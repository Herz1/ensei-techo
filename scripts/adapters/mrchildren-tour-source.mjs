import {
  makeSourceRecord,
  refreshRecordContentHash,
} from "../event-ingest-lib.mjs";
import { parseMrChildrenTour } from "../parsers/mrchildren-tour.mjs";

const ACTIVE_MONTHS = new Set([
  "2026-04",
  "2026-05",
  "2026-06",
  "2026-10",
  "2026-11",
  "2026-12",
]);

const VENUE_IDS = new Map([
  ["ららアリーナ 東京ベイ", "lalaarena-tokyo-bay"],
  ["横浜アリーナ", "yokohama-arena"],
  ["日本ガイシホール", "gaishi-hall"],
  ["宮城セキスイハイムスーパーアリーナ", "sekisui-heim-super-arena"],
  ["マリンメッセ福岡A館", "marine-messe-a"],
  ["大阪城ホール", "osaka-jo-hall"],
  ["あなぶきアリーナ香川", "anabuki-arena-kagawa"],
  ["ぴあアリーナMM", "pia-arena-mm"],
  ["北海きたえーる", "kitaele"],
  ["サンドーム福井", "sundome-fukui"],
  ["静岡エコパアリーナ", "ecopa-arena"],
  ["有明アリーナ", "ariake-arena"],
  ["SAGAアリーナ", "saga-arena"],
  ["広島グリーンアリーナ", "hiroshima-green-arena"],
]);

function collectionOverlapsTour(months) {
  return months.some(({ year, month }) =>
    ACTIVE_MONTHS.has(`${Number(year)}-${String(Number(month)).padStart(2, "0")}`),
  );
}

export function createMrChildrenTourSourceAdapter(context) {
  const definition = {
    id: "mrchildren-tour-2026-official",
    name: "Mr.Children Tour 2026 公式特設サイト",
    type: "artist_official",
    role: "artist_official",
    parserIds: ["mrchildren-tour-2026-html"],
    parserVersion: "1",
    url: "https://tour.mrchildren.jp/index.html",
    fetchedAt: context.generatedAt,
  };

  return {
    definition,
    async collect({ fetchText, recordParserResult, getRawEvidence }) {
      if (!collectionOverlapsTour(context.months)) {
        return {
          skipped: true,
          reason: "目标 collection window 不覆盖 Mr.Children Tour 2026 的公演月份",
          records: [],
        };
      }

      const html = await fetchText(definition.url, {
        evidenceRole: "artist_official",
      });
      const parsed = parseMrChildrenTour(html, definition.url, {
        months: context.months,
      });
      const raw = getRawEvidence(definition.url);
      await recordParserResult({
        url: definition.url,
        parserId: "mrchildren-tour-2026-html",
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
            lineupText: "Mr.Children",
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
