import * as cheerio from "cheerio";
import {
  cleanText,
  normalizeName,
  normalizeTime,
  toIsoDate,
} from "../event-ingest-lib.mjs";

const DATE_PATTERN = /(20\d{2})\.(\d{2})\.(\d{2})\s*[（(][^）)]*[）)]/u;
const DETAIL_PATH = /^\/program\/[^/?#]+\/?$/u;
const NON_MUSIC = /(仙台89ERS|B\.LEAGUE|TOHOKU\s+CUP|RIZIN|SENJO|SPORTS\s*DAY|TOUCH\s+THE\s+SPORTS|ABE\s+CUP|ICE\s+SKATING|アイスショー|プロレス|FIFA|パブリックビューイング|インターンシップ|キャリア発見フェア|はたちの集い|学位記授与式|入学式|卒業|試合開始|キックオフ|サッカー|バスケット|3×3|リアル脱出ゲーム|スケート初心者講習会|防災フェス|体育祭)/iu;
const MUSIC_SIGNAL = /(?:\bLIVE\b|\bTOUR\b|\bCONCERT\b|\bMUSIC\b|\bARENA\b|\bFES(?:TIVAL)?\b|\bONEMAN\b|\bSAKANAQUARIUM\b|ライブ|コンサート|音楽|ロック|歌謡|シンフォニ|フェス)/iu;
const TIME_MARKER = /(?:[〖＜][^〗＞]{1,20}[〗＞]\s*)?(?:開場(?:・|\/|／)開演|開場・試合開始|開場(?:\/|／)キックオフ|試合開始|開催時間|イベント時間|オープン時間|開場)/u;

function normalizeUrl(value, base) {
  try {
    return new URL(value, base).href;
  } catch {
    return undefined;
  }
}

function monthKeys(months) {
  return new Set(
    months.map(({ year, month }) =>
      `${Number(year)}-${String(Number(month)).padStart(2, "0")}`,
    ),
  );
}

function detailAnchors($, sourceUrl) {
  return $("a[href]").toArray()
    .map((anchor) => {
      const href = $(anchor).attr("href");
      const url = normalizeUrl(href, sourceUrl);
      if (!url) return null;
      const parsed = new URL(url);
      if (parsed.hostname !== new URL(sourceUrl).hostname) return null;
      if (!DETAIL_PATH.test(parsed.pathname)) return null;
      const text = cleanText($(anchor).text());
      if (!DATE_PATTERN.test(text)) return null;
      return { anchor, url, text };
    })
    .filter(Boolean);
}

function titleFromCard(text) {
  const dateMatch = text.match(DATE_PATTERN);
  if (!dateMatch) return "";
  let tail = cleanText(text.slice((dateMatch.index ?? 0) + dateMatch[0].length));
  tail = tail.replace(/^終了したイベントです\s*/u, "");
  const marker = tail.search(TIME_MARKER);
  if (marker >= 0) tail = tail.slice(0, marker);
  return cleanText(tail);
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

function extractArtistNames(title, knownArtistNames = new Set()) {
  const rules = [
    /^(.+?)\s+ARENA\s+TOUR\b/iu,
    /^(.+?)\s+LIVE\s+TOUR\b/iu,
    /^(.+?)\s+CONCERT\s+TOUR\b/iu,
    /^(.+?)\s+ONEMAN\s+TOUR\b/iu,
    /^(.+?)\s+BAY\s+SIDE\s+TOUR\b/iu,
    /^(.+?)\s+WORLD\s+TOUR\b/iu,
    /^(.+?)\s+TOUR\s+20\d{2}/iu,
    /^(.+?)\s+Tour\s+20\d{2}/u,
    /^(.+?)\s+10th\s+Anniversary\s+Tour\b/iu,
    /^(.+?)\s+TOUR\s+20\d{2}[〜～-]/u,
  ];
  for (const rule of rules) {
    const match = title.match(rule);
    if (!match?.[1]) continue;
    const candidate = cleanText(match[1]);
    const normalized = normalizeName(candidate);
    if (
      knownArtistNames.has(normalized) ||
      /^[A-Za-z0-9][A-Za-z0-9 ._!&'+=-]{1,60}$/u.test(candidate) ||
      /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}A-Za-z0-9 .・]+$/u.test(candidate)
    ) {
      return [candidate];
    }
  }

  const normalizedTitle = normalizeName(title);
  const matches = [...knownArtistNames]
    .filter((known) => known.length >= 3 && normalizedTitle.startsWith(known))
    .sort((left, right) => right.length - left.length);
  if (matches.length === 1) {
    const rawPrefix = title.match(/^(.+?)(?=\s+(?:LIVE|TOUR|ARENA|CONCERT|ONEMAN|BAY\s+SIDE|10th\s+Anniversary)\b)/iu)?.[1];
    if (rawPrefix && normalizeName(rawPrefix) === matches[0]) return [cleanText(rawPrefix)];
  }
  return [];
}

function parsePerformances(text) {
  const results = [];
  for (const match of text.matchAll(
    /(?:[〖＜][^〗＞]{1,20}[〗＞]\s*)?開場(?:・|\/|／)開演\s*(\d{1,2}:\d{2})\s*[／/]\s*(\d{1,2}:\d{2})/gu,
  )) {
    results.push({
      openTime: normalizeTime(match[1]),
      startTime: normalizeTime(match[2]),
    });
  }
  if (results.length) return results;

  if (/開場(?:・|\/|／)開演\s*未定/u.test(text)) {
    return [{ openTime: undefined, startTime: undefined }];
  }

  const pair = text.match(/開場\s*(\d{1,2}:\d{2})\s*[／/]\s*開演\s*(\d{1,2}:\d{2})/u);
  if (pair) {
    return [{
      openTime: normalizeTime(pair[1]),
      startTime: normalizeTime(pair[2]),
    }];
  }
  return [];
}

export function parseXebioArenaSendaiProgram(
  html,
  sourceUrl,
  { months = [], knownArtistNames = new Set() } = {},
) {
  const $ = cheerio.load(html);
  const bodyText = cleanText($("body").text());
  if (!bodyText.includes("イベント") || !bodyText.includes("ゼビオアリーナ仙台")) {
    return {
      ok: false,
      reason: "ゼビオアリーナ仙台官方 program 页面缺少场馆/事件标识，页面结构可能已变化",
      records: [],
    };
  }

  const allowed = monthKeys(months);
  if (!allowed.size) {
    return {
      ok: false,
      reason: "ゼビオアリーナ仙台 parser 需要明确目标月份",
      records: [],
    };
  }

  const records = [];
  for (const item of detailAnchors($, sourceUrl)) {
    const dateMatch = item.text.match(DATE_PATTERN);
    if (!dateMatch) continue;
    const date = toIsoDate(dateMatch[1], dateMatch[2], dateMatch[3]);
    if (!date || !allowed.has(date.slice(0, 7))) continue;

    const title = titleFromCard(item.text);
    if (!isMusicEvent(title, knownArtistNames)) continue;
    const performances = parsePerformances(item.text);
    if (!performances.length) continue;
    const artistNames = extractArtistNames(title, knownArtistNames);

    for (const performance of performances) {
      records.push({
        title,
        artistNames,
        date,
        ...performance,
        officialDetailUrl: item.url,
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
