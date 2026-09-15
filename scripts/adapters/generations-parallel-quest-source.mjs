import {
  makeSourceRecord,
  refreshRecordContentHash,
} from "../event-ingest-lib.mjs";
import { parseGenerationsParallelQuest } from "../parsers/generations-parallel-quest-v2.mjs";

const VENUE_IDS = new Map([
  ["ビッグハット", "big-hat-nagano"],
  ["マリンメッセ福岡A館", "marine-messe-a"],
  ["有明アリーナ", "ariake-arena"],
  ["サンドーム福井", "sundome-fukui"],
  ["大阪城ホール", "osaka-jo-hall"],
  ["GLION ARENA KOBE", "glion-arena-kobe"],
  ["あなぶきアリーナ香川", "anabuki-arena-kagawa"],
  ["広島グリーンアリーナ", "hiroshima-green-arena"],
  ["IGアリーナ", "ig-arena"],
  ["朱鷺メッセ", "toki-messe"],
  ["Kアリーナ横浜", "k-arena-yokohama"],
  ["北海きたえーる", "kitaele"],
  ["神戸ワールド記念ホール", "world-hall"],
  ["クロコくんホール", "gaishi-hall"],
  ["静岡エコパアリーナ", "ecopa-arena"],
]);

function collectionMonthKeys(months) {
  return new Set(
    months.map(({ year, month }) =>
      `${Number(year)}-${String(Number(month)).padStart(2, "0")}`,
    ),
  );
}

export function createGenerationsParallelQuestSourceAdapter(context) {
  const definition = {
    id: "generations-parallel-quest-official",
    name: "GENERATIONS LIVE TOUR 2026 PARALLEL QUEST 公式",
    type: "artist_official",
    role: "artist_official",
    parserIds: ["generations-parallel-quest-html"],
    parserVersion: "2",
    url: "https://www.ldh-liveschedule.jp/sys/tour/40102/",
    fetchedAt: context.generatedAt,
  };

  return {
    definition,
    async collect({ fetchText, recordParserResult, getRawEvidence }) {
      const html = await fetchText(definition.url, {
        evidenceRole: "artist_official",
      });
      const parsed = parseGenerationsParallelQuest(html, definition.url, {
        months: context.months,
      });
      const raw = getRawEvidence(definition.url);
      await recordParserResult({
        url: definition.url,
        parserId: "generations-parallel-quest-html",
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
            lineupText: "GENERATIONS",
            artistNames: event.artistNames,
            venueName: event.venueName,
            venueIdHint: VENUE_IDS.get(event.venueName),
            date: event.date,
            openTime: event.openTime,
            startTime: event.startTime,
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
              ticketTypes: "not_checked",
              prices: "not_checked",
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
