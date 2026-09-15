import { parseOsakaJoHallSchedule } from "../parsers/osaka-johall.mjs";

export function createOsakaJoHallSourceAdapter(context) {
  const definition = {
    id: "osaka-johall-official",
    name: "大阪城ホール 公式イベントスケジュール",
    type: "venue_official",
    role: "venue_schedule",
    parserIds: ["osaka-johall-month-html"],
    parserVersion: "1",
    url: "https://www.osaka-johall.com/event/",
    fetchedAt: context.generatedAt,
  };

  return {
    definition,
    async collect({ fetchText, recordParserResult, getRawEvidence }) {
      const records = [];
      for (const { year, month } of context.months) {
        const url = new URL(definition.url);
        url.searchParams.set("ym", `${year}${String(month).padStart(2, "0")}`);
        try {
          const html = await fetchText(url, { evidenceRole: "venue_schedule" });
          const parsed = parseOsakaJoHallSchedule(
            html,
            {
              ...definition,
              url: url.href,
              rawEvidence: getRawEvidence(url),
            },
            { year, month },
          );
          await recordParserResult({
            url,
            parserId: "osaka-johall-month-html",
            status: parsed.ok ? "success" : "parser_failed",
            error: parsed.ok ? undefined : parsed.reason,
            outputCount: parsed.records.length,
          });
          if (parsed.ok) records.push(...parsed.records);
        } catch (error) {
          await recordParserResult({
            url,
            parserId: "osaka-johall-month-html",
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
