import Fuse from "fuse.js";
import type {
  ArtistSummary,
  SearchEventSummary,
  SearchIndex,
  VenueSummary,
} from "@/lib/types";

/** 片假名 → 平假名(搜索归一化:「キングヌー」和「きんぐぬー」等价) */
export function kataToHira(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60),
  );
}

export function normalize(s: string | null | undefined): string {
  return kataToHira((s ?? "").toLowerCase().trim());
}

interface ArtistDoc {
  ref: ArtistSummary;
  nameJa: string;
  nameZh: string;
  romaji: string;
  kana: string;
  aliases: string[];
}

interface VenueDoc {
  ref: VenueSummary;
  nameJa: string;
  nameZh: string;
  city: string;
}

interface EventDoc {
  ref: SearchEventSummary;
  titleJa: string;
  titleZh: string;
  tourName: string;
}

let artistFuse: Fuse<ArtistDoc> | null = null;
let venueFuse: Fuse<VenueDoc> | null = null;
let eventFuse: Fuse<EventDoc> | null = null;
let indexedSource: SearchIndex | null = null;

function buildIndexes(index: SearchIndex) {
  if (artistFuse && indexedSource === index) return;
  indexedSource = index;

  artistFuse = new Fuse(
    index.artists.map((a) => ({
      ref: a,
      nameJa: normalize(a.nameJa),
      nameZh: normalize(a.nameZh),
      romaji: normalize(a.romaji),
      kana: normalize(a.kana),
      aliases: a.aliases.map(normalize),
    })),
    {
      keys: [
        { name: "nameJa", weight: 2 },
        { name: "nameZh", weight: 2 },
        { name: "romaji", weight: 1.5 },
        { name: "kana", weight: 1.5 },
        { name: "aliases", weight: 1.5 },
      ],
      threshold: 0.32,
      ignoreLocation: true,
      includeScore: true,
    },
  );

  venueFuse = new Fuse(
    index.venues.map((v) => ({
      ref: v,
      nameJa: normalize(v.nameJa),
      nameZh: normalize(v.nameZh),
      city: normalize(v.city),
    })),
    {
      keys: [
        { name: "nameJa", weight: 2 },
        { name: "nameZh", weight: 2 },
        { name: "city", weight: 1 },
      ],
      threshold: 0.32,
      ignoreLocation: true,
      includeScore: true,
    },
  );

  eventFuse = new Fuse(
    index.events.map((e) => ({
      ref: e,
      titleJa: normalize(e.titleJa),
      titleZh: normalize(e.titleZh),
      tourName: normalize(e.tourName ?? ""),
    })),
    {
      keys: [
        { name: "titleJa", weight: 2 },
        { name: "titleZh", weight: 2 },
        { name: "tourName", weight: 1 },
      ],
      threshold: 0.3,
      ignoreLocation: true,
      includeScore: true,
    },
  );
}

export interface SearchResults {
  artists: ArtistSummary[];
  venues: VenueSummary[];
  events: SearchEventSummary[];
}

export function searchAll(query: string, index: SearchIndex): SearchResults {
  const q = normalize(query);
  if (!q) return { artists: [], venues: [], events: [] };
  buildIndexes(index);

  const artistHits = artistFuse!.search(q, { limit: 5 }).map((r) => r.item.ref);
  const venueHits = venueFuse!.search(q, { limit: 4 }).map((r) => r.item.ref);

  // 演出:直接命中 + 命中艺人的未来场次
  const direct = eventFuse!.search(q, { limit: 6 }).map((r) => r.item.ref);
  const viaArtist =
    artistHits.length > 0
      ? index.events.filter((e) => e.artistIds.includes(artistHits[0].id))
      : [];
  const merged: SearchEventSummary[] = [];
  const seen = new Set<string>();
  for (const e of [...direct, ...viaArtist]) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    merged.push(e);
    if (merged.length >= 6) break;
  }

  return { artists: artistHits, venues: venueHits, events: merged };
}
