import { db } from "../../lib/sqlite";
import {
  SLOT, TIMEZONE, bookingName, cancellationDigest, digest,
  newCancellationCode, normalizeCancellationCode, shanghaiClock,
  slotHasEnded, validDate,
} from "../../lib/booking-rules";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

class InputError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

async function body(request: Request) {
  const origin = request.headers.get("origin");
  const requestUrl = new URL(request.url);
  const publicOrigin = process.env.PUBLIC_ORIGIN || `${requestUrl.protocol}//${request.headers.get("host") || requestUrl.host}`;
  if (origin && origin !== publicOrigin) {
    throw new InputError("请从本站页面提交预约。", 403);
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new InputError("提交格式不正确，请刷新页面重试。");
  }
  if (Number(request.headers.get("content-length")) > 2048) {
    throw new InputError("提交内容过长。", 413);
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 2048) throw new InputError("提交内容过长。", 413);
  let value;
  try { value = JSON.parse(raw); } catch { throw new InputError("提交格式不正确。"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InputError("提交格式不正确。");
  return value as Record<string, unknown>;
}

async function checkRequestRate(request: Request, operation: string) {
  // Production binds to loopback; Nginx overwrites this header with the real peer IP.
  const ip = process.env.TRUST_PROXY === "1" ? request.headers.get("x-real-ip") : null;
  if (!ip) return;
  const key = await digest(`booking-rate-v1:${operation}:${ip}`);
  const now = Date.now();
  const row = await db().prepare(
    `INSERT INTO request_limits (key, window_start, count) VALUES (?, ?, 1)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN window_start <= ? THEN 1 ELSE count + 1 END,
       window_start = CASE WHEN window_start <= ? THEN excluded.window_start ELSE window_start END
     RETURNING count`,
  ).bind(key, now, now - 60_000, now - 60_000).first<{ count: number }>();
  if (row && row.count > 20) throw new InputError("操作过于频繁，请稍后再试。", 429);
}

function failure(error: unknown) {
  if (error instanceof InputError) return json({ error: error.message }, error.status);
  console.error("Booking storage operation failed", error instanceof Error ? error.message : "Unknown error");
  return json({ error: "预约服务暂时不可用，请稍后重试。" }, 503);
}

export async function GET(request: Request) {
  try {
    const clock = shanghaiClock();
    const params = new URL(request.url).searchParams;
    const from = params.get("from") ?? clock.today;
    const to = params.get("to") ?? from;
    if (!validDate(from) || !validDate(to) || to < from) throw new InputError("请选择有效的日期范围。");
    if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > 62) throw new InputError("一次最多查看 63 天的预约。");
    const result = await db().prepare(
      "SELECT booking_date AS date, name, created_at AS createdAt FROM bookings WHERE booking_date >= ? AND booking_date <= ? ORDER BY booking_date",
    ).bind(from, to).all();
    return json({ today: clock.today, now: clock.now, timezone: TIMEZONE, slot: SLOT, bookings: result.results });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const value = await body(request);
    if (!validDate(value.date)) throw new InputError("请选择有效的预约日期。");
    const date = value.date;
    const name = bookingName(value.name);
    if (!name) throw new InputError("请填写 1–40 个字的姓名或乐队名。");
    await checkRequestRate(request, "reserve");
    const suppliedCode = value.cancellationCode === undefined ? null : normalizeCancellationCode(value.cancellationCode);
    if (value.cancellationCode !== undefined && !suppliedCode) throw new InputError("取消码格式不正确，请刷新后重试。");
    const cancellationCode = suppliedCode ? suppliedCode.match(/.{4}/g)!.join("-") : newCancellationCode();
    const normalized = normalizeCancellationCode(cancellationCode)!;
    const cancellationHash = await cancellationDigest(date, normalized);
    // Recovery remains available after the slot ends; only a new reservation
    // is rejected by the time check. The secret code authenticates this read.
    if (suppliedCode) {
      const existing = await db().prepare(
        "SELECT booking_date AS date, name, created_at AS createdAt FROM bookings WHERE booking_date = ? AND cancellation_digest = ?",
      ).bind(date, cancellationHash).first();
      if (existing) return json({ booking: existing, cancellationCode });
    }
    if (slotHasEnded(date)) throw new InputError("这个时段已结束，请选择其他日期。");
    const createdAt = new Date().toISOString();
    // The date is the primary key: concurrent requests cannot both reserve this room.
    const inserted = await db().prepare(
      "INSERT OR IGNORE INTO bookings (booking_date, name, cancellation_digest, created_at) VALUES (?, ?, ?, ?) RETURNING booking_date",
    ).bind(date, name, cancellationHash, createdAt).first();
    if (!inserted) {
      // A browser keeps its random code before sending. A retry with that same
      // secret may recover its result after a dropped response, without exposing
      // another visitor's code or granting access through a public identifier.
      if (suppliedCode) {
        const existing = await db().prepare(
          "SELECT booking_date AS date, name, created_at AS createdAt FROM bookings WHERE booking_date = ? AND cancellation_digest = ?",
        ).bind(date, cancellationHash).first();
        if (existing) return json({ booking: existing, cancellationCode });
      }
      throw new InputError("这个日期刚刚被预约了，请选择其他日期。", 409);
    }
    return json({ booking: { date, name, createdAt }, cancellationCode }, 201);
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request) {
  try {
    const value = await body(request);
    if (!validDate(value.date)) throw new InputError("请选择需要取消的预约日期。");
    await checkRequestRate(request, "cancel");
    const code = normalizeCancellationCode(value.cancellationCode);
    if (!code) throw new InputError("取消码不正确，请检查后重试。");
    const hash = await cancellationDigest(value.date, code);
    // Matching both date and digest also prevents an old code cancelling a new reservation.
    const deleted = await db().prepare(
      "DELETE FROM bookings WHERE booking_date = ? AND cancellation_digest = ? RETURNING booking_date",
    ).bind(value.date, hash).first();
    if (!deleted) throw new InputError("日期或取消码不正确，或者预约已经取消。", 404);
    return json({ ok: true });
  } catch (error) { return failure(error); }
}
