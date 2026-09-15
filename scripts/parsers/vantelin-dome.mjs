import * as cheerio from "cheerio";
import {
  cleanText,
  normalizeName,
  normalizeTime,
  toIsoDate,
} from "../event-ingest-lib.mjs";

const EVENT_HEADER = /(\d{1,2})\/(\d{1,2})\s*[（(][^）)]*[）)]\s*開場\s*(---|--|未定|\d{1,2}:\d{2})\s*[／/]\s*開始\s*(---|--|未定|\d{1,2}:\d{2})/u;
const EVENT_HEADER_GLOBAL = new RegExp(EVENT_HEADER.source, "gu");
const EMPTY_MONTH = /(20\d{2})年(\d{1,2})月は予定がありません/gu;
const NON_MUSIC = /(中日\s*vs|ドラゴンズ|野球|ファーム・リーグ|ソフトボール|サッカー|マラソン|学校展|結婚式|関係者|大会|試合|ナイター|クイーンズカップ|LEGENDS\s+MATCH|侍ジャパン|JFA|ベースボール|オープン戦|スポーツ)/iu;
const MUSIC_SIGNAL = /(?:\bLIVE\b|\bTOUR\b|\bCONCERT\b|\bMUSIC\b|\bFES(?:TIVAL)?\b|\bROCK\b|ライブ|コンサート|音楽|フェス)/iu;
const FESTIVAL_SIGNAL = /(?:FES(?:TIVAL)?|フェス)/iu;

function normalizeUrl(value, base) {
  try {
    return new URL(value, base).href;
  } catch {
    return undefined;
  }
}

function requestedMonthYears(months) {
  const result = new Map();
  for (const item of months) {
    const month = Number(item.month);
    const year = Number(item.year);
    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) {
      continue;
    }
    if (result.has(month) && result.get(month) !== year) {
      return null;
    }
    result.set(month, year);
  }
  return result;
}

function fallbackBlocks(text) {
  const matches = [...text.matchAll(EVENT_HEADER_GLOBAL)];
  return matches.map((match, index) =>
    text.slice(
      match.index ?? 0,
      index + 1 < matches.length ? matches[index + 1].index : text.length,
    ),
  );
}

function cleanTailTitle(text) {
  const match = text.match(EVENT_HEADER);
  if (!match) return "";
  let tail = cleanText(text.slice((match.index ?? 0) + match[0].length));
  const stopPattern = /(?:20\d{2}年\d{1,2}月は予定がありません|お問い合わせ|問い合わせ|TEL[:：]|コンコース売店|プリズマクラブ|ドーム内駐車場|正面チケット売場|中日ドラゴンズコールセンター|キョードー東海|サンデーフォークプロモーション|ファミリークラブ|インフォメーション|ニュース＆トピックス|トップページへ)/u;
  const stop = tail.search(stopPattern);
  if (stop >= 0) tail = tail.slice(0, stop);
  return cleanText(tail);
}

function titleFromBlock($, text) {
  const tail = cleanTailTitle(text);
  const normalizedTail = normalizeName(tail);
  if (!normalizedTail) return "";
  const anchored = $("a[href]").toArray()
    .map((anchor) => cleanText($(anchor).text()))
    .filter(Boolean)
    .filter((label) => !/^(?:詳細|こちら|トップ|アクセス|チケット)$/u.test(label))
    .find((label) => {
      const normalized = normalizeName(label);
      return normalized.length >= 3 && normalizedTail.includes(normalized);
    });
  return anchored || tail;
}

function isMusicEvent(title, knownArtistNames = new Set()) {
  if (!title || NON_MUSIC.test(title)) return false;
  if (MUSIC_SIGNAL.test(title)) return true;
  const normalized = normalizeName(title);
  for (const known of knownArtistNames) {
    if (known.length >= 3 && normalized.includes(known)) return true;
  }
  return false;
}

function candidateArtistPrefix(title) {
  const rules = [
    /^(.+?)\s+PRESENTS\b/iu,
    /^(.+?)\s+20\d{2}\s+WORLD\s+TOUR\b/iu,
    /^(.+?)\s+WORLD\s+TOUR\b/iu,
    /^(.+?)\s+DOME\s+TOUR\b/iu,
    /^(.+?)\s+LIVE\s+TOUR\b/iu,
    /^(.+?)\s+CONCERT\s+TOUR\b/iu,
    /^(.+?)\s+ASIA\b.*\b(?:DOME|STADIUM)\b.*\bTOUR\b/iu,
    /^(.+?)\s+-\s+.+\bTOUR\b/iu,
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
  const normalized = normalizeName(prefix);
  if (!normalized) return [];
  if (knownArtistNames.has(normalized)) return [prefix];
  if (/^[A-Z0-9][A-Z0-9 ._!&'+=-]{1,48}$/u.test(prefix)) return [prefix];
  if (
    /^[A-Za-z0-9][A-Za-z0-9 ._!&'+=-]{1,48}$/u.test(prefix) &&
    /\b(?:WORLD|DOME|LIVE|CONCERT)\s+TOUR\b/iu.test(title)
  ) {
    return [prefix];
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
      return {
        url,
        score,
        external: new URL(url).hostname !== sourceHost,
      };
    })
    .filter(Boolean)
    .sort((left, right) =>
      right.score - left.score || Number(right.external) - Number(left.external),
    );
  return candidates[0]?.url;
}

function parsePublishedTime(value) {
  if (!value || /^(?:---|--|未定)$/u.test(value)) return undefined;
  return normalizeTime(value);
}

function parseBlock(text, { $, sourceUrl, monthYears, knownArtistNames }) {
  const match = text.match(EVENT_HEADER);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = monthYears.get(month);
  if (!year) return null;
  const title = titleFromBlock($, text);
  if (!isMusicEvent(title, knownArtistNames)) return null;
  const date = toIsoDate(year, month, day);
  if (!date) return null;
  return {
    title,
    date,
    openTime: parsePublishedTime(match[3]),
    startTime: parsePublishedTime(match[4]),
    artistNames: artistNamesFromTitle(title, knownArtistNames),
    officialEventUrl: officialEventUrl($, sourceUrl, title),
  };
}

export function parseVantelinDomeSchedule(
  html,
  sourceUrl,
  { months = [], knownArtistNames = new Set() } = {},
) {
  const $ = cheerio.load(html);
  const bodyText = cleanText($("body").text().replace(/\r?\n/gu, " "));
  if (!bodyText.includes("イベントカレンダー") || !bodyText.includes("バンテリンドーム ナゴヤ")) {
    return {
      ok: false,
      reason: "バンテリンドーム ナゴヤ官网页缺少事件日历标识，页面结构可能已变化",
      records: [],
    };
  }

  const monthYears = requestedMonthYears(months);
  if (!monthYears || monthYears.size === 0) {
    return {
      ok: false,
      reason: "バンテリンドーム ナゴヤ滚动年历需要明确的目标月份，避免跨年猜测",
      records: [],
    };
  }

  const hasEventRows = EVENT_HEADER.test(bodyText);
  const hasEmptyMonthMarkers = [...bodyText.matchAll(EMPTY_MONTH)].length > 0;
  if (!hasEventRows && !hasEmptyMonthMarkers) {
    return {
      ok: false,
      reason: "バンテリンドーム ナゴヤ官网页未发现事件行或空月份标记，页面结构可能已变化",
      records: [],
    };
  }

  const records = fallbackBlocks(bodyText)
    .map((block) => parseBlock(cleanText(block), {
      $,
      sourceUrl,
      monthYears,
      knownArtistNames,
    }))
    .filter(Boolean);

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
