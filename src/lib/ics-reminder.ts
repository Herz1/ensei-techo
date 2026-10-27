export const CALENDAR_REMINDERS = [
  { minutes: 0, label: "不提醒" },
  { minutes: 30, label: "提前 30 分钟" },
  { minutes: 60, label: "提前 1 小时" },
  { minutes: 1440, label: "提前 1 天" },
] as const;

export type CalendarReminderMinutes = (typeof CALENDAR_REMINDERS)[number]["minutes"];

export function normalizeCalendarReminder(value: unknown): CalendarReminderMinutes {
  return CALENDAR_REMINDERS.find((option) => option.minutes === value)?.minutes ?? 0;
}

/** A DISPLAY alarm is embedded only in explicitly selected performance events. */
export function calendarAlarm(minutes: CalendarReminderMinutes): string[] {
  const safe = normalizeCalendarReminder(minutes);
  if (!safe) return [];
  return [
    "BEGIN:VALARM",
    safe === 1440 ? "TRIGGER:-P1D" : `TRIGGER:-PT${safe}M`,
    "ACTION:DISPLAY",
    "DESCRIPTION:演出即将开始，请确认官方时间与出行安排。",
    "END:VALARM",
  ];
}
