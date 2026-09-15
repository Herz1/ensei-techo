import {
  makeSourceRecord,
  refreshRecordContentHash,
} from "../event-ingest-lib.mjs";
import {
  parseSundomeFukuiDetail,
  parseSundomeFukuiScheduleLinks,
} from "../parsers/sundome-fukui.mjs";

export function createSundomeFukuiSourceAdapter(context) {
  const definition = {
    id: "sundome-fukui-official",
    name: "サンドーム福井 公式イベント情報",
    type: "venue_official",
    role: "venue_schedule",
    parserIds: ["sundome-fukui-event-index-html", "sundome-fukui-detail-html"],
    parserVersion: "1",
    url: "https://sundome.sankan.jp/eventinfo/",
    fetchedAt: context.generatedAt,
  };

  return {
    definition,
    async collect({ fetchText, recordParserResult, getRawEvidence }) {
      const indexHtml = await fetchText(definition.url, {
        evidenceRole: "venue_schedule",
      });
      const discovered = parseSundomeFukuiScheduleLinks(indexHtml, definition.url);
      const indexRaw = getRawEvidence(definition.url);
      await recordParserResult({
        url: definition.url,
        parserId: "sundome-fukui-event-index-html",
        status: discovered.ok ? "success" : "parser_failed",
        error: discovered.ok ? undefined : discovered.reason,
        outputCount: discovered.links.length,
      });
      if (!discovered.ok) return { records: [] };

      const records = [];
      for (const item of discovered.links) {
        try {
          const html = await fetchText(item.url, {
            evidenceRole: "venue_detail",
          });
          const parsed = parseSundomeFukuiDetail(html, item.url, {
            months: context.months,
            knownArtistNames: context.knownArtistNames,
          });
          const detailRaw = getRawEvidence(item.url);
          await recordParserResult({
            url: item.url,
            parserId: "sundome-fukui-detail-html",
            status: parsed.ok ? "success" : "parser_failed",
            error: parsed.ok ? undefined : parsed.reason,
            outputCount: parsed.records.length,
          });
          if (!parsed.ok) continue;

          for (let index = 0; index < parsed.records.length; index += 1) {
            const event = parsed.records[index];
            const sourceChain = [
              {
                role: "venue_schedule",
                sourceId: definition.id,
                url: definition.url,
                fetchStatus: "success",
                contentHash: indexRaw?.contentHash,
                contentType: indexRaw?.contentType,
                httpStatus: indexRaw?.httpStatus,
                fetchedAt: indexRaw?.fetchedAt,
              },
              {
                role: "venue_detail",
                sourceId: definition.id,
                url: item.url,
                fetchStatus: "success",
                contentHash: detailRaw?.contentHash,
                contentType: detailRaw?.contentType,
                httpStatus: detailRaw?.httpStatus,
                fetchedAt: detailRaw?.fetchedAt,
              },
            ];
            if (event.promoterUrl) {
              sourceChain.push({
                role: "promoter_official",
                sourceId: definition.id,
                url: event.promoterUrl,
                fetchStatus: "not_checked",
              });
            }
            if (event.artistOfficialUrl && event.artistOfficialUrl !== event.promoterUrl) {
              sourceChain.push({
                role: "artist_official",
                sourceId: definition.id,
                url: event.artistOfficialUrl,
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
                sourceEventId: `${item.url}|${event.date}|${event.startTime ?? index}`,
                sourceUrl: item.url,
                title: event.title,
                lineupText: event.artistNames.join(" / "),
                artistNames: event.artistNames,
                venueName: "サンドーム福井",
                venueIdHint: "sundome-fukui",
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
            url: item.url,
            parserId: "sundome-fukui-detail-html",
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
