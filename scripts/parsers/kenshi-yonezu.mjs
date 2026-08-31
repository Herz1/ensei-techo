import * as cheerio from "cheerio";
import {
  cleanText,
  makeSourceRecord,
  toIsoDate,
} from "../event-ingest-lib.mjs";

export function parseKenshiYonezuTour(html, source) {
  const $ = cheerio.load(html);
  const records = [];
  $("blockquote p").each((_, element) => {
    const paragraph = $(element);
    const match = cleanText(paragraph.text()).match(
      /^(\d{1,2})\/\s*(\d{1,2})\s*\([^)]+\)\s*OPEN\s*(\d{2}:\d{2})\s*\/\s*START\s*(\d{2}:\d{2})/u,
    );
    if (!match) return;
    const date = toIsoDate(2026, match[1], match[2]);
    const venueName = cleanText(paragraph.find("strong").last().text()).replace(
      /^(?:長野|神奈川|大阪|福岡|宮城|愛知)\s+/u,
      "",
    );
    if (!date || !venueName) return;
    records.push(makeSourceRecord(source, {
      sourceEventId: `${date}|${venueName}`,
      title: "米津玄師 2026 TOUR / GHOST",
      artistNames: ["米津玄師"],
      venueName,
      date,
      openTime: match[3],
      startTime: match[4],
      ticketUrl: "https://ticket.kenshiyonezu.jp/tour/2026",
      ticketTypes: [
        { name: "指定席", priceJpy: 9900, taxIncluded: true, notes: [] },
        { name: "注釈付指定席", priceJpy: 9900, taxIncluded: true, notes: [] },
        {
          name: "立見",
          priceJpy: 9900,
          taxIncluded: true,
          notes: ["長野・大阪・福岡・宮城公演"],
        },
      ],
      ticketPhases: [{
        name: "一般販売（抽選）",
        kind: "playguide_lottery",
        start: "2026-07-07",
        end: "2026-07-26",
        url: "https://ticket.kenshiyonezu.jp/tour/2026",
      }],
      pricesJpy: [9900],
      fieldAvailability: {
        ticketTypes: "published",
        prices: "published",
        additionalFees: "source_does_not_disclose",
        ticketPhases: "published",
        eligibility: "source_does_not_disclose",
        purchaseUrls: "published",
      },
      statusHint: "unknown",
    }));
  });
  return records;
}
