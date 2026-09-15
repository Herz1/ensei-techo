import {
  makeSourceRecord,
  refreshRecordContentHash,
} from "../event-ingest-lib.mjs";
import {
  parseAnabukiArenaDetail,
  parseAnabukiArenaScheduleLinks,
} from "../parsers/anabuki-arena-kagawa.mjs";

export function createAnabukiArenaKagawaSourceAdapter(context) {
  const definition = {
    id: "anabuki-arena-kagawa-official",
    name: "あなぶきアリーナ香川 公式イベント情報",
    type: "venue_official",
    role: "venue_schedule",
    parserIds: [
      "anabuki-arena-home-html",
      "anabuki-arena-detail-html",
    ],
    parserVersion: "1",
    url: "https://kagawa-arena.com/",
    fetchedAt: context.generatedAt,
  };

  return {
    definition,
    async collect({ fetchText, recordParserResult, getRawEvidence }) {
      const scheduleHtml = await fetchText(definition.url, {
        evidenceRole: "venue_schedule",
      });
      const discovered = parseAnabukiArenaScheduleLinks(scheduleHtml, definition.url, {
        knownArtistNames: context.knownArtistNames,
      });
      const scheduleRaw = getRawEvidence(definition.url);
      await recordParserResult({
        url: definition.url,
        parserId: "anabuki-arena-home-html",
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
          const parsed = parseAnabukiArenaDetail(html, item.url, {
            months: context.months,
            knownArtistNames: context.knownArtistNames,
          });
          const detailRaw = getRawEvidence(item.url);
          await recordParserResult({
            url: item.url,
            parserId: "anabuki-arena-detail-html",
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
                contentHash: scheduleRaw?.contentHash,
                contentType: scheduleRaw?.contentType,
                httpStatus: scheduleRaw?.httpStatus,
                fetchedAt: scheduleRaw?.fetchedAt,
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
            if (event.artistOfficialUrl) {
              sourceChain.push({
                role: "artist_official",
                sourceId: definition.id,
                url: event.artistOfficialUrl,
                fetchStatus: "not_checked",
              });
            }
            if (event.promoterUrl && event.promoterUrl !== event.artistOfficialUrl) {
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
                venueName: "あなぶきアリーナ香川",
                venueIdHint: "anabuki-arena-kagawa",
                date: event.date,
                openTime: event.openTime,
                startTime: event.startTime,
                ticketTypes: event.ticketTypes,
                pricesJpy: event.pricesJpy,
                sourceChain,
                fieldAvailability: {
                  ticketTypes: event.ticketTypes.length ? "published" : "not_found_on_page",
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
            records.push(refreshRecordContentHash(record));
          }
        } catch (error) {
          await recordParserResult({
            url: item.url,
            parserId: "anabuki-arena-detail-html",
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
