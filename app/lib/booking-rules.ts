export const SLOTS = Array.from({ length: 13 }, (_, index) => ({
  start: `${String(index + 8).padStart(2, "0")}:00`,
  end: `${String(index + 9).padStart(2, "0")}:00`,
}));
export type Slot = (typeof SLOTS)[number];
export function bookingSlot(value: unknown) {
  return SLOTS.find((slot) => slot.start === value) ?? null;
}
export const TIMEZONE = "Asia/Shanghai";

export function shanghaiClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) => parts.find((value) => value.type === type)!.value;
  return {
    today: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
    now: now.toISOString(),
  };
}

export function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export function slotHasEnded(date: string, slotStart: string, now = new Date()) {
  const slot = bookingSlot(slotStart);
  if (!slot) return true;
  const clock = shanghaiClock(now);
  return date < clock.today || (date === clock.today && clock.time >= slot.end);
}

export function bookingName(value: unknown) {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  if (!name || Array.from(name).length > 40 || /[\u0000-\u001f\u007f]/.test(name)) return null;
  return name;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newCancellationCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const code = Array.from(bytes, (byte) => CODE_ALPHABET[byte & 31]).join("");
  return code.match(/.{4}/g)!.join("-");
}

export function normalizeCancellationCode(value: unknown) {
  if (typeof value !== "string") return null;
  const code = value.trim().replace(/[\s-]/g, "").toUpperCase();
  return /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{16}$/.test(code) ? code : null;
}

export async function digest(value: string) {
  const result = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(result), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function cancellationDigest(date: string, code: string, slotStart: string = "20:00") {
  // Retain legacy 20:00 codes when migrating existing reservations.
  return digest(slotStart === "20:00" ? `cancel-v1:${date}:${code}` : `cancel-v2:${date}:${slotStart}:${code}`);
}
