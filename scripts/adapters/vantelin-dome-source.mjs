import {
  makeSourceRecord,
  refreshRecordContentHash,
} from "../event-ingest-lib.mjs";
import { parseVantelinDomeSchedule } from "../parsers/vantelin-dome.mjs";

export function createVantelinDomeSourceAdapter(context) {
  const definition = {
    id: "vantelin-dome-official",
    name: "バンテリンドーム ナゴヤ 公式イベントカレンダー",
    type: "venue_official",
    role: "venue_schedule",
    parserIds: ["vantelin-dome-event-calendar-html"],
    parserVersion: "1",
    url: "https://www.nagoya-dome.co.jp/sp/eventcalen.php",
    fetchedAt: context.generatedAt,
  };

  return {
    definition,
    async collect({ fetchText, recordParserResult, getRawEvidence }) {
      try {
        const html = await fetchText(definition.url, {
          evidenceRole: "venue_schedule",
        });
        const parsed = parseVantelinDomeSchedule(html, definition.url, {
          months: context.months,
          knownArtistNames: context.knownArtistNames,
        });
        const raw = getRawEvidence(definition.url);
        await recordParserResult({
          url: definition.url,
          parserId: "vantelin-dome-event-calendar-html",
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
              venueName: "バンテリンドーム ナゴヤ",
              venueIdHint: "vantelin-dome",
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
          parserId: "vantelin-dome-event-calendar-html",
          status: "not_run",
          error,
          outputCount: 0,
        });
        throw error;
      }
    },
  };
}
