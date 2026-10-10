import { db } from "../../lib/sqlite";
import { validAdminKey } from "../../lib/admin-key";
import { digest } from "../../lib/booking-rules";

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
    throw new InputError("请从本站页面提交。", 403);
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

async function checkRequestRate(request: Request) {
  const ip = (process.env.TRUST_PROXY === "1" ? request.headers.get("x-real-ip") : null) || "direct";
  const key = await digest(`feedback-rate-v1:${ip}`);
  const now = Date.now();
  const row = await db().prepare(
    `INSERT INTO request_limits (key, window_start, count) VALUES (?, ?, 1)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN window_start <= ? THEN 1 ELSE count + 1 END,
       window_start = CASE WHEN window_start <= ? THEN excluded.window_start ELSE window_start END
     RETURNING count`,
  ).bind(key, now, now - 60_000, now - 60_000).first<{ count: number }>();
  if (row && row.count > 5) throw new InputError("提交过于频繁，请稍后再试。", 429);
}

// GET /api/feedback: 支持 grokbot 或管理员凭 ADMIN_KEY 查询提取反馈
export async function GET(request: Request) {
  const adminKey = request.headers.get("x-admin-key") || new URL(request.url).searchParams.get("adminKey") || "";
  if (!validAdminKey(adminKey, process.env.ADMIN_CANCELLATION_KEY)) {
    return json({ error: "未授权访问。" }, 401);
  }
  const rows = await db().prepare(
    "SELECT id, contact, content, created_at FROM feedback ORDER BY id DESC LIMIT 100",
  ).bind().all();
  return json({ feedback: rows.results });
}

// POST /api/feedback: 提交反馈
export async function POST(request: Request) {
  try {
    await checkRequestRate(request);
    const payload = await body(request);
    const contact = typeof payload.contact === "string" ? payload.contact.trim() : "";
    const content = typeof payload.content === "string" ? payload.content.trim() : "";

    if (!contact) {
      throw new InputError("请留下联系方式（微信/手机号等），方便与您联系。");
    }
    if (contact.length > 50) {
      throw new InputError("联系方式过长，请控制在50字以内。");
    }
    if (!content) {
      throw new InputError("请填写您的建议或需求内容。");
    }
    if (content.length > 500) {
      throw new InputError("建议内容过长，请控制在500字以内。");
    }

    const createdAt = new Date().toISOString();
    await db().prepare(
      "INSERT INTO feedback (contact, content, created_at) VALUES (?, ?, ?)",
    ).bind(contact, content, createdAt).first();

    return json({ ok: true, message: "感谢反馈，我们已收到！" });
  } catch (error) {
    if (error instanceof InputError) return json({ error: error.message }, error.status);
    return json({ error: "提交失败，请稍后重试。" }, 500);
  }
}
