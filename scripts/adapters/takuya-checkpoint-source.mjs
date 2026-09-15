import {
  makeSourceRecord,
  refreshRecordContentHash,
} from "../event-ingest-lib.mjs";
import { parseTakuyaCheckpoint } from "../parsers/takuya-checkpoint.mjs";

const VENUE_IDS = new Map([
  ["GLION ARENA KOBE", "glion-arena-kobe"],
  ["マリンメッセ福岡A館", "marine-messe-a"],
  ["ららアリーナ 東京ベイ", "lalaarena-tokyo-bay"],
]);

function collectionMonthKeys(months) {
  return new Set(
    months.map(({ year, month }) =>
      `${Number(year)}-${String(Number(month)).padStart(2, "0")}`,
    ),
  );
}

export function createTakuyaCheckpointSourceAdapter(context) {
  const definition = {
    id: "takuya-checkpoint-official",
    name: "TAKUYA KIMURA Live Tour 2026 Checkpoint 公式",
    type: "artist_official",
    role: "artist_official",
    parserIds: ["takuya-checkpoint-html"],
    parserVersion: "1",
    url: "https://starto.jp/s/p/live/10520",
    fetchedAt: context.generatedAt,
  };

  return {
    definition,
    async collect({ fetchText, recordParserResult, getRawEvidence }) {
      const html = await fetchText(definition.url, {
        evidenceRole: "artist_official",
      });
      const parsed = parseTakuyaCheckpoint(html, definition.url, {
        months: context.months,
      });
      const raw = getRawEvidence(definition.url);
      await recordParserResult({
        url: definition.url,
        parserId: "takuya-checkpoint-html",
        status: parsed.ok ? "success" : "parser_failed",
        error: parsed.ok ? undefined : parsed.reason,
        outputCount: parsed.records.length,
      });
      if (!parsed.ok) return { records: [] };

      const targetMonths = collectionMonthKeys(context.months);
      const overlapsTour = parsed.tourMonths.some((month) => targetMonths.has(month));
      if (!overlapsTour) {
        return {
          skipped: true,
          reason: `目标 collection window 与 Checkpoint 日本公演月份不重叠: ${parsed.tourMonths.join(", ")}`,
          records: [],
        };
      }

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
            lineupText: "木村拓哉",
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
              openTime: "not_found_on_page",
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
