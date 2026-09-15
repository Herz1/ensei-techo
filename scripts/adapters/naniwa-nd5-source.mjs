import {
  makeSourceRecord,
  refreshRecordContentHash,
} from "../event-ingest-lib.mjs";
import { parseNaniwaNd5 } from "../parsers/naniwa-nd5.mjs";

const VENUE_IDS = new Map([
  ["北海きたえーる", "kitaele"],
  ["マリンメッセ福岡A館", "marine-messe-a"],
  ["大阪城ホール", "osaka-jo-hall"],
  ["横浜アリーナ", "yokohama-arena"],
  ["宮城セキスイハイムスーパーアリーナ", "sekisui-heim-super-arena"],
  ["朱鷺メッセ", "toki-messe"],
  ["あなぶきアリーナ香川", "anabuki-arena-kagawa"],
  ["静岡エコパアリーナ", "ecopa-arena"],
  ["ららアリーナ 東京ベイ", "lalaarena-tokyo-bay"],
]);

function collectionMonthKeys(months) {
  return new Set(
    months.map(({ year, month }) =>
      `${Number(year)}-${String(Number(month)).padStart(2, "0")}`,
    ),
  );
}

export function createNaniwaNd5SourceAdapter(context) {
  const definition = {
    id: "naniwa-nd5-official",
    name: "なにわ男子 LIVE TOUR 2026 ND5 公式",
    type: "artist_official",
    role: "artist_official",
    parserIds: ["naniwa-nd5-html"],
    parserVersion: "1",
    url: "https://starto.jp/s/p/live/10489",
    fetchedAt: context.generatedAt,
  };

  return {
    definition,
    async collect({ fetchText, recordParserResult, getRawEvidence }) {
      const html = await fetchText(definition.url, {
        evidenceRole: "artist_official",
      });
      const parsed = parseNaniwaNd5(html, definition.url, {
        months: context.months,
      });
      const raw = getRawEvidence(definition.url);
      await recordParserResult({
        url: definition.url,
        parserId: "naniwa-nd5-html",
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
          reason: `目标 collection window 与 なにわ男子 ND5 tour 月份不重叠: ${parsed.tourMonths.join(", ")}`,
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
            lineupText: "なにわ男子",
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
