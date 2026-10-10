"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { readLocalCode, removeLocalCode, saveLocalCode } from "./lib/local-cancellation-codes";
import { SLOTS } from "./lib/booking-rules";
import type { Slot } from "./lib/booking-rules";

type Booking = { date: string; slotStart: string; name: string; createdAt: string };
type Schedule = {
  today: string;
  now: string;
  timezone: string;
  slots: Slot[];
  bookings: Booking[];
};
type DialogState =
  | { kind: "booking"; date: string; slot: Slot }
  | { kind: "cancellation"; date: string; slot: Slot; booking: Booking }
  | { kind: "booked"; date: string; slot: Slot; name: string; cancellationCode: string; savedLocally: boolean }
  | { kind: "cancelled"; date: string; slot: Slot };

const BOOKING_TIMEZONE = "Asia/Shanghai";
const WEEKDAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

function dateInTimezone(date: Date, timezone = BOOKING_TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function localDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function dateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(value: string, amount: number) {
  const date = localDate(value);
  date.setDate(date.getDate() + amount);
  return dateString(date);
}

function startOfWeek(value: string) {
  const date = localDate(value);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return dateString(date);
}

function formatDate(value: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("zh-CN", options).format(localDate(value));
}

function getTimeInTimezone(iso: string, timezone: string) {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value);
  return part("hour") * 60 + part("minute");
}

function dateIsEnded(date: string, slot: Slot, schedule: Schedule | null) {
  if (!schedule) return false;
  if (date < schedule.today) return true;
  if (date > schedule.today) return false;
  const nowMinutes = getTimeInTimezone(schedule.now, schedule.timezone || BOOKING_TIMEZONE);
  const [endHour, endMinute] = slot.end.split(":").map(Number);
  return nowMinutes !== null && nowMinutes >= endHour * 60 + endMinute;
}

function apiErrorMessage(body: unknown, fallback: string) {
  if (body && typeof body === "object" && "error" in body) {
    const error = (body as { error?: unknown }).error;
    if (typeof error === "string" && error.trim()) return error;
  }
  return fallback;
}

function createCancellationCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const raw = Array.from(bytes, (byte) => alphabet[byte & 31]).join("");
  return raw.match(/.{4}/g)!.join("-");
}

function GuitarMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="brand-mark">
      <path d="M29.2 8.3a8.4 8.4 0 0 0-9.5 2.1l-2 2.4-4.1-.7a3 3 0 0 0-3.4 3.4l.8 4.1-2.5 2a8.4 8.4 0 0 0 11.8 11.8l2-2.5 4.1.8a3 3 0 0 0 3.4-3.4l-.7-4.1 2.4-2a8.4 8.4 0 0 0 2.1-9.5l4.9-4.9-2.1-2.1-4.9 4.9Z" fill="currentColor" />
      <circle cx="18.2" cy="26.1" r="3.1" fill="#f5f0e5" />
      <path d="m20.5 23.9 13.2-13.2m-9.8 16.6 13.2-13.2" fill="none" stroke="#f5f0e5" strokeWidth="1.1" />
    </svg>
  );
}

function ArrowIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="arrow-icon" data-direction={direction}>
      <path d="M12.5 4.5 7 10l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DialogShell({
  title,
  children,
  busy,
  onClose,
}: {
  title: string;
  children: ReactNode;
  busy: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="booking-dialog"
      aria-labelledby="dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) dialogRef.current?.close();
      }}
      onClose={onClose}
    >
      <div className="dialog-content">
        <div className="dialog-heading">
          <h2 id="dialog-title">{title}</h2>
          {!busy && <button className="icon-button dialog-close" type="button" aria-label="关闭对话框" onClick={() => dialogRef.current?.close()}><span aria-hidden="true">×</span></button>}
        </div>
        {children}
      </div>
    </dialog>
  );
}

export default function Home() {
  const initialToday = useMemo(() => dateInTimezone(new Date()), []);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(initialToday));
  const [selectedDate, setSelectedDate] = useState(initialToday);
  const [jumpDate, setJumpDate] = useState(initialToday);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [dialogError, setDialogError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [publicNameConfirmed, setPublicNameConfirmed] = useState(false);
  const [bookingCancellationCode, setBookingCancellationCode] = useState("");
  const [bookingOutcomeUncertain, setBookingOutcomeUncertain] = useState(false);
  const [cancellationCode, setCancellationCode] = useState("");
  const [adminMode, setAdminMode] = useState(false);
  const [adminKey, setAdminKey] = useState("");
  const [adminConfirmed, setAdminConfirmed] = useState(false);
  const [codeWasLoaded, setCodeWasLoaded] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const hasLoadedRef = useRef(false);
  const lastLoadedWeek = useRef("");
  const serverDateAligned = useRef(false);
  const bookingCancellationCodeRef = useRef("");
  const dates = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const bookingsBySlot = useMemo(() => {
    const lookup = new Map<string, Booking>();
    for (const booking of schedule?.bookings ?? []) lookup.set(`${booking.date}:${booking.slotStart}`, booking);
    return lookup;
  }, [schedule]);

  useEffect(() => {
    let active = true;
    let requestRunning = false;
    const weekChanged = lastLoadedWeek.current !== weekStart;
    if (weekChanged) {
      setIsLoading(true);
      setHasLoaded(false);
      hasLoadedRef.current = false;
      setSchedule(null);
    }

    const refresh = async () => {
      if (requestRunning) return;
      requestRunning = true;
      try {
        const from = weekStart;
        const to = addDays(weekStart, 6);
        const response = await fetch(`/api/bookings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { cache: "no-store" });
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new Error(apiErrorMessage(body, "预约排期暂时无法加载，请点击重试。"));
        const nextSchedule = body as Schedule;
        if (!nextSchedule || typeof nextSchedule.today !== "string" || !Array.isArray(nextSchedule.bookings) || !Array.isArray(nextSchedule.slots)) {
          throw new Error("预约排期数据格式异常，请点击重试。");
        }
        if (!active) return;
        setSchedule(nextSchedule);
        setHasLoaded(true);
        hasLoadedRef.current = true;
        lastLoadedWeek.current = weekStart;
        setIsLoading(false);
        setLoadError("");
        if (!serverDateAligned.current) {
          serverDateAligned.current = true;
          const serverWeek = startOfWeek(nextSchedule.today);
          setSelectedDate(nextSchedule.today);
          setJumpDate(nextSchedule.today);
          if (serverWeek !== weekStart) setWeekStart(serverWeek);
        }
      } catch (error) {
        if (!active) return;
        const message = error instanceof TypeError
          ? "无法连接预约服务，请检查网络连接后重试。"
          : error instanceof Error
            ? error.message
            : "预约排期暂时无法加载，请点击重试。";
        setLoadError(message);
        if (!hasLoadedRef.current) setIsLoading(false);
      } finally {
        requestRunning = false;
      }
    };

    void refresh();
    const interval = window.setInterval(() => void refresh(), 30_000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [weekStart, refreshKey]);

  const retry = useCallback(() => {
    setLoadError("");
    setRefreshKey((value) => value + 1);
  }, []);

  const closeDialog = useCallback(() => {
    if (isSubmitting) return;
    setDialog(null);
    setAdminKey("");
    setAdminConfirmed(false);
    setCancellationCode("");
    setDialogError("");
    setCopyMessage("");
  }, [isSubmitting]);

  const openBooking = (date: string, slot: Slot) => {
    setSelectedDate(date);
    setName("");
    setPublicNameConfirmed(false);
    bookingCancellationCodeRef.current = "";
    setBookingCancellationCode("");
    setBookingOutcomeUncertain(false);
    setDialogError("");
    setCopyMessage("");
    setDialog({ kind: "booking", date, slot });
  };

  const openCancellation = (date: string, slot: Slot) => {
    const booking = bookingsBySlot.get(`${date}:${slot.start}`);
    if (!booking) return;
    setSelectedDate(date);
    const savedCode = readLocalCode(date, slot.start, booking.createdAt);
    setCancellationCode(savedCode);
    setCodeWasLoaded(Boolean(savedCode));
    setAdminMode(false);
    setAdminKey("");
    setAdminConfirmed(false);
    setDialogError("");
    setDialog({ kind: "cancellation", date, slot, booking });
  };

  const handleBooking = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dialog || dialog.kind !== "booking") return;
    if (!name.trim()) {
      setDialogError("请填写姓名或乐队名。");
      return;
    }
    if (!publicNameConfirmed) {
      setDialogError("请先确认姓名或乐队名将公开显示。");
      return;
    }
    let code = bookingCancellationCodeRef.current;
    if (!code) {
      try {
        code = createCancellationCode();
      } catch {
        setDialogError("此浏览器暂时无法安全生成取消码，请检查浏览器环境后重试。");
        return;
      }
      bookingCancellationCodeRef.current = code;
      setBookingCancellationCode(code);
    }
    setDialogError("");
    setIsSubmitting(true);
    // Preserve the code even if the server accepts a booking but its response is lost.
    saveLocalCode(dialog.date, dialog.slot.start, code, null);
    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: dialog.date, slotStart: dialog.slot.start, name: name.trim(), cancellationCode: code }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status >= 500) {
          setBookingOutcomeUncertain(true);
          setDialogError("预约结果未能确认，请查看排期。若预约已生效，可以用下面的取消码取消。");
        } else {
          removeLocalCode(dialog.date, dialog.slot.start, code);
          setDialogError(apiErrorMessage(body, "预约未能完成，请稍后重试。"));
        }
        setRefreshKey((value) => value + 1);
        return;
      }
      if (!body || typeof body !== "object" || !("cancellationCode" in body) || typeof body.cancellationCode !== "string" ||
        !("booking" in body) || !body.booking || typeof body.booking !== "object" ||
        !("name" in body.booking) || typeof body.booking.name !== "string" ||
        !("createdAt" in body.booking) || typeof body.booking.createdAt !== "string" ||
        !("date" in body.booking) || body.booking.date !== dialog.date ||
        !("slotStart" in body.booking) || body.booking.slotStart !== dialog.slot.start) {
        setBookingOutcomeUncertain(true);
        setDialogError("预约结果未能确认，请查看排期。若预约已生效，可以用下面的取消码取消。");
        setRefreshKey((value) => value + 1);
        return;
      }
      const savedLocally = saveLocalCode(dialog.date, dialog.slot.start, body.cancellationCode, body.booking.createdAt);
      setDialog({ kind: "booked", date: dialog.date, slot: dialog.slot, name: body.booking.name, cancellationCode: body.cancellationCode, savedLocally });
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setBookingOutcomeUncertain(true);
      setDialogError("预约结果未能确认，请查看排期。若预约已生效，可以用下面的取消码取消。");
      setRefreshKey((value) => value + 1);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancellation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dialog || dialog.kind !== "cancellation") return;
    if (adminMode && (!adminKey || !adminConfirmed)) {
      setDialogError("请输入管理员密钥，并确认已核实预约人和日期。");
      return;
    }
    if (!adminMode && !cancellationCode.trim()) {
      setDialogError("请输入预约时收到的取消码。");
      return;
    }
    setDialogError("");
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/bookings", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(adminMode
          ? { date: dialog.date, slotStart: dialog.slot.start, adminKey, expectedCreatedAt: dialog.booking.createdAt, expectedName: dialog.booking.name }
          : { date: dialog.date, slotStart: dialog.slot.start, cancellationCode: cancellationCode.trim() }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiErrorMessage(body, "取消未能完成，请检查取消码后重试。"));
      removeLocalCode(dialog.date, dialog.slot.start);
      setAdminKey("");
      setCancellationCode("");
      setDialog({ kind: "cancelled", date: dialog.date, slot: dialog.slot });
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setDialogError(error instanceof TypeError
        ? "无法连接预约服务，请检查网络连接后重试。"
        : error instanceof Error
          ? error.message
          : "取消未能完成，请稍后重试。");
      setRefreshKey((value) => value + 1);
    } finally {
      setIsSubmitting(false);
    }
  };

  const shiftWeek = (amount: number) => {
    const nextWeek = addDays(weekStart, amount * 7);
    const nextSelection = selectedDate >= weekStart && selectedDate <= addDays(weekStart, 6)
      ? addDays(selectedDate, amount * 7)
      : nextWeek;
    setWeekStart(nextWeek);
    setSelectedDate(nextSelection);
    setJumpDate(nextSelection);
  };

  const jumpToDate = (value: string) => {
    if (!value) return;
    setJumpDate(value);
    setSelectedDate(value);
    setWeekStart(startOfWeek(value));
  };

  const copyCancellationCode = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyMessage("取消码已复制。请妥善保存。");
    } catch {
      setCopyMessage("复制失败，请手动选择并复制上方取消码。");
    }
  };

  const weekLabel = `${formatDate(weekStart, { month: "long", day: "numeric" })} — ${formatDate(addDays(weekStart, 6), { month: "long", day: "numeric" })}`;

  return (
    <main className="page-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="MUC音协 排练室预约首页">
          <span className="brand-icon"><GuitarMark /></span>
          <span className="brand-name">MUC音协 · 排练室</span>
        </a>
        <a className="header-link" href="#schedule">查看排期 <span aria-hidden="true">↘</span></a>
      </header>

      <div id="top" className="page-content">
        <section className="hero" aria-labelledby="page-title">
          <div className="hero-copy">
            <p className="eyebrow">MUC MUSIC ASSOCIATION / 排练室预约</p>
            <h1 id="page-title">排练室预约</h1>
            <p className="hero-slogan">民谣诗意 · 热血摇滚</p>
            <p className="hero-description">每日 13 个独立时段 · 仅限单组独占 · 实时同步排期</p>
          </div>
        </section>

        <section id="schedule" className="schedule-section" aria-labelledby="schedule-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">SCHEDULE / 本周时段</p>
              <h2 id="schedule-title">时段排期</h2>
            </div>
            <div className="legend" aria-label="排期状态说明">
              <span><i className="legend-dot available-dot" />可预约</span>
              <span><i className="legend-dot booked-dot" />已占用</span>
              <span><i className="legend-dot ended-dot" />已结束</span>
            </div>
          </div>

          <div className="schedule-panel">
            <div className="schedule-toolbar">
              <div className="week-control">
                <button className="icon-button week-arrow" type="button" aria-label="上一周" onClick={() => shiftWeek(-1)}><ArrowIcon direction="left" /></button>
                <h3 className="week-label" aria-live="polite">{weekLabel}</h3>
                <button className="icon-button week-arrow" type="button" aria-label="下一周" onClick={() => shiftWeek(1)}><ArrowIcon direction="right" /></button>
              </div>
              <label className="date-jump">
                <span className="calendar-symbol" aria-hidden="true">▦</span>
                <span className="date-jump-label">跳转日期</span>
                <input aria-label="选择要查看的日期" type="date" value={jumpDate} onChange={(event) => jumpToDate(event.target.value)} />
              </label>
            </div>

            {loadError && (
              <div className="load-error" role="alert">
                <div><strong>{hasLoaded ? "排期刷新失败" : "排期加载失败"}</strong><span>{loadError}</span></div>
                <button className="retry-button" type="button" onClick={retry}>重试</button>
              </div>
            )}

            {!hasLoaded && isLoading ? (
              <div className="schedule-loading" role="status"><span className="loading-spinner" />加载排期中…</div>
            ) : !hasLoaded && loadError ? (
              <div className="schedule-unavailable">暂无法获取排期，请检查网络或点击重试。</div>
            ) : (
              <>
                <div className="date-tabs" role="group" aria-label="选择预约日期">
                  {dates.map((date, index) => {
                    const bookingCount = schedule?.bookings.filter((booking) => booking.date === date).length ?? 0;
                    return (
                      <button key={date} type="button" className={`date-tab ${date === selectedDate ? "selected" : ""}`} aria-pressed={date === selectedDate} aria-label={formatDate(date, { month: "long", day: "numeric", weekday: "long" })} onClick={() => { setSelectedDate(date); setJumpDate(date); }}>
                        <span className="day-name">{WEEKDAY_NAMES[index]}</span>
                        <span className="day-number">{Number(date.slice(-2))}</span>
                        <span className="date-tab-note">{date === schedule?.today ? "今日" : `${bookingCount} 组`}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="daily-subheading">
                  <h3 className="daily-heading">{formatDate(selectedDate, { month: "long", day: "numeric", weekday: "long" })}</h3>
                  <span className="daily-note">13 个时段 · 每时段 60 分钟</span>
                </div>
                <div className="slot-grid" aria-label={`${selectedDate}小时排期`}>
                {(schedule?.slots ?? SLOTS).map((slot) => {
                  const booking = bookingsBySlot.get(`${selectedDate}:${slot.start}`);
                  const ended = dateIsEnded(selectedDate, slot, schedule);
                  const status = ended ? "ended" : booking ? "booked" : "available";
                  const statusText = ended ? "已结束" : booking ? "已占用" : "空闲";
                  return (
                    <article className={`day-card ${status}`} key={slot.start} aria-label={`${slot.start}–${slot.end}`}>
                      <div className="day-card-top">
                        <span className="hour-label">{slot.start}–{slot.end}</span>
                        <div className="day-status"><i className="status-dot" /><span>{statusText}</span></div>
                      </div>
                      <div className="day-card-body">
                        {booking ? (
                          <p className="booking-name" title={booking.name}>
                            <span className="booking-badge">占用</span>
                            <span className="booking-owner">{booking.name}</span>
                          </p>
                        ) : (
                          <p className="slot-idle-hint">{ended ? "该时段已过" : "时段开放预约"}</p>
                        )}
                      </div>
                      <div className="day-card-action">
                        {booking ? (
                          <button type="button" className="text-action cancel-action" onClick={() => openCancellation(selectedDate, slot)} aria-label={`取消${selectedDate} ${slot.start}–${slot.end}的预约`}>退订时段 <span aria-hidden="true">→</span></button>
                        ) : ended ? (
                          <span className="ended-note">—</span>
                        ) : (
                          <button type="button" className="reserve-button" disabled={!hasLoaded || Boolean(loadError)} onClick={() => openBooking(selectedDate, slot)} aria-label={`预约${selectedDate} ${slot.start}–${slot.end}`}>立即预约 <span aria-hidden="true">↗</span></button>
                        )}
                      </div>
                    </article>
                  );
                })}
                </div>
              </>
            )}

            <div className="schedule-footnote"><span className="footnote-icon" aria-hidden="true">i</span><p>预约名称将公开显示。凭 16 位取消码可自行退订；遗失取消码请联系排练室负责人。</p></div>
          </div>
        </section>
      </div>

      <footer className="site-footer">
        <span className="footer-title">MUC MUSIC ASSOCIATION</span>
        <span className="footer-meta">民谣诗意 · 热血摇滚</span>
        <a href="#top" className="footer-top">回到顶部 ↑</a>
      </footer>

      {dialog && (
        <DialogShell key={dialog.kind} title={dialog.kind === "booking" ? "预约时段" : dialog.kind === "cancellation" ? "取消预约" : dialog.kind === "booked" ? "预约已完成" : "已成功取消"} busy={isSubmitting} onClose={closeDialog}>
          {dialog.kind === "booking" && (
            <form className="dialog-form" onSubmit={handleBooking}>
              <p className="dialog-intro">{formatDate(dialog.date, { year: "numeric", month: "long", day: "numeric", weekday: "long" })} · {dialog.slot.start}–{dialog.slot.end}</p>
              <label className="form-field" htmlFor="booking-name"><span>姓名 / 乐队名</span><input id="booking-name" type="text" autoComplete="name" autoFocus required maxLength={40} placeholder="请输入姓名或乐队名称" value={name} onChange={(event) => setName(event.target.value)} aria-describedby="public-name-note" /></label>
              <label className="consent-check" htmlFor="public-name-confirmed"><input id="public-name-confirmed" type="checkbox" checked={publicNameConfirmed} onChange={(event) => setPublicNameConfirmed(event.target.checked)} /><span id="public-name-note">确认公开展示此名称</span></label>
              {dialogError && <p className="dialog-error" role="alert">{dialogError}</p>}
              {bookingOutcomeUncertain && bookingCancellationCode && (
                <div className="uncertain-code">
                  <span className="code-label">生成的取消码</span>
                  <code className="cancellation-code">{bookingCancellationCode}</code>
                  <button className="copy-button" type="button" onClick={() => void copyCancellationCode(bookingCancellationCode)}>复制</button>
                  <p className="copy-message" aria-live="polite">{copyMessage}</p>
                </div>
              )}
              <button className="dialog-submit" type="submit" disabled={isSubmitting || !publicNameConfirmed}>{isSubmitting ? <><span className="button-spinner" />提交中…</> : "确认预约"}</button>
            </form>
          )}

          {dialog.kind === "cancellation" && (
            <form className="dialog-form" onSubmit={handleCancellation}>
              <p className="dialog-intro">{formatDate(dialog.date, { year: "numeric", month: "long", day: "numeric", weekday: "long" })} · {dialog.slot.start}–{dialog.slot.end}</p>
              <p className="cancellation-owner">当前预约：<strong>{dialog.booking.name}</strong></p>
              <label className="consent-check cancellation-mode" htmlFor="admin-cancellation-mode"><input id="admin-cancellation-mode" type="checkbox" disabled={isSubmitting} checked={adminMode} onChange={(event) => { setAdminMode(event.target.checked); setAdminKey(""); setAdminConfirmed(false); setDialogError(""); }} /><span>管理员协助模式</span></label>
              {adminMode ? (
                <>
                  <label className="form-field" htmlFor="admin-cancellation-key"><span>管理员密钥</span><input id="admin-cancellation-key" type="password" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={256} required disabled={isSubmitting} value={adminKey} onChange={(event) => setAdminKey(event.target.value)} placeholder="输入管理员密钥" /></label>
                  <label className="consent-check" htmlFor="admin-cancellation-confirmed"><input id="admin-cancellation-confirmed" type="checkbox" disabled={isSubmitting} checked={adminConfirmed} onChange={(event) => setAdminConfirmed(event.target.checked)} /><span>已核实身份，确认取消预约</span></label>
                </>
              ) : (
                <>
                  <label className="form-field" htmlFor="booking-cancellation-code"><span>取消码</span><input id="booking-cancellation-code" type="text" autoCapitalize="characters" autoComplete="off" autoFocus disabled={isSubmitting} value={cancellationCode} onChange={(event) => setCancellationCode(event.target.value)} placeholder="请输入 16 位取消码" /></label>
                  <p className="field-hint">{codeWasLoaded ? "已从本机读取保存的取消码" : "请输入预约时获得的取消码"}</p>
                </>
              )}
              {dialogError && <p className="dialog-error" role="alert">{dialogError}</p>}
              <button className="dialog-submit" type="submit" disabled={isSubmitting || (adminMode && (!adminKey || !adminConfirmed))}>{isSubmitting ? <><span className="button-spinner" />提交中…</> : "确认取消"}</button>
            </form>
          )}

          {dialog.kind === "booked" && (
            <div className="success-content">
              <p className="dialog-intro">{formatDate(dialog.date, { year: "numeric", month: "long", day: "numeric", weekday: "long" })} · {dialog.slot.start}–{dialog.slot.end}</p>
              <div className="success-mark" aria-hidden="true">✓</div>
              <p className="success-message">预约已成功（{dialog.name}）</p>
              <div className="code-card"><span className="code-label">取消凭证码</span><code className="cancellation-code">{dialog.cancellationCode}</code><button className="copy-button" type="button" onClick={() => void copyCancellationCode(dialog.cancellationCode)}>复制凭证码</button></div>
              <p className="save-code-note">{dialog.savedLocally ? "凭证码已在此浏览器暂存。若更换设备请提前留存。" : "请妥善复制并保存此凭证码。"}</p>
              <p className="copy-message" aria-live="polite">{copyMessage}</p>
              <button className="dialog-submit" type="button" onClick={closeDialog}>完成</button>
            </div>
          )}

          {dialog.kind === "cancelled" && (
            <div className="success-content"><p className="dialog-intro">{formatDate(dialog.date, { year: "numeric", month: "long", day: "numeric", weekday: "long" })} · {dialog.slot.start}–{dialog.slot.end}</p><div className="success-mark" aria-hidden="true">✓</div><p className="success-message">预约已成功取消</p><button className="dialog-submit" type="button" onClick={closeDialog}>完成</button></div>
          )}
        </DialogShell>
      )}
    </main>
  );
}
