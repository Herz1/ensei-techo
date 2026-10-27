"use client";

import { CALENDAR_REMINDERS, normalizeCalendarReminder, type CalendarReminderMinutes } from "@/lib/ics-reminder";

export function CalendarReminderSelect({ value, onChange }: { value: CalendarReminderMinutes; onChange: (value: CalendarReminderMinutes) => void }) {
  return (
    <label className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
      演出提醒
      <select value={value} onChange={(event) => onChange(normalizeCalendarReminder(Number(event.target.value)))} className="min-h-9 rounded-xl border border-zinc-200 bg-white px-2 text-xs text-zinc-700 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200 dark:border-zinc-700 dark:bg-card-dark dark:text-zinc-200">
        {CALENDAR_REMINDERS.map((option) => <option key={option.minutes} value={option.minutes}>{option.label}</option>)}
      </select>
    </label>
  );
}
