import * as cheerio from "cheerio";
import {
  cleanText,
  splitArtistNames,
  toIsoDate,
} from "../event-ingest-lib.mjs";
import { isSpecificTicketUrl } from "./ticket-url.mjs";

const LARGE_ARENA_TYPES = new Set(["メインアリーナ", "スタジアム"]);
const EXCLUDED_CATEGORIES = new Set([
  "スポーツ",
  "集会・式典・セミナー",
  "物販・展示会",
]);

function monthHeading(year, month) {
  return `${year}年${month}月のイベント`;
}

function normalizeUrl(value, base) {
  try {
    return new URL(value, base).href;
  } catch {
    return undefined;
  }
}

function isEventDetailUrl(value, sourceUrl) {
  try {
    const url = new URL(value, sourceUrl);
    const source = new URL(sourceUrl);
    if (url.hostname !== source.hostname) return false;
    if (!url.pathname.startsWith("/schedule/")) return false;
    if (/^\/schedule\/(?:\d{4}\/\d{2}\/?|?)$/u.test(url.pathname)) return false;
    return /^\/schedule\/[^/]+\/?$/u.test(url.pathname);
  } catch {
    return false;
  }
}

function eventContainers($) {
  const nodes = $("article,li,div").toArray().filter((element) => {
    const text = cleanText($(element).text());
    if (!/開催日/u.test(text) || !/会場タイプ/u.test(text)) return false;
    return $(element).find("a[href]").toArray().some((anchor) =>
      isEventDetailUrl($(anchor).attr("href"), "https://www.saitama-arena.co.jp/schedule/"),
    );
  });
  const set = new Set(nodes);
  return nodes.filter((element) =>
    !$(element).find("article,li,div").toArray().some(
      (child) => child !== element && set.has(child),
    ),
  );
}

function venueTypeFrom(text) {
  const match = text.match(/会場タイプ\s*(スタジアム|メインアリーナ|コミュニティアリーナ|展示ホール|TOIRO|けやきひろば|その他)/u);
  return match?.[1];
}

function categoryFrom(text) {
  return [
    "コンサート・ショー",
    "スポーツ",
    "集会・式典・セミナー",
    "物販・展示会",
    "その他",
  ].find((category) => text.includes(category));
}

function titleAndDetailUrl($, element, sourceUrl) {
  const anchors = $(element).find("a[href]").toArray();
  for (const anchor of anchors) {
    const href = $(anchor).attr("href");
    if (!isEventDetailUrl(href, sourceUrl)) continue;
    const title = cleanText($(anchor).text());
    if (!title || /客席確認/u.test(title)) continue;
    return {
      title,
      url: normalizeUrl(href, sourceUrl),
    };
  }
  const heading = cleanText($(element).find("h1,h2,h3,h4").first().text());
  const detailAnchor = anchors.find((anchor) =>
    isEventDetailUrl($(anchor).attr("href"), sourceUrl),
  );
  return {
    title: heading,
    url: detailAnchor
      ? normalizeUrl($(detailAnchor).attr("href"), sourceUrl)
      : undefined,
  };
}

export function parseSaitamaArenaScheduleIndex(html, sourceUrl, { year, month }) {
  const $ = cheerio.load(html);
  const bodyText = cleanText($("body").text());
  const expectedHeading = monthHeading(year, month);
  if (!bodyText.includes(expectedHeading)) {
    return {
      ok: false,
      reason: `GMOアリーナさいたま月間页缺少「${expectedHeading}」，查询参数可能失效或页面结构已变化`,
      events: [],
    };
  }

  const events = [];
  for (const element of eventContainers($)) {
    const text = cleanText($(element).text());
    const venueType = venueTypeFrom(text);
    if (!LARGE_ARENA_TYPES.has(venueType)) continue;
    const category = categoryFrom(text);
    if (EXCLUDED_CATEGORIES.has(category)) continue;

    const detail = titleAndDetailUrl($, element, sourceUrl);
    if (!detail.title || !detail.url) continue;
    const purchaseUrls = $(element).find("a[href]").toArray()
      .map((anchor) => normalizeUrl($(anchor).attr("href"), sourceUrl))
      .filter((url) => url && isSpecificTicketUrl(url));
    events.push({
      title: detail.title,
      url: detail.url,
      category,
      venueType,
      purchaseUrls: [...new Set(purchaseUrls)],
    });
  }

  return {
    ok: true,
    events: events.filter(
      (event, index, all) => all.findIndex((item) => item.url === event.url) === index,
    ),
  };
}

function sectionAfterHeading($, label) {
  const heading = $("h1,h2,h3,h4").toArray().find(
    (element) => cleanText($(element).text()) === label,
  );
  if (!heading) return "";
  const parts = [];
  let current = $(heading).next();
  while (current.length) {
    if (/^H[1-4]$/u.test(current.get(0)?.tagName?.toUpperCase() ?? "")) break;
    parts.push(cleanText(current.text()));
    current = current.next();
  }
  return cleanText(parts.join(" "));
}

function inclusiveDates(start, end) {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return [];
  const result = [];
  for (
    let value = startDate;
    value <= endDate && result.length < 10;
    value = new Date(value.getTime() + 86_400_000)
  ) {
    result.push(value.toISOString().slice(0, 10));
  }
  return result;
}

function dateRangeFrom(text) {
  const range = text.match(
    /(\d{4})\/(\d{1,2})\/(\d{1,2})[^～~]*[～~]\s*(\d{4})\/(\d{1,2})\/(\d{1,2})/u,
  );
  if (range) {
    const start = toIsoDate(range[1], range[2], range[3]);
    const end = toIsoDate(range[4], range[5], range[6]);
    return start && end ? { start, end, matched: range[0] } : null;
  }
  const single = text.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/u);
  if (!single) return null;
  const date = toIsoDate(single[1], single[2], single[3]);
  return date ? { start: date, end: date, matched: single[0] } : null;
}

function timePairs(text) {
  const pairs = [];
  for (const match of String(text).matchAll(
    /開場\s*(\d{1,2}:\d{2})[^開場開演]{0,40}開演\s*(\d{1,2}:\d{2})/gu,
  )) {
    pairs.push({ openTime: match[1], startTime: match[2] });
  }
  return pairs;
}

function showsFromSchedule(scheduleText) {
  const range = dateRangeFrom(scheduleText);
  if (!range) return [];
  const dates = inclusiveDates(range.start, range.end);
  const detailText = cleanText(scheduleText.replace(range.matched, ""));
  const shows = [];

  const dayLabels = [...detailText.matchAll(/(\d{1,2})日(?:[（(][^)）]+[)）])?/gu)];
  if (dayLabels.length) {
    for (let index = 0; index < dayLabels.length; index += 1) {
      const match = dayLabels[index];
      const startIndex = (match.index ?? 0) + match[0].length;
      const endIndex = index + 1 < dayLabels.length
        ? dayLabels[index + 1].index
        : detailText.length;
      const chunk = detailText.slice(startIndex, endIndex);
      const date = dates.find((item) => Number(item.slice(-2)) === Number(match[1]));
      if (!date) continue;
      const pairs = timePairs(chunk);
      if (pairs.length) {
        pairs.forEach((pair) => shows.push({ date, ...pair }));
      } else {
        shows.push({ date, openTime: undefined, startTime: undefined });
      }
    }
    const coveredDates = new Set(shows.map((show) => show.date));
    dates.filter((date) => !coveredDates.has(date)).forEach((date) =>
      shows.push({ date, openTime: undefined, startTime: undefined }),
    );
    return shows;
  }

  const pairs = timePairs(detailText);
  if (dates.length === 1) {
    return pairs.length
      ? pairs.map((pair) => ({ date: dates[0], ...pair }))
      : [{ date: dates[0], openTime: undefined, startTime: undefined }];
  }
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

function artistNamesFromTitle(value) {
  let title = cleanText(value)
    .replace(/^\d{4}\s+/u, "")
    .replace(/^FANCLUB\s+presents\s+/iu, "");
  const patterns = [
    /^(.+?)[「『]/u,
    /^(.+?)\s*[|｜]\s*/u,
    /^(.+?)\s+(?:WORLD\s+TOUR|CONCERT\s+TOUR|LIVE\s+TOUR|TOUR|SPECIAL\s+LIVE|FAN\s*MEETING|CAST\s+LIVE)/iu,
  ];
  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match?.[1]) return splitArtistNames(match[1]);
  }
  return [];
}

function eligibilityFrom(text) {
  const rules = [];
  const push = (label) => {
    if (!rules.some((rule) => rule.label === label)) {
      rules.push({ label, appliesTo: "入場条件" });
    }
  };
  if (/再入場不可/u.test(text)) push("再入場不可");
  if (/未就学児(?:童)?入場不可/u.test(text)) push("未就学児童入場不可");
  const agePaid = text.match(/(\d+)歳以上有料/u);
  if (agePaid) push(`${agePaid[1]}歳以上有料`);
  return rules;
}

export function parseSaitamaArenaDetail(html, sourceUrl) {
  const $ = cheerio.load(html);
  const title = cleanText($("h1").first().text());
  const scheduleText = sectionAfterHeading($, "開催日");
  const venueType = sectionAfterHeading($, "開催場所").split(/\s+/u)[0];
  const detailText = sectionAfterHeading($, "イベント詳細") || cleanText($("body").text());
  if (!title || !scheduleText || !LARGE_ARENA_TYPES.has(venueType)) {
    return {
      ok: false,
      reason: "GMOアリーナさいたま详情页缺少标题、開催日或大型会场类型，页面结构可能已变化",
      shows: [],
      purchaseUrls: [],
      eligibility: [],
    };
  }

  const shows = showsFromSchedule(scheduleText);
  if (!shows.length) {
    return {
      ok: false,
      reason: "GMOアリーナさいたま详情页无法解析開催日",
      shows: [],
      purchaseUrls: [],
      eligibility: [],
    };
  }

  const purchaseUrls = $("a[href]").toArray()
    .map((anchor) => normalizeUrl($(anchor).attr("href"), sourceUrl))
    .filter((url) => url && isSpecificTicketUrl(url));
  return {
    ok: true,
    title,
    venueType,
    artistNames: artistNamesFromTitle(title),
    shows,
    eligibility: eligibilityFrom(detailText),
    purchaseUrls: [...new Set(purchaseUrls)],
  };
}
