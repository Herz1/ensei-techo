import * as cheerio from "cheerio";
import {
  cleanText,
  normalizeName,
  normalizeTime,
  toIsoDate,
} from "../event-ingest-lib.mjs";

const DETAIL_PATH = /^\/eventinfo\/[^/?#]+\/?$/u;
const NON_MUSIC = /(振袖|呉服|着物|宝石|展示会|説明会|フェスタ|大会|選手権|スポーツ|式典|就職|商談|マラソン|プロレス|格闘)/iu;
const PERFORMANCE = /(20\d{2})\/(\d{1,2})\/(\d{1,2})\s+開場\s*(\d{1,2}:\d{2})\s*[／/]\s*開演\s*(\d{1,2}:\d{2})/gu;

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

function eventCardText($, anchor) {
  const candidates = [anchor, ...$(anchor).parents("article,li,section,div").toArray()];
  return candidates
    .map((node) => cleanText($(node).text()))
    .find((text) =>
      text.includes("開催期間") &&
      text.includes("利用会場") &&
      text.length <= 900,
    ) ?? "";
}

export function parseSundomeFukuiScheduleLinks(html, sourceUrl) {
  const $ = cheerio.load(html);
  const bodyText = cleanText($("body").text());
  if (!bodyText.includes("イベント情報") || !bodyText.includes("Event Schedule")) {
    return {
      ok: false,
      reason: "サンドーム福井官方 event index 缺少 Event Schedule 标识",
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
    const context = eventCardText($, anchor);
    if (!context) continue;
    if (!context.includes("メインホール") || !context.includes("コンサート")) continue;
    if (NON_MUSIC.test(context)) continue;
    links.push({
      url,
      discoveryText: context,
    });
  }

  return {
    ok: true,
    links: links.filter(
      (item, index, all) => all.findIndex((candidate) => candidate.url === item.url) === index,
    ),
  };
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

function titleFrom(bodyText) {
  return segmentBetween(bodyText, "催事名", ["主催者名", "利用会場", "開催期間"]);
}

function artistNamesFrom(title, knownArtistNames = new Set()) {
  const rules = [
    /^(.+?)\s+LIVE\s+TOUR\b/iu,
    /^(.+?)\s+ARENA\s+TOUR\b/iu,
    /^(.+?)\s+TOUR\s+20\d{2}\b/iu,
    /^(.+?)\s+Ringo\s+Jam\s+Tour\b/iu,
    /^(.+?)\s+コンサート\b/u,
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

function performancesFrom(bodyText, allowed) {
  const records = [];
  for (const match of bodyText.matchAll(PERFORMANCE)) {
    const date = toIsoDate(match[1], match[2], match[3]);
    if (!date || !allowed.has(date.slice(0, 7))) continue;
    records.push({
      date,
      openTime: normalizeTime(match[4]),
      startTime: normalizeTime(match[5]),
    });
  }
  return records;
}

function externalLinks($, sourceUrl, bodyText) {
  const sourceHost = new URL(sourceUrl).hostname;
  const promoterText = segmentBetween(bodyText, "主催者HP", ["お問い合わせ先", "ふくいSDGsパートナー"]);
  const artistText = segmentBetween(bodyText, "アーティストHP", ["カテゴリー", "サンドーム福井"]);
  let promoterUrl;
  let artistOfficialUrl;

  for (const anchor of $("a[href]").toArray()) {
    const url = normalizeUrl($(anchor).attr("href"), sourceUrl);
    if (!url) continue;
    const parsed = new URL(url);
    if (parsed.hostname === sourceHost) continue;
    const label = cleanText($(anchor).text());
    if (!promoterUrl && promoterText && (promoterText.includes(label) || promoterText.includes(url))) {
      promoterUrl = url;
      continue;
    }
    if (!artistOfficialUrl && artistText && (artistText.includes(label) || artistText.includes(url))) {
      artistOfficialUrl = url;
    }
  }
  return { promoterUrl, artistOfficialUrl };
}

export function parseSundomeFukuiDetail(
  html,
  sourceUrl,
  { months = [], knownArtistNames = new Set() } = {},
) {
  const $ = cheerio.load(html);
  const bodyText = cleanText($("body").text());
  if (
    !bodyText.includes("イベント情報") ||
    !bodyText.includes("コンサート") ||
    !bodyText.includes("利用会場") ||
    !bodyText.includes("メインホール")
  ) {
    return {
      ok: false,
      reason: "サンドーム福井详情页缺少 concert/main hall 结构标识",
      records: [],
    };
  }

  const title = titleFrom(bodyText);
  if (!title || NON_MUSIC.test(title)) {
    return { ok: false, reason: "详情页未解析到可用音乐催事名", records: [] };
  }
  const allowed = allowedMonthKeys(months);
  const performances = performancesFrom(bodyText, allowed);
  if (!performances.length) {
    return { ok: false, reason: "详情页未解析到目标月份内明确 OPEN/START", records: [] };
  }

  const artistNames = artistNamesFrom(title, knownArtistNames);
  const links = externalLinks($, sourceUrl, bodyText);
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
