import * as cheerio from "cheerio";
import {
  cleanText,
  normalizeName,
  normalizeTime,
  splitArtistNames,
  toIsoDate,
} from "../event-ingest-lib.mjs";

const MONTH_PATTERN = /(20\d{2})年(\d{1,2})月/gu;
const DAY_PATTERN = /(\d{1,2})\s*[（(][月火水木金土日](?:[・･]祝)?[)）]/gu;

function normalizeUrl(value, base) {
  try {
    return new URL(value, base).href;
  } catch {
    return undefined;
  }
}

function monthKey(year, month) {
  return `${Number(year)}-${String(Number(month)).padStart(2, "0")}`;
}

function monthSegments(text) {
  const matches = [...text.matchAll(MONTH_PATTERN)];
  return matches.map((match, index) => ({
    year: Number(match[1]),
    month: Number(match[2]),
    text: text.slice(
      (match.index ?? 0) + match[0].length,
      index + 1 < matches.length ? matches[index + 1].index : text.length,
    ),
  }));
}

function daySegments(text) {
  const matches = [...text.matchAll(DAY_PATTERN)];
  return matches.map((match, index) => ({
    day: Number(match[1]),
    text: text.slice(
      (match.index ?? 0) + match[0].length,
      index + 1 < matches.length ? matches[index + 1].index : text.length,
    ),
  }));
}

function eventTitleFrom(segment) {
  const categoryIndex = segment.indexOf("コンサート");
  if (categoryIndex < 0) return "";
  const tail = cleanText(segment.slice(categoryIndex + "コンサート".length));
  const stops = [
    "開場",
    "開演",
    "<お問い合わせ>",
    "お問い合わせ",
    "TEL：",
    "TEL:",
  ];
  const stop = stops
    .map((marker) => tail.indexOf(marker))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];
  return cleanText(stop === undefined ? tail : tail.slice(0, stop));
}

function artistNamesFromTitle(value) {
  let title = cleanText(value)
    .replace(/^20\d{2}\s+/u, "")
    .replace(/^(?:NISSAY\s+PRESENTS|PRESENTS)\s+/iu, "");
  const patterns = [
    /^(.+?)[「『]/u,
    /^(.+?)\s+-\s+/u,
    /^(.+?)\s+(?:WORLD\s+TOUR|DOME\s+TOUR|LIVE\s+TOUR|CONCERT\s+TOUR|TOUR)\b/iu,
    /^(.+?)\s+in\s+TOKYO\s+DOME\b/iu,
    /^([A-Za-z0-9_=:!+.-]{2,})\s+(?:ASIA\b|\d+(?:st|nd|rd|th)?\s+ANNIVERSARY\b)/iu,
  ];
  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (!match?.[1]) continue;
    const names = splitArtistNames(match[1]);
    if (names.length) return names;
  }
  if (/^[\p{L}\p{N}_=:!+.'&-]{2,40}(?:\s+[\p{L}\p{N}_=:!+.'&-]{1,24}){0,3}$/u.test(title)) {
    return splitArtistNames(title);
  }
  return [];
}

function officialEventUrl($, sourceUrl, title) {
  const wanted = normalizeName(title);
  if (!wanted) return undefined;
  const sourceHost = new URL(sourceUrl).hostname;
  const candidates = $("a[href]").toArray()
    .map((anchor) => {
      const label = cleanText($(anchor).text());
      const url = normalizeUrl($(anchor).attr("href"), sourceUrl);
      if (!label || !url) return null;
      const normalized = normalizeName(label);
      const score = normalized === wanted
        ? 3
        : normalized.includes(wanted) || wanted.includes(normalized)
          ? 2
          : 0;
      if (!score) return null;
      return { url, score, external: new URL(url).hostname !== sourceHost };
    })
    .filter(Boolean)
    .sort((left, right) =>
      right.score - left.score || Number(right.external) - Number(left.external),
    );
  return candidates[0]?.url;
}

function parseTimes(segment) {
  const open = segment.match(/開場\s*(\d{1,2}:\d{2})/u)?.[1];
  const start = segment.match(/開演\s*(\d{1,2}:\d{2})/u)?.[1];
  return {
    openTime: normalizeTime(open),
    startTime: normalizeTime(start),
  };
}

export function parseTokyoDomeSchedule(html, sourceUrl, { months = [] } = {}) {
  const $ = cheerio.load(html);
  const bodyText = cleanText($("body").text().replace(/\r?\n/gu, " "));
  if (!bodyText.includes("東京ドームスケジュール")) {
    return {
      ok: false,
      reason: "東京ドーム官网页缺少「東京ドームスケジュール」，页面结构可能已变化",
      records: [],
    };
  }

  const allowedMonths = new Set(
    months.map(({ year, month }) => monthKey(year, month)),
  );
  const records = [];

  for (const month of monthSegments(bodyText)) {
    if (allowedMonths.size && !allowedMonths.has(monthKey(month.year, month.month))) {
      continue;
    }
    for (const day of daySegments(month.text)) {
      if (!day.text.includes("コンサート")) continue;
      const title = eventTitleFrom(day.text);
      if (!title) continue;
      const date = toIsoDate(month.year, month.month, day.day);
      if (!date) continue;
      const { openTime, startTime } = parseTimes(day.text);
      const eventUrl = officialEventUrl($, sourceUrl, title);
      records.push({
        title,
        date,
        openTime,
        startTime,
        artistNames: artistNamesFromTitle(title),
        officialEventUrl: eventUrl,
      });
    }
  }

  return {
    ok: true,
    records: records.filter(
      (record, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.date === record.date &&
            candidate.title === record.title &&
            candidate.startTime === record.startTime,
        ) === index,
    ),
  };
}
