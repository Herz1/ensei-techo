import {
  makeSourceRecord,
  refreshRecordContentHash,
} from "../event-ingest-lib.mjs";
import { parseKurokoKunHallConcertSchedule } from "../parsers/kuroko-kun-hall.mjs";

export function createKurokoKunHallSourceAdapter(context) {
  const definition = {
    id: "kuroko-kun-hall-official",
    name: "NGKスポーツプラザ クロコくんホール 公式コンサート情報",
    type: "venue_official",
    role: "venue_schedule",
    parserIds: ["kuroko-kun-hall-concert-html"],
    parserVersion: "1",
    url: "https://www.nespa.or.jp/sports-plaza/hall/event-schedule/concert.html",
    fetchedAt: context.generatedAt,
  };

  return {
    definition,
    async collect({ fetchText, recordParserResult, getRawEvidence }) {
      try {
        const html = await fetchText(definition.url, {
          evidenceRole: "venue_schedule",
        });
        const parsed = parseKurokoKunHallConcertSchedule(html, definition.url, {
          months: context.months,
        });
        const raw = getRawEvidence(definition.url);
        await recordParserResult({
          url: definition.url,
          parserId: "kuroko-kun-hall-concert-html",
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
          if (event.officialDetailUrl) {
            sourceChain.push({
              role: "venue_detail",
              sourceId: definition.id,
              url: event.officialDetailUrl,
              fetchStatus: "not_checked",
            });
          }
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
              sourceEventId: `${event.date}|${event.startTime ?? index}|${event.title}`,
              sourceUrl: definition.url,
              title: event.title,
              lineupText: [event.artistNames.join(" / "), event.title].filter(Boolean).join(" | "),
              artistNames: event.artistNames,
              venueName: "クロコくんホール",
              venueIdHint: "gaishi-hall",
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
          parserId: "kuroko-kun-hall-concert-html",
          status: "not_run",
          error,
          outputCount: 0,
        });
        throw error;
      }
    },
  };
}
