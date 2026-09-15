import {
  makeSourceRecord,
  refreshRecordContentHash,
} from "../event-ingest-lib.mjs";
import { parseSuperBeaverArenaTour } from "../parsers/super-beaver-arena.mjs";

const ACTIVE_MONTHS = new Set(["2027-01", "2027-02", "2027-03"]);

const VENUE_IDS = new Map([
  ["Kアリーナ横浜", "k-arena-yokohama"],
  ["グランメッセ熊本", "grandmesse-kumamoto"],
  ["あなぶきアリーナ香川", "anabuki-arena-kagawa"],
  ["和歌山ビッグホエール", "wakayama-big-whale"],
  ["朱鷺メッセ", "toki-messe"],
  ["三重県営サンアリーナ", "mie-sun-arena"],
]);

function collectionOverlapsArenaTour(months) {
  return months.some(({ year, month }) =>
    ACTIVE_MONTHS.has(`${Number(year)}-${String(Number(month)).padStart(2, "0")}`),
  );
}

export function createSuperBeaverArenaSourceAdapter(context) {
  const definition = {
    id: "super-beaver-arena-official",
    name: "SUPER BEAVER 公式 2026-2027 Arena Tour",
    type: "artist_official",
    role: "artist_official",
    parserIds: ["super-beaver-arena-tour-html"],
    parserVersion: "1",
    url: "https://sp.super-beaver.com/feature/tour2627",
    fetchedAt: context.generatedAt,
  };

  return {
    definition,
    async collect({ fetchText, recordParserResult, getRawEvidence }) {
      if (!collectionOverlapsArenaTour(context.months)) {
        return {
          skipped: true,
          reason: "目标 collection window 不覆盖 SUPER BEAVER Arena Tour 的 2027-01 至 2027-03",
          records: [],
        };
      }

      const html = await fetchText(definition.url, {
        evidenceRole: "artist_official",
      });
      const parsed = parseSuperBeaverArenaTour(html, definition.url, {
        months: context.months,
      });
      const raw = getRawEvidence(definition.url);
      await recordParserResult({
        url: definition.url,
        parserId: "super-beaver-arena-tour-html",
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
            lineupText: "SUPER BEAVER",
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
