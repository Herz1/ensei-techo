import {
  makeSourceRecord,
  refreshRecordContentHash,
} from "../event-ingest-lib.mjs";
import {
  parseSogoBudokanDetail,
  parseSogoBudokanScheduleIndex,
} from "../parsers/sogo-budokan.mjs";

export function createBudokanSogoSourceAdapter(context) {
  const definition = {
    id: "budokan-sogo-tokyo-official",
    name: "SOGO TOKYO 日本武道館 公演情報",
    type: "promoter_official",
    role: "promoter_schedule",
    parserIds: ["sogo-budokan-index-html", "sogo-budokan-detail-html"],
    parserVersion: "1",
    url: "https://sogotokyo.com/live_information/calendar/",
    fetchedAt: context.generatedAt,
  };

  return {
    definition,
    async collect({ fetchText, recordParserResult, getRawEvidence }) {
      const discovered = [];
      for (const { year, month } of context.months) {
        const url = `${definition.url}?year=${year}&month=${String(month).padStart(2, "0")}`;
        try {
          const html = await fetchText(url, {
            evidenceRole: "promoter_schedule",
          });
          const parsed = parseSogoBudokanScheduleIndex(html, url, { year, month });
          await recordParserResult({
            url,
            parserId: "sogo-budokan-index-html",
            status: parsed.ok ? "success" : "parser_failed",
            error: parsed.ok ? undefined : parsed.reason,
            outputCount: parsed.events.length,
          });
          if (parsed.ok) discovered.push(...parsed.events);
        } catch (error) {
          await recordParserResult({
            url,
            parserId: "sogo-budokan-index-html",
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
            evidenceRole: "promoter_detail",
          });
          const detail = parseSogoBudokanDetail(html, event.url);
          const raw = getRawEvidence(event.url);
          await recordParserResult({
            url: event.url,
            parserId: "sogo-budokan-detail-html",
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
                role: "promoter_detail",
                rawEvidence: raw,
              },
              {
                sourceEventId: `${event.url}|${show.date}|${show.startTime ?? index}`,
                sourceUrl: event.url,
                title: detail.title,
                lineupText: detail.artistNames.join(" / ") || detail.title,
                artistNames: detail.artistNames,
                venueName: "日本武道館",
                venueIdHint: "budokan",
                date: show.date,
                openTime: show.openTime,
                startTime: show.startTime,
                ticketTypes: detail.ticketTypes,
                pricesJpy: detail.pricesJpy,
                eligibility: detail.eligibility,
                purchaseUrls: detail.purchaseUrls,
                ticketUrl: detail.purchaseUrls[0],
                fieldAvailability: {
                  ticketTypes: detail.ticketTypes.length
                    ? "published"
                    : "not_found_on_page",
                  prices: detail.pricesJpy.length
                    ? "published"
                    : "not_found_on_page",
                  additionalFees: "not_checked",
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
                    role: "promoter_schedule",
                    sourceId: definition.id,
                    url: event.scheduleUrl,
                    fetchStatus: "success",
                  },
                  {
                    role: "promoter_detail",
                    sourceId: definition.id,
                    url: event.url,
                    fetchStatus: "success",
                    contentHash: raw?.contentHash,
                    contentType: raw?.contentType,
                    httpStatus: raw?.httpStatus,
                    fetchedAt: raw?.fetchedAt,
                  },
                  ...detail.officialSiteUrls.map((url) => ({
                    role: "artist_official",
                    sourceId: definition.id,
                    url,
                    fetchStatus: "not_checked",
                  })),
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
            parserId: "sogo-budokan-detail-html",
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
