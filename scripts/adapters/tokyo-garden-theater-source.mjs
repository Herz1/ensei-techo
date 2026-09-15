import {
  makeSourceRecord,
  refreshRecordContentHash,
} from "../event-ingest-lib.mjs";
import {
  parseTokyoGardenTheaterDetail,
  parseTokyoGardenTheaterScheduleLinks,
} from "../parsers/tokyo-garden-theater.mjs";

function monthKey(year, month) {
  return `${Number(year)}-${String(Number(month)).padStart(2, "0")}`;
}

export function createTokyoGardenTheaterSourceAdapter(context) {
  const definition = {
    id: "tokyo-garden-theater-official",
    name: "東京ガーデンシアター 公式イベント情報",
    type: "venue_official",
    role: "venue_schedule",
    parserIds: [
      "tokyo-garden-theater-month-html",
      "tokyo-garden-theater-detail-html",
    ],
    parserVersion: "1",
    url: "https://www.shopping-sumitomo-rd.com/tokyo_garden_theater/schedule/",
    fetchedAt: context.generatedAt,
  };

  return {
    definition,
    async collect({ fetchText, recordParserResult, getRawEvidence }) {
      const discovered = new Map();
      const allowedMonths = new Set(
        context.months.map(({ year, month }) => monthKey(year, month)),
      );

      for (const { year, month } of context.months) {
        const url = `${definition.url}?date=${Number(year)}-${String(Number(month)).padStart(2, "0")}`;
        try {
          const html = await fetchText(url, {
            evidenceRole: "venue_schedule",
          });
          const parsed = parseTokyoGardenTheaterScheduleLinks(html, url, {
            year,
            month,
          });
          await recordParserResult({
            url,
            parserId: "tokyo-garden-theater-month-html",
            status: parsed.ok ? "success" : "parser_failed",
            error: parsed.ok ? undefined : parsed.reason,
            outputCount: parsed.links.length,
          });
          if (!parsed.ok) continue;

          for (const item of parsed.links) {
            const existing = discovered.get(item.url) ?? {
              url: item.url,
              discoveryText: item.discoveryText,
              scheduleUrls: [],
            };
            if (item.discoveryText.length > existing.discoveryText.length) {
              existing.discoveryText = item.discoveryText;
            }
            if (!existing.scheduleUrls.includes(url)) existing.scheduleUrls.push(url);
            discovered.set(item.url, existing);
          }
        } catch (error) {
          await recordParserResult({
            url,
            parserId: "tokyo-garden-theater-month-html",
            status: "not_run",
            error,
            outputCount: 0,
          });
        }
      }

      const records = [];
      for (const item of discovered.values()) {
        try {
          const html = await fetchText(item.url, {
            evidenceRole: "venue_detail",
          });
          const parsed = parseTokyoGardenTheaterDetail(html, item.url, {
            discoveryText: item.discoveryText,
            knownArtistNames: context.knownArtistNames,
          });
          const detailRaw = getRawEvidence(item.url);
          await recordParserResult({
            url: item.url,
            parserId: "tokyo-garden-theater-detail-html",
            status: parsed.ok ? "success" : "parser_failed",
            error: parsed.ok ? undefined : parsed.reason,
            outputCount: parsed.records.length,
          });
          if (!parsed.ok) continue;

          for (const event of parsed.records) {
            if (!allowedMonths.has(event.date.slice(0, 7))) continue;
            const sourceChain = item.scheduleUrls.map((scheduleUrl) => {
              const raw = getRawEvidence(scheduleUrl);
              return {
                role: "venue_schedule",
                sourceId: definition.id,
                url: scheduleUrl,
                fetchStatus: "success",
                contentHash: raw?.contentHash,
                contentType: raw?.contentType,
                httpStatus: raw?.httpStatus,
                fetchedAt: raw?.fetchedAt,
              };
            });
            sourceChain.push({
              role: "venue_detail",
              sourceId: definition.id,
              url: item.url,
              fetchStatus: "success",
              contentHash: detailRaw?.contentHash,
              contentType: detailRaw?.contentType,
              httpStatus: detailRaw?.httpStatus,
              fetchedAt: detailRaw?.fetchedAt,
            });
            if (event.officialEventUrl) {
              sourceChain.push({
                role: "event_official",
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
            for (const url of event.purchaseUrls) {
              sourceChain.push({
                role: "ticket_detail",
                sourceId: definition.id,
                url,
                fetchStatus: "not_checked",
              });
            }

            const record = makeSourceRecord(
              {
                ...definition,
                url: item.url,
                role: "venue_detail",
                rawEvidence: detailRaw,
              },
              {
                sourceEventId: `${item.url}|${event.date}|${event.startTime}`,
                sourceUrl: item.url,
                title: event.title,
                lineupText: [event.artistNames.join(" / "), event.title].filter(Boolean).join(" | "),
                artistNames: event.artistNames,
                venueName: "東京ガーデンシアター",
                venueIdHint: "garden-theater",
                date: event.date,
                openTime: event.openTime,
                startTime: event.startTime,
                ticketTypes: event.ticketTypes,
                pricesJpy: event.pricesJpy,
                eligibility: event.eligibility,
                purchaseUrls: event.purchaseUrls,
                ticketUrl: event.purchaseUrls[0],
                sourceChain,
                fieldAvailability: {
                  ticketTypes: event.ticketTypes.length ? "published" : "not_found_on_page",
                  prices: event.pricesJpy.length ? "published" : "not_found_on_page",
                  additionalFees: "not_found_on_page",
                  ticketPhases: "not_checked",
                  eligibility: event.eligibility.length ? "published" : "not_found_on_page",
                  purchaseUrls: event.purchaseUrls.length ? "published" : "not_found_on_page",
                  openTime: "published",
                  startTime: "published",
                },
                statusHint: "unknown",
              },
            );
            records.push(refreshRecordContentHash(record));
          }
        } catch (error) {
          await recordParserResult({
            url: item.url,
            parserId: "tokyo-garden-theater-detail-html",
            status: "not_run",
            error,
            outputCount: 0,
          });
        }
      }

      return {
        records: records.filter(
          (record, index, all) =>
            all.findIndex((candidate) => candidate.sourceEventId === record.sourceEventId) === index,
        ),
      };
    },
  };
}
