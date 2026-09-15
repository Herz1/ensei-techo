import {
  makeSourceRecord,
  refreshRecordContentHash,
} from "../event-ingest-lib.mjs";
import { parseFantasticsSunflower } from "../parsers/fantastics-sunflower.mjs";

const VENUE_IDS = new Map([
  ["Aichi Sky Expo(愛知県国際展示場) ホールA", "aichi-sky-expo-hall-a"],
  ["広島グリーンアリーナ", "hiroshima-green-arena"],
  ["大阪城ホール", "osaka-jo-hall"],
  ["静岡エコパアリーナ", "ecopa-arena"],
  ["有明アリーナ", "ariake-arena"],
  ["マリンメッセ福岡A館", "marine-messe-a"],
  ["国立代々木競技場 第一体育館", "yoyogi-first"],
  ["サンドーム福井", "sundome-fukui"],
]);

function collectionMonthKeys(months) {
  return new Set(
    months.map(({ year, month }) =>
      `${Number(year)}-${String(Number(month)).padStart(2, "0")}`,
    ),
  );
}

export function createFantasticsSunflowerSourceAdapter(context) {
  const definition = {
    id: "fantastics-sunflower-official",
    name: "FANTASTICS LIVE TOUR 2026 SUNFLOWER 公式",
    type: "artist_official",
    role: "artist_official",
    parserIds: ["fantastics-sunflower-html"],
    parserVersion: "2",
    url: "https://www.ldh-liveschedule.jp/sys/tour/40198/",
    fetchedAt: context.generatedAt,
  };

  return {
    definition,
    async collect({ fetchText, recordParserResult, getRawEvidence }) {
      const html = await fetchText(definition.url, {
        evidenceRole: "artist_official",
      });
      const parsed = parseFantasticsSunflower(html, definition.url, {
        months: context.months,
      });
      const raw = getRawEvidence(definition.url);
      await recordParserResult({
        url: definition.url,
        parserId: "fantastics-sunflower-html",
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
          reason: `目标 collection window 与官方 tour 月份不重叠: ${parsed.tourMonths.join(", ")}`,
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
            lineupText: "FANTASTICS",
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
