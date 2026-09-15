import * as cheerio from "cheerio";
import {
  cleanText,
  normalizeTime,
  parseJpyPrices,
  splitArtistNames,
  toIsoDate,
} from "../event-ingest-lib.mjs";
import { isSpecificTicketUrl } from "./ticket-url.mjs";

const DETAIL_PATH = /^\/events\/\d+\/?$/u;

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

function sectionBetween(text, starts, ends) {
  const startMatches = starts
    .map((label) => ({ label, index: text.indexOf(label) }))
    .filter(({ index }) => index >= 0)
    .sort((left, right) => left.index - right.index);
  if (!startMatches.length) return "";
  const start = startMatches[0];
  const tail = text.slice(start.index + start.label.length);
  const end = ends
    .map((label) => tail.indexOf(label))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];
  return cleanText(end === undefined ? tail : tail.slice(0, end));
}

function timePairs(text) {
  const normalized = cleanText(text).replaceAll("：", ":");
  const pairs = [];
  const patterns = [
    /OPEN\s*\/\s*START\s*:\s*(\d{1,2}:\d{2})\s*[\/／]\s*(\d{1,2}:\d{2})/giu,
    /OPEN\s*:\s*(\d{1,2}:\d{2})\s*[\/／]\s*START\s*:\s*(\d{1,2}:\d{2})/giu,
    /(\d{1,2}:\d{2})\s*開場[^\d]{0,24}(\d{1,2}:\d{2})\s*開演/gu,
  ];
  for (const pattern of patterns) {
    for (const match of normalized.matchAll(pattern)) {
      const pair = {
        openTime: normalizeTime(match[1]),
        startTime: normalizeTime(match[2]),
      };
      if (
        pair.openTime &&
        pair.startTime &&
        !pairs.some(
          (item) =>
            item.openTime === pair.openTime && item.startTime === pair.startTime,
        )
      ) {
        pairs.push(pair);
      }
    }
    if (pairs.length) break;
  }
  return pairs;
}

function showsFrom(text) {
  const matches = [...String(text).matchAll(
    /(20\d{2})年(\d{1,2})月(\d{1,2})日(?:[（(][^）)]*[）)])?/gu,
  )];
  const shows = [];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const date = toIsoDate(match[1], match[2], match[3]);
    if (!date) continue;
    const startIndex = (match.index ?? 0) + match[0].length;
    const endIndex = index + 1 < matches.length
      ? matches[index + 1].index
      : String(text).length;
    const chunk = String(text).slice(startIndex, endIndex);
    const pairs = timePairs(chunk);
    if (pairs.length) {
      pairs.forEach((pair) => shows.push({ date, ...pair }));
    } else {
      shows.push({ date, openTime: undefined, startTime: undefined });
    }
  }
  return shows.filter(
    (show, index, all) =>
      all.findIndex(
        (candidate) =>
          candidate.date === show.date &&
          candidate.openTime === show.openTime &&
          candidate.startTime === show.startTime,
      ) === index,
  );
}

function eligibilityFrom(text) {
  const rules = [];
  const push = (label, appliesTo = "入場条件") => {
    if (!rules.some((rule) => rule.label === label)) {
      rules.push({ label, appliesTo });
    }
  };
  if (/未就学児(?:童)?入場不可/u.test(text)) push("未就学児童入場不可");
  const paid = text.match(/(\d+)歳以上(?:は)?(?:有料|チケット(?:が)?必要)/u);
  if (paid) push(`${paid[1]}歳以上チケット必要`);
  const under = text.match(/(\d+)歳未満(?:は)?入場不可/u);
  if (under) push(`${under[1]}歳未満入場不可`);
  const limit = text.match(/お一人様(?:1公演につき)?\s*(\d+)枚まで/u);
  if (limit) push(`1人${limit[1]}枚まで`, "申込条件");
  if (/本人確認/u.test(text)) push("本人確認の場合あり");
  if (/電子チケットのみ/u.test(text)) push("電子チケットのみ", "発券条件");
  return rules;
}

function officialSiteUrls($, sourceUrl) {
  const sourceHost = new URL(sourceUrl).hostname;
  return [...new Set(
    $("a[href]").toArray()
      .filter((anchor) =>
        /公式サイト|OFFICIAL\s*SITE|公演詳細/iu.test(cleanText($(anchor).text())),
      )
      .map((anchor) => normalizeUrl($(anchor).attr("href"), sourceUrl))
      .filter((url) => {
        if (!url) return false;
        const parsed = new URL(url);
        return parsed.hostname !== sourceHost && !isSpecificTicketUrl(url);
      }),
  )];
}

export function parseIgArenaScheduleIndex(html, sourceUrl, { year, month }) {
  const $ = cheerio.load(html);
  const bodyText = cleanText($("body").text());
  const monthToken = new RegExp(`${year}\\s+${Number(month)}(?:\\D|$)`, "u");
  if (!bodyText.includes("イベント・チケット") || !monthToken.test(bodyText)) {
    return {
      ok: false,
      reason: `IGアリーナ月間页缺少 ${year}-${String(month).padStart(2, "0")} 的事件标记，查询参数可能失效或页面结构已变化`,
      events: [],
    };
  }

  const events = [];
  for (const anchor of $("a[href]").toArray()) {
    const href = $(anchor).attr("href");
    if (!isDetailUrl(href, sourceUrl)) continue;
    const url = normalizeUrl(href, sourceUrl);
    if (!url || events.some((event) => event.url === url)) continue;
    events.push({
      url,
      title: cleanText($(anchor).text()),
      scheduleUrl: sourceUrl,
    });
  }
  return { ok: true, events };
}

export function parseIgArenaDetail(html, sourceUrl) {
  const $ = cheerio.load(html);
  const bodyText = cleanText($("body").text());
  const title = cleanText($("h1").first().text());
  if (!title) {
    return {
      ok: false,
      reason: "IGアリーナ详情页缺少公演标题",
      isMusic: false,
      shows: [],
    };
  }

  const artistText = sectionBetween(
    bodyText,
    ["▼アーティスト", "アーティスト", "ARTIST"],
    ["▼日時", "日時", "DATE", "▼公演詳細", "▼チケット", "▼公式サイト"],
  );
  const artistNames = splitArtistNames(artistText);
  if (!artistNames.length) {
    return {
      ok: true,
      isMusic: false,
      title,
      artistNames: [],
      shows: [],
      pricesJpy: [],
      eligibility: [],
      purchaseUrls: [],
      officialSiteUrls: [],
    };
  }

  const scheduleText = sectionBetween(
    bodyText,
    ["▼日時", "日時", "DATE"],
    [
      "▼公演詳細",
      "公演詳細",
      "▼チケット",
      "チケット",
      "▼公式サイト",
      "公式サイト",
      "▼主催",
      "主催",
      "▼企画",
      "企画／制作",
      "▼公演に関するお問い合わせ先",
    ],
  );
  const shows = showsFrom(scheduleText || bodyText);
  if (!shows.length) {
    return {
      ok: false,
      reason: "IGアリーナ音乐详情页无法解析公演日期",
      isMusic: true,
      title,
      artistNames,
      shows: [],
    };
  }

  const ticketText = sectionBetween(
    bodyText,
    ["▼チケット料金", "チケット料金", "▼チケット", "チケット"],
    [
      "▼公式サイト",
      "公式サイト",
      "▼公演詳細",
      "公演詳細",
      "▼主催",
      "主催",
      "▼企画",
      "企画／制作",
      "▼公演に関するお問い合わせ先",
    ],
  );
  const pricesJpy = parseJpyPrices(ticketText);
  const eligibility = eligibilityFrom(`${ticketText} ${bodyText}`);
  const purchaseUrls = [...new Set(
    $("a[href]").toArray()
      .map((anchor) => normalizeUrl($(anchor).attr("href"), sourceUrl))
      .filter((url) => url && isSpecificTicketUrl(url)),
  )];

  return {
    ok: true,
    isMusic: true,
    title,
    artistNames,
    shows,
    pricesJpy,
    eligibility,
    purchaseUrls,
    officialSiteUrls: officialSiteUrls($, sourceUrl),
  };
}
