import * as cheerio from "cheerio";
import {
  cleanText,
  splitArtistNames,
  toIsoDate,
} from "../event-ingest-lib.mjs";
import { parseTicketText } from "./ticket-text.mjs";
import { isSpecificTicketUrl } from "./ticket-url.mjs";

const DETAIL_PATH = /\/schedule\/(\d{4})(\d{2})(\d{2})-(\d+)\/?$/u;
const SECTION_END = [
  "ARTIST",
  "OPEN/START",
  "INFORMATION",
  "TICKETS",
  "NOTES",
  "CONTACT",
  "ORGANIZER",
  "公演スケジュール一覧",
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sectionText(text, label) {
  const endLabels = SECTION_END.filter((item) => item !== label)
    .map(escapeRegExp)
    .join("|");
  const match = text.match(
    new RegExp(
      `${escapeRegExp(label)}\\s+(.+?)(?=\\s+(?:${endLabels})\\s+|$)`,
      "iu",
    ),
  );
  return cleanText(match?.[1]);
}

function normalizeTicketCurrency(text) {
  return String(text ?? "").replace(/([0-9][0-9,]*)\s*円/gu, "¥$1");
}

function eligibilityFrom($, fallbackText) {
  const values = $("p,li,dd")
    .toArray()
    .map((element) => cleanText($(element).text()))
    .filter(Boolean);
  if (!values.length && fallbackText) values.push(cleanText(fallbackText));

  const rules = [];
  const push = (label, appliesTo) => {
    if (!rules.some((rule) => rule.label === label && rule.appliesTo === appliesTo)) {
      rules.push({ label, appliesTo });
    }
  };

  for (const text of values) {
    if (/未就学児(?:童)?入場不可/u.test(text)) {
      push("未就学児童入場不可", "入場条件");
    }
    const ageTicket = text.match(/(\d+)歳以上(?:は|要)?(?:チケット|有料)/u);
    if (ageTicket) {
      push(`${ageTicket[1]}歳以上はチケット必要`, "入場条件");
    }
    const underAge = text.match(/(\d+)歳未満(?:は)?入場不可/u);
    if (underAge) {
      push(`${underAge[1]}歳未満は入場不可`, "入場条件");
    }
    const ticketLimit = text.match(/(?:お一人様|1公演につき|枚数制限[^\d]{0,12})(\d+)枚/u);
    if (ticketLimit) {
      push(`1人あたり${ticketLimit[1]}枚まで`, "申込条件");
    }
    if (/(?:Membership|ファンクラブ|FC|会員)[^。]{0,80}(?:限定|必要)/iu.test(text)) {
      push(cleanText(text).slice(0, 180), "会員条件");
    }
    if (/(?:本人確認|身分証明書|写真付き身分証)/u.test(text)) {
      push(cleanText(text).slice(0, 180), "本人確認");
    }
  }
  return rules;
}

function classifyOfficialLink(url, label) {
  if (isSpecificTicketUrl(url)) return "ticket_detail";
  if (/オフィシャル|公式(?:HP|サイト|ホームページ)|official\s*(?:site|website)/iu.test(label)) {
    return "artist_official";
  }
  if (/問い合わせ|contact/iu.test(label)) return "promoter_official";
  return null;
}

function dateFromUrl(value) {
  try {
    const url = new URL(value);
    const match = url.pathname.match(DETAIL_PATH);
    if (!match) return undefined;
    return toIsoDate(match[1], match[2], match[3]);
  } catch {
    return undefined;
  }
}

export function parseKArenaScheduleLinks(html, sourceUrl) {
  const $ = cheerio.load(html);
  const origin = new URL(sourceUrl);
  const links = [];
  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    let url;
    try {
      url = new URL(href, sourceUrl);
    } catch {
      return;
    }
    if (url.hostname !== origin.hostname) return;
    const date = dateFromUrl(url.href);
    if (!date) return;
    links.push({
      url: url.href,
      date,
      label: cleanText($(element).text()),
    });
  });
  return links.filter(
    (link, index, all) => all.findIndex((item) => item.url === link.url) === index,
  );
}

export function parseKArenaDetail(html, sourceUrl) {
  const $ = cheerio.load(html);
  const bodyText = cleanText($("body").text());
  const title = cleanText($("h1").first().text()) ||
    cleanText($("title").first().text()).replace(/\s*[|｜].*$/u, "");
  const date = dateFromUrl(sourceUrl);
  if (!title || !date) {
    return {
      ok: false,
      reason: "K Arena 详情页缺少演出标题或标准日期 URL，页面结构可能已变化",
      ticketTypes: [],
      prices: [],
      additionalFees: [],
      eligibility: [],
      purchaseUrls: [],
      discoveredLinks: [],
    };
  }

  const artistText = sectionText(bodyText, "ARTIST");
  const openStartText = sectionText(bodyText, "OPEN/START");
  const ticketText = sectionText(bodyText, "TICKETS");
  const notesText = sectionText(bodyText, "NOTES");
  const times = openStartText.match(
    /OPEN\s*(\d{1,2}:\d{2})\s*(?:\/|／)?\s*START\s*(\d{1,2}:\d{2})/iu,
  );
  const ticketInfo = parseTicketText(normalizeTicketCurrency(ticketText));
  const ticketTypes = ticketInfo.ticketTypes.map((ticket) => ({
    ...ticket,
    name: ticket.name
      ? cleanText(ticket.name).replace(/^[◆◇■●・]+\s*/u, "")
      : ticket.name,
  }));

  const discoveredLinks = [];
  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    let absolute;
    try {
      absolute = new URL(href, sourceUrl).href;
    } catch {
      return;
    }
    const label = cleanText($(element).text()) ||
      cleanText($(element).closest("p,li,dd,div").text());
    const role = classifyOfficialLink(absolute, label);
    if (role) discoveredLinks.push({ role, url: absolute });
  });
  const uniqueLinks = discoveredLinks.filter(
    (link, index, all) => all.findIndex(
      (item) => item.role === link.role && item.url === link.url,
    ) === index,
  );
  const purchaseUrls = uniqueLinks
    .filter((link) => link.role === "ticket_detail")
    .map((link) => link.url);
  const eligibility = eligibilityFrom($, `${ticketText} ${notesText}`);

  return {
    ok: true,
    title,
    date,
    artistText,
    artistNames: splitArtistNames(artistText),
    openTime: times?.[1],
    startTime: times?.[2],
    ticketTypes,
    prices: ticketInfo.prices,
    additionalFees: ticketInfo.additionalFees,
    eligibility,
    purchaseUrls: [...new Set(purchaseUrls)],
    discoveredLinks: uniqueLinks.filter((link) => link.role !== "ticket_detail"),
    fieldAvailability: {
      ticketTypes: ticketTypes.length ? "published" : "not_found_on_page",
      prices: ticketInfo.prices.length ? "published" : "not_found_on_page",
      additionalFees: ticketInfo.additionalFees.length
        ? "published"
        : "not_found_on_page",
      ticketPhases: "not_found_on_page",
      eligibility: eligibility.length ? "published" : "not_found_on_page",
      purchaseUrls: purchaseUrls.length ? "published" : "not_found_on_page",
      openTime: times?.[1] ? "published" : "not_found_on_page",
      startTime: times?.[2] ? "published" : "not_found_on_page",
    },
  };
}
