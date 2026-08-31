// JST(UTC+9,无夏令时)时间工具。演出数据一律以 JST 日期 + HH:mm 存储。

const JST_OFFSET = "+09:00";
const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"];

/** 把 JST 日期(+可选时刻)转成 Date 对象 */
export function jstDate(date: string, time = "00:00"): Date {
  return new Date(`${date}T${time}:00${JST_OFFSET}`);
}

/** 当前 JST 日期字符串 YYYY-MM-DD */
export function todayJst(now: Date = new Date()): string {
  return now.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

/** JST 日期加 n 天 */
export function addDays(date: string, n: number): string {
  const d = jstDate(date, "12:00");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

/** "2026-09-12" -> "2026/09/12(土)" */
export function formatJaDate(date: string): string {
  // 12:00 JST = 03:00 UTC,同一天,故 getUTCDay 即 JST 星期
  const d = jstDate(date, "12:00");
  const w = WEEKDAY_JA[d.getUTCDay()];
  const [y, m, day] = date.split("-");
  return `${y}/${m}/${day}(${w})`;
}

/** 短格式 "9/12(土)" */
export function formatJaDateShort(date: string): string {
  const d = jstDate(date, "12:00");
  const w = WEEKDAY_JA[d.getUTCDay()];
  const [, m, day] = date.split("-");
  return `${Number(m)}/${Number(day)}(${w})`;
}

/** 相对今天的中文标签:今天 / 明天 / 3天后 / 已结束 */
export function relativeDayLabel(date: string, now: Date = new Date()): string {
  const today = todayJst(now);
  const diff = Math.round((jstDate(date, "12:00").getTime() - jstDate(today, "12:00").getTime()) / 86400000);
  if (diff === 0) return "今天";
  if (diff === 1) return "明天";
  if (diff === 2) return "后天";
  if (diff < 0) return "已结束";
  if (diff <= 60) return `${diff}天后`;
  return "";
}

/** 用户本地时区是否就是日本时区 */
export function isUserInJst(): boolean {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone === "Asia/Tokyo";
  } catch {
    return false;
  }
}

/** JST 时刻对应的用户本地时刻 "20:00" -> "19:00"(北京) */
export function toLocalTime(date: string, time: string): string {
  const d = jstDate(date, time);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function toTimeZoneTime(
  date: string,
  time: string,
  timeZone: string,
): string {
  return jstDate(date, time).toLocaleString(undefined, {
    timeZone,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export interface Countdown {
  days: number;
  hours: number;
  totalMs: number;
}

/** 距 JST 某日 23:59 的倒计时(用于受付截止) */
export function countdownTo(date: string, now: Date = new Date()): Countdown {
  const target = jstDate(date, "23:59").getTime();
  const totalMs = target - now.getTime();
  const days = Math.floor(totalMs / 86400000);
  const hours = Math.floor((totalMs % 86400000) / 3600000);
  return { days, hours, totalMs };
}

/** 倒计时中文标签:"还剩 3 天" / "今天截止" / "已截止" */
export function countdownLabel(endDate: string, now: Date = new Date()): string {
  const { days, totalMs } = countdownTo(endDate, now);
  if (totalMs < 0) return "已截止";
  if (days === 0) return "今天截止";
  if (days === 1) return "明天截止";
  return `还剩 ${days} 天`;
}

/** date 是否在 [start, end](含端点)内,均为 JST 日期字符串 */
export function isBetween(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}
