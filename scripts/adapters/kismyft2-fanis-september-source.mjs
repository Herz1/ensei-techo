import {
  makeSourceRecord,
  refreshRecordContentHash,
} from "../event-ingest-lib.mjs";
import { parseKismyft2FanisSeptember } from "../parsers/kismyft2-fanis-september.mjs";

const VENUE_IDS = new Map([
  ["ららアリーナ 東京ベイ", "lalaarena-tokyo-bay"],
  ["広島グリーンアリーナ", "hiroshima-green-arena"],
  ["朱鷺メッセ", "toki-messe"],
]);

function collectionMonthKeys(months) {
  return new Set(months.map(({ year, month }) =>
    `${Number(year)}-${String(Number(month)).padStart(2, "0")}`,
  ));
}

export function createKismyft2FanisSeptemberSourceAdapter(context) {
  const definition = {
    id: "kismyft2-fanis-september-official",
    name: "Kis-My-Ft2 LIVE TOUR 2026 fan IS September 公式",
    type: "artist_official",
    role: "artist_official",
    parserIds: ["kismyft2-fanis-september-html"],
    parserVersion: "1",
    url: "https://starto.jp/s/p/live/10460",
    fetchedAt: context.generatedAt,
  };

  return {
    definition,
    async collect({ fetchText, recordParserResult, getRawEvidence }) {
      const html = await fetchText(definition.url, { evidenceRole: "artist_official" });
      const parsed = parseKismyft2FanisSeptember(html, definition.url, {
        months: context.months,
      });
      const raw = getRawEvidence(definition.url);
      await recordParserResult({
        url: definition.url,
        parserId: "kismyft2-fanis-september-html",
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
          reason: `目标 collection window 与 fan IS 9 月最终段不重叠: ${parsed.tourMonths.join(", ")}`,
          records: [],
        };
      }

      const records = parsed.records.map((event, index) => {
        const record = makeSourceRecord(
          { ...definition, rawEvidence: raw },
          {
            sourceEventId: `${event.date}|${event.venueName}|${event.startTime ?? index}`,
            sourceUrl: definition.url,
            title: event.title,
            lineupText: "Kis-My-Ft2",
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
        records: records.filter((record, index, all) =>
          all.findIndex((candidate) => candidate.sourceEventId === record.sourceEventId) === index,
        ),
      };
    },
  };
}
