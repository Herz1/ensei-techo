import * as cheerio from "cheerio";
import { cleanText, normalizeTime, toIsoDate } from "../event-ingest-lib.mjs";

const TITLE = "NEWS LIVE TOUR 2026 /// KMK";
const TITLE_RE = /NEWS\s+LIVE\s+TOUR\s+2026\s*\/{3}\s*KMK/iu;
const DATE_START_RE = /(20\d{2})[.\/](\d{1,2})[.\/](\d{1,2})[（(][^）)]*[）)](\d{1,2}:\d{2})(?![-–―〜~])/gu;
const MEMBER_PRICE_RE = /(?:ファミリークラブ会員チケット|Family\s+Club\s+Member\s+Ticket)\s*([0-9][0-9,]*)\s*(?:円|yen)\s*[（(](?:税込|tax\s+included)[）)]/iu;
const GENERAL_PRICE_RE = /(?:一般チケット(?:\s*[（(]プレイガイド[）)])?|General\s+tickets?(?:\s*[（(]ticket\s+agency[）)])?)\s*([0-9][0-9,]*)\s*(?:円|yen)\s*[（(](?:税込|tax\s+included)[）)]/iu;

const VENUES = [
  ["北海道立総合体育センター（北海きたえーる）", "北海きたえーる"],
  ["北海道立総合体育センター(北海きたえーる)", "北海きたえーる"],
  ["マリンメッセ福岡A館", "マリンメッセ福岡A館"],
  ["エコパアリーナ", "静岡エコパアリーナ"],
  ["セキスイハイムスーパーアリーナ", "宮城セキスイハイムスーパーアリーナ"],
  ["有明アリーナ", "有明アリーナ"],
  ["横浜アリーナ", "横浜アリーナ"],
  ["広島グリーンアリーナ", "広島グリーンアリーナ"],
  ["GLION ARENA KOBE", "GLION ARENA KOBE"],
];

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

function compact(value) {
  return value.normalize("NFKC").replace(/\s+/gu, "");
}

function venueBlocks(bodyText) {
  const text = compact(bodyText);
  const markers = [];
  const seenCanonical = new Set();

  for (const [marker, venueName] of VENUES) {
    const compactMarker = compact(marker);
    const index = text.indexOf(compactMarker);
    if (index < 0 || seenCanonical.has(venueName)) continue;
    markers.push({ index, length: compactMarker.length, venueName });
    seenCanonical.add(venueName);
  }
  markers.sort((a, b) => a.index - b.index);

  return markers.map((marker, index) => ({
    ...marker,
    segment: text.slice(
      marker.index + marker.length,
      index + 1 < markers.length ? markers[index + 1].index : text.length,
    ),
  }));
}

function parseSchedule(bodyText) {
  const records = [];
  for (const block of venueBlocks(bodyText)) {
    for (const match of block.segment.matchAll(DATE_START_RE)) {
      const date = toIsoDate(match[1], match[2], match[3]);
      const startTime = normalizeTime(match[4]);
      if (!date || !startTime) continue;
      records.push({
        title: TITLE,
        artistNames: ["NEWS"],
        venueName: block.venueName,
        date,
        startTime,
      });
    }
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

function parsePrice(bodyText, pattern) {
  const match = bodyText.match(pattern);
  if (!match) return undefined;
  const price = Number(match[1].replaceAll(",", ""));
  return Number.isInteger(price) && price > 0 ? price : undefined;
}

function ticketTypesFrom(bodyText) {
  const member = parsePrice(bodyText, MEMBER_PRICE_RE);
  const general = parsePrice(bodyText, GENERAL_PRICE_RE);
  return [
    ...(member ? [{ name: "ファミリークラブ会員チケット", priceJpy: member, taxIncluded: true, notes: [] }] : []),
    ...(general ? [{ name: "一般チケット", priceJpy: general, taxIncluded: true, notes: [] }] : []),
  ];
}

export function parseNewsKmk(
  html,
  sourceUrl,
  { months = [] } = {},
) {
  const $ = cheerio.load(html);
  const bodyText = cleanText($("body").text()).normalize("NFKC");
  if (!TITLE_RE.test(bodyText)) {
    return {
      ok: false,
      reason: "NEWS official page 缺少 KMK tour 标识",
      records: [],
      tourMonths: [],
      allRecordCount: 0,
    };
  }

  const allRecords = parseSchedule(bodyText);
  if (!allRecords.length) {
    return {
      ok: false,
      reason: "KMK 页面未解析到明确日期/会场/开演时间记录",
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
      openTime: undefined,
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
