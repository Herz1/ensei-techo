import {
  makeSourceRecord,
  refreshRecordContentHash,
} from "../event-ingest-lib.mjs";
import {
  parseIgArenaDetail,
  parseIgArenaScheduleIndex,
} from "../parsers/ig-arena.mjs";

function monthKey(value) {
  return String(value).slice(0, 7);
}

export function createIgArenaSourceAdapter(context) {
  const definition = {
    id: "ig-arena-official",
    name: "IGアリーナ 公式イベント・チケット",
    type: "venue_official",
    role: "venue_schedule",
    parserIds: ["ig-arena-index-html", "ig-arena-detail-html"],
    parserVersion: "1",
    url: "https://www.ig-arena.jp/events/",
    fetchedAt: context.generatedAt,
  };
  const allowedMonths = new Set(
    context.months.map(({ year, month }) =>
      `${year}-${String(month).padStart(2, "0")}`,
    ),
  );

  return {
    definition,
    async collect({ fetchText, recordParserResult, getRawEvidence }) {
      const discovered = [];
      for (const { year, month } of context.months) {
        const url = `${definition.url}?month=${year}-${String(month).padStart(2, "0")}`;
        try {
          const html = await fetchText(url, {
            evidenceRole: "venue_schedule",
          });
          const parsed = parseIgArenaScheduleIndex(html, url, { year, month });
          await recordParserResult({
            url,
            parserId: "ig-arena-index-html",
            status: parsed.ok ? "success" : "parser_failed",
            error: parsed.ok ? undefined : parsed.reason,
            outputCount: parsed.events.length,
          });
          if (parsed.ok) discovered.push(...parsed.events);
        } catch (error) {
          await recordParserResult({
            url,
            parserId: "ig-arena-index-html",
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
          const detail = parseIgArenaDetail(html, event.url);
          const raw = getRawEvidence(event.url);
          const scheduleRaw = getRawEvidence(event.scheduleUrl);
          const acceptedShows = detail.ok && detail.isMusic
            ? detail.shows.filter((show) => allowedMonths.has(monthKey(show.date)))
            : [];
          await recordParserResult({
            url: event.url,
            parserId: "ig-arena-detail-html",
            status: detail.ok ? "success" : "parser_failed",
            error: detail.ok ? undefined : detail.reason,
            outputCount: acceptedShows.length,
          });
          if (!detail.ok || !detail.isMusic || !acceptedShows.length) continue;

          acceptedShows.forEach((show, index) => {
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
                lineupText: detail.artistNames.join(" / "),
                artistNames: detail.artistNames,
                venueName: "IGアリーナ",
                venueIdHint: "ig-arena",
                date: show.date,
                openTime: show.openTime,
                startTime: show.startTime,
                pricesJpy: detail.pricesJpy,
                eligibility: detail.eligibility,
                purchaseUrls: detail.purchaseUrls,
                ticketUrl: detail.purchaseUrls[0],
                fieldAvailability: {
                  ticketTypes: "not_found_on_page",
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
                    role: "venue_schedule",
                    sourceId: definition.id,
                    url: event.scheduleUrl,
                    fetchStatus: "success",
                    contentHash: scheduleRaw?.contentHash,
                    contentType: scheduleRaw?.contentType,
                    httpStatus: scheduleRaw?.httpStatus,
                    fetchedAt: scheduleRaw?.fetchedAt,
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
            parserId: "ig-arena-detail-html",
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
