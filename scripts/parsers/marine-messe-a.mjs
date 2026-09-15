import * as cheerio from "cheerio";
import {
  cleanText,
  normalizeName,
  normalizeTime,
  toIsoDate,
} from "../event-ingest-lib.mjs";

const DATE_AT_START = /^(\d{1,2})\.(\d{1,2})[（(][^）)]*[）)]\s*/u;
const DATE_ANYWHERE = /\d{1,2}\.\d{1,2}[（(][^）)]*[）)]/u;
const TIME_AT_START = /^(?:[①-⑳]\s*)?(\d{1,2}:\d{2})\s*[～〜~]?\s*/u;
const MUSIC_SIGNAL = /(?:\bLIVE\b|\bTOUR\b|\bCONCERT\b|\bMUSIC\b|\bFES(?:TIVAL)?\b|\bROCK\b|ライブ|コンサート|音楽会|歌謡祭|歌謡ショー|ファンミーティング|ファンミ|フェス)/iu;
const NON_MUSIC = /(?:展示会|見本市|商談会|学会|大会|セミナー|講演会|就職|EXPO|フェア|博覧会|物産|デンタル|アイス\s*[”"'「『]?Find|ディズニー・オン・アイス|スポーツ|バスケット|バレー|プロレス|マラソン)/iu;
const FESTIVAL_SIGNAL = /(?:FES(?:TIVAL)?|フェス|MUSIC\s+FESTIVAL)/iu;
const PROMOTER_HOSTS = [
  "kyodo-west.co.jp",
  "ldh-liveschedule.jp",
  "bea-net.com",
  "creative-man.co.jp",
  "diskgarage.com",
  "wess.jp",
];

function normalizeUrl(value, base) {
  try {
    return new URL(value, base).href;
  } catch {
    return undefined;
  }
}

function inferYear(baseYear, baseMonth, eventMonth) {
  const year = Number(baseYear);
  const month = Number(baseMonth);
  const candidate = Number(eventMonth);
  if (month === 12 && candidate === 1) return year + 1;
  if (month === 1 && candidate === 12) return year - 1;
  if (candidate < month - 6) return year + 1;
  if (candidate > month + 6) return year - 1;
  return year;
}

function allowedDate(date, allowedMonths) {
  if (!allowedMonths.size) return true;
  return allowedMonths.has(date.slice(0, 7));
}

function parseSchedulePrefix(text, { year, month, allowedMonths }) {
  let rest = cleanText(text);
  const shows = [];

  while (rest) {
    const dateMatch = rest.match(DATE_AT_START);
    if (!dateMatch) break;
    rest = rest.slice(dateMatch[0].length);

    const eventYear = inferYear(year, month, Number(dateMatch[1]));
    const date = toIsoDate(eventYear, dateMatch[1], dateMatch[2]);
    const times = [];

    while (rest) {
      const timeMatch = rest.match(TIME_AT_START);
      if (!timeMatch) break;
      const time = normalizeTime(timeMatch[1]);
      if (time) times.push(time);
      rest = rest.slice(timeMatch[0].length);
    }

    if (date && allowedDate(date, allowedMonths)) {
      if (times.length) {
        for (const startTime of times) shows.push({ date, startTime });
      } else {
        shows.push({ date, startTime: undefined });
      }
    }
  }

  return {
    shows,
    title: cleanText(rest),
  };
}

function knownMatches(title, knownArtistNames = new Set()) {
  const normalizedTitle = normalizeName(title);
  return [...knownArtistNames]
    .filter((name) =>
      name.length >= 3 &&
      normalizedTitle.startsWith(name),
    )
    .sort((left, right) => right.length - left.length);
}

function isMusicEvent(title, knownArtistNames) {
  if (!title || NON_MUSIC.test(title)) return false;
  if (MUSIC_SIGNAL.test(title)) return true;
  return knownMatches(title, knownArtistNames).length > 0;
}

function artistPrefix(title) {
  const rules = [
    /^(.+?)\s+CONCERT\s+TOUR\b/iu,
    /^(.+?)\s+LIVE\s+TOUR\b/iu,
    /^(.+?)\s+\d+(?:st|nd|rd|th)\s+ANNIVERSARY\b/iu,
    /^(.+?)\s+20\d{2}\s+TOUR\b/iu,
    /^(.+?)\s+TOUR\s+20\d{2}\b/iu,
    /^(.+?)\s+ARENA\s+TOUR\b/iu,
  ];
  for (const rule of rules) {
    const match = title.match(rule);
    if (match?.[1]) return cleanText(match[1]);
  }
  return "";
}

function artistNamesFromTitle(title, knownArtistNames) {
  const matches = knownMatches(title, knownArtistNames);
  if (FESTIVAL_SIGNAL.test(title)) return matches.slice(0, 6);

  const prefix = artistPrefix(title);
  if (prefix) {
    const normalizedPrefix = normalizeName(prefix);
    if (knownArtistNames.has(normalizedPrefix)) return [prefix];
    if (/^[A-Z0-9][A-Z0-9 ._!&'+=-]{1,48}$/u.test(prefix)) return [prefix];
    if (/[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}]/u.test(prefix)) return [prefix];
  }

  return matches.slice(0, 3);
}

function eventAnchor($, element) {
  const anchors = $(element).find("a[href]").toArray();
  return anchors.find((anchor) => DATE_ANYWHERE.test(cleanText($(anchor).text()))) ?? null;
}

function sourceRoleForUrl(url, sourceUrl) {
  try {
    const hostname = new URL(url).hostname.toLocaleLowerCase("en");
    const sourceHostname = new URL(sourceUrl).hostname.toLocaleLowerCase("en");
    if (hostname === sourceHostname) return "venue_detail";
    if (PROMOTER_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
      return "promoter_official";
    }
  } catch {
    return "promoter_official";
  }
  return "artist_official";
}

export function parseMarineMesseASchedule(
  html,
  sourceUrl,
  {
    year,
    month,
    allowedMonths = [],
    knownArtistNames = new Set(),
  } = {},
) {
  const $ = cheerio.load(html);
  const expectedHeading = `${Number(year)}年${String(Number(month)).padStart(2, "0")}月のイベント`;
  const bodyText = cleanText($("body").text());
  if (!bodyText.includes(expectedHeading)) {
    return {
      ok: false,
      reason: `マリンメッセ福岡A館官网页缺少「${expectedHeading}」，年月或页面结构可能已变化`,
      records: [],
    };
  }

  if (bodyText.includes("Coming Soon") && !$("li").toArray().some((element) =>
    DATE_ANYWHERE.test(cleanText($(element).text())),
  )) {
    return { ok: true, records: [] };
  }

  const allowed = new Set(
    allowedMonths.map(({ year: targetYear, month: targetMonth }) =>
      `${Number(targetYear)}-${String(Number(targetMonth)).padStart(2, "0")}`,
    ),
  );
  const records = [];
  const elements = $("li").toArray().filter((element) =>
    DATE_ANYWHERE.test(cleanText($(element).text())),
  );

  for (const element of elements) {
    const anchor = eventAnchor($, element);
    const text = cleanText(anchor ? $(anchor).text() : $(element).text());
    const parsed = parseSchedulePrefix(text, {
      year,
      month,
      allowedMonths: allowed,
    });
    if (!parsed.title || !isMusicEvent(parsed.title, knownArtistNames)) continue;

    const officialEventUrl = anchor
      ? normalizeUrl($(anchor).attr("href"), sourceUrl)
      : undefined;
    const artistNames = artistNamesFromTitle(parsed.title, knownArtistNames);

    for (const show of parsed.shows) {
      records.push({
        title: parsed.title,
        date: show.date,
        startTime: show.startTime,
        artistNames,
        officialEventUrl,
        officialEventRole: officialEventUrl ? sourceRoleForUrl(officialEventUrl, sourceUrl) : undefined,
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
