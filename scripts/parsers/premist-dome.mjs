import * as cheerio from "cheerio";
import {
  cleanText,
  normalizeName,
  normalizeTime,
  toIsoDate,
} from "../event-ingest-lib.mjs";

const DATE_PATTERN = /(20\d{2})\/(\d{1,2})\/(\d{1,2})[（(][^）)]*[）)]/u;
const DETAIL_PATH = /\/schedule\/detail\/?\?date=\d{8}$/u;
const MUSIC_SIGNAL = /(?:\bMUSIC\b|\bLIVE\b|\bTOUR\b|\bCONCERT\b|\bFES(?:TIVAL)?\b|\bFANMEETING\b|ライブ|コンサート|音楽|フェス)/iu;
const NON_MUSIC = /(サッカー|野球|ラグビー|フットボール|マラソン|選手権|大会|試合|ヨガ|花火|モノ\s*ヴィレッジ|食べる・たいせつ|講座|学校イベント|紙ひこうき)/iu;

function normalizeUrl(value, base) {
  try {
    return new URL(value, base).href;
  } catch {
    return undefined;
  }
}

function allowedMonthKeys(months) {
  return new Set(
    months.map(({ year, month }) =>
      `${Number(year)}-${String(Number(month)).padStart(2, "0")}`,
    ),
  );
}

function detailAnchor($, element, sourceUrl) {
  for (const anchor of $(element).find("a[href]").toArray()) {
    const url = normalizeUrl($(anchor).attr("href"), sourceUrl);
    if (!url) continue;
    try {
      const parsed = new URL(url);
      if (DETAIL_PATH.test(`${parsed.pathname}${parsed.search}`)) {
        return { anchor, url };
      }
    } catch {
      // Ignore malformed links.
    }
  }
  return null;
}

function eventContainers($, sourceUrl) {
  const selectors = "article,li,section,div";
  const nodes = $(selectors).toArray().filter((element) => {
    const text = cleanText($(element).text());
    return DATE_PATTERN.test(text) &&
      text.includes("開始時刻") &&
      Boolean(detailAnchor($, element, sourceUrl));
  });
  const set = new Set(nodes);
  return nodes.filter((element) =>
    !$(element).find(selectors).toArray().some(
      (child) => child !== element && set.has(child),
    ),
  );
}

function categoryFrom(text) {
  if (/\bコンサート\b/u.test(text)) return "コンサート";
  if (/\bイベント\b/u.test(text)) return "イベント";
  if (/\bサッカー\b/u.test(text)) return "サッカー";
  if (/\b野球\b/u.test(text)) return "野球";
  if (/\bラグビー\b/u.test(text)) return "ラグビー";
  return "other";
}

function titleFromAnchor($, anchor) {
  return cleanText($(anchor).text())
    .replace(/^20\d{2}\/\d{1,2}\/\d{1,2}[（(][^）)]*[）)]\s*/u, "")
    .replace(/^20\d{2}\/\d{1,2}\/\d{1,2}\s*/u, "")
    .trim();
}

function parsePublishedTime(text, label) {
  const match = text.match(new RegExp(`${label}\\s*(未定|\\d{1,2}:\\d{2})`, "u"));
  if (!match || match[1] === "未定") return undefined;
  return normalizeTime(match[1]);
}

function isMusicEvent(title, category, knownArtistNames = new Set()) {
  if (!title || NON_MUSIC.test(title)) return false;
  if (category === "コンサート") return true;
  if (category !== "イベント") return false;
  if (MUSIC_SIGNAL.test(title)) return true;
  const normalized = normalizeName(title);
  for (const known of knownArtistNames) {
    if (known.length >= 3 && normalized.includes(known)) return true;
  }
  return false;
}

function artistNamesFromTitle(title, knownArtistNames = new Set()) {
  const normalized = normalizeName(title);
  const exactKnown = [...knownArtistNames]
    .filter((known) => known.length >= 3 && normalized.includes(known))
    .sort((a, b) => b.length - a.length);

  const prefixRules = [
    /^(.+?)\s+ASIA\b.*\b(?:DOME|STADIUM)\b.*\bTOUR\b/iu,
    /^(.+?)\s+DOME\s+TOUR\b/iu,
    /^(.+?)\s+LIVE\s+TOUR\b/iu,
    /^(.+?)\s+WORLD\s+TOUR\b/iu,
    /^(.+?)\s+[–-]\s+The\b/iu,
  ];
  for (const rule of prefixRules) {
    const match = title.match(rule);
    if (!match?.[1]) continue;
    const candidate = cleanText(match[1]);
    const candidateNormalized = normalizeName(candidate);
    if (
      knownArtistNames.has(candidateNormalized) ||
      /^[A-Za-z0-9_!+.' -]{2,50}$/u.test(candidate)
    ) {
      return [candidate];
    }
  }

  if (exactKnown.length === 1) {
    const known = exactKnown[0];
    const raw = title.split(/\s{2,}|\s+(?=(?:LIVE|DOME|WORLD|ASIA)\b)/u)[0];
    if (normalizeName(raw) === known) return [cleanText(raw)];
  }
  return [];
}

function classifyExternalLinks($, element, sourceUrl) {
  const sourceHost = new URL(sourceUrl).hostname;
  let officialEventUrl;
  let promoterUrl;

  for (const anchor of $(element).find("a[href]").toArray()) {
    const url = normalizeUrl($(anchor).attr("href"), sourceUrl);
    if (!url) continue;
    const parsed = new URL(url);
    if (parsed.hostname === sourceHost) continue;
    const label = cleanText($(anchor).text());
    const contexts = [anchor, ...$(anchor).parents("p,li,div,section,article").toArray()]
      .map((node) => cleanText($(node).text()))
      .filter((value) => value.length <= 500);

    if (!officialEventUrl && /公式サイト|イベント公式サイト/u.test(label)) {
      officialEventUrl = url;
      continue;
    }
    if (!promoterUrl && contexts.some((value) => value.includes("お問い合わせ"))) {
      promoterUrl = url;
    }
  }
  return { officialEventUrl, promoterUrl };
}

export function parsePremistDomeEventList(
  html,
  sourceUrl,
  { months = [], knownArtistNames = new Set() } = {},
) {
  const $ = cheerio.load(html);
  const bodyText = cleanText($("body").text());
  if (!bodyText.includes("イベントリスト") || !bodyText.includes("大和ハウス プレミストドーム")) {
    return {
      ok: false,
      reason: "大和ハウス プレミストドーム官网 event list 缺少结构标识，页面结构可能已变化",
      records: [],
    };
  }

  const monthKeys = allowedMonthKeys(months);
  if (!monthKeys.size) {
    return {
      ok: false,
      reason: "大和ハウス プレミストドーム parser 需要明确目标月份",
      records: [],
    };
  }

  const records = [];
  for (const element of eventContainers($, sourceUrl)) {
    const text = cleanText($(element).text());
    const dateMatch = text.match(DATE_PATTERN);
    if (!dateMatch) continue;
    const date = toIsoDate(dateMatch[1], dateMatch[2], dateMatch[3]);
    if (!date || !monthKeys.has(date.slice(0, 7))) continue;

    const detail = detailAnchor($, element, sourceUrl);
    if (!detail) continue;
    const title = titleFromAnchor($, detail.anchor);
    const category = categoryFrom(text);
    if (!isMusicEvent(title, category, knownArtistNames)) continue;

    const { officialEventUrl, promoterUrl } = classifyExternalLinks($, element, sourceUrl);
    records.push({
      title,
      category,
      date,
      openTime: parsePublishedTime(text, "開場時刻"),
      startTime: parsePublishedTime(text, "開始時刻"),
      artistNames: artistNamesFromTitle(title, knownArtistNames),
      officialDetailUrl: detail.url,
      officialEventUrl,
      promoterUrl,
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
