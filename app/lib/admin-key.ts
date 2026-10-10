import { createHash, timingSafeEqual } from "node:crypto";

export function validAdminKey(candidate: unknown, configured: string | undefined) {
  // Missing or weak configuration disables administrator cancellation.
  if (!configured || configured.length < 32 || configured.length > 256 ||
    typeof candidate !== "string" || candidate.length > 256) return false;
  const hash = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(hash(candidate), hash(configured));
}
