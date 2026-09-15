import {
  makeSourceRecord,
  refreshRecordContentHash,
} from "../event-ingest-lib.mjs";
import { parseWorldMemorialHallMonth } from "../parsers/world-memorial-hall.mjs";

function monthUrl(year, month) {
  return `https://www.kobe-spokyo.jp/world-kobe/cal_event?ym=${year}${String(month).padStart(2, "0")}`;
}

export function createWorldMemorialHallSourceAdapter(context) {
  const definition = {
    id: "world-memorial-hall-official",
    name: "神戸ワールド記念ホール 公式イベントカレンダー",
    type: "venue_official",
    role: "venue_schedule",
    parserIds: ["world-memorial-hall-month-html"],
    parserVersion: "1",
    url: "https://www.kobe-spokyo.jp/world-kobe/cal_event",
    fetchedAt: context.generatedAt,
  };

  return {
    definition,
    async collect({ fetchText, recordParserResult, getRawEvidence }) {
      const records = [];
      let successfulMonths = 0;

      for (const target of context.months) {
        const url = monthUrl(target.year, target.month);
        try {
          const html = await fetchText(url, {
            evidenceRole: "venue_schedule",
          });
          const parsed = parseWorldMemorialHallMonth(html, url, {
            year: target.year,
            month: target.month,
            months: context.months,
            knownArtistNames: context.knownArtistNames,
          });
          const raw = getRawEvidence(url);
          await recordParserResult({
            url,
            parserId: "world-memorial-hall-month-html",
            status: parsed.ok ? "success" : "parser_failed",
            error: parsed.ok ? undefined : parsed.reason,
            outputCount: parsed.records.length,
          });
          if (!parsed.ok) continue;
          successfulMonths += 1;

          for (let index = 0; index < parsed.records.length; index += 1) {
            const event = parsed.records[index];
            const sourceChain = [
              {
                role: "venue_schedule",
                sourceId: definition.id,
                url,
                fetchStatus: "success",
                contentHash: raw?.contentHash,
                contentType: raw?.contentType,
                httpStatus: raw?.httpStatus,
                fetchedAt: raw?.fetchedAt,
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
                url,
                rawEvidence: raw,
              },
              {
                sourceEventId: `${event.date}|${event.startTime ?? index}|${event.title}`,
                sourceUrl: url,
                title: event.title,
                lineupText: event.artistNames.join(" / "),
                artistNames: event.artistNames,
                venueName: "神戸ワールド記念ホール",
                venueIdHint: "world-hall",
                date: event.date,
                openTime: undefined,
                startTime: event.startTime,
                sourceChain,
                fieldAvailability: {
                  ticketTypes: "not_found_on_page",
                  prices: "not_found_on_page",
                  additionalFees: "not_found_on_page",
                  ticketPhases: "not_checked",
                  eligibility: "not_found_on_page",
                  purchaseUrls: "not_found_on_page",
                  openTime: "not_found_on_page",
                  startTime: event.startTime ? "published" : "not_found_on_page",
                },
                statusHint: "unknown",
              },
            );
            records.push(refreshRecordContentHash(record));
          }
        } catch (error) {
          await recordParserResult({
            url,
            parserId: "world-memorial-hall-month-html",
            status: "not_run",
            error,
            outputCount: 0,
          });
        }
      }

      if (!successfulMonths) {
        throw new Error("神戸ワールド記念ホール所有目标月份均抓取或解析失败");
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
