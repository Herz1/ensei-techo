import * as cheerio from "cheerio";
import {
  cleanText,
  normalizeTime,
  toIsoDate,
} from "../event-ingest-lib.mjs";

const TITLE = "2026 INI 5TH ANNIVERSARY DOME TOUR [CITY OF LIGHTS]";
const TITLE_RE = /2026\s+INI\s+5TH\s+ANNIVERSARY\s+DOME\s+TOUR\s*\[CITY\s+OF\s+LIGHTS\]/iu;
const DATE_TIME_RE = /(20\d{2})\/(\d{1,2})\/(\d{1,2})\s*[（(][^）)]*[）)]\s*(?:開場|Doors\s*open)\s*(\d{1,2}:\d{2})\s*[／/]\s*(?:開演|Show\s*starts?|Start)\s*(\d{1,2}:\d{2})/giu;
const PRICE_RE = /(?:^|\s|■)指定席\s*[:：]?\s*([0-9][0-9,]*)円\s*[（(]税込[）)]/u;

const VENUE_MARKERS = [
  ["[東京・東京ドーム]", "東京ドーム"],
  ["[大阪・京セラドーム大阪]", "京セラドーム大阪"],
  ["[Tokyo Dome, Tokyo]", "東京ドーム"],
  ["[Osaka - Kyocera Dome Osaka]", "京セラドーム大阪"],
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

function locateVenueBlocks(bodyText) {
  const compactText = compact(bodyText);
  const matches = [];
  for (const [marker, venueName] of VENUE_MARKERS) {
    const compactMarker = compact(marker);
    let from = 0;
    while (from < compactText.length) {
      const index = compactText.indexOf(compactMarker, from);
      if (index < 0) break;
      matches.push({ index, length: compactMarker.length, venueName });
      from = index + compactMarker.length;
    }
  }
  return { compactText, matches: matches.sort((a, b) => a.index - b.index) };
}

function ticketTypesFrom(bodyText) {
  const match = bodyText.match(PRICE_RE);
  if (!match) return [];
  const priceJpy = Number(match[1].replaceAll(",", ""));
  if (!Number.isInteger(priceJpy) || priceJpy <= 0) return [];
  return [{ name: "指定席", priceJpy, taxIncluded: true, notes: [] }];
}

function parseAllRecords(bodyText) {
  const { compactText, matches } = locateVenueBlocks(bodyText);
  const records = [];

  for (let index = 0; index < matches.length; index += 1) {
    const block = matches[index];
    const start = block.index + block.length;
    const end = index + 1 < matches.length ? matches[index + 1].index : compactText.length;
    const segment = compactText.slice(start, end);
    for (const match of segment.matchAll(DATE_TIME_RE)) {
      const date = toIsoDate(match[1], match[2], match[3]);
      const openTime = normalizeTime(match[4]);
      const startTime = normalizeTime(match[5]);
      if (!date || !openTime || !startTime) continue;
      records.push({
        title: TITLE,
        artistNames: ["INI"],
        venueName: block.venueName,
        date,
        openTime,
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

export function parseIniCityOfLights(
  html,
  sourceUrl,
  { months = [] } = {},
) {
  const $ = cheerio.load(html);
  const bodyText = cleanText($("body").text()).normalize("NFKC");
  if (!TITLE_RE.test(bodyText)) {
    return {
      ok: false,
      reason: "INI official page 缺少 CITY OF LIGHTS tour 标识",
      records: [],
      tourMonths: [],
      allRecordCount: 0,
    };
  }

  const allRecords = parseAllRecords(bodyText);
  if (!allRecords.length) {
    return {
      ok: false,
      reason: "CITY OF LIGHTS 页面未解析到明确日期/会场/开场开演记录",
      records: [],
      tourMonths: [],
      allRecordCount: 0,
    };
  }

  const ticketTypes = ticketTypesFrom(bodyText);
  const pricesJpy = ticketTypes.map((item) => item.priceJpy);
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
