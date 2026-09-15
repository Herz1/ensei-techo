import * as cheerio from "cheerio";
import {
  cleanText,
  normalizeName,
  normalizeTime,
  toIsoDate,
} from "../event-ingest-lib.mjs";

const EVENT_DATE = /(20\d{2})\/(\d{1,2})\/(\d{1,2})/u;
const NON_MUSIC = /(就職|EXPO|トヨタ|フィールド無料開放|リレーマラソン|マラソン|サッカー|Pet博|焼酎|うまいもん|SPECIAL MATCH|野球|スポーツ|展示会|商談会|説明会|キッズ|無料開放)/iu;
const MUSIC_SIGNAL = /(?:\bLIVE\b|\bTOUR\b|\bCONCERT\b|\bMUSIC\b|\bFES(?:TIVAL)?\b|\bROCK\b|SMTOWN|NUMBER\s*SHOT|ライブ|コンサート|音楽|フェス)/iu;
const FESTIVAL_SIGNAL = /(?:FES(?:TIVAL)?|MUSIC\s+CIRCUS|NUMBER\s*SHOT|GREATEST\s+ROCK|SMTOWN)/iu;
const CLOCK = "(\\d{1,2}:\\d{2})";

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
  const tail = cleanText(text.slice(eventIndex + "イベント".length).replace(/^\s*[:：|｜]\s*/u, ""));
  const stop = ["開演時間", "開催時間", "お問い合わせ"]
    .map((marker) => tail.indexOf(marker))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];
  return cleanText(stop === undefined ? tail : tail.slice(0, stop));
}

function parseEventTimes(text) {
  const labelFirst = text.match(
    new RegExp(`開場\\s*[／/]?\\s*${CLOCK}\\s*(?:[／/|｜]\\s*)?開演\\s*[／/]?\\s*${CLOCK}`, "u"),
  );
  if (labelFirst) {
    return {
      openTime: normalizeTime(labelFirst[1]),
      startTime: normalizeTime(labelFirst[2]),
    };
  }

  const timeFirst = text.match(
    new RegExp(`${CLOCK}\\s*開場\\s*(?:[／/|｜]\\s*)?${CLOCK}\\s*開演`, "u"),
  );
  if (timeFirst) {
    return {
      openTime: normalizeTime(timeFirst[1]),
      startTime: normalizeTime(timeFirst[2]),
    };
  }

  const startAfter = text.match(new RegExp(`開演\\s*[／/]?\\s*${CLOCK}`, "u"))?.[1];
  const startBefore = text.match(new RegExp(`${CLOCK}\\s*開演`, "u"))?.[1];
  const openAfter = text.match(new RegExp(`開場\\s*[／/]?\\s*${CLOCK}`, "u"))?.[1];
  const openBefore = text.match(new RegExp(`${CLOCK}\\s*開場`, "u"))?.[1];
  return {
    openTime: normalizeTime(openAfter ?? openBefore),
    startTime: normalizeTime(startAfter ?? startBefore),
  };
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
  const strongRules = [
    /^(.+?)\s+DOME\s+TOUR\b/iu,
    /^(.+?)\s+LIVE\s+TOUR\b/iu,
    /^(.+?)\s+CONCERT\s+TOUR\b/iu,
    /^(.+?)\s+TOUR\s+20\d{2}\b/iu,
  ];
  for (const rule of strongRules) {
    const match = title.match(rule);
    if (match?.[1]) return { prefix: cleanText(match[1]), strong: true };
  }
  const weakRules = [
    /^(.+?)\s+PRESENTS\b/iu,
    /^(.+?)\s+(?:\d{4}\s+)?WORLD\s+TOUR\b/iu,
    /^(.+?)\s+ASIA\b.*\b(?:DOME|STADIUM)\b.*\bTOUR\b/iu,
  ];
  for (const rule of weakRules) {
    const match = title.match(rule);
    if (match?.[1]) return { prefix: cleanText(match[1]), strong: false };
  }
  return null;
}

function knownArtistDisplayPrefix(title, knownArtistNames = new Set()) {
  const normalizedTitle = normalizeName(title);
  const known = [...knownArtistNames].find(
    (candidate) => candidate.length >= 4 && normalizedTitle.startsWith(candidate),
  );
  if (!known) return null;

  const marker = title.search(
    /\s+(?:(?:20\d{2}\s+)?WORLD\s+TOUR|DOME\s+TOUR|LIVE\s+TOUR|CONCERT\s+TOUR|ASIA\b|TOUR\s+20\d{2})/iu,
  );
  if (marker <= 0) return null;
  const prefix = cleanText(title.slice(0, marker)).replace(/\s+20\d{2}$/u, "");
  return normalizeName(prefix) === known ? prefix : null;
}

function hostSupportsArtist(url, normalizedArtist) {
  if (!url || !normalizedArtist) return false;
  try {
    const host = normalizeName(new URL(url).hostname.replace(/^www\./u, ""));
    return normalizedArtist.length >= 4 && host.includes(normalizedArtist);
  } catch {
    return false;
  }
}

function artistNamesFromTitle(title, knownArtistNames = new Set(), eventUrl) {
  if (FESTIVAL_SIGNAL.test(title)) return [];
  const knownPrefix = knownArtistDisplayPrefix(title, knownArtistNames);
  if (knownPrefix) return [knownPrefix];
  const candidate = candidateArtistPrefix(title);
  if (!candidate?.prefix) return [];
  const normalized = normalizeName(candidate.prefix);
  if (!normalized) return [];
  if (knownArtistNames.has(normalized)) return [candidate.prefix];
  if (candidate.strong) return [candidate.prefix];
  if (hostSupportsArtist(eventUrl, normalized)) return [candidate.prefix];
  if (/^[A-Z0-9][A-Z0-9 ._!&'+=-]{1,40}$/u.test(candidate.prefix)) {
    return [candidate.prefix];
  }
  return [];
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
  const eventUrl = officialEventUrl($, element, sourceUrl, title);
  const times = parseEventTimes(text);
  return {
    title,
    date,
    openTime: times.openTime,
    startTime: times.startTime,
    artistNames: artistNamesFromTitle(title, knownArtistNames, eventUrl),
    officialEventUrl: eventUrl,
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
