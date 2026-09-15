import {
  makeSourceRecord,
  refreshRecordContentHash,
} from "../event-ingest-lib.mjs";
import { parseTokyoDomeSchedule } from "../parsers/tokyo-dome.mjs";

export function createTokyoDomeSourceAdapter(context) {
  const definition = {
    id: "tokyo-dome-official",
    name: "東京ドーム 公式スケジュール",
    type: "venue_official",
    role: "venue_schedule",
    parserIds: ["tokyo-dome-schedule-html"],
    parserVersion: "1",
    url: "https://www.tokyo-dome.co.jp/dome/event/schedule.html",
    fetchedAt: context.generatedAt,
  };

  return {
    definition,
    async collect({ fetchText, recordParserResult, getRawEvidence }) {
      try {
        const html = await fetchText(definition.url, {
          evidenceRole: "venue_schedule",
        });
        const parsed = parseTokyoDomeSchedule(html, definition.url, {
          months: context.months,
        });
        const raw = getRawEvidence(definition.url);
        await recordParserResult({
          url: definition.url,
          parserId: "tokyo-dome-schedule-html",
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
          if (event.officialEventUrl && event.officialEventUrl !== definition.url) {
            sourceChain.push({
              role: "artist_official",
              sourceId: definition.id,
              url: event.officialEventUrl,
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
              lineupText: event.title,
              artistNames: event.artistNames,
              venueName: "東京ドーム",
              venueIdHint: "tokyo-dome",
              date: event.date,
              openTime: event.openTime,
              startTime: event.startTime,
              fieldAvailability: {
                ticketTypes: "not_found_on_page",
                prices: "not_found_on_page",
                additionalFees: "not_found_on_page",
                ticketPhases: "not_checked",
                eligibility: "not_found_on_page",
                purchaseUrls: "not_found_on_page",
                openTime: event.openTime ? "published" : "not_found_on_page",
                startTime: event.startTime ? "published" : "not_found_on_page",
              },
              sourceChain,
              statusHint: "unknown",
            },
          );
          return refreshRecordContentHash(record);
        });

        return { records };
      } catch (error) {
        await recordParserResult({
          url: definition.url,
          parserId: "tokyo-dome-schedule-html",
          status: "not_run",
          error,
          outputCount: 0,
        });
        throw error;
      }
    },
  };
}
