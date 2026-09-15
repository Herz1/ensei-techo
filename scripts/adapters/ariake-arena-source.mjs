import {
  makeSourceRecord,
  refreshRecordContentHash,
} from "../event-ingest-lib.mjs";
import { parseAriakeArenaSchedule } from "../parsers/ariake-arena.mjs";

export function createAriakeArenaSourceAdapter(context) {
  const definition = {
    id: "ariake-arena-official",
    name: "有明アリーナ 公式イベント情報",
    type: "venue_official",
    role: "venue_schedule",
    parserIds: ["ariake-arena-event-html"],
    parserVersion: "2",
    url: "https://ariake-arena.tokyo/event/",
    fetchedAt: context.generatedAt,
  };

  return {
    definition,
    async collect({ fetchText, recordParserResult, getRawEvidence }) {
      try {
        const html = await fetchText(definition.url, {
          evidenceRole: "venue_schedule",
        });
        const parsed = parseAriakeArenaSchedule(html, definition.url, {
          months: context.months,
          knownArtistNames: context.knownArtistNames,
        });
        const raw = getRawEvidence(definition.url);
        await recordParserResult({
          url: definition.url,
          parserId: "ariake-arena-event-html",
          status: parsed.ok ? "success" : "parser_failed",
          error: parsed.ok ? undefined : parsed.reason,
          outputCount: parsed.records.length,
        });
        if (!parsed.ok) return { records: [] };

        const records = parsed.records.map((event, index) => {
          const sourceChain = [
            {
              role: "venue_schedule",
              sourceId: definition.id,
              url: definition.url,
              fetchStatus: "success",
              contentHash: raw?.contentHash,
              contentType: raw?.contentType,
              httpStatus: raw?.httpStatus,
              fetchedAt: raw?.fetchedAt,
            },
          ];
          if (event.officialEventUrl) {
            sourceChain.push({
              role: "artist_official",
              sourceId: definition.id,
              url: event.officialEventUrl,
              fetchStatus: "not_checked",
            });
          }
          if (event.promoterUrl && event.promoterUrl !== event.officialEventUrl) {
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
              sourceEventId: `${event.date}|${event.startTime ?? index}|${event.title}`,
              sourceUrl: definition.url,
              title: event.title,
              lineupText: [event.artistNames.join(" / "), event.title].filter(Boolean).join(" | "),
              artistNames: event.artistNames,
              venueName: "有明アリーナ",
              venueIdHint: "ariake-arena",
              date: event.date,
              openTime: event.openTime,
              startTime: event.startTime,
              ticketTypes: event.ticketTypes,
              pricesJpy: event.pricesJpy,
              eligibility: event.eligibility,
              sourceChain,
              fieldAvailability: {
                ticketTypes: event.ticketTypes.length ? "published" : "not_found_on_page",
                prices: event.pricesJpy.length ? "published" : "not_found_on_page",
                additionalFees: "not_found_on_page",
                ticketPhases: "not_checked",
                eligibility: event.eligibility.length ? "published" : "not_found_on_page",
                purchaseUrls: "not_found_on_page",
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
      } catch (error) {
        await recordParserResult({
          url: definition.url,
          parserId: "ariake-arena-event-html",
          status: "not_run",
          error,
          outputCount: 0,
        });
        throw error;
      }
    },
  };
}
