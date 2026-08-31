import * as cheerio from "cheerio";
import { parseEventJsonLd } from "./structured-event.mjs";
import { parseTicketText } from "./ticket-text.mjs";
import { isSpecificTicketUrl } from "./ticket-url.mjs";

function clean(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function classifyOfficialLink(url, label) {
  if (isSpecificTicketUrl(url)) return "ticket_detail";
  if (/主催|問い合わせ|連絡先/u.test(label)) return "promoter_official";
  if (/web\s*サイト|公式|artist/iu.test(label)) return "artist_official";
  return null;
}

export function parseYokohamaArenaDetail(html, sourceUrl) {
  const $ = cheerio.load(html);
  const table = $("table.event_detail_table").first();
  const structured = parseEventJsonLd(html);
  if (!table.length) {
    return {
      ok: false,
      reason: "横浜アリーナ详情页缺少 table.event_detail_table，页面结构可能已变化",
      additionalFees: [],
      eligibility: [],
      purchaseUrls: [],
      discoveredLinks: [],
      structured,
    };
  }

  const rows = {};
  table.find("tr").each((_, element) => {
    const cells = $(element).find("th,td").toArray().map((cell) =>
      clean($(cell).text()),
    );
    if (cells.length >= 2 && cells[0]) {
      rows[cells[0]] = cells.slice(1).join(" ");
    }
  });
  const ticketText = Object.entries(rows)
    .filter(([label]) => /料金|チケット|席種|価格/u.test(label))
    .map(([label, value]) => `${label} ${value}`)
    .join(" ");
  const ticketInfo = parseTicketText(ticketText);
  const discoveredLinks = [];
  table.find("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    const absolute = new URL(href, sourceUrl).href;
    const rowLabel = clean($(element).closest("tr").find("th").first().text());
    const role = classifyOfficialLink(absolute, rowLabel);
    if (role) discoveredLinks.push({ role, url: absolute });
  });
  const purchaseUrls = discoveredLinks
    .filter((link) => link.role === "ticket_detail")
    .map((link) => link.url);

  return {
    ok: true,
    artistText: rows["アーティスト"],
    scheduleText: rows["日程"],
    additionalFees: ticketInfo.additionalFees,
    ticketTypes: ticketInfo.ticketTypes,
    prices: ticketInfo.prices,
    eligibility: [],
    purchaseUrls: [...new Set(purchaseUrls)],
    discoveredLinks: discoveredLinks.filter(
      (link, index, links) =>
        links.findIndex(
          (candidate) =>
            candidate.role === link.role && candidate.url === link.url,
        ) === index,
    ),
    structured,
  };
}
