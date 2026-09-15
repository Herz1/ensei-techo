import * as cheerio from "cheerio";
import {
  cleanText,
  normalizeName,
  normalizeTime,
  toIsoDate,
} from "../event-ingest-lib.mjs";

const DATE_PATTERN = /(20\d{2})年(\d{1,2})月(\d{1,2})日[（(][^）)]*[）)]/u;
const GENERIC_HEADING = /^(?:EVENT|DETAIL|イベント|イベント詳細|コンサート|日時|入場料\(円\)|お問合せ先\(TEL\))$/iu;

function normalizeUrl(value, base) {
  try {
    return new URL(value, base).href;
  } catch {
    return undefined;
  }
}

function eventContainers($) {
  const nodes = $("article,section,li,tr,div").toArray().filter((element) => {
    const text = cleanText($(element).text());
    return DATE_PATTERN.test(text) &&
      text.includes("コンサート") &&
      text.includes("入場料(円)") &&
      text.includes("お問合せ先(TEL)");
  });
  const set = new Set(nodes);
  return nodes.filter((element) =>
    !$(element).find("article,section,li,tr,div").toArray().some(
      (child) => child !== element && set.has(child),
    ),
  );
}

function headingsIn($, element) {
  return $(element).find("h1,h2,h3,h4,h5,h6").toArray()
    .map((heading) => cleanText($(heading).text()))
    .filter(Boolean)
    .filter((value) => !DATE_PATTERN.test(value))
    .filter((value) => !GENERIC_HEADING.test(value));
}

function eventIdentity($, element, text) {
  const headings = headingsIn($, element);
  if (headings.length) {
    const title = headings
      .slice()
      .sort((left, right) => right.length - left.length)[0];
    const artist = headings.find(
      (value) => normalizeName(value) !== normalizeName(title),
    );
    return { title, artistName: artist };
  }

  const categoryIndex = text.indexOf("コンサート");
  if (categoryIndex < 0) return { title: "", artistName: undefined };
  const prefix = cleanText(text.slice(0, categoryIndex));
  const lastDate = [...prefix.matchAll(new RegExp(DATE_PATTERN.source, "gu"))].at(-1);
  const tail = cleanText(
    lastDate
      ? prefix.slice((lastDate.index ?? 0) + lastDate[0].length)
      : prefix,
  );
  return { title: tail, artistName: undefined };
}

function parseTime(text, label) {
  const value = text.match(new RegExp(`${label}時間[:：]\\s*(\\d{1,2}:\\d{2})`, "u"))?.[1];
  return normalizeTime(value);
}

function segmentBetween(text, start, ends) {
  const startIndex = text.indexOf(start);
  if (startIndex < 0) return "";
  const tail = text.slice(startIndex + start.length);
  const stop = ends
    .map((marker) => tail.indexOf(marker))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  return cleanText(stop === undefined ? tail : tail.slice(0, stop));
}

function pricesFrom(text) {
  const priceText = segmentBetween(text, "入場料(円)", ["お問合せ先(TEL)"]);
  if (!priceText || /関係者のみ/u.test(priceText)) return [];
  return [...new Set(
    [...priceText.matchAll(/(?<!\d)(\d{1,3}(?:,\d{3})+|\d{4,6})(?!\d)/gu)]
      .map((match) => Number(match[1].replaceAll(",", "")))
      .filter((value) => Number.isInteger(value) && value > 0 && value < 1_000_000),
  )].sort((a, b) => a - b);
}

function detailUrl($, element, sourceUrl, title) {
  const wanted = normalizeName(title);
  const links = $(element).find("a[href]").toArray()
    .map((anchor) => ({
      label: cleanText($(anchor).text()),
      url: normalizeUrl($(anchor).attr("href"), sourceUrl),
    }))
    .filter((item) => item.url);
  const exact = links.find((item) => normalizeName(item.label) === wanted);
  if (exact) return exact.url;
  return links.find((item) => /詳細を見る/u.test(item.label))?.url;
}

function conservativeArtistNames(title, artistName, knownArtistNames = new Set()) {
  if (artistName) return [artistName];
  const normalizedTitle = normalizeName(title);
  const knownMatches = [...knownArtistNames].filter(
    (known) => known.length >= 3 && normalizedTitle.includes(known),
  );
  if (knownMatches.length === 1) {
    const rawPrefix = cleanText(title)
      .replace(/^20\d{2}(?:-\d{2})?\s+/u, "")
      .match(/^(.+?)(?=\s+(?:WORLD\s+TOUR|DOME\s+LIVE\s+TOUR|DOME\s+TOUR|LIVE\s+TOUR|CONCERT|JAPAN\s+FANMEETING)\b|「|‘|')/iu)?.[1];
    if (rawPrefix && normalizeName(rawPrefix) === knownMatches[0]) return [rawPrefix];
  }

  const cleaned = cleanText(title).replace(/^20\d{2}(?:-\d{2})?\s+/u, "");
  const match = cleaned.match(
    /^(.+?)(?=\s+(?:WORLD\s+TOUR|DOME\s+LIVE\s+TOUR|DOME\s+TOUR|LIVE\s+TOUR|CONCERT\s+TOUR|JAPAN\s+FANMEETING)\b|「)/iu,
  );
  if (!match?.[1]) return [];
  const candidate = cleanText(match[1]);
  if (/^[A-Za-z0-9_!+.' -]{2,48}$/u.test(candidate)) return [candidate];
  return [];
}

export function parseKyoceraDomeSchedule(
  html,
  sourceUrl,
  { year, month, knownArtistNames = new Set() } = {},
) {
  const $ = cheerio.load(html);
  const bodyText = cleanText($("body").text());
  const expectedHeading = `${Number(year)}年${Number(month)}月のイベントスケジュール`;
  if (!bodyText.includes(expectedHeading)) {
    return {
      ok: false,
      reason: `京セラドーム大阪官网月页缺少「${expectedHeading}」，查询参数或页面结构可能已变化`,
      records: [],
    };
  }

  const records = [];
  for (const element of eventContainers($)) {
    const text = cleanText($(element).text());
    const dateMatch = text.match(DATE_PATTERN);
    if (!dateMatch) continue;
    if (Number(dateMatch[1]) !== Number(year) || Number(dateMatch[2]) !== Number(month)) {
      continue;
    }
    const date = toIsoDate(dateMatch[1], dateMatch[2], dateMatch[3]);
    if (!date) continue;
    const { title, artistName } = eventIdentity($, element, text);
    if (!title) continue;
    const openTime = parseTime(text, "開場");
    const startTime = parseTime(text, "開始");
    const pricesJpy = pricesFrom(text);
    records.push({
      title,
      date,
      openTime,
      startTime,
      pricesJpy,
      artistNames: conservativeArtistNames(title, artistName, knownArtistNames),
      officialEventUrl: detailUrl($, element, sourceUrl, title),
    });
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
