type CodeStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const PREFIX = "guitar-room:cancel:v2:";
function storedValue(target: CodeStorage, date: string, slotStart: string) {
  return target.getItem(`${PREFIX}${date}:${slotStart}`) ??
    (slotStart === "20:00" ? target.getItem(`guitar-room:cancel:v1:${date}`) : null);
}

// Storage may be unavailable in private mode, or full. Booking must still work.
export function saveLocalCode(date: string, slotStart: string, code: string, createdAt: string | null, storage?: CodeStorage) {
  try {
    const target = storage ?? window.localStorage;
    if (createdAt === null) {
      // A competing attempt in another tab must not overwrite a confirmed code.
      try {
        const existing = JSON.parse(storedValue(target, date, slotStart) ?? "null");
        if (typeof existing?.createdAt === "string" && existing.code !== code) return false;
      } catch {
        // Replace corrupt data; setItem below still reports blocked storage.
      }
    }
    target.setItem(`${PREFIX}${date}:${slotStart}`, JSON.stringify({ code, createdAt }));
    return true;
  } catch {
    return false;
  }
}

export function readLocalCode(date: string, slotStart: string, createdAt: string, storage?: CodeStorage): string {
  try {
    const value = JSON.parse(storedValue(storage ?? window.localStorage, date, slotStart) ?? "null");
    if (!value || typeof value.code !== "string" || !/^[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){3}$/.test(value.code)) return "";
    // A null timestamp represents an attempt whose response was lost.
    if (value.createdAt !== null && value.createdAt !== createdAt) return "";
    return value.code;
  } catch {
    return "";
  }
}

export function removeLocalCode(date: string, slotStart: string, code?: string, storage?: CodeStorage) {
  try {
    const target = storage ?? window.localStorage;
    if (code !== undefined) {
      const value = JSON.parse(storedValue(target, date, slotStart) ?? "null");
      if (value?.code !== code) return;
    }
    target.removeItem(`${PREFIX}${date}:${slotStart}`);
    if (slotStart === "20:00") target.removeItem(`guitar-room:cancel:v1:${date}`);
  } catch {
    // A storage failure must not turn a successful server cancellation into an error.
  }
}
