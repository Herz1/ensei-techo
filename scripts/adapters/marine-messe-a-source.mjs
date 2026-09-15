import {
  makeSourceRecord,
  refreshRecordContentHash,
} from "../event-ingest-lib.mjs";
import { parseMarineMesseASchedule } from "../parsers/marine-messe-a.mjs";

export function createMarineMesseASourceAdapter(context) {
  const definition = {
    id: "marine-messe-a-official",
    name: "マリンメッセ福岡A館 公式イベント情報",
    type: "venue_official",
    role: "venue_schedule",
    parserIds: ["marine-messe-a-month-html"],
    parserVersion: "1",
    url: "https://www.marinemesse.or.jp/sp/messe/event/",
    fetchedAt: context.generatedAt,
  };

  return {
    definition,
    async collect({ fetchText, recordParserResult, getRawEvidence }) {
      const byEvent = new Map();

      for (const { year, month } of context.months) {
        const url = `${definition.url}?mm=${Number(month)}&yy=${Number(year)}`;
        try {
          const html = await fetchText(url, {
            evidenceRole: "venue_schedule",
          });
          const parsed = parseMarineMesseASchedule(html, url, {
            year,
            month,
            allowedMonths: context.months,
            knownArtistNames: context.knownArtistNames,
          });
          const raw = getRawEvidence(url);
          await recordParserResult({
            url,
            parserId: "marine-messe-a-month-html",
            status: parsed.ok ? "success" : "parser_failed",
            error: parsed.ok ? undefined : parsed.reason,
            outputCount: parsed.records.length,
          });
          if (!parsed.ok) continue;

          for (const event of parsed.records) {
            const sourceChain = [
              {
                role: "venue_schedule",
                sourceId: definition.id,
                url,
                fetchStatus: "success",
                contentHash: raw?.contentHash,
                contentType: raw?.contentType,
                httpStatus: raw?.httpStatus,
                fetchedAt: raw?.fetchedAt,
              },
            ];
            if (event.officialEventUrl && event.officialEventUrl !== url) {
              sourceChain.push({
                role: event.officialEventRole ?? "promoter_official",
                sourceId: definition.id,
                url: event.officialEventUrl,
                fetchStatus: "not_checked",
              });
            }

            const record = makeSourceRecord(
              {
                ...definition,
                url,
                rawEvidence: raw,
              },
              {
                sourceEventId: `${event.date}|${event.startTime ?? "unknown"}|${event.title}`,
                sourceUrl: url,
                title: event.title,
                lineupText: event.title,
                artistNames: event.artistNames,
                venueName: "マリンメッセ福岡A館",
                venueIdHint: "marine-messe-a",
                date: event.date,
                openTime: undefined,
                startTime: event.startTime,
                sourceChain,
                fieldAvailability: {
                  ticketTypes: "not_found_on_page",
                  prices: "not_found_on_page",
                  additionalFees: "not_found_on_page",
                  ticketPhases: "not_checked",
                  eligibility: "not_found_on_page",
                  purchaseUrls: "not_found_on_page",
                  openTime: "not_found_on_page",
                  startTime: event.startTime ? "published" : "not_found_on_page",
                },
                statusHint: "unknown",
              },
            );
            byEvent.set(record.sourceEventId, refreshRecordContentHash(record));
          }
        } catch (error) {
          await recordParserResult({
            url,
            parserId: "marine-messe-a-month-html",
            status: "not_run",
            error,
            outputCount: 0,
          });
        }
      }

      return { records: [...byEvent.values()] };
    },
  };
}
