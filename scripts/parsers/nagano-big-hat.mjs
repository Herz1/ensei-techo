import * as cheerio from "cheerio";
import {
  cleanText,
  normalizeName,
  normalizeTime,
  toIsoDate,
} from "../event-ingest-lib.mjs";

const DETAIL_PATH = /^\/bighat\/topics\/.+\.php$/u;
const NON_MUSIC = /(ロボットコンテスト|マーチング|ウェルディング|リレー・フォー・ライフ|産業フェア|インターンシップ|キャリア発見|就職|合同説明会|大会|フェスタ|セミナー|展示会|スポーツ|選手権|式典|プロレス|格闘)/iu;
const MUSIC_SIGNAL = /(?:\bLIVE\b|\bTOUR\b|\bCONCERT\b|\bMUSIC\b|\bARENA\b|\bFES(?:TIVAL)?\b|ライブ|コンサート|ツアー|音楽|歌謡)/iu;
const DATE_TOKEN = /(\d{1,2})\/(\d{1,2})[（(][^）)]*[）)]/gu;

function normalizeUrl(value, base) {
  try {
    return new URL(value, base).href;
  } catch {
    return undefined;
  }
}

function monthYearsFrom(months) {
  const map = new Map();
  for (const { year, month } of months) {
    const y = Number(year);
    const m = Number(month);
    if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) continue;
    if (map.has(m) && map.get(m) !== y) return null;
    map.set(m, y);
  }
  return map;
}

function cardText($, anchor) {
  const candidates = [anchor, ...$(anchor).parents("article,li,section,div").toArray()];
  return candidates
    .map((node) => cleanText($(node).text()))
    .find((text) => text.length >= 4 && text.length <= 900) ?? "";
}

function isMusicText(text, knownArtistNames = new Set()) {
  if (!text || NON_MUSIC.test(text)) return false;
  if (MUSIC_SIGNAL.test(text)) return true;
  const normalized = normalizeName(text);
  for (const known of knownArtistNames) {
    if (known.length >= 3 && normalized.includes(known)) return true;
  }
  return false;
}

export function parseNaganoBigHatScheduleLinks(
  html,
  sourceUrl,
  { knownArtistNames = new Set() } = {},
) {
  const $ = cheerio.load(html);
  const bodyText = cleanText($("body").text());
  if (!bodyText.includes("ビッグハット") || !bodyText.includes("トピックス")) {
    return {
      ok: false,
      reason: "長野ビッグハット官方 event topics 缺少场馆/トピックス标识",
      links: [],
    };
  }

  const links = [];
  for (const anchor of $("a[href]").toArray()) {
    const url = normalizeUrl($(anchor).attr("href"), sourceUrl);
    if (!url) continue;
    const parsed = new URL(url);
    if (parsed.hostname !== new URL(sourceUrl).hostname || !DETAIL_PATH.test(parsed.pathname)) {
      continue;
    }
    const context = cardText($, anchor);
    if (!isMusicText(context, knownArtistNames)) continue;
    links.push({ url, discoveryText: context });
  }

  return {
    ok: true,
    links: links.filter(
      (item, index, all) => all.findIndex((candidate) => candidate.url === item.url) === index,
    ),
  };
}

function stripDatePrefix(value) {
  return cleanText(value)
    .replace(/^(?:20\d{2}\s*)?/u, "")
    .replace(/^(?:\d{1,2}\/\d{1,2}[（(][^）)]*[）)]\s*)+/u, "")
    .replace(/^[〖『「【]\s*/u, "")
    .replace(/\s*[〗』」】]$/u, "");
}

function titleFrom($, knownArtistNames = new Set()) {
  const markerText = cleanText($("body").text());
  const markerIndex = [markerText.indexOf("日時"), markerText.indexOf("日程")]
    .filter((value) => value >= 0)
    .sort((a, b) => a - b)[0];
  const prefix = markerIndex === undefined ? markerText : markerText.slice(0, markerIndex);
  const selectors = "h1,h2,h3,h4,h5,h6,p,strong,b,dt,dd,a";
  const candidates = [];

  for (const node of $(selectors).toArray()) {
    if ($(node).find(selectors).length) continue;
    const raw = cleanText($(node).text());
    if (!raw || raw.length > 220 || !prefix.includes(raw)) continue;
    const value = stripDatePrefix(raw);
    if (!value || NON_MUSIC.test(value) || !isMusicText(value, knownArtistNames)) continue;
    if (/^(?:イベント|トピックス|ビッグハット|公式HP|チケットについて)$/u.test(value)) continue;
    if (!candidates.includes(value)) candidates.push(value);
  }

  return candidates.sort((a, b) => b.length - a.length)[0] ?? "";
}

function artistNamesFrom(title, knownArtistNames = new Set()) {
  const rules = [
    /^(.+?)\s+LIVE\s+TOUR\b/iu,
    /^(.+?)\s+ARENA\s+TOUR\b/iu,
    /^(.+?)\s+TOUR\s+20\d{2}\b/iu,
    /^(.+?)\s+Ringo\s+Jam\s+Tour\b/iu,
    /^(.+?)\s+2026\s+TOUR\b/iu,
    /^(.+?)\s+TOUR\b/iu,
    /^(.+?)\s+CONCERT\b/iu,
  ];
  for (const rule of rules) {
    const match = title.match(rule);
    if (!match?.[1]) continue;
    const candidate = cleanText(match[1]);
    if (
      knownArtistNames.has(normalizeName(candidate)) ||
      /^[\p{L}\p{N}][\p{L}\p{N} .・_'!&+.-]{1,80}$/u.test(candidate)
    ) {
      return [candidate];
    }
  }

  const normalized = normalizeName(title);
  const known = [...knownArtistNames]
    .filter((value) => value.length >= 3 && normalized.includes(value))
    .sort((a, b) => b.length - a.length);
  return known.length === 1 ? [known[0]] : [];
}

function segmentBetween(text, startMarkers, endMarkers) {
  const starts = startMarkers
    .map((marker) => ({ marker, index: text.indexOf(marker) }))
    .filter((item) => item.index >= 0)
    .sort((a, b) => a.index - b.index);
  if (!starts.length) return "";
  const first = starts[0];
  const tail = text.slice(first.index + first.marker.length);
  const stop = endMarkers
    .map((marker) => tail.indexOf(marker))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  return cleanText(stop === undefined ? tail : tail.slice(0, stop));
}

function performancesFrom(bodyText, monthYears) {
  const schedule = segmentBetween(
    bodyText.normalize("NFKC"),
    ["日時", "日程"],
    ["入場料", "料金", "公式HP", "チケットについて", "お問い合わせ"],
  );
  const matches = [...schedule.matchAll(DATE_TOKEN)];
  const records = [];

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const month = Number(match[1]);
    const day = Number(match[2]);
    const year = monthYears.get(month);
    if (!year) continue;
    const date = toIsoDate(year, month, day);
    if (!date) continue;
    const segment = schedule.slice(
      (match.index ?? 0) + match[0].length,
      index + 1 < matches.length ? matches[index + 1].index : schedule.length,
    );
    const pair = segment.match(/開場\s*(\d{1,2}:\d{2})\s*開演\s*(\d{1,2}:\d{2})/u);
    if (!pair) continue;
    records.push({
      date,
      openTime: normalizeTime(pair[1]),
      startTime: normalizeTime(pair[2]),
    });
  }
  return records;
}

function classifiedLinks($, sourceUrl, bodyText) {
  const sourceHost = new URL(sourceUrl).hostname;
  const officialText = segmentBetween(bodyText, ["公式HP", "公式サイト"], ["チケットについて", "お問い合わせ", "入場料"]);
  const ticketText = segmentBetween(bodyText, ["チケットについて"], ["お問い合わせ", "公式HP", "入場料"]);
  let artistOfficialUrl;
  let ticketInfoUrl;

  for (const anchor of $("a[href]").toArray()) {
    const url = normalizeUrl($(anchor).attr("href"), sourceUrl);
    if (!url) continue;
    const parsed = new URL(url);
    if (parsed.hostname === sourceHost) continue;
    const label = cleanText($(anchor).text());
    if (!artistOfficialUrl && officialText && (officialText.includes(label) || officialText.includes(url))) {
      artistOfficialUrl = url;
      continue;
    }
    if (!ticketInfoUrl && ticketText && (ticketText.includes(label) || ticketText.includes(url))) {
      ticketInfoUrl = url;
    }
  }
  return { artistOfficialUrl, ticketInfoUrl };
}

export function parseNaganoBigHatDetail(
  html,
  sourceUrl,
  { months = [], knownArtistNames = new Set() } = {},
) {
  const $ = cheerio.load(html);
  const bodyText = cleanText($("body").text());
  if (!bodyText.includes("ビッグハット") || !bodyText.includes("トピックス")) {
    return {
      ok: false,
      reason: "長野ビッグハット详情页缺少场馆/トピックス标识",
      records: [],
    };
  }

  const monthYears = monthYearsFrom(months);
  if (!monthYears || !monthYears.size) {
    return {
      ok: false,
      reason: "Big Hat parser 需要无冲突的目标月份→年份映射",
      records: [],
    };
  }

  const title = titleFrom($, knownArtistNames);
  if (!title || NON_MUSIC.test(title)) {
    return { ok: false, reason: "详情页未解析到可用音乐标题", records: [] };
  }
  const performances = performancesFrom(bodyText, monthYears);
  if (!performances.length) {
    return { ok: false, reason: "详情页未解析到目标窗口内明确 OPEN/START", records: [] };
  }
  const artistNames = artistNamesFrom(title, knownArtistNames);
  const links = classifiedLinks($, sourceUrl, bodyText);

  return {
    ok: true,
    records: performances.map((performance) => ({
      title,
      artistNames,
      ...performance,
      ...links,
    })),
  };
}
