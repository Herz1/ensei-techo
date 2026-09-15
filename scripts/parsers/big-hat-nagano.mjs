import * as cheerio from "cheerio";
import {
  cleanText,
  normalizeName,
  normalizeTime,
  toIsoDate,
} from "../event-ingest-lib.mjs";

const DETAIL_PATH = /^\/bighat\/topics\/\d{4}\/\d{2}\/[^/?#]+\.php$/u;
const NON_MUSIC = /(ロボットコンテスト|マーチングコンテスト|ウェルディングフェスタ|産業フェア|インターンシップ|キャリア発見|スポーツ|大会|選手権|展示会|説明会|フェア|マラソン|リレー・フォー・ライフ)/iu;
const MUSIC_SIGNAL = /(?:\bLIVE\b|\bTOUR\b|\bCONCERT\b|\bARENA\b|\bMUSIC\b|Ringo\s+Jam|ライブ|コンサート|ツアー)/iu;
const DATE_TOKEN = /(\d{1,2})\/(\d{1,2})[（(][^）)]*[）)]/gu;

function normalizeUrl(value, base) {
  try {
    return new URL(value, base).href;
  } catch {
    return undefined;
  }
}

function stripLeadingDates(value) {
  return cleanText(
    value
      .normalize("NFKC")
      .replace(/^(?:(?:\d{1,2}\/\d{1,2})\([^)]*\)\s*)+/u, ""),
  );
}

function cardText($, anchor) {
  const candidates = [anchor, ...$(anchor).parents("article,li,section,div").toArray()];
  return candidates
    .map((node) => cleanText($(node).text()))
    .find((text) => text.length >= 4 && text.length <= 900) ?? "";
}

function isMusicTitle(value, knownArtistNames = new Set()) {
  const text = cleanText(value).normalize("NFKC");
  if (!text || NON_MUSIC.test(text)) return false;
  if (MUSIC_SIGNAL.test(text)) return true;
  const normalized = normalizeName(text);
  return [...knownArtistNames].some(
    (known) => known.length >= 3 && normalized.includes(known),
  );
}

export function parseBigHatNaganoIndex(
  html,
  sourceUrl,
  { knownArtistNames = new Set() } = {},
) {
  const $ = cheerio.load(html);
  const bodyText = cleanText($("body").text());
  if (!bodyText.includes("ビッグハット") || !bodyText.includes("イベント")) {
    return {
      ok: false,
      reason: "ビッグハット官方 event index 缺少场馆/Event 标识",
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
    const title = stripLeadingDates(cleanText($(anchor).text()) || context);
    if (!isMusicTitle(`${title} ${context}`, knownArtistNames)) continue;
    links.push({ url, discoveryText: context, titleHint: title });
  }

  return {
    ok: true,
    links: links.filter(
      (item, index, all) => all.findIndex((candidate) => candidate.url === item.url) === index,
    ),
  };
}

function eventTitle($, bodyText, knownArtistNames) {
  const headings = $("h1,h2,h3,h4").toArray()
    .map((node) => stripLeadingDates($(node).text()))
    .filter(Boolean);
  const preferred = headings.find((value) => isMusicTitle(value, knownArtistNames));
  if (preferred) return preferred;

  const candidates = bodyText
    .split(/(?:日時|日程|入場料)/u)
    .map(stripLeadingDates)
    .filter((value) => isMusicTitle(value, knownArtistNames));
  return candidates[0] ?? "";
}

function artistNamesFrom(title, knownArtistNames = new Set()) {
  const normalizedTitle = title.normalize("NFKC");
  const rules = [
    /^(.+?)\s+Ringo\s+Jam\s+Tour\b/iu,
    /^(.+?)\s+LIVE\s+TOUR\b/iu,
    /^(.+?)\s+ARENA\s+TOUR\b/iu,
    /^(.+?)\s+TOUR\b/iu,
    /^(.+?)(?=20\d{2}\s+TOUR\b)/iu,
    /^(.+?)\s+コンサート\b/u,
  ];
  for (const rule of rules) {
    const match = normalizedTitle.match(rule);
    if (!match?.[1]) continue;
    const candidate = cleanText(match[1]);
    if (
      knownArtistNames.has(normalizeName(candidate)) ||
      /^[\p{L}\p{N}][\p{L}\p{N} .・_'!&+.-]{1,80}$/u.test(candidate)
    ) {
      return [candidate];
    }
  }

  const normalized = normalizeName(normalizedTitle);
  const known = [...knownArtistNames]
    .filter((value) => value.length >= 3 && normalized.includes(value))
    .sort((a, b) => b.length - a.length);
  return known.length === 1 ? [known[0]] : [];
}

function scheduleText(bodyText) {
  const normalized = bodyText.normalize("NFKC");
  const markers = ["日時", "日程"];
  const starts = markers
    .map((marker) => ({ marker, index: normalized.indexOf(marker) }))
    .filter((item) => item.index >= 0)
    .sort((a, b) => a.index - b.index);
  if (!starts.length) return "";
  const first = starts[0];
  const tail = normalized.slice(first.index + first.marker.length);
  const stop = ["入場料", "公式HP", "チケットについて", "お問合せ", "お問い合わせ"]
    .map((marker) => tail.indexOf(marker))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  return cleanText(stop === undefined ? tail : tail.slice(0, stop));
}

function resolveYear(month, months) {
  const years = [...new Set(
    months
      .filter((item) => Number(item.month) === Number(month))
      .map((item) => Number(item.year)),
  )];
  return years.length === 1 ? years[0] : undefined;
}

function performancesFrom(bodyText, months) {
  const text = scheduleText(bodyText);
  const matches = [...text.matchAll(DATE_TOKEN)];
  const records = [];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const month = Number(match[1]);
    const day = Number(match[2]);
    const year = resolveYear(month, months);
    if (!year) continue;
    const date = toIsoDate(year, month, day);
    if (!date) continue;
    const segment = text.slice(
      (match.index ?? 0) + match[0].length,
      index + 1 < matches.length ? matches[index + 1].index : text.length,
    );
    const open = segment.match(/開場\s*(\d{1,2}:\d{2})/u)?.[1];
    const start = segment.match(/開演\s*(\d{1,2}:\d{2})/u)?.[1];
    const openTime = normalizeTime(open);
    const startTime = normalizeTime(start);
    if (!startTime) continue;
    records.push({ date, openTime, startTime });
  }
  return records;
}

function classifiedLinks($, sourceUrl) {
  const sourceHost = new URL(sourceUrl).hostname;
  let artistOfficialUrl;
  let ticketInfoUrl;
  for (const anchor of $("a[href]").toArray()) {
    const url = normalizeUrl($(anchor).attr("href"), sourceUrl);
    if (!url) continue;
    const parsed = new URL(url);
    if (parsed.hostname === sourceHost) continue;
    const contexts = [anchor, ...$(anchor).parents("tr,dl,dd,p,li,div,section").toArray()]
      .map((node) => cleanText($(node).text()))
      .filter((text) => text.length <= 700);
    if (!artistOfficialUrl && contexts.some((text) => text.includes("公式HP"))) {
      artistOfficialUrl = url;
      continue;
    }
    if (!ticketInfoUrl && contexts.some((text) => text.includes("チケットについて"))) {
      ticketInfoUrl = url;
    }
  }
  return { artistOfficialUrl, ticketInfoUrl };
}

export function parseBigHatNaganoDetail(
  html,
  sourceUrl,
  { months = [], knownArtistNames = new Set() } = {},
) {
  const $ = cheerio.load(html);
  const bodyText = cleanText($("body").text());
  if (!bodyText.includes("ビッグハット") || !bodyText.includes("イベント")) {
    return {
      ok: false,
      reason: "ビッグハット详情页缺少场馆/Event 标识",
      records: [],
    };
  }

  const title = eventTitle($, bodyText, knownArtistNames);
  if (!title || !isMusicTitle(title, knownArtistNames)) {
    return { ok: false, reason: "详情页不是保守规则认可的音乐公演", records: [] };
  }
  const performances = performancesFrom(bodyText, months);
  if (!performances.length) {
    return { ok: false, reason: "详情页未解析到目标月份内明确开演时间", records: [] };
  }

  const artistNames = artistNamesFrom(title, knownArtistNames);
  const links = classifiedLinks($, sourceUrl);
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
