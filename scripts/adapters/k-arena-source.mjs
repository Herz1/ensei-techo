import {
  makeSourceRecord,
  refreshRecordContentHash,
} from "../event-ingest-lib.mjs";
import {
  parseKArenaDetail,
  parseKArenaScheduleLinks,
} from "../parsers/k-arena.mjs";

export function createKArenaSourceAdapter(context) {
  const definition = {
    id: "k-arena-yokohama-official",
    name: "Kアリーナ横浜 公式スケジュール",
    type: "venue_official",
    role: "venue_schedule",
    parserIds: ["k-arena-schedule-html", "k-arena-detail-html"],
    parserVersion: "1",
    url: "https://k-arena.com/schedule/",
    fetchedAt: context.generatedAt,
  };

  return {
    definition,
    async collect({ fetchText, recordParserResult, getRawEvidence }) {
      const scheduleHtml = await fetchText(definition.url, {
        evidenceRole: "venue_schedule",
      });
      const discovered = parseKArenaScheduleLinks(scheduleHtml, definition.url);
      await recordParserResult({
        url: definition.url,
        parserId: "k-arena-schedule-html",
        status: discovered.length ? "success" : "parser_failed",
        error: discovered.length
          ? undefined
          : "K Arena 日程页未发现标准 /schedule/YYYYMMDD-N/ 详情链接",
        outputCount: discovered.length,
      });

      const records = [];
      for (const item of discovered) {
        if (item.date < context.today) continue;
        try {
          const html = await fetchText(item.url, {
            evidenceRole: "venue_detail",
          });
          const detail = parseKArenaDetail(html, item.url);
          const raw = getRawEvidence(item.url);
          await recordParserResult({
            url: item.url,
            parserId: "k-arena-detail-html",
            status: detail.ok ? "success" : "parser_failed",
            error: detail.ok ? undefined : detail.reason,
            outputCount: detail.ok ? 1 : 0,
          });
          if (!detail.ok) continue;

          const record = makeSourceRecord(
            {
              ...definition,
              url: item.url,
              role: "venue_detail",
              rawEvidence: raw,
            },
            {
              sourceEventId: item.url,
              sourceUrl: item.url,
              title: detail.title,
              lineupText: detail.artistText,
              artistNames: detail.artistNames,
              venueName: "Kアリーナ横浜",
              venueIdHint: "k-arena-yokohama",
              date: detail.date,
              openTime: detail.openTime,
              startTime: detail.startTime,
              ticketTypes: detail.ticketTypes,
              pricesJpy: detail.prices,
              additionalFees: detail.additionalFees,
              eligibility: detail.eligibility,
              purchaseUrls: detail.purchaseUrls,
              ticketUrl: detail.purchaseUrls[0],
              fieldAvailability: detail.fieldAvailability,
              sourceChain: [
                {
                  role: "venue_schedule",
                  sourceId: definition.id,
                  url: definition.url,
                  fetchStatus: "success",
                  contentHash: getRawEvidence(definition.url)?.contentHash,
                  contentType: getRawEvidence(definition.url)?.contentType,
                  httpStatus: getRawEvidence(definition.url)?.httpStatus,
                  fetchedAt: getRawEvidence(definition.url)?.fetchedAt,
                },
                {
                  role: "venue_detail",
                  sourceId: definition.id,
                  url: item.url,
                  fetchStatus: "success",
                  contentHash: raw?.contentHash,
                  contentType: raw?.contentType,
                  httpStatus: raw?.httpStatus,
                  fetchedAt: raw?.fetchedAt,
                },
                ...detail.discoveredLinks.map((link) => ({
                  role: link.role,
                  sourceId: definition.id,
                  url: link.url,
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
        } catch (error) {
          await recordParserResult({
            url: item.url,
            parserId: "k-arena-detail-html",
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
