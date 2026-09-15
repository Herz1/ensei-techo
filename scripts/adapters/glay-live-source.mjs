import {
  makeSourceRecord,
  refreshRecordContentHash,
} from "../event-ingest-lib.mjs";
import { parseGlayLivePage } from "../parsers/glay-live.mjs";

const VENUE_IDS = new Map([
  ["大阪城ホール", "osaka-jo-hall"],
  ["ゼビオアリーナ仙台", "xebio-arena-sendai"],
  ["有明アリーナ", "ariake-arena"],
  ["朱鷺メッセ", "toki-messe"],
  ["北海きたえーる", "kitaele"],
  ["マリンメッセ福岡A館", "marine-messe-a"],
  ["GLION ARENA KOBE", "glion-arena-kobe"],
  ["広島グリーンアリーナ", "hiroshima-green-arena"],
  ["Aichi Sky Expo(愛知県国際展示場) ホールA", "aichi-sky-expo-hall-a"],
  ["函館サーモン・まるなまアリーナ（函館アリーナ）", "hakodate-arena"],
  ["横浜アリーナ", "yokohama-arena"],
]);

export function createGlayLiveSourceAdapter(context) {
  const definition = {
    id: "glay-official-live",
    name: "GLAY 公式 LIVE",
    type: "artist_official",
    role: "artist_official",
    parserIds: ["glay-live-html"],
    parserVersion: "1",
    url: "https://www.glay.co.jp/feature/live",
    fetchedAt: context.generatedAt,
  };

  return {
    definition,
    async collect({ fetchText, recordParserResult, getRawEvidence }) {
      const html = await fetchText(definition.url, {
        evidenceRole: "artist_official",
      });
      const parsed = parseGlayLivePage(html, definition.url, {
        months: context.months,
      });
      const raw = getRawEvidence(definition.url);
      await recordParserResult({
        url: definition.url,
        parserId: "glay-live-html",
        status: parsed.ok ? "success" : "parser_failed",
        error: parsed.ok ? undefined : parsed.reason,
        outputCount: parsed.records.length,
      });
      if (!parsed.ok) return { records: [] };

      const records = parsed.records.map((event, index) => {
        const sourceChain = [
          {
            role: "artist_official",
            sourceId: definition.id,
            url: definition.url,
            fetchStatus: "success",
            contentHash: raw?.contentHash,
            contentType: raw?.contentType,
            httpStatus: raw?.httpStatus,
            fetchedAt: raw?.fetchedAt,
          },
        ];
        if (event.promoterUrl) {
          sourceChain.push({
            role: "promoter_official",
            sourceId: definition.id,
            url: event.promoterUrl,
            fetchStatus: "not_checked",
          });
        }

        const record = makeSourceRecord(
          {
            ...definition,
            rawEvidence: raw,
          },
          {
            sourceEventId: `${event.date}|${event.venueName}|${event.startTime ?? index}`,
            sourceUrl: definition.url,
            title: event.title,
            lineupText: "GLAY",
            artistNames: event.artistNames,
            venueName: event.venueName,
            venueIdHint: VENUE_IDS.get(event.venueName),
            date: event.date,
            openTime: event.openTime,
            startTime: event.startTime,
            sourceChain,
            fieldAvailability: {
              ticketTypes: "not_found_on_page",
              prices: "not_found_on_page",
              additionalFees: "not_found_on_page",
              ticketPhases: "not_checked",
              eligibility: "not_found_on_page",
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
