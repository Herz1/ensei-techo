import {
  makeSourceRecord,
  refreshRecordContentHash,
} from "../event-ingest-lib.mjs";
import { parsePayPayDomeSchedule } from "../parsers/paypay-dome.mjs";

export function createPayPayDomeSourceAdapter(context) {
  const definition = {
    id: "mizuho-paypay-dome-official",
    name: "みずほPayPayドーム福岡 公式イベント日程",
    type: "venue_official",
    role: "venue_schedule",
    parserIds: ["paypay-dome-year-html"],
    parserVersion: "2",
    url: "https://www.softbankhawks.co.jp/stadium/event_schedule/",
    fetchedAt: context.generatedAt,
  };

  return {
    definition,
    async collect({ fetchText, recordParserResult, getRawEvidence }) {
      const records = [];
      const years = [...new Set(context.months.map(({ year }) => Number(year)))].sort();

      for (const year of years) {
        const url = `${definition.url}${year}/`;
        try {
          const html = await fetchText(url, {
            evidenceRole: "venue_schedule",
          });
          const parsed = parsePayPayDomeSchedule(html, url, {
            year,
            months: context.months,
            knownArtistNames: context.knownArtistNames,
          });
          const raw = getRawEvidence(url);
          await recordParserResult({
            url,
            parserId: "paypay-dome-year-html",
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
                role: event.artistNames.length ? "artist_official" : "promoter_official",
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
                venueName: "みずほPayPayドーム福岡",
                venueIdHint: "mizuho-paypay-dome",
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
                  purchaseUrls: "not_found_on_page",
                  openTime: event.openTime ? "published" : "not_found_on_page",
                  startTime: event.startTime ? "published" : "not_found_on_page",
                },
                statusHint: "unknown",
              },
            );
            records.push(refreshRecordContentHash(record));
          }
        } catch (error) {
          await recordParserResult({
            url,
            parserId: "paypay-dome-year-html",
            status: "not_run",
            error,
            outputCount: 0,
          });
        }
      }

      return { records };
    },
  };
}
