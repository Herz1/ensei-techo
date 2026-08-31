import * as cheerio from "cheerio";
import { cleanText, makeSourceRecord } from "../event-ingest-lib.mjs";

export function parseSheenaRingoTour(html, source) {
  const $ = cheerio.load(html);
  const records = [];
  $(".sched-list li").each((_, element) => {
    const item = $(element);
    const date = cleanText(item.find(".sched-date").text()).replaceAll(".", "-");
    const venueName = cleanText(item.find(".sched-venue").text());
    const [openTime, startTime] = cleanText(item.find(".sched-time").text())
      .split("/")
      .map(cleanText);
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(date) || !venueName) return;
    records.push(makeSourceRecord(source, {
      sourceEventId: `${date}|${venueName}`,
      title: "椎名林檎と彼奴等と試す煩悩菩提",
      artistNames: ["椎名林檎"],
      venueName,
      date,
      openTime,
      startTime,
      ticketPhases: [
        {
          name: "林檎班 会員先行",
          kind: "fc_lottery",
          start: "2026-07-15",
          end: "2026-07-27",
          url: "https://www.kronekodow.com/ringohan/",
        },
        {
          name: "SR猫柳本線ポケット リニア会員先行",
          kind: "fc_lottery",
          start: "2026-07-27",
          end: "2026-08-05",
          url: "https://sp.kronekodow.com/",
        },
        {
          name: "SR猫柳本線ポケット 会員先行",
          kind: "fc_lottery",
          start: "2026-08-03",
          end: "2026-08-12",
          url: "https://sp.kronekodow.com/",
        },
        {
          name: "一般発売（詳細は公式発表を確認）",
          kind: "general",
          start: "2026-10-04",
          end: "2026-10-04",
          url: source.url,
        },
      ],
      pricesJpy: [12500],
      eligibility: [
        { label: "林檎班会員", appliesTo: "林檎班 会員先行" },
        {
          label: "SR猫柳本線ポケット リニア会員（会員歴3年以上）",
          appliesTo: "SR猫柳本線ポケット リニア会員先行",
        },
        {
          label: "SR猫柳本線ポケット会員",
          appliesTo: "SR猫柳本線ポケット 会員先行",
        },
      ],
      purchaseUrls: [
        "https://www.kronekodow.com/ringohan/",
        "https://sp.kronekodow.com/",
        source.url,
      ],
      fieldAvailability: {
        ticketTypes: "source_does_not_disclose",
        prices: "published",
        additionalFees: "source_does_not_disclose",
        ticketPhases: "published",
        eligibility: "published",
        purchaseUrls: "published",
      },
      statusHint: "unknown",
    }));
  });
  return records;
}
