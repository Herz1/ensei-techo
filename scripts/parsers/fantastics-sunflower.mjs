import * as cheerio from "cheerio";
import {
  cleanText,
  normalizeTime,
  toIsoDate,
} from "../event-ingest-lib.mjs";

const TITLE = "FANTASTICS LIVE TOUR 2026 “SUNFLOWER”";
const TITLE_RE = /FANTASTICS\s+LIVE\s+TOUR\s+2026\s+[“"]SUNFLOWER[”"]/iu;
const DATE_RE = /(?:(20\d{2})\/)?(\d{1,2})\/(\d{1,2})[（(][^）)]*[）)]/gu;
const HEADER_TIME_RE = /(?:開場\s*[／/]\s*開演|OPEN\s*[／/]\s*START|Doors\s+open\s*[／/]\s*Start)\s*(\d{1,2}:\d{2})\s*[／/]\s*(\d{1,2}:\d{2})/iu;
const LABELED_TIME_RE = /(?:開場|OPEN|Doors\s+open)\s*(\d{1,2}:\d{2})\s*[／/]\s*(?:開演|START|Start)\s*(\d{1,2}:\d{2})/iu;
const PERFORMANCE_PREFIX = /^\[[^\]]+公演\]\s*/u;

function monthKey(date) {
  return date.slice(0, 7);
}

function allowedMonthKeys(months) {
  return new Set(
    months.map(({ year, month }) =>
      `${Number(year)}-${String(Number(month)).padStart(2, "0")}`,
    ),
  );
}

function normalizeVenueName(value) {
  const normalized = cleanText(value)
    .normalize("NFKC")
    .replace(PERFORMANCE_PREFIX, "")
    .trim();
  if (/^Aichi Sky Expo\s*\(愛知県国際展示場\)\s*ホールA$/u.test(normalized)) {
    return "Aichi Sky Expo(愛知県国際展示場) ホールA";
  }
  if (/^マリンメッセ福岡\s+A館$/u.test(normalized)) {
    return "マリンメッセ福岡A館";
  }
  if (normalized === "エコパアリーナ") return "静岡エコパアリーナ";
  return normalized;
}

function extractTimes(segment) {
  for (const pattern of [HEADER_TIME_RE, LABELED_TIME_RE]) {
    const match = segment.match(pattern);
    if (!match || match.index === undefined) continue;
    const openTime = normalizeTime(match[1]);
    const startTime = normalizeTime(match[2]);
    if (openTime && startTime) {
      return { match, openTime, startTime };
    }
  }
  return undefined;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function priceForLabel(bodyText, label) {
  const escaped = escapeRegExp(label);
  const match = bodyText.match(
    new RegExp(`${escaped}\\s*[：:]\\s*[¥￥]\\s*([0-9][0-9,]*)`, "u"),
  );
  if (!match) return undefined;
  const price = Number(match[1].replaceAll(",", ""));
  return Number.isInteger(price) && price > 0 ? price : undefined;
}

function ticketTypesFrom(bodyText) {
  return [
    "全席指定",
    "プレミアムチケット",
    "プレミアムチケット(オリジナルグッズ付き)",
  ].flatMap((name) => {
    const priceJpy = priceForLabel(bodyText, name);
    return priceJpy
      ? [{ name, priceJpy, taxIncluded: true, notes: [] }]
      : [];
  });
}

function parseAllRecords(bodyText) {
  const matches = [...bodyText.matchAll(DATE_RE)];
  const records = [];
  let currentYear = 2026;

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    if (match[1]) currentYear = Number(match[1]);
    const date = toIsoDate(currentYear, match[2], match[3]);
    if (!date) continue;

    const segment = cleanText(bodyText.slice(
      (match.index ?? 0) + match[0].length,
      index + 1 < matches.length ? matches[index + 1].index : bodyText.length,
    )).normalize("NFKC");
    const timing = extractTimes(segment);
    if (!timing) continue;

    const venueName = normalizeVenueName(segment.slice(0, timing.match.index));
    if (!venueName || venueName.length > 100) continue;
    if (/(?:TICKET|GOODS|NEWS|INFO|お問い合わせ|申込期間)/iu.test(venueName)) continue;

    records.push({
      title: TITLE,
      artistNames: ["FANTASTICS"],
      venueName,
      date,
      openTime: timing.openTime,
      startTime: timing.startTime,
    });
  }

  return records.filter(
    (record, index, all) =>
      all.findIndex((candidate) =>
        candidate.date === record.date &&
        candidate.venueName === record.venueName &&
        candidate.startTime === record.startTime,
      ) === index,
  );
}

export function parseFantasticsSunflower(
  html,
  sourceUrl,
  { months = [] } = {},
) {
  const $ = cheerio.load(html);
  const bodyText = cleanText($("body").text()).normalize("NFKC");
  if (!TITLE_RE.test(bodyText)) {
    return {
      ok: false,
      reason: "FANTASTICS official page 缺少 SUNFLOWER tour 标识",
      records: [],
      tourMonths: [],
      allRecordCount: 0,
    };
  }

  const allRecords = parseAllRecords(bodyText);
  if (!allRecords.length) {
    return {
      ok: false,
      reason: "SUNFLOWER 页面未解析到明确日期/会场/开场开演记录",
      records: [],
      tourMonths: [],
      allRecordCount: 0,
    };
  }

  const ticketTypes = ticketTypesFrom(bodyText);
  const pricesJpy = [...new Set(ticketTypes.map((item) => item.priceJpy))].sort((a, b) => a - b);
  const allowed = allowedMonthKeys(months);
  const tourMonths = [...new Set(allRecords.map((record) => monthKey(record.date)))].sort();
  const records = allRecords
    .filter((record) => allowed.has(monthKey(record.date)))
    .map((record) => ({
      ...record,
      ticketTypes,
      pricesJpy,
    }));

  return {
    ok: true,
    records,
    tourMonths,
    allRecordCount: allRecords.length,
  };
}
