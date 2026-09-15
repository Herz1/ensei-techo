import * as cheerio from "cheerio";
import {
  cleanText,
  normalizeName,
  normalizeTime,
  splitArtistNames,
  toIsoDate,
} from "../event-ingest-lib.mjs";

const EVENT_DATE = /(20\d{2})\/(\d{1,2})\/(\d{1,2})/u;
const NON_MUSIC = /(就職|EXPO|トヨタ|フィールド無料開放|リレーマラソン|マラソン|サッカー|Pet博|焼酎|うまいもん|SPECIAL MATCH|野球|スポーツ|展示会|商談会|説明会|キッズ|無料開放)/iu;
const MUSIC_SIGNAL = /(?:\bLIVE\b|\bWORLD\s+TOUR\b|\bDOME\s+TOUR\b|\bLIVE\s+TOUR\b|\bCONCERT\b|\bMUSIC\b|\bFES(?:TIVAL)?\b|\bROCK\b|SMTOWN|NUMBER\s*SHOT|ライブ|コンサート|音楽|フェス)/iu;
const FESTIVAL_SIGNAL = /(?:FES(?:TIVAL)?|MUSIC\s+CIRCUS|NUMBER\s*SHOT|GREATEST\s+ROCK|SMTOWN)/iu;

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

function eventContainers($) {
  const nodes = $("article,section,li,tr,div").toArray().filter((element) => {
    const text = cleanText($(element).text());
    return EVENT_DATE.test(text) && text.includes("イベント") && text.includes("お問い合わせ");
  });
  const set = new Set(nodes);
  return nodes.filter((element) =>
    !$(element).find("article,section,li,tr,div").toArray().some(
      (child) => child !== element && set.has(child),
    ),
  );
}

function fallbackBlocks(text) {
  const matches = [...text.matchAll(/20\d{2}\/\d{1,2}\/\d{1,2}/gu)];
  return matches.map((match, index) =>
    text.slice(
      match.index ?? 0,
      index + 1 < matches.length ? matches[index + 1].index : text.length,
    ),
  );
}

function titleFromBlock(text) {
  const eventIndex = text.indexOf("イベント");
  if (eventIndex < 0) return "";
  const tail = cleanText(text.slice(eventIndex + "イベント".length).replace(/^[:：|｜]\s*/u, ""));
  const stop = ["開演時間", "開催時間", "お問い合わせ"]
    .map((marker) => tail.indexOf(marker))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];
  return cleanText(stop === undefined ? tail : tail.slice(0, stop));
}

function parseLabelTime(text, label) {
  const before = text.match(new RegExp(`(\\d{1,2}:\\d{2})\\s*${label}`, "u"))?.[1];
  const after = text.match(new RegExp(`${label}\\s*[／/]?\\s*(\\d{1,2}:\\d{2})`, "u"))?.[1];
  return normalizeTime(before ?? after);
}

function isMusicEvent(title, knownArtistNames = new Set()) {
  if (!title || NON_MUSIC.test(title)) return false;
  if (MUSIC_SIGNAL.test(title)) return true;
  const normalized = normalizeName(title);
  for (const known of knownArtistNames) {
    if (known.length >= 4 && normalized.includes(known)) return true;
  }
  return false;
}

function candidateArtistPrefix(title) {
  const rules = [
    /^(.+?)\s+PRESENTS\b/iu,
    /^(.+?)\s+(?:\d{4}\s+)?WORLD\s+TOUR\b/iu,
    /^(.+?)\s+DOME\s+TOUR\b/iu,
    /^(.+?)\s+LIVE\s+TOUR\b/iu,
    /^(.+?)\s+CONCERT\s+TOUR\b/iu,
    /^(.+?)\s+ASIA\b.*\b(?:DOME|STADIUM)\b.*\bTOUR\b/iu,
    /^(.+?)\s+TOUR\s+20\d{2}\b/iu,
  ];
  for (const rule of rules) {
    const match = title.match(rule);
    if (match?.[1]) return cleanText(match[1]);
  }
  return "";
}

function artistNamesFromTitle(title, knownArtistNames = new Set()) {
  if (FESTIVAL_SIGNAL.test(title)) return [];
  const prefix = candidateArtistPrefix(title);
  if (!prefix) return [];
  const names = splitArtistNames(prefix);
  return names.filter((name) => knownArtistNames.has(normalizeName(name)));
}

function officialEventUrl($, element, sourceUrl, title) {
  const wanted = normalizeName(title);
  if (!wanted) return undefined;
  const anchors = element
    ? $(element).find("a[href]").toArray()
    : $("a[href]").toArray();
  const candidates = anchors
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
      return score ? { url, score } : null;
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score);
  return candidates[0]?.url;
}

function parseBlock(text, { $, element, sourceUrl, allowedMonths, knownArtistNames }) {
  const dateMatch = text.match(EVENT_DATE);
  if (!dateMatch) return null;
  const date = toIsoDate(dateMatch[1], dateMatch[2], dateMatch[3]);
  if (!date) return null;
  if (allowedMonths.size && !allowedMonths.has(monthKey(dateMatch[1], dateMatch[2]))) {
    return null;
  }
  const title = titleFromBlock(text);
  if (!isMusicEvent(title, knownArtistNames)) return null;
  return {
    title,
    date,
    openTime: parseLabelTime(text, "開場"),
    startTime: parseLabelTime(text, "開演"),
    artistNames: artistNamesFromTitle(title, knownArtistNames),
    officialEventUrl: officialEventUrl($, element, sourceUrl, title),
  };
}

export function parsePayPayDomeSchedule(
  html,
  sourceUrl,
  { year, months = [], knownArtistNames = new Set() } = {},
) {
  const $ = cheerio.load(html);
  const bodyText = cleanText($("body").text());
  const expectedTitle = `${year}年みずほPayPayドームイベント日程`;
  if (!bodyText.includes(expectedTitle)) {
    return {
      ok: false,
      reason: `みずほPayPayドーム官网页缺少「${expectedTitle}」，年份或页面结构可能已变化`,
      records: [],
    };
  }

  const allowedMonths = new Set(
    months
      .filter((item) => Number(item.year) === Number(year))
      .map((item) => monthKey(item.year, item.month)),
  );
  const records = [];
  const containers = eventContainers($);
  if (containers.length) {
    for (const element of containers) {
      const record = parseBlock(cleanText($(element).text()), {
        $,
        element,
        sourceUrl,
        allowedMonths,
        knownArtistNames,
      });
      if (record) records.push(record);
    }
  } else {
    for (const block of fallbackBlocks(bodyText)) {
      const record = parseBlock(cleanText(block), {
        $,
        element: null,
        sourceUrl,
        allowedMonths,
        knownArtistNames,
      });
      if (record) records.push(record);
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
