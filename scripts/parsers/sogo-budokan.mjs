import * as cheerio from "cheerio";
import {
  cleanText,
  normalizeTime,
  parseJpyPrices,
  splitArtistNames,
  toIsoDate,
} from "../event-ingest-lib.mjs";
import { isSpecificTicketUrl } from "./ticket-url.mjs";

const DETAIL_PATH = /^\/live_information\/detail\/\d+\/?$/u;
const SECTION_LABELS = [
  "EVENT TITLE",
  "DATE",
  "VENUE",
  "OPEN / START",
  "PRICE",
  "TICKET",
  "INFORMATION",
  "NOTICE",
  "CONTACT",
];

function normalizeUrl(value, base) {
  try {
    return new URL(value, base).href;
  } catch {
    return undefined;
  }
}

function isDetailUrl(value, base) {
  try {
    const url = new URL(value, base);
    const source = new URL(base);
    return url.hostname === source.hostname && DETAIL_PATH.test(url.pathname);
  } catch {
    return false;
  }
}

function section(text, label, endings) {
  const start = text.indexOf(label);
  if (start < 0) return "";
  const tail = text.slice(start + label.length);
  const end = endings
    .map((candidate) => tail.indexOf(candidate))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];
  return cleanText(end === undefined ? tail : tail.slice(0, end));
}

function artistHeadingFromBody(rawBody, title) {
  const marker = rawBody.indexOf("EVENT TITLE");
  if (marker < 0) return [];
  const blocked = new Set([
    "SCHEDULEイベントスケジュール",
    "ARTISTSアーティスト一覧",
    "VENUES会場一覧",
    "NEWSお知らせ",
    "FAQお問い合わせ",
    "SEARCH",
    "OFFICIAL SITE",
  ]);
  const lines = rawBody
    .slice(0, marker)
    .split(/[\r\n]+/u)
    .map(cleanText)
    .filter(Boolean)
    .filter((value) =>
      !blocked.has(value) &&
      value !== title &&
      !/^JavaScript/u.test(value) &&
      !/^本サービス/u.test(value) &&
      !/^Image[:：]/iu.test(value) &&
      value.length <= 100,
    );
  const candidate = lines.at(-1);
  return candidate ? splitArtistNames(candidate) : [];
}

function datesFrom(text) {
  const dates = [];
  for (const match of text.matchAll(/(\d{4})\.(\d{1,2})\.(\d{1,2})/gu)) {
    const date = toIsoDate(match[1], match[2], match[3]);
    if (date && !dates.includes(date)) dates.push(date);
  }
  return dates;
}

function yearForMonth(month, dates) {
  const sameMonth = dates.find((date) => Number(date.slice(5, 7)) === Number(month));
  if (sameMonth) return Number(sameMonth.slice(0, 4));
  if (!dates.length) return undefined;
  const firstYear = Number(dates[0].slice(0, 4));
  const firstMonth = Number(dates[0].slice(5, 7));
  if (firstMonth === 12 && Number(month) === 1) return firstYear + 1;
  return firstYear;
}

function showsFrom(dateText, openStartText) {
  const dates = datesFrom(dateText);
  const normalized = cleanText(openStartText).replaceAll("：", ":");
  const labeled = [];
  const labeledPattern = /[＜<]?\s*(\d{1,2})\/(\d{1,2})[^＞>]{0,24}(?:公演)?\s*[＞>]?\s*(?:OPEN|開場)\s*(\d{1,2}:\d{2})\s*\/\s*(?:START|開演)\s*(\d{1,2}:\d{2})/giu;
  for (const match of normalized.matchAll(labeledPattern)) {
    const year = yearForMonth(match[1], dates);
    const date = year ? toIsoDate(year, match[1], match[2]) : undefined;
    if (!date) continue;
    labeled.push({
      date,
      openTime: normalizeTime(match[3]),
      startTime: normalizeTime(match[4]),
    });
  }
  if (labeled.length) return labeled;

  const pairs = [...normalized.matchAll(/(\d{1,2}:\d{2})\s*\/\s*(\d{1,2}:\d{2})/gu)]
    .map((match) => ({
      openTime: normalizeTime(match[1]),
      startTime: normalizeTime(match[2]),
    }));
  if (!dates.length) return [];
  if (pairs.length === 1) {
    return dates.map((date) => ({ date, ...pairs[0] }));
  }
  if (pairs.length === dates.length) {
    return dates.map((date, index) => ({ date, ...pairs[index] }));
  }
  return dates.map((date) => ({
    date,
    openTime: undefined,
    startTime: undefined,
  }));
}

function ticketTypesFrom(priceText) {
  const ticketTypes = [];
  const lines = priceText
    .replaceAll("。", "\n")
    .split(/[\r\n]+/u)
    .map(cleanText)
    .filter(Boolean);
  for (const line of lines) {
    const match = line.match(
      /^(?:[①-⑳]|\d+[.)、]?)?\s*(.{1,90}?(?:席|チケット|券))\s*(?:[:：]|\s)\s*[¥￥]\s*([\d,]+)/u,
    );
    if (!match) continue;
    const priceJpy = Number(match[2].replaceAll(",", ""));
    const name = cleanText(match[1]);
    if (!name || !Number.isInteger(priceJpy)) continue;
    if (ticketTypes.some((item) => item.name === name && item.priceJpy === priceJpy)) continue;
    ticketTypes.push({
      name,
      priceJpy,
      taxIncluded: /税込/u.test(line) ? true : null,
      notes: [],
    });
  }
  return ticketTypes;
}

function eligibilityFrom(text) {
  const rules = [];
  const push = (label, appliesTo = "入場条件") => {
    if (!rules.some((rule) => rule.label === label)) {
      rules.push({ label, appliesTo });
    }
  };
  if (/未就学児(?:童)?入場不可/u.test(text)) push("未就学児童入場不可");
  const minimumPaid = text.match(/(\d+)歳以上(?:は)?チケット(?:が)?必要/u);
  if (minimumPaid) push(`${minimumPaid[1]}歳以上チケット必要`);
  const underAge = text.match(/(\d+)歳未満(?:は)?入場不可/u);
  if (underAge) push(`${underAge[1]}歳未満入場不可`);
  const limit = text.match(/お一人様(?:1公演につき)?\s*(\d+)枚まで/u);
  if (limit) push(`1人${limit[1]}枚まで`, "申込条件");
  if (/本人確認/u.test(text)) push("本人確認の場合あり", "入場条件");
  if (/電子チケットのみ/u.test(text)) push("電子チケットのみ", "発券条件");
  return rules;
}

function officialSiteUrls($, sourceUrl) {
  return [...new Set(
    $("a[href]").toArray()
      .filter((anchor) => /OFFICIAL\s*SITE/iu.test(cleanText($(anchor).text())))
      .map((anchor) => normalizeUrl($(anchor).attr("href"), sourceUrl))
      .filter(Boolean),
  )];
}

export function parseSogoBudokanScheduleIndex(html, sourceUrl, { year, month }) {
  const $ = cheerio.load(html);
  const bodyText = cleanText($("body").text());
  const expectedMonth = `${year}.${String(month).padStart(2, "0")}`;
  if (!bodyText.includes(expectedMonth)) {
    return {
      ok: false,
      reason: `SOGO TOKYO月間页缺少「${expectedMonth}」，查询参数可能失效或页面结构已变化`,
      events: [],
    };
  }

  const events = [];
  for (const anchor of $("a[href]").toArray()) {
    const href = $(anchor).attr("href");
    if (!isDetailUrl(href, sourceUrl)) continue;
    const anchorText = cleanText($(anchor).text());
    if (!anchorText.includes("日本武道館")) continue;
    const url = normalizeUrl(href, sourceUrl);
    if (!url || events.some((event) => event.url === url)) continue;
    events.push({ url, scheduleUrl: sourceUrl });
  }
  return { ok: true, events };
}

export function parseSogoBudokanDetail(html, sourceUrl) {
  const $ = cheerio.load(html);
  const rawBody = $("body").text();
  const bodyText = cleanText(rawBody);
  const title = section(bodyText, "EVENT TITLE", SECTION_LABELS.slice(1));
  const dateText = section(bodyText, "DATE", SECTION_LABELS.slice(2));
  const venueText = section(bodyText, "VENUE", SECTION_LABELS.slice(3));
  const openStartText = section(bodyText, "OPEN / START", SECTION_LABELS.slice(4));
  const priceText = section(bodyText, "PRICE", SECTION_LABELS.slice(5));
  const informationText = section(bodyText, "INFORMATION", ["NOTICE", "CONTACT"]);
  const noticeText = section(bodyText, "NOTICE", ["CONTACT"]);

  if (!title || !dateText || !venueText.includes("日本武道館")) {
    return {
      ok: false,
      reason: "SOGO TOKYO详情页缺少标题、日期或日本武道館会场标记",
      shows: [],
    };
  }

  const shows = showsFrom(dateText, openStartText);
  if (!shows.length) {
    return {
      ok: false,
      reason: "SOGO TOKYO详情页无法解析公演日期",
      shows: [],
    };
  }

  const ticketTypes = ticketTypesFrom(priceText);
  const pricesJpy = parseJpyPrices(priceText);
  const eligibility = eligibilityFrom(`${priceText} ${informationText} ${noticeText}`);
  const purchaseUrls = [...new Set(
    $("a[href]").toArray()
      .map((anchor) => normalizeUrl($(anchor).attr("href"), sourceUrl))
      .filter((url) => url && isSpecificTicketUrl(url)),
  )];

  return {
    ok: true,
    title,
    artistNames: artistHeadingFromBody(rawBody, title),
    shows,
    ticketTypes,
    pricesJpy,
    eligibility,
    purchaseUrls,
    officialSiteUrls: officialSiteUrls($, sourceUrl),
  };
}
