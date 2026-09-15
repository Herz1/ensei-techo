import * as cheerio from "cheerio";
import {
  cleanText,
  normalizeName,
  normalizeTime,
  toIsoDate,
} from "../event-ingest-lib.mjs";

const DETAIL_PATH = /^\/event\/\d+\/?$/u;
const NON_MUSIC = /(ディズニー(?:・|オン・アイス)|B\.LEAGUE|ファイブアローズ|フットサル|卓球|柔道|空手|Crossminton|スポーツ|大会|選手権|マラソン|JOB QUEST|穴吹祭|警察|体感デー|OPEN DAY|リーグ戦|プレシーズン|vs\.?\s)/iu;
const MUSIC_SIGNAL = /(?:\bLIVE\b|\bTOUR\b|\bCONCERT\b|\bARENA\b|\bMUSIC\b|\bFES(?:TIVAL)?\b|ライブ|コンサート|ツアー|音楽|歌謡)/iu;
const DATE_JP = /(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日[（(][^）)]*[）)]/gu;

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

function cardText($, anchor) {
  const ancestors = [anchor, ...$(anchor).parents("li,article,section,div").toArray()];
  return ancestors
    .map((node) => cleanText($(node).text()))
    .find((text) => text.includes("メインアリーナ") && text.length <= 700) ?? "";
}

function isMusicDiscovery(text, knownArtistNames = new Set()) {
  if (!text || NON_MUSIC.test(text)) return false;
  if (MUSIC_SIGNAL.test(text)) return true;
  const normalized = normalizeName(text);
  for (const known of knownArtistNames) {
    if (known.length >= 3 && normalized.includes(known)) return true;
  }
  return false;
}

export function parseAnabukiArenaScheduleLinks(
  html,
  sourceUrl,
  { knownArtistNames = new Set() } = {},
) {
  const $ = cheerio.load(html);
  const bodyText = cleanText($("body").text());
  if (!bodyText.includes("あなぶきアリーナ香川") || !bodyText.includes("EVENT")) {
    return {
      ok: false,
      reason: "あなぶきアリーナ香川官网首页缺少场馆/Event 标识，页面结构可能已变化",
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
    if (!isMusicDiscovery(context, knownArtistNames)) continue;
    links.push({ url, discoveryText: context });
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

function timedDates(text) {
  const matches = [...text.matchAll(DATE_JP)];
  const records = [];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const date = toIsoDate(match[1], match[2], match[3]);
    if (!date) continue;
    const segment = text.slice(
      (match.index ?? 0) + match[0].length,
      index + 1 < matches.length ? matches[index + 1].index : text.length,
    );
    const times = [...segment.matchAll(/(?:[①②③④⑤]\s*)?(?:開場|開演)?\s*[\/:／]?\s*(\d{1,2}[：:]\d{2})/gu)]
      .map((timeMatch) => normalizeTime(timeMatch[1]))
      .filter(Boolean);
    records.push({ date, times: [...new Set(times)] });
  }
  return records;
}

function performancesFrom(bodyText) {
  const openText = segmentBetween(bodyText, "開場時間", ["開演時間", "終演時間", "料金", "公式サイト", "お問い合わせ", "備考"]);
  const startText = segmentBetween(bodyText, "開演時間", ["終演時間", "料金", "公式サイト", "お問い合わせ", "備考"]);
  const opensByDate = new Map(timedDates(openText).map((item) => [item.date, item.times]));
  const starts = timedDates(startText);
  const performances = [];

  for (const item of starts) {
    for (let index = 0; index < item.times.length; index += 1) {
      const openTimes = opensByDate.get(item.date) ?? [];
      performances.push({
        date: item.date,
        openTime: openTimes[index] ?? (openTimes.length === 1 && item.times.length === 1 ? openTimes[0] : undefined),
        startTime: item.times[index],
      });
    }
  }
  return performances;
}

function titleFrom($) {
  const headings = $("h1").toArray().map((node) => cleanText($(node).text())).filter(Boolean);
  return headings.find((value) => value.length > 3) ?? "";
}

function artistNamesFrom(title, knownArtistNames = new Set()) {
  const bracket = title.match(/^[〖【](.+?)[〗】]/u)?.[1];
  if (bracket && !NON_MUSIC.test(bracket)) return [cleanText(bracket)];
  const normalized = normalizeName(title);
  const matches = [...knownArtistNames]
    .filter((known) => known.length >= 3 && normalized.includes(known))
    .sort((a, b) => b.length - a.length);
  return matches.length === 1 ? [matches[0]] : [];
}

function ticketTypesFrom($) {
  const results = [];
  const nodes = $("p,li,dd,div").toArray();
  for (const node of nodes) {
    if ($(node).find("p,li,dd,div").length) continue;
    const value = cleanText($(node).text());
    const match = value.match(/^(.{1,80}?)[：:\s　]+([0-9][0-9,]*)\s*円\s*[（(]税込[)）]?$/u);
    if (!match) continue;
    const name = cleanText(match[1]).replace(/^[・※*\s]+/u, "");
    const priceJpy = Number(match[2].replaceAll(",", ""));
    if (!name || !Number.isInteger(priceJpy) || priceJpy <= 0) continue;
    if (results.some((item) => item.name === name && item.priceJpy === priceJpy)) continue;
    results.push({ name, priceJpy, taxIncluded: true, notes: [] });
  }
  return results;
}

function classifiedLinks($, sourceUrl) {
  const sourceHost = new URL(sourceUrl).hostname;
  let artistOfficialUrl;
  let promoterUrl;
  for (const anchor of $("a[href]").toArray()) {
    const url = normalizeUrl($(anchor).attr("href"), sourceUrl);
    if (!url) continue;
    const host = new URL(url).hostname;
    if (host === sourceHost) continue;
    const contexts = [anchor, ...$(anchor).parents("p,li,dd,div,section").toArray()]
      .map((node) => cleanText($(node).text()))
      .filter((text) => text.length <= 600);
    if (!artistOfficialUrl && contexts.some((text) => text.includes("公式サイト"))) {
      artistOfficialUrl = url;
      continue;
    }
    if (!promoterUrl && contexts.some((text) => text.includes("お問い合わせ"))) {
      promoterUrl = url;
    }
  }
  return { artistOfficialUrl, promoterUrl };
}

export function parseAnabukiArenaDetail(
  html,
  sourceUrl,
  { months = [], knownArtistNames = new Set() } = {},
) {
  const $ = cheerio.load(html);
  const bodyText = cleanText($("body").text());
  if (!bodyText.includes("あなぶきアリーナ香川") || !bodyText.includes("メインアリーナ")) {
    return {
      ok: false,
      reason: "あなぶきアリーナ香川详情页缺少场馆/メインアリーナ标识",
      records: [],
    };
  }

  const title = titleFrom($);
  if (!title || NON_MUSIC.test(title) || (!MUSIC_SIGNAL.test(title) && !artistNamesFrom(title, knownArtistNames).length)) {
    return { ok: false, reason: "详情页不是保守规则认可的音乐公演", records: [] };
  }
  const allowed = allowedMonthKeys(months);
  const performances = performancesFrom(bodyText).filter((item) =>
    allowed.has(item.date.slice(0, 7)),
  );
  if (!performances.length) {
    return { ok: false, reason: "详情页未解析到目标月份内的明确开演时间", records: [] };
  }

  const ticketTypes = ticketTypesFrom($);
  const pricesJpy = [...new Set(ticketTypes.map((item) => item.priceJpy))].sort((a, b) => a - b);
  const links = classifiedLinks($, sourceUrl);
  const artistNames = artistNamesFrom(title, knownArtistNames);

  return {
    ok: true,
    records: performances.map((performance) => ({
      title,
      artistNames,
      ...performance,
      ticketTypes,
      pricesJpy,
      ...links,
    })),
  };
}
