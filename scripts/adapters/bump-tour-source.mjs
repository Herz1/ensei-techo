import {
  makeSourceRecord,
  refreshRecordContentHash,
} from "../event-ingest-lib.mjs";
import { parseBumpTour } from "../parsers/bump-tour.mjs";

const ACTIVE_MONTHS = new Set([
  "2026-10",
  "2026-11",
  "2026-12",
  "2027-01",
  "2027-02",
]);

const VENUE_IDS = new Map([
  ["ゼビオアリーナ仙台", "xebio-arena-sendai"],
  ["北海きたえーる", "kitaele"],
  ["有明アリーナ", "ariake-arena"],
  ["GLION ARENA KOBE", "glion-arena-kobe"],
  ["あなぶきアリーナ香川", "anabuki-arena-kagawa"],
  ["広島グリーンアリーナ", "hiroshima-green-arena"],
  ["マリンメッセ福岡A館", "marine-messe-a"],
  ["IGアリーナ", "ig-arena"],
  ["京セラドーム大阪", "kyocera-dome"],
  ["東京ドーム", "tokyo-dome"],
]);

function collectionOverlapsTour(months) {
  return months.some(({ year, month }) =>
    ACTIVE_MONTHS.has(`${Number(year)}-${String(Number(month)).padStart(2, "0")}`),
  );
}

export function createBumpTourSourceAdapter(context) {
  const definition = {
    id: "bump-tour-2026-2027-official",
    name: "BUMP OF CHICKEN TOUR 2026-2027 公式",
    type: "artist_official",
    role: "artist_official",
    parserIds: ["bump-ratio-clavis-html"],
    parserVersion: "1",
    url: "https://www.bumpofchicken.com/live_information/2799",
    fetchedAt: context.generatedAt,
  };

  return {
    definition,
    async collect({ fetchText, recordParserResult, getRawEvidence }) {
      if (!collectionOverlapsTour(context.months)) {
        return {
          skipped: true,
          reason: "目标 collection window 不覆盖 BUMP OF CHICKEN Ratio Clavis 公演月份",
          records: [],
        };
      }

      const html = await fetchText(definition.url, {
        evidenceRole: "artist_official",
      });
      const parsed = parseBumpTour(html, definition.url, {
        months: context.months,
      });
      const raw = getRawEvidence(definition.url);
      await recordParserResult({
        url: definition.url,
        parserId: "bump-ratio-clavis-html",
        status: parsed.ok ? "success" : "parser_failed",
        error: parsed.ok ? undefined : parsed.reason,
        outputCount: parsed.records.length,
      });
      if (!parsed.ok) return { records: [] };

      const records = parsed.records.map((event, index) => {
        const record = makeSourceRecord(
          {
            ...definition,
            rawEvidence: raw,
          },
          {
            sourceEventId: `${event.date}|${event.venueName}|${event.startTime ?? index}`,
            sourceUrl: definition.url,
            title: event.title,
            lineupText: "BUMP OF CHICKEN",
            artistNames: event.artistNames,
            venueName: event.venueName,
            venueIdHint: VENUE_IDS.get(event.venueName),
            date: event.date,
            openTime: event.openTime,
            startTime: event.startTime,
            ticketTypes: event.ticketTypes,
            pricesJpy: event.pricesJpy,
            sourceChain: [{
              role: "artist_official",
              sourceId: definition.id,
              url: definition.url,
              fetchStatus: "success",
              contentHash: raw?.contentHash,
              contentType: raw?.contentType,
              httpStatus: raw?.httpStatus,
              fetchedAt: raw?.fetchedAt,
            }],
            fieldAvailability: {
              ticketTypes: event.ticketTypes.length ? "published" : "not_found_on_page",
              prices: event.pricesJpy.length ? "published" : "not_found_on_page",
              additionalFees: "not_checked",
              ticketPhases: "not_checked",
              eligibility: "not_checked",
              purchaseUrls: "not_checked",
              openTime: event.openTime ? "published" : "not_found_on_page",
              startTime: event.startTime ? "published" : "not_found_on_page",
            },
            statusHint: "unknown",
          },
        );
        return refreshRecordContentHash(record);
      });

      return {
        records: records.filter(
          (record, index, all) =>
            all.findIndex((candidate) => candidate.sourceEventId === record.sourceEventId) === index,
        ),
      };
    },
  };
}
