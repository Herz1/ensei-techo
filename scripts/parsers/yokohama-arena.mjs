import {
  cleanText,
  makeSourceRecord,
  splitArtistNames,
} from "../event-ingest-lib.mjs";
import { isSpecificTicketUrl } from "./ticket-url.mjs";

export function parseYokohamaArenaEvents(payload, source) {
  if (!Array.isArray(payload)) return [];
  const records = [];
  for (const item of payload) {
    const title = cleanText(item.title || item.artist);
    const date = item.date1;
    if (!title || !date || /^(?:設営日|撤去日|休館日)$/u.test(title)) continue;
    const starts = Array.isArray(item.ev_start) && item.ev_start.length
      ? item.ev_start
      : [undefined];
    const opens = Array.isArray(item.ev_open) ? item.ev_open : [];
    starts.forEach((startTime, index) => {
      const path = item.path
        ? new URL(item.path, "https://www.yokohama-arena.co.jp").href
        : source.url;
      const candidateTicketUrl = item.ticket_url_ja || item.url || undefined;
      const ticketUrl = isSpecificTicketUrl(candidateTicketUrl)
        ? candidateTicketUrl
        : undefined;
      records.push(makeSourceRecord(source, {
        sourceEventId: `${item.path || title}|${date}|${startTime || index}`,
        sourceUrl: path,
        title,
        lineupText: item.artist || "",
        artistNames: splitArtistNames(item.artist || ""),
        venueName: "横浜アリーナ",
        venueIdHint: "yokohama-arena",
        date,
        endDate: item.date2 !== date ? item.date2 : undefined,
        openTime: opens[index] || opens[0],
        startTime,
        ticketUrl,
        fieldAvailability: {
          ticketTypes: "not_checked",
          prices: "not_checked",
          additionalFees: "not_checked",
          ticketPhases: "not_checked",
          eligibility: "not_checked",
          purchaseUrls: ticketUrl
            ? "published"
            : "not_checked",
        },
        statusHint: "unknown",
      }));
    });
  }
  return records;
}
