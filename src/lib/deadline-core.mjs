const FIXED_OFFSETS = {
  "Asia/Tokyo": "+09:00",
  "Asia/Shanghai": "+08:00",
};

export function isValidLocalDateTime(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(value)) return false;
  const [date, time] = value.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (hour > 23 || minute > 59) return false;
  const check = new Date(Date.UTC(year, month - 1, day, hour, minute));
  return check.getUTCFullYear() === year
    && check.getUTCMonth() === month - 1
    && check.getUTCDate() === day
    && check.getUTCHours() === hour
    && check.getUTCMinutes() === minute;
}

export function createDeadlineTiming(at, preferenceTimeZone, browserTimeZone) {
  if (!isValidLocalDateTime(at)) return null;
  const fixedOffset = FIXED_OFFSETS[preferenceTimeZone];
  const timestamp = fixedOffset
    ? Date.parse(`${at}:00${fixedOffset}`)
    : Date.parse(at);
  if (!Number.isFinite(timestamp)) return null;
  return {
    timeZone: preferenceTimeZone === "browser"
      ? (browserTimeZone || "browser")
      : preferenceTimeZone,
    instantAt: new Date(timestamp).toISOString(),
  };
}

export function deadlineInstant(deadline) {
  const exactTimestamp = Date.parse(deadline?.instantAt ?? "");
  if (Number.isFinite(exactTimestamp)) return { timestamp: exactTimestamp, exact: true };
  const fixedOffset = FIXED_OFFSETS[deadline?.timeZone];
  const timestamp = fixedOffset
    ? Date.parse(`${deadline.at}:00${fixedOffset}`)
    : Date.parse(deadline?.at ?? "");
  return {
    timestamp,
    exact: Boolean(fixedOffset) && Number.isFinite(timestamp),
  };
}

export function isDeadlineOverdue(deadline, nowMs = Date.now()) {
  const { timestamp } = deadlineInstant(deadline);
  return Number.isFinite(timestamp) && timestamp < nowMs;
}

export function manualDeadlineTimeZoneLabel(deadline) {
  if (!deadline?.timeZone) return "时区未记录（按当前浏览器本地时间解释）";
  if (deadline.timeZone === "Asia/Tokyo") return "日本时间（JST）";
  if (deadline.timeZone === "Asia/Shanghai") return "中国标准时间（Asia/Shanghai）";
  if (deadline.timeZone === "browser") return "浏览器本地时区（名称未识别）";
  return `用户时区（${deadline.timeZone}）`;
}

export function formatManualDeadlineWallTime(deadline) {
  if (!deadline?.at) return "时间未说明";
  return deadline.at.replace("T", " ");
}

function usableTimeZone(value) {
  if (!value || ["browser", "unknown"].includes(value)) return undefined;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(new Date(0));
    return value;
  } catch {
    return undefined;
  }
}

export function manualTaskTimeZoneLabel(task) {
  if (task?.timeZone === "Asia/Tokyo") return "日本时间（JST）";
  if (task?.timeZone === "Asia/Shanghai") return "中国标准时间（Asia/Shanghai）";
  if (task?.timeZone === "browser") return "保存时的浏览器本地时区";
  if (!task?.timeZone || task.timeZone === "unknown") return "时区未记录";
  return `用户时区（${task.timeZone}）`;
}

export function formatManualTaskWallTime(task) {
  const timestamp = Date.parse(task?.dueAt ?? "");
  if (!Number.isFinite(timestamp)) return "时间未说明";
  return new Intl.DateTimeFormat("zh-CN", {
    ...(usableTimeZone(task?.timeZone) ? { timeZone: task.timeZone } : {}),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

export function isManualTaskOverdue(task, nowMs = Date.now()) {
  const timestamp = Date.parse(task?.dueAt ?? "");
  return Number.isFinite(timestamp) && timestamp < nowMs;
}

export function calendarDateKey(timestamp, timeZone) {
  if (!Number.isFinite(timestamp)) return null;
  return new Intl.DateTimeFormat("en-CA", {
    ...(usableTimeZone(timeZone) ? { timeZone } : {}),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
}
