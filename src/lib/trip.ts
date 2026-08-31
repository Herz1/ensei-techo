import type { EventSummary, VenueSummary } from "@/lib/types";
import { TRAVEL_LEG_LABELS, type TripPlan } from "@/lib/trip-store";
import { prefectureById } from "@/data/prefectures";
import { jstDate } from "@/lib/time";

export const ESTIMATED_LIVE_MINUTES = 150;

export interface TripCatalog {
  eventById: ReadonlyMap<string, EventSummary>;
  venueById: ReadonlyMap<string, VenueSummary>;
}

export interface TripConflict {
  key: string;
  type: "overlap" | "cross_prefecture" | "buffer" | "return_before_end";
  eventIds: string[];
  title: string;
  detail: string;
}

export interface TripTimelineItem {
  id: string;
  date: string;
  time?: string;
  kind: "arrival" | "return" | "stay" | "custom" | "event" | "travel";
  title: string;
  detail?: string;
  eventId?: string;
  estimated?: boolean;
  durationMinutes?: number;
  status?: "estimated" | "confirmed";
}

function minutesOf(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

export function estimatedEnd(
  event: Pick<EventSummary, "id" | "date" | "startTime">,
  trip: TripPlan,
): {
  date: string;
  time: string;
  estimated: boolean;
  timestamp: number;
} {
  const override = trip.eventEndOverrides[event.id];
  if (override) {
    let timestamp = jstDate(event.date, override).getTime();
    if (minutesOf(override) < minutesOf(event.startTime)) timestamp += 86_400_000;
    const date = new Date(timestamp).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
    return { date, time: override, estimated: false, timestamp };
  }
  const timestamp = jstDate(event.date, event.startTime).getTime() + ESTIMATED_LIVE_MINUTES * 60_000;
  const end = new Date(timestamp);
  return {
    date: end.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }),
    time: end.toLocaleTimeString("sv-SE", {
      timeZone: "Asia/Tokyo",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
    estimated: true,
    timestamp,
  };
}

export function detectTripConflicts(trip: TripPlan, catalog: TripCatalog): TripConflict[] {
  const { eventById, venueById } = catalog;
  const tripEvents = trip.eventIds
    .map((eventId) => eventById.get(eventId))
    .filter((event): event is EventSummary => Boolean(event));
  const conflicts: TripConflict[] = [];

  for (let leftIndex = 0; leftIndex < tripEvents.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < tripEvents.length; rightIndex += 1) {
      const originalLeft = tripEvents[leftIndex];
      const originalRight = tripEvents[rightIndex];
      if (originalLeft.date !== originalRight.date) continue;
      const [left, right] = [originalLeft, originalRight].sort((a, b) =>
        a.openTime.localeCompare(b.openTime),
      );
      const pairKey = [left.id, right.id].sort().join("-");
      const leftVenue = venueById.get(left.venueId);
      const rightVenue = venueById.get(right.venueId);
      if (
        leftVenue &&
        rightVenue &&
        leftVenue.prefecture !== rightVenue.prefecture
      ) {
        const leftPrefecture = prefectureById.get(leftVenue.prefecture)?.nameZh ?? leftVenue.prefecture;
        const rightPrefecture = prefectureById.get(rightVenue.prefecture)?.nameZh ?? rightVenue.prefecture;
        conflicts.push({
          key: `cross-${pairKey}`,
          type: "cross_prefecture",
          eventIds: [left.id, right.id],
          title: "同日跨都道府县",
          detail: `${leftPrefecture}与${rightPrefecture}为同日场次；请自行查询实际交通，不代表必然不可行。`,
        });
      }

      const leftEnd = estimatedEnd(left, trip).timestamp;
      const rightOpen = jstDate(right.date, right.openTime).getTime();
      if (rightOpen < leftEnd) {
        conflicts.push({
          key: `overlap-${pairKey}`,
          type: "overlap",
          eventIds: [left.id, right.id],
          title: "公演时间重叠",
          detail: `后一场开场早于前一场${estimatedEnd(left, trip).estimated ? "估算" : "手动"}结束时间。`,
        });
      } else {
        const gapMinutes = Math.floor((rightOpen - leftEnd) / 60_000);
        if (gapMinutes < trip.bufferMinutes) {
          conflicts.push({
            key: `buffer-${pairKey}-${trip.bufferMinutes}`,
            type: "buffer",
            eventIds: [left.id, right.id],
            title: "场次缓冲不足",
            detail: `两场之间约 ${gapMinutes} 分钟，低于你设置的 ${trip.bufferMinutes} 分钟；请结合实际散场和交通确认。`,
          });
        }
      }
    }
  }

  for (const event of tripEvents) {
    const eventStart = jstDate(event.date, event.startTime).getTime();
    const end = estimatedEnd(event, trip);
    const departures = [
      ...trip.travelLegs.flatMap((leg) => leg.departAt ? [{ id: leg.id, at: leg.departAt, label: `${leg.from} → ${leg.to}` }] : []),
      ...(trip.returnAt ? [{ id: "return", at: trip.returnAt, label: "返程" }] : []),
    ];
    for (const departure of departures) {
      const timestamp = jstDate(departure.at.slice(0, 10), departure.at.slice(11, 16)).getTime();
      if (timestamp <= eventStart || timestamp >= end.timestamp) continue;
      conflicts.push({
        key: `return-before-end-${event.id}-${departure.id}`,
        type: "return_before_end",
        eventIds: [event.id],
        title: "交通出发早于演出结束",
        detail: `${departure.label} 的出发时间早于本场${end.estimated ? "按 150 分钟估算的" : "个人确认的"}结束时间；请核对是否需要提前离场或调整交通。`,
      });
    }
  }
  return conflicts;
}

function noteItem(
  id: string,
  at: string | undefined,
  kind: TripTimelineItem["kind"],
  title: string,
  detail: string | undefined,
): TripTimelineItem | null {
  if (!at && !detail) return null;
  return {
    id,
    date: at?.slice(0, 10) ?? "",
    ...(at ? { time: at.slice(11, 16) } : {}),
    kind,
    title,
    ...(detail ? { detail } : {}),
  };
}

export function buildTripTimeline(trip: TripPlan, catalog: TripCatalog): TripTimelineItem[] {
  const { eventById, venueById } = catalog;
  const items: TripTimelineItem[] = [];
  const arrival = noteItem("arrival", trip.arrivalAt, "arrival", "抵达／去程", trip.arrivalNote);
  const stay = noteItem("stay", trip.stayAt, "stay", "住宿", trip.stayNote);
  const returning = noteItem("return", trip.returnAt, "return", "返程", trip.returnNote);
  if (arrival) items.push({ ...arrival, date: arrival.date || trip.startDate });
  if (stay) items.push({ ...stay, date: stay.date || trip.startDate });
  if (returning) items.push({ ...returning, date: returning.date || trip.endDate });

  for (const eventId of trip.eventIds) {
    const event = eventById.get(eventId);
    if (!event) continue;
    const venue = venueById.get(event.venueId);
    const end = estimatedEnd(event, trip);
    items.push(
      {
        id: `${event.id}-open`,
        date: event.date,
        time: event.openTime,
        kind: "event",
        eventId: event.id,
        title: `开场 · ${event.titleJa}`,
        detail: venue?.nameJa,
      },
      {
        id: `${event.id}-start`,
        date: event.date,
        time: event.startTime,
        kind: "event",
        eventId: event.id,
        title: `开演 · ${event.titleJa}`,
        detail: "官方开演时间（JST）",
      },
      {
        id: `${event.id}-end`,
        date: end.date,
        time: end.time,
        kind: "event",
        eventId: event.id,
        title: `${end.estimated ? "预计结束" : "手动结束"} · ${event.titleJa}`,
        detail: end.estimated ? "按开演后 150 分钟估算，不是官方结束时间" : "个人确认，由用户手动填写",
        estimated: end.estimated,
      },
    );
  }

  for (const item of trip.customItems) {
    items.push({
      id: item.id,
      date: item.date,
      ...(item.time ? { time: item.time } : {}),
      kind: "custom",
      title: item.label,
      detail: item.kind === "transport" ? "交通事项" : item.kind === "stay" ? "住宿事项" : "自定义待办",
    });
  }

  for (const leg of trip.travelLegs) {
    const date = leg.departAt?.slice(0, 10) ?? leg.arriveAt?.slice(0, 10) ?? trip.startDate;
    const time = leg.departAt?.slice(11, 16) ?? leg.arriveAt?.slice(11, 16);
    const detail = [
      leg.arriveAt ? `到达 ${leg.arriveAt.replace("T", " ")}` : "到达未说明",
      leg.durationMinutes !== undefined ? `${leg.durationMinutes} 分钟` : "时长未说明",
      leg.status === "confirmed" ? "个人确认" : "个人估算",
      leg.referenceUrl,
      leg.note,
    ].filter(Boolean).join(" · ");
    items.push({
      id: leg.id,
      date,
      ...(time ? { time } : {}),
      kind: "travel",
      title: `${TRAVEL_LEG_LABELS[leg.type]} · ${leg.from} → ${leg.to}`,
      detail,
      ...(leg.durationMinutes !== undefined ? { durationMinutes: leg.durationMinutes } : {}),
      status: leg.status,
      estimated: leg.status === "estimated",
    });
  }

  return items.sort((left, right) => {
    const dateCompared = left.date.localeCompare(right.date);
    if (dateCompared !== 0) return dateCompared;
    return (left.time ?? "99:99").localeCompare(right.time ?? "99:99");
  });
}

export function venueDestination(venue: VenueSummary): string {
  if (venue.lat !== null && venue.lng !== null) return `${venue.lat},${venue.lng}`;
  const station = venue.stations[0];
  return station ? `${station.station}駅` : venue.nameJa;
}

export function mapsRouteUrl(origin: string, destination: string): string {
  const params = new URLSearchParams({
    api: "1",
    origin,
    destination,
    travelmode: "transit",
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
