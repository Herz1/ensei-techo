import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const checkOnly = process.argv.includes("--check");
const source = (path) => resolve(ROOT, "src/data", path);

const [events, baseArtists, ingestedArtists, baseVenues, ingestedVenues] = await Promise.all([
  readFile(source("events.json"), "utf8").then(JSON.parse),
  readFile(source("artists.json"), "utf8").then(JSON.parse),
  readFile(source("artists-ingested.json"), "utf8").then(JSON.parse),
  readFile(source("venues.json"), "utf8").then(JSON.parse),
  readFile(source("venues-ingested.json"), "utf8").then(JSON.parse),
]);

const artists = [...baseArtists, ...ingestedArtists].map((artist) => ({
  id: artist.id,
  nameJa: artist.nameJa,
  nameZh: artist.nameZh,
  romaji: artist.romaji,
  kana: artist.kana,
  aliases: artist.aliases,
  genres: artist.genres,
  ...(artist.popularity !== undefined ? { popularity: artist.popularity } : {}),
  color: artist.color,
  ...(artist.profileStatus ? { profileStatus: artist.profileStatus } : {}),
}));

const venues = [...baseVenues, ...ingestedVenues].map((venue) => ({
  id: venue.id,
  nameJa: venue.nameJa,
  nameZh: venue.nameZh,
  prefecture: venue.prefecture,
  city: venue.city,
  lat: venue.lat,
  lng: venue.lng,
  capacity: venue.capacity,
  tier: venue.tier,
  stations: venue.stations,
  hubAccess: venue.hubAccess,
  ...(venue.lockers ? { lockers: venue.lockers } : {}),
  ...(venue.notes ? { notes: venue.notes } : {}),
  ...(venue.model3d ? { model3d: venue.model3d } : {}),
  ...(venue.profileStatus ? { profileStatus: venue.profileStatus } : {}),
}));

const eventSummaries = events.map((event) => ({
  id: event.id,
  artistIds: event.artistIds,
  titleJa: event.titleJa,
  titleZh: event.titleZh,
  ...(event.tourName ? { tourName: event.tourName } : {}),
  type: event.type,
  venueId: event.venueId,
  date: event.date,
  openTime: event.openTime,
  startTime: event.startTime,
  eventStatus: event.eventStatus,
  status: event.status,
  tiers: event.tiers,
  phases: event.phases,
  eligibility: event.eligibility,
  ticketLinks: event.ticketLinks,
  ticketOffers: event.ticketOffers,
  verification: {
    checkedAt: event.verification.checkedAt,
    sources: event.verification.sources,
  },
  ...(event.streaming ? { streaming: event.streaming } : {}),
}));

const summaryIndex = {
  schemaVersion: 1,
  generatedFrom: "src/data/events.json",
  eventCount: eventSummaries.length,
  events: eventSummaries,
  artists,
  venues,
};

const searchIndex = {
  schemaVersion: 1,
  generatedFrom: "src/data/events.json",
  events: eventSummaries.map((event) => ({
    id: event.id,
    artistIds: event.artistIds,
    titleJa: event.titleJa,
    titleZh: event.titleZh,
    ...(event.tourName ? { tourName: event.tourName } : {}),
    date: event.date,
    eventStatus: event.eventStatus,
    status: event.status,
  })),
  artists,
  venues,
};

const outputs = [
  {
    path: resolve(ROOT, "src/data/generated/event-summary-index.json"),
    content: `${JSON.stringify(summaryIndex)}\n`,
  },
  {
    path: resolve(ROOT, "public/data/search-index.json"),
    content: `${JSON.stringify(searchIndex)}\n`,
  },
];

for (const output of outputs) {
  if (checkOnly) {
    let current = null;
    try {
      current = await readFile(output.path, "utf8");
    } catch {
      // 统一使用下方的过期提示。
    }
    if (current !== output.content) {
      throw new Error(`客户端派生数据缺失或过期：${output.path}。请运行 npm run prepare:client-data。`);
    }
  } else {
    await mkdir(resolve(output.path, ".."), { recursive: true });
    await writeFile(output.path, output.content, "utf8");
  }
}

console.log(
  `${checkOnly ? "客户端派生数据检查通过" : "客户端派生数据已生成"}：${eventSummaries.length} 场、${artists.length} 位艺人、${venues.length} 个场馆。`,
);
