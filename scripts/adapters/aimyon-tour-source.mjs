import {
  makeSourceRecord,
  refreshRecordContentHash,
} from "../event-ingest-lib.mjs";
import { parseAimyonTour2027 } from "../parsers/aimyon-tour.mjs";

const ACTIVE_MONTHS = new Set([
  "2027-02",
  "2027-03",
  "2027-04",
  "2027-05",
  "2027-06",
  "2027-07",
]);

const VENUE_IDS = new Map([
  ["ぴあアリーナMM", "pia-arena-mm"],
  ["サンドーム福井", "sundome-fukui"],
  ["朱鷺メッセ", "toki-messe"],
  ["Kアリーナ横浜", "k-arena-yokohama"],
  ["宮城セキスイハイムスーパーアリーナ", "sekisui-heim-super-arena"],
  ["国立代々木競技場 第一体育館", "yoyogi-first"],
  ["GLION ARENA KOBE", "glion-arena-kobe"],
  ["クロコくんホール", "gaishi-hall"],
  ["静岡エコパアリーナ", "ecopa-arena"],
  ["大阪城ホール", "osaka-jo-hall"],
  ["あなぶきアリーナ香川", "anabuki-arena-kagawa"],
  ["真駒内セキスイハイムアイスアリーナ", "makomanai-ice-arena"],
  ["広島グリーンアリーナ", "hiroshima-green-arena"],
  ["マリンメッセ福岡A館", "marine-messe-a"],
  ["Aichi Sky Expo(愛知県国際展示場) ホールA", "aichi-sky-expo-hall-a"],
  ["神戸ワールド記念ホール", "world-hall"],
  ["沖縄サントリーアリーナ", "okinawa-arena"],
]);

function collectionOverlapsTour(months) {
  return months.some(({ year, month }) =>
    ACTIVE_MONTHS.has(`${Number(year)}-${String(Number(month)).padStart(2, "0")}`),
  );
}

export function createAimyonTourSourceAdapter(context) {
  const definition = {
    id: "aimyon-tour-2027-official",
    name: "AIMYON TOUR 2027 -cosmic%- 公式",
    type: "artist_official",
    role: "artist_official",
    parserIds: ["aimyon-cosmic-tour-html"],
    parserVersion: "1",
    url: "https://www.aimyong.net/feature/tour2027",
    fetchedAt: context.generatedAt,
  };

  return {
    definition,
    async collect({ fetchText, recordParserResult, getRawEvidence }) {
      if (!collectionOverlapsTour(context.months)) {
        return {
          skipped: true,
          reason: "目标 collection window 不覆盖 AIMYON TOUR 2027 -cosmic%- 的 2027-02 至 2027-07",
          records: [],
        };
      }

      const html = await fetchText(definition.url, {
        evidenceRole: "artist_official",
      });
      const parsed = parseAimyonTour2027(html, definition.url, {
        months: context.months,
      });
      const raw = getRawEvidence(definition.url);
      await recordParserResult({
        url: definition.url,
        parserId: "aimyon-cosmic-tour-html",
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
            lineupText: "あいみょん",
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
