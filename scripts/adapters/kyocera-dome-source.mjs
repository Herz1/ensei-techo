import {
  makeSourceRecord,
  refreshRecordContentHash,
} from "../event-ingest-lib.mjs";
import { parseKyoceraDomeSchedule } from "../parsers/kyocera-dome.mjs";

export function createKyoceraDomeSourceAdapter(context) {
  const definition = {
    id: "kyocera-dome-official",
    name: "京セラドーム大阪 公式イベント情報",
    type: "venue_official",
    role: "venue_schedule",
    parserIds: ["kyocera-dome-month-html"],
    parserVersion: "1",
    url: "https://www.kyoceradome-osaka.jp/events/",
    fetchedAt: context.generatedAt,
  };

  return {
    definition,
    async collect({ fetchText, recordParserResult, getRawEvidence }) {
      const byEvent = new Map();

      for (const { year, month } of context.months) {
        const url = `${definition.url}?monthId=${Number(month)}&yearId=${Number(year)}`;
        try {
          const html = await fetchText(url, {
            evidenceRole: "venue_schedule",
          });
          const parsed = parseKyoceraDomeSchedule(html, url, {
            year,
            month,
            knownArtistNames: context.knownArtistNames,
          });
          const raw = getRawEvidence(url);
          await recordParserResult({
            url,
            parserId: "kyocera-dome-month-html",
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
                role: "venue_detail",
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
                venueName: "京セラドーム大阪",
                venueIdHint: "kyocera-dome",
                date: event.date,
                openTime: event.openTime,
                startTime: event.startTime,
                pricesJpy: event.pricesJpy,
                sourceChain,
                fieldAvailability: {
                  ticketTypes: "not_found_on_page",
                  prices: event.pricesJpy.length ? "published" : "not_found_on_page",
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
            byEvent.set(record.sourceEventId, refreshRecordContentHash(record));
          }
        } catch (error) {
          await recordParserResult({
            url,
            parserId: "kyocera-dome-month-html",
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
