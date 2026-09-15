import {
  makeSourceRecord,
  refreshRecordContentHash,
} from "../event-ingest-lib.mjs";
import {
  parseSaitamaArenaDetail,
  parseSaitamaArenaScheduleIndex,
} from "../parsers/saitama-arena.mjs";

export function createSaitamaArenaSourceAdapter(context) {
  const definition = {
    id: "saitama-super-arena-official",
    name: "GMOアリーナさいたま 公式イベントスケジュール",
    type: "venue_official",
    role: "venue_schedule",
    parserIds: ["saitama-arena-index-html", "saitama-arena-detail-html"],
    parserVersion: "1",
    url: "https://www.saitama-arena.co.jp/schedule/",
    fetchedAt: context.generatedAt,
  };

  return {
    definition,
    async collect({ fetchText, recordParserResult, getRawEvidence }) {
      const discovered = [];
      for (const { year, month } of context.months) {
        const url = `${definition.url}${year}/${String(month).padStart(2, "0")}/`;
        try {
          const html = await fetchText(url, {
            evidenceRole: "venue_schedule",
          });
          const parsed = parseSaitamaArenaScheduleIndex(html, url, { year, month });
          await recordParserResult({
            url,
            parserId: "saitama-arena-index-html",
            status: parsed.ok ? "success" : "parser_failed",
            error: parsed.ok ? undefined : parsed.reason,
            outputCount: parsed.events.length,
          });
          if (parsed.ok) discovered.push(...parsed.events);
        } catch (error) {
          await recordParserResult({
            url,
            parserId: "saitama-arena-index-html",
            status: "not_run",
            error,
            outputCount: 0,
          });
        }
      }

      const records = [];
      const uniqueEvents = discovered.filter(
        (event, index, all) => all.findIndex((item) => item.url === event.url) === index,
      );
      for (const event of uniqueEvents) {
        try {
          const html = await fetchText(event.url, {
            evidenceRole: "venue_detail",
          });
          const detail = parseSaitamaArenaDetail(html, event.url);
          const raw = getRawEvidence(event.url);
          await recordParserResult({
            url: event.url,
            parserId: "saitama-arena-detail-html",
            status: detail.ok ? "success" : "parser_failed",
            error: detail.ok ? undefined : detail.reason,
            outputCount: detail.ok ? detail.shows.length : 0,
          });
          if (!detail.ok) continue;

          detail.shows.forEach((show, index) => {
            const record = makeSourceRecord(
              {
                ...definition,
                url: event.url,
                role: "venue_detail",
                rawEvidence: raw,
              },
              {
                sourceEventId: `${event.url}|${show.date}|${show.startTime ?? index}`,
                sourceUrl: event.url,
                title: detail.title,
                lineupText: detail.title,
                artistNames: detail.artistNames,
                venueName: "さいたまスーパーアリーナ",
                venueIdHint: "saitama-super-arena",
                date: show.date,
                openTime: show.openTime,
                startTime: show.startTime,
                eligibility: detail.eligibility,
                purchaseUrls: detail.purchaseUrls,
                ticketUrl: detail.purchaseUrls[0],
                fieldAvailability: {
                  ticketTypes: "not_found_on_page",
                  prices: "not_found_on_page",
                  additionalFees: "not_found_on_page",
                  ticketPhases: "not_checked",
                  eligibility: detail.eligibility.length
                    ? "published"
                    : "not_found_on_page",
                  purchaseUrls: detail.purchaseUrls.length
                    ? "published"
                    : "not_found_on_page",
                  openTime: show.openTime ? "published" : "not_found_on_page",
                  startTime: show.startTime ? "published" : "not_found_on_page",
                },
                sourceChain: [
                  {
                    role: "venue_schedule",
                    sourceId: definition.id,
                    url: event.url,
                    fetchStatus: "success",
                  },
                  {
                    role: "venue_detail",
                    sourceId: definition.id,
                    url: event.url,
                    fetchStatus: "success",
                    contentHash: raw?.contentHash,
                    contentType: raw?.contentType,
                    httpStatus: raw?.httpStatus,
                    fetchedAt: raw?.fetchedAt,
                  },
                  ...detail.purchaseUrls.map((url) => ({
                    role: "ticket_detail",
                    sourceId: definition.id,
                    url,
                    fetchStatus: "not_checked",
                  })),
                ],
                statusHint: "unknown",
              },
            );
            records.push(refreshRecordContentHash(record));
          });
        } catch (error) {
          await recordParserResult({
            url: event.url,
            parserId: "saitama-arena-detail-html",
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
