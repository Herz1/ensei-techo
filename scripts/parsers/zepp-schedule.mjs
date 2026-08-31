import * as cheerio from "cheerio";
import {
  cleanText,
  makeSourceRecord,
  parseJpyPrices,
  splitArtistNames,
  toIsoDate,
} from "../event-ingest-lib.mjs";
import { parseTicketText } from "./ticket-text.mjs";

export function parseZeppSchedule(html, source, venue) {
  const $ = cheerio.load(html);
  const records = [];
  $("a.sch-content").each((_, element) => {
    const card = $(element);
    const year = cleanText(card.find(".sch-content-date__year").first().text());
    const monthDay = cleanText(card.find(".sch-content-date__month").first().text());
    const dateMatch = monthDay.match(/^(\d{1,2})\.(\d{1,2})$/);
    const date = dateMatch && toIsoDate(year, dateMatch[1], dateMatch[2]);
    const rawPerformer = card.find(".sch-content-text__performer").first().text();
    const performer = cleanText(rawPerformer);
    const title = cleanText(card.find(".sch-content-text__ttl").first().text()) || performer;
    if (!date || !title) return;
    const rows = card.find(".sch-content-text-date").toArray();
    const showRows = rows.length ? rows : [card.get(0)];
    const description = card.find(".sch-content-text__desc").text();
    const ticketInfo = parseTicketText(description);
    const pricesJpy = ticketInfo.prices.length
      ? ticketInfo.prices
      : parseJpyPrices(description);
    // 只认官方票价区的 sold-out 标记；演出标题可能包含 “SOLDOUT” 字样，不能据此判定售罄。
    const statusHint = card.find(".sold-out").length > 0 ? "sold_out" : "unknown";
    const sourceUrl = new URL(card.attr("href") || source.url, source.url).href;
    showRows.forEach((row, index) => {
      const container = $(row);
      records.push(makeSourceRecord(source, {
        sourceEventId: `${sourceUrl}|${date}|${
          cleanText(container.find(".sch-content-text-date__start").first().text()) || index
        }`,
        sourceUrl,
        title,
        lineupText: performer,
        artistNames: splitArtistNames(rawPerformer),
        venueName: venue.name,
        venueIdHint: venue.id,
        date,
        openTime: cleanText(container.find(".sch-content-text-date__open").first().text()),
        startTime: cleanText(container.find(".sch-content-text-date__start").first().text()),
        pricesJpy,
        ticketTypes: ticketInfo.ticketTypes,
        additionalFees: ticketInfo.additionalFees,
        fieldAvailability: {
          ticketTypes: ticketInfo.ticketTypes.length ? "published" : "not_found_on_page",
          prices: pricesJpy.length ? "published" : "not_found_on_page",
          additionalFees: ticketInfo.additionalFees.length ? "published" : "not_found_on_page",
          ticketPhases: "not_checked",
          eligibility: "not_checked",
          purchaseUrls: "not_checked",
        },
        statusHint,
      }));
    });
  });
  return records;
}
