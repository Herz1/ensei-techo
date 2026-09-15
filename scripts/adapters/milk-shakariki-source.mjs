import {
  makeSourceRecord,
  refreshRecordContentHash,
} from "../event-ingest-lib.mjs";
import { parseMilkShakariki } from "../parsers/milk-shakariki.mjs";

const VENUE_IDS = new Map([
  ["マリンメッセ福岡B館", "marine-messe-b"],
  ["ゼビオアリーナ仙台", "xebio-arena-sendai"],
  ["ぴあアリーナMM", "pia-arena-mm"],
  ["Aichi Sky Expo(愛知県国際展示場) ホールA", "aichi-sky-expo-hall-a"],
  ["大阪城ホール", "osaka-jo-hall"],
  ["横浜アリーナ", "yokohama-arena"],
]);

function collectionMonthKeys(months) {
  return new Set(months.map(({ year, month }) =>
    `${Number(year)}-${String(Number(month)).padStart(2, "0")}`,
  ));
}

export function createMilkShakarikiSourceAdapter(context) {
  const definition = {
    id: "milk-shakariki-official",
    name: "M!LK ARENA TOUR 2026-2027 シャカリキレボリューション 公式",
    type: "artist_official",
    role: "artist_official",
    parserIds: ["milk-shakariki-html"],
    parserVersion: "1",
    url: "https://sd-milk.com/pages/shakarikirevolution",
    fetchedAt: context.generatedAt,
  };

  return {
    definition,
    async collect({ fetchText, recordParserResult, getRawEvidence }) {
      const html = await fetchText(definition.url, { evidenceRole: "artist_official" });
      const parsed = parseMilkShakariki(html, definition.url, {
        months: context.months,
      });
      const raw = getRawEvidence(definition.url);
      await recordParserResult({
        url: definition.url,
        parserId: "milk-shakariki-html",
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
          reason: `目标 collection window 与 M!LK Shakariki tour 月份不重叠: ${parsed.tourMonths.join(", ")}`,
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
            lineupText: "M!LK",
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
        records: records.filter((record, index, all) =>
          all.findIndex((candidate) => candidate.sourceEventId === record.sourceEventId) === index,
        ),
      };
    },
  };
}
