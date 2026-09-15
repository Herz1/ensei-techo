import * as cheerio from "cheerio";
import {
  cleanText,
  normalizeName,
  normalizeTime,
  toIsoDate,
} from "../event-ingest-lib.mjs";

const DATE_TOKEN = /(\d{1,2})月(\d{1,2})日[（(][^）)]*[）)]/gu;
const NON_MUSIC = /(ディズニー(?:・|オン・アイス)|DESTRUCTION\s+in\s+KOBE|プロレス|格闘|ボクシング|ETHICS\s+FAN\s+MEETING|実践倫理|展示会|見本市|全国大会|研究集会|式典)/iu;
const MUSIC_SIGNAL = /(?:\bLIVE\b|\bTOUR\b|\bCONCERT\b|\bARENA\b|\bMUSIC\b|\bFES(?:TIVAL)?\b|\bCOLORFUL\s+LIVE\b|ライブ|コンサート|歌謡|音楽|ツアー)/iu;

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

function eventContainers($) {
  const nodes = $("li").toArray().filter((element) => DATE_TOKEN.test(cleanText($(element).text())));
  const set = new Set(nodes);
  return nodes.filter((element) =>
    !$(element).find("li").toArray().some((child) => child !== element && set.has(child)),
  );
}

function titleFrom(text) {
  const match = text.match(DATE_TOKEN);
  if (!match) return "";
  return cleanText(text.slice(0, match.index ?? 0));
}

function pageYearFor(pageYear, pageMonth, eventMonth) {
  const y = Number(pageYear);
  const p = Number(pageMonth);
  const m = Number(eventMonth);
  if (p >= 10 && m <= 3) return y + 1;
  if (p <= 3 && m >= 10) return y - 1;
  return y;
}

function performancesFrom(text, pageYear, pageMonth, allowed) {
  const matches = [...text.matchAll(DATE_TOKEN)];
  const records = [];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const month = Number(match[1]);
    const day = Number(match[2]);
    const year = pageYearFor(pageYear, pageMonth, month);
    const date = toIsoDate(year, month, day);
    if (!date || !allowed.has(date.slice(0, 7))) continue;
    const segment = text.slice(
      (match.index ?? 0) + match[0].length,
      index + 1 < matches.length ? matches[index + 1].index : text.length,
    );
    const times = [...segment.matchAll(/(\d{1,2}:\d{2})\s*[～~]/gu)]
      .map((timeMatch) => normalizeTime(timeMatch[1]))
      .filter(Boolean);
    if (times.length) {
      for (const startTime of times) records.push({ date, startTime });
    } else {
      records.push({ date, startTime: undefined });
    }
  }
  return records;
}

function classifiedLinks($, element, sourceUrl) {
  const sourceHost = new URL(sourceUrl).hostname;
  let artistOfficialUrl;
  let promoterUrl;
  for (const anchor of $(element).find("a[href]").toArray()) {
    const url = normalizeUrl($(anchor).attr("href"), sourceUrl);
    if (!url) continue;
    const host = new URL(url).hostname;
    if (host === sourceHost) continue;
    const label = cleanText($(anchor).text()).normalize("NFKC");
    if (!artistOfficialUrl && /アーティスト\s*オフィシャルサイト/u.test(label)) {
      artistOfficialUrl = url;
      continue;
    }
    if (!promoterUrl) promoterUrl = url;
  }
  return { artistOfficialUrl, promoterUrl };
}

function isMusicEvent(title, artistOfficialUrl, knownArtistNames = new Set()) {
  if (!title || NON_MUSIC.test(title)) return false;
  if (artistOfficialUrl) return true;
  if (MUSIC_SIGNAL.test(title)) return true;
  const normalized = normalizeName(title);
  for (const known of knownArtistNames) {
    if (known.length >= 3 && normalized.includes(known)) return true;
  }
  return false;
}

function artistNamesFromTitle(title, knownArtistNames = new Set()) {
  const normalizedTitle = normalizeName(title);
  const exact = [...knownArtistNames]
    .filter((known) => known.length >= 3 && normalizedTitle === known)
    .sort((a, b) => b.length - a.length);
  if (exact.length === 1) return [title];

  const stripped = title.replace(/^20\d{2}\s+/u, "");
  const rules = [
    /^(.+?)\s+JAPAN\s+ARENA\s+TOUR\b/iu,
    /^(.+?)\s+ARENA\s+LIVE\b/iu,
    /^(.+?)\s+ARENA\s+TOUR\b/iu,
    /^(.+?)\s+LIVE\s+TOUR\b/iu,
    /^(.+?)\s+CONCERT\s+TOUR\b/iu,
    /^(.+?)\s+TOUR\s+20\d{2}/iu,
    /^(.+?)\s+\d+(?:st|nd|rd|th)\s+LIVE\b/iu,
    /^(.+?)\s+\d+(?:st|nd|rd|th)\s+ARENA\b/iu,
  ];
  for (const rule of rules) {
    const match = stripped.match(rule);
    if (!match?.[1]) continue;
    const candidate = cleanText(match[1]);
    if (knownArtistNames.has(normalizeName(candidate))) return [candidate];
  }

  const fanMeeting = stripped.match(/FAN\s+MEETING\s+([A-Za-z0-9_!.'-]{2,60})/iu)?.[1];
  if (fanMeeting && knownArtistNames.has(normalizeName(fanMeeting))) return [fanMeeting];

  const contained = [...knownArtistNames]
    .filter((known) => known.length >= 3 && normalizedTitle.includes(known))
    .sort((a, b) => b.length - a.length);
  if (contained.length === 1) return [contained[0]];
  return [];
}

export function parseWorldMemorialHallMonth(
  html,
  sourceUrl,
  { year, month, months = [], knownArtistNames = new Set() } = {},
) {
  const $ = cheerio.load(html);
  const bodyText = cleanText($("body").text());
  if (
    !bodyText.includes("イベントカレンダー") ||
    !bodyText.includes("ホールイベント情報") ||
    !bodyText.includes("開催日/開演時間") ||
    !bodyText.includes("お問い合わせ先")
  ) {
    return {
      ok: false,
      reason: "神戸ワールド記念ホール官方月历缺少结构标识，页面结构可能已变化",
      records: [],
    };
  }

  const pageYear = Number(year);
  const pageMonth = Number(month);
  if (!Number.isInteger(pageYear) || !Number.isInteger(pageMonth) || pageMonth < 1 || pageMonth > 12) {
    return { ok: false, reason: "World Hall parser 需要明确 year/month", records: [] };
  }
  const allowed = allowedMonthKeys(months);
  if (!allowed.size) {
    return { ok: false, reason: "World Hall parser 需要明确目标月份窗口", records: [] };
  }

  const records = [];
  for (const element of eventContainers($)) {
    const text = cleanText($(element).text());
    const title = titleFrom(text);
    if (!title) continue;
    const links = classifiedLinks($, element, sourceUrl);
    if (!isMusicEvent(title, links.artistOfficialUrl, knownArtistNames)) continue;
    const performances = performancesFrom(text, pageYear, pageMonth, allowed);
    if (!performances.length) continue;
    const artistNames = artistNamesFromTitle(title, knownArtistNames);
    for (const performance of performances) {
      records.push({
        title,
        artistNames,
        ...performance,
        ...links,
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
