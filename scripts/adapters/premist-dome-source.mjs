import {
  makeSourceRecord,
  refreshRecordContentHash,
} from "../event-ingest-lib.mjs";
import { parsePremistDomeEventList } from "../parsers/premist-dome.mjs";

export function createPremistDomeSourceAdapter(context) {
  const definition = {
    id: "premist-dome-official",
    name: "大和ハウス プレミストドーム 公式イベントリスト",
    type: "venue_official",
    role: "venue_schedule",
    parserIds: ["premist-dome-event-list-html"],
    parserVersion: "1",
    url: "https://www.sapporo-dome.co.jp/eventlist/",
    fetchedAt: context.generatedAt,
  };

  return {
    definition,
    async collect({ fetchText, recordParserResult, getRawEvidence }) {
      try {
        const html = await fetchText(definition.url, {
          evidenceRole: "venue_schedule",
        });
        const parsed = parsePremistDomeEventList(html, definition.url, {
          months: context.months,
          knownArtistNames: context.knownArtistNames,
        });
        const raw = getRawEvidence(definition.url);
        await recordParserResult({
          url: definition.url,
          parserId: "premist-dome-event-list-html",
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
              lineupText: event.title,
              artistNames: event.artistNames,
              venueName: "大和ハウス プレミストドーム",
              venueIdHint: "sapporo-dome",
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
          parserId: "premist-dome-event-list-html",
          status: "not_run",
          error,
          outputCount: 0,
        });
        throw error;
      }
    },
  };
}
