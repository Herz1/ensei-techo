import type { ArtistSummary, EventSummary, VenueSummary } from "@/lib/types";
import { todayJst } from "@/lib/time";

export function eventHeat(e: Pick<EventSummary, "date">): number {
  return e.date >= todayJst() ? 1 : 0;
}

export function upcomingEvents(events: EventSummary[], now = todayJst()): EventSummary[] {
  return events.filter((e) => e.date >= now);
}

export function artistHeat(a: ArtistSummary, events: EventSummary[]): number {
  return events.filter(
    (e) => e.artistIds.includes(a.id) && e.status !== "ended",
  ).length;
}

export function topArtists(artists: ArtistSummary[], events: EventSummary[], n: number): { artist: ArtistSummary; heat: number }[] {
  return artists
    .map((a) => ({ artist: a, heat: artistHeat(a, events) }))
    .filter((item) => item.heat > 0)
    .sort((x, y) => y.heat - x.heat)
    .slice(0, n);
}

export function topEvents(events: EventSummary[], n: number): { event: EventSummary; heat: number }[] {
  const now = todayJst();
  return events
    .filter((e) => e.date >= now)
    .map((e) => ({ event: e, heat: eventHeat(e) }))
    .sort((x, y) => x.event.date.localeCompare(y.event.date))
    .slice(0, n);
}

/** 各都道府县热度(未来公演),用于地区榜与地图热力 */
export function prefectureHeat(events: EventSummary[], venues: VenueSummary[]): Map<string, { heat: number; count: number }> {
  const now = todayJst();
  const venueById = new Map(venues.map((venue) => [venue.id, venue]));
  const map = new Map<string, { heat: number; count: number }>();
  for (const e of events) {
    if (e.date < now) continue;
    const v = venueById.get(e.venueId);
    if (!v) continue;
    const cur = map.get(v.prefecture) ?? { heat: 0, count: 0 };
    cur.heat += eventHeat(e);
    cur.count += 1;
    map.set(v.prefecture, cur);
  }
  return map;
}
