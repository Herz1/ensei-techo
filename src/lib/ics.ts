// 想看演出 → ICS 日历(纯前端生成下载,可导入手机/Google 日历)
import type { EventSummary, VenueSummary } from "@/lib/types";
import type { ManualTask, UserEventPlan } from "@/lib/store";
import type { TripPlan } from "@/lib/trip-store";
import { buildTripTimeline, estimatedEnd } from "@/lib/trip";
import { jstDate } from "@/lib/time";
import { manualTaskTimeZoneLabel } from "@/lib/deadline-core.mjs";

/** ICS 文本字段转义:逗号/分号/反斜杠/换行 */
function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/** Date → ICS UTC 时间戳 "20260812T090000Z" */
function utcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** RFC 5545 行折叠:超过 75 字节按 UTF-8 安全折行 */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let curBytes = 0;
  for (const ch of line) {
    const b = new TextEncoder().encode(ch).length;
    // 续行以空格开头,占 1 字节
    const limit = out.length === 0 ? 75 : 74;
    if (curBytes + b > limit) {
      out.push(cur);
      cur = ch;
      curBytes = b;
    } else {
      cur += ch;
      curBytes += b;
    }
  }
  if (cur) out.push(cur);
  return out.join("\r\n ");
}

const LIVE_DURATION_MS = 2.5 * 3600_000;

/** 生成想看演出的 VCALENDAR 文本 */
export function buildIcs(items: { event: EventSummary; venue?: VenueSummary }[]): string {
  const now = utcStamp(new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ensei-techo//EnseiTecho//CN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:远征手账 · 想看的 Live",
  ];

  for (const { event, venue } of items) {
    const start = jstDate(event.date, event.startTime);
    const end = new Date(start.getTime() + LIVE_DURATION_MS);
    const location = venue
      ? [venue.nameJa, venue.city].filter(Boolean).join(" · ")
      : "";
    const desc = [
      `開場 ${event.openTime} / 開演 ${event.startTime} (JST)`,
      event.tourName ? `巡演: ${event.tourName}` : "",
      `状态: ${event.status}`,
      "由 远征手账导出；演出信息以官方页面为准",
    ]
      .filter(Boolean)
      .join("\n");

    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.id}@ensei-techo`,
      `DTSTAMP:${now}`,
      `DTSTART:${utcStamp(start)}`,
      `DTEND:${utcStamp(end)}`,
      `SUMMARY:${esc(event.titleJa)}`,
      location ? `LOCATION:${esc(location)}` : "",
      `DESCRIPTION:${esc(desc)}`,
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.filter(Boolean).map(fold).join("\r\n") + "\r\n";
}

/** 将用户手动填写的截止时间导出为 VTODO 或 30 分钟 VEVENT。 */
export function buildDeadlineIcs(
  items: { plan: UserEventPlan; task: ManualTask; event: EventSummary }[],
  mode: "task" | "event",
): string {
  const now = utcStamp(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ensei-techo//EnseiTecho//CN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:远征手账 · 个人截止${mode === "task" ? "任务" : "日历"}`,
  ];

  for (const { plan, task, event } of items) {
    const dueTimestamp = Date.parse(task.dueAt);
    const due = new Date(dueTimestamp);
    if (!Number.isFinite(dueTimestamp)) continue;
    const linkedApplication = task.linkedApplicationId
      ? plan.applications.find((application) => application.id === task.linkedApplicationId)
      : undefined;
    const summary = `${task.label} · ${event.titleJa}`;
    const description = [
      `此时间由用户手动填写；${manualTaskTimeZoneLabel(task)}。`,
      "导出保持保存时的绝对时刻。",
      linkedApplication ? `关联申请：${linkedApplication.label}` : "未关联具体申请。",
      "请自行对照官方页面确认。",
    ].join("\n");
    if (mode === "task") {
      lines.push(
        "BEGIN:VTODO",
        `UID:deadline-${event.id}-${task.id}@ensei-techo`,
        `DTSTAMP:${now}`,
        `DUE:${utcStamp(due)}`,
        `SUMMARY:${esc(summary)}`,
        `DESCRIPTION:${esc(description)}`,
        "STATUS:NEEDS-ACTION",
        "END:VTODO",
      );
    } else {
      const end = new Date(due.getTime() + 30 * 60_000);
      lines.push(
        "BEGIN:VEVENT",
        `UID:deadline-${event.id}-${task.id}@ensei-techo`,
        `DTSTAMP:${now}`,
        `DTSTART:${utcStamp(due)}`,
        `DTEND:${utcStamp(end)}`,
        `SUMMARY:${esc(summary)}`,
        `DESCRIPTION:${esc(description)}`,
        "END:VEVENT",
      );
    }
  }

  lines.push("END:VCALENDAR");
  return lines.filter(Boolean).map(fold).join("\r\n") + "\r\n";
}

/** 生成一次远征的多场公演与用户行程 ICS；正式公演时刻按 JST 解释。 */
export function buildTripIcs(
  trip: TripPlan,
  items: { event: EventSummary; venue?: VenueSummary }[],
): string {
  const now = utcStamp(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ensei-techo//EnseiTecho Trip//CN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(`远征手账 · ${trip.name}`)}`,
  ];

  for (const { event, venue } of items) {
    const start = jstDate(event.date, event.startTime);
    const endMeta = estimatedEnd(event, trip);
    const end = new Date(endMeta.timestamp);
    const location = venue
      ? [venue.nameJa, venue.city].filter(Boolean).join(" · ")
      : "";
    const description = [
      `官方开场 ${event.openTime} / 开演 ${event.startTime}（JST）`,
      endMeta.estimated
        ? "结束时间为开演后 150 分钟估算，并非官方公布"
        : "结束时间为个人确认，由用户手动填写",
      "由日历客户端负责转换为设备时区",
    ].join("\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:trip-${trip.id}-${event.id}@ensei-techo`,
      `DTSTAMP:${now}`,
      `DTSTART:${utcStamp(start)}`,
      `DTEND:${utcStamp(end)}`,
      `SUMMARY:${esc(event.titleJa)}`,
      location ? `LOCATION:${esc(location)}` : "",
      `DESCRIPTION:${esc(description)}`,
      "END:VEVENT",
    );
  }

  const eventById = new Map(items.map(({ event }) => [event.id, event]));
  const venueById = new Map(
    items.flatMap(({ event, venue }) => (venue ? [[event.venueId, venue] as const] : [])),
  );
  const nonEventItems = buildTripTimeline(trip, { eventById, venueById }).filter((item) => item.kind !== "event");
  for (const item of nonEventItems) {
    lines.push("BEGIN:VEVENT", `UID:trip-${trip.id}-${item.id}@ensei-techo`, `DTSTAMP:${now}`);
    if (item.time) {
      const start = jstDate(item.date, item.time);
      lines.push(
        `DTSTART:${utcStamp(start)}`,
        `DTEND:${utcStamp(new Date(start.getTime() + (item.durationMinutes ?? 30) * 60_000))}`,
      );
    } else {
      lines.push(`DTSTART;VALUE=DATE:${item.date.replaceAll("-", "")}`);
    }
    lines.push(
      `SUMMARY:${esc(item.title)}`,
      item.detail ? `DESCRIPTION:${esc(`${item.detail}\n用户填写的远征事项（JST）`)}` : "",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.filter(Boolean).map(fold).join("\r\n") + "\r\n";
}

/** 触发浏览器文件下载 */
export function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
