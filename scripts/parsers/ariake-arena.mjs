import * as cheerio from "cheerio";
import {
  cleanText,
  normalizeName,
  normalizeTime,
  toIsoDate,
} from "../event-ingest-lib.mjs";

const DATE_TOKEN = /(\d{1,2})\.(\d{1,2})\s+(MON|TUE|WED|THU|FRI|SAT|SUN)\b/giu;
const HEADER_DATES = /^\s*\d{1,2}\.\d{1,2}\s+(?:MON|TUE|WED|THU|FRI|SAT|SUN)\b(?:\s*-?\s*\d{1,2}\.\d{1,2}\s+(?:MON|TUE|WED|THU|FRI|SAT|SUN)\b)*/iu;
const NON_MUSIC = /(ハンドボール|バスケットボール|バレーボール|B\.LEAGUE|AKATSUKI\s+JAPAN|\bTIPOFF\b|試合開始|国際試合|スポーツフェス|ディズニー・オン・アイス|サッカー|野球|マラソン|格闘|プロレス|柔道|空手|ボクシング|vs\.?\s)/iu;
const MUSIC_SIGNAL = /(?:\bLIVE\b|\bTOUR\b|\bCONCERT\b|\bMUSIC\b|\bFES(?:TIVAL)?\b|\bFANMEETING\b|ライブ|コンサート|音楽|フェス|祭)/iu;
const GENERIC = /^(?:ARIAKE ARENA EVENT|ARCHIVE|EVENT|公演時間|料金|公式サイト|お問合せ先|備考)$/iu;

function normalizeUrl(value, base) {
  try {
    return new URL(value, base).href;
  } catch {
    return undefined;
  }
}

function monthYearsFrom(months) {
  const map = new Map();
  for (const item of months) {
    const month = Number(item.month);
    const year = Number(item.year);
    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) continue;
    if (map.has(month) && map.get(month) !== year) return null;
    map.set(month, year);
  }
  return map;
}

function eventContainers($) {
  const selectors = "article,section,li,div,dl";
  const nodes = $(selectors).toArray().filter((element) => {
    const text = cleanText($(element).text());
    return text.includes("公演時間") &&
      text.includes("料金") &&
      text.includes("公式サイト") &&
      text.includes("お問合せ先") &&
      text.includes("備考") &&
      /\d{1,2}\.\d{1,2}\s+(?:MON|TUE|WED|THU|FRI|SAT|SUN)\b/iu.test(text);
  });
  const set = new Set(nodes);
  return nodes.filter((element) =>
    !$(element).find(selectors).toArray().some(
      (child) => child !== element && set.has(child),
    ),
  );
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

function identityPrefix(text) {
  const marker = text.indexOf("公演時間");
  if (marker < 0) return "";
  return cleanText(text.slice(0, marker)).replace(HEADER_DATES, "").trim();
}

function leafCandidates($, element, prefix) {
  const selectors = "h1,h2,h3,h4,h5,h6,p,span,strong,b,a";
  const values = [];
  for (const node of $(element).find(selectors).toArray()) {
    if ($(node).find(selectors).length) continue;
    const value = cleanText($(node).text());
    if (!value || value.length > 180 || GENERIC.test(value)) continue;
    if (/^https?:\/\//iu.test(value)) continue;
    if (/^\d{1,2}\.\d{1,2}\s+(?:MON|TUE|WED|THU|FRI|SAT|SUN)\b/iu.test(value)) continue;
    if (!prefix.includes(value)) continue;
    if (!values.includes(value)) values.push(value);
  }
  return values;
}

function eventIdentity($, element, text) {
  const prefix = identityPrefix(text);
  const candidates = leafCandidates($, element, prefix);
  if (candidates.length) {
    const title = candidates.slice().sort((a, b) => b.length - a.length)[0];
    const artistLabel = candidates.find((value) => {
      if (normalizeName(value) === normalizeName(title)) return false;
      return value.length <= 100;
    });
    return { title, artistLabel };
  }

  const parts = prefix.split(/\s{2,}|\s+[|｜]\s+/u).map(cleanText).filter(Boolean);
  if (parts.length >= 2) {
    return {
      title: parts[parts.length - 1],
      artistLabel: parts[parts.length - 2],
    };
  }
  return { title: prefix, artistLabel: undefined };
}

function splitArtistLabel(label) {
  if (!label || /出演者は備考欄/u.test(label)) return [];
  return label
    .split(/\s*(?:\/|／|,|，|、|・)\s*/u)
    .map(cleanText)
    .filter((value) => value.length >= 2 && value.length <= 60)
    .filter((value, index, all) => all.indexOf(value) === index);
}

function isMusicEvent(title, artistNames, text, knownArtistNames = new Set()) {
  if (NON_MUSIC.test(`${title} ${text}`)) return false;
  if (MUSIC_SIGNAL.test(title)) return true;
  for (const artist of artistNames) {
    if (knownArtistNames.has(normalizeName(artist))) return true;
  }
  const normalized = normalizeName(`${title} ${artistNames.join(" ")}`);
  for (const known of knownArtistNames) {
    if (known.length >= 3 && normalized.includes(known)) return true;
  }
  return false;
}

function performanceRecords(text, monthYears) {
  const performance = segmentBetween(text, "公演時間", ["料金"]);
  const matches = [...performance.matchAll(DATE_TOKEN)];
  const records = [];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const month = Number(match[1]);
    const day = Number(match[2]);
    const year = monthYears.get(month);
    if (!year) continue;
    const date = toIsoDate(year, month, day);
    if (!date) continue;
    const segment = performance.slice(
      (match.index ?? 0) + match[0].length,
      index + 1 < matches.length ? matches[index + 1].index : performance.length,
    );
    const pairMatches = [...segment.matchAll(
      /(?:[①②③④⑤]\s*)?開場\s*(\d{1,2}:\d{2})\s*[／/]\s*開演\s*(\d{1,2}:\d{2})/gu,
    )];
    if (pairMatches.length) {
      for (const pair of pairMatches) {
        records.push({
          date,
          openTime: normalizeTime(pair[1]),
          startTime: normalizeTime(pair[2]),
        });
      }
      continue;
    }
    for (const start of segment.matchAll(
      /(?:[①②③④⑤]\s*)?開演\s*(\d{1,2}:\d{2})/gu,
    )) {
      records.push({
        date,
        openTime: undefined,
        startTime: normalizeTime(start[1]),
      });
    }
  }
  return records;
}

function parseTicketTypes(text) {
  const rawPriceText = segmentBetween(text, "料金", ["公式サイト"]);
  const taxIncluded = /税込/u.test(rawPriceText) ? true : null;
  const priceText = rawPriceText
    .replace(/[（(]税込[)）]/gu, "|")
    .replace(/[（(]税込み[)）]/gu, "|");
  const chunks = priceText.split("|").map(cleanText).filter(Boolean);
  const ticketTypes = [];
  for (const chunk of chunks) {
    const yen = chunk.match(/(.{1,60}?)[：:]?\s*[¥￥]\s*([0-9][0-9,]*)/u);
    const en = chunk.match(/(.{1,60}?)[：:]?\s*([0-9][0-9,]*)\s*円/u);
    const match = yen ?? en;
    if (!match) continue;
    const name = cleanText(match[1])
      .replace(/^[※*・\s]+/u, "")
      .replace(/[：:\s]+$/u, "");
    const priceJpy = Number(match[2].replaceAll(",", ""));
    if (!name || !Number.isInteger(priceJpy) || priceJpy <= 0) continue;
    if (ticketTypes.some((item) => item.name === name && item.priceJpy === priceJpy)) continue;
    ticketTypes.push({
      name,
      priceJpy,
      taxIncluded,
      notes: [],
    });
  }
  return ticketTypes;
}

function eligibilityFrom(text) {
  const remarks = segmentBetween(text, "備考", []);
  const rules = [];
  const age = remarks.match(/\d+歳以上有料[、,]\s*\d+歳未満入場不可/u)?.[0];
  if (age) rules.push({ label: age, appliesTo: "入場条件" });
  const limit = remarks.match(/お1人様1公演につき\d+枚まで(?:申込み|申し込み)可能/u)?.[0];
  if (limit) rules.push({ label: limit, appliesTo: "申込条件" });
  return rules;
}

function contextualExternalUrl($, element, sourceUrl, marker) {
  const sourceHost = new URL(sourceUrl).hostname;
  for (const anchor of $(element).find("a[href]").toArray()) {
    const url = normalizeUrl($(anchor).attr("href"), sourceUrl);
    if (!url || new URL(url).hostname === sourceHost || new URL(url).hostname.endsWith("ariake-arena.tokyo")) {
      continue;
    }

    const local = $(anchor).closest("p,li,tr,dd,td").first();
    let context = cleanText(local.text());
    if (local.is("dd")) {
      context = cleanText(`${local.prevAll("dt").first().text()} ${context}`);
    }
    if (context.includes(marker)) return url;
  }
  return undefined;
}

export function parseAriakeArenaSchedule(
  html,
  sourceUrl,
  { months = [], knownArtistNames = new Set() } = {},
) {
  const $ = cheerio.load(html);
  const bodyText = cleanText($("body").text());
  if (!bodyText.includes("ARIAKE ARENA EVENT")) {
    return {
      ok: false,
      reason: "有明アリーナ官网页缺少 ARIAKE ARENA EVENT 标识，页面结构可能已变化",
      records: [],
    };
  }
  const monthYears = monthYearsFrom(months);
  if (!monthYears || monthYears.size === 0) {
    return {
      ok: false,
      reason: "有明アリーナ滚动日程需要明确目标月份，避免跨年猜测",
      records: [],
    };
  }

  const records = [];
  for (const element of eventContainers($)) {
    const text = cleanText($(element).text());
    if (!text.includes("開演")) continue;
    const { title, artistLabel } = eventIdentity($, element, text);
    const artistNames = splitArtistLabel(artistLabel);
    if (!title || !isMusicEvent(title, artistNames, text, knownArtistNames)) continue;
    const performances = performanceRecords(text, monthYears);
    if (!performances.length) continue;
    const ticketTypes = parseTicketTypes(text);
    const pricesJpy = [...new Set(ticketTypes.map((item) => item.priceJpy))].sort((a, b) => a - b);
    const eligibility = eligibilityFrom(text);
    const officialEventUrl = contextualExternalUrl($, element, sourceUrl, "公式サイト");
    const promoterUrl = contextualExternalUrl($, element, sourceUrl, "お問合せ先");

    for (const performance of performances) {
      records.push({
        title,
        artistNames,
        ...performance,
        ticketTypes,
        pricesJpy,
        eligibility,
        officialEventUrl,
        promoterUrl,
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
