import * as cheerio from "cheerio";
import {
  cleanText,
  normalizeTime,
  toIsoDate,
} from "../event-ingest-lib.mjs";

const TITLE = 'Vaundy ASIA ARENA TOUR 2026 "HORO"';
const TITLE_RE = /Vaundy\s+ASIA\s+ARENA\s+TOUR\s+2026\s+[“"]HORO[”"]/iu;
const DATE_RE = /(20\d{2})\s+(\d{1,2})[.\/]\s*(\d{1,2})\s+(?:mon|tue|wed|thu|fri|sat|sun)/iu;
const TIME_RE = /(\d{1,2}:\d{2})\s*[／/]\s*(\d{1,2}:\d{2})/u;
const PRICE_RE = /スタンディング\s*([0-9][0-9,]*)\s*円\s*[（(]税込[）)]/u;

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
  return value.normalize("NFKC").replace(/\s+/gu, "").toLowerCase();
}

function venueFromCells(cells) {
  const joined = compact(cells.join(" "));
  if (
    joined.includes(compact("幕張メッセ 9・11ホール")) ||
    joined.includes(compact("Makuhari Messe Halls 9 & 11"))
  ) {
    return "幕張メッセ 国際展示場9-11ホール";
  }
  if (
    joined.includes(compact("北九州メッセ")) ||
    joined.includes(compact("Kitakyushu Messe"))
  ) {
    return "北九州メッセ";
  }
  return undefined;
}

function ticketTypesFrom(bodyText) {
  const match = bodyText.match(PRICE_RE);
  if (!match) return [];
  const priceJpy = Number(match[1].replaceAll(",", ""));
  if (!Number.isInteger(priceJpy) || priceJpy <= 0) return [];
  return [{ name: "スタンディング", priceJpy, taxIncluded: true, notes: [] }];
}

function parseJapanSchedule($) {
  const records = [];
  for (const row of $("table tr").toArray()) {
    const cells = $(row).find("th,td").toArray()
      .map((cell) => cleanText($(cell).text()).normalize("NFKC"))
      .filter(Boolean);
    if (cells.length < 2) continue;

    const venueName = venueFromCells(cells);
    if (!venueName) continue;
    const rowText = cleanText(cells.join(" ")).normalize("NFKC");
    const dateMatch = rowText.match(DATE_RE);
    const timeMatch = rowText.match(TIME_RE);
    if (!dateMatch || !timeMatch) continue;

    const date = toIsoDate(dateMatch[1], dateMatch[2], dateMatch[3]);
    const openTime = normalizeTime(timeMatch[1]);
    const startTime = normalizeTime(timeMatch[2]);
    if (!date || !openTime || !startTime) continue;

    records.push({
      title: TITLE,
      artistNames: ["Vaundy"],
      venueName,
      date,
      openTime,
      startTime,
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

export function parseVaundyHoro(
  html,
  sourceUrl,
  { months = [] } = {},
) {
  const $ = cheerio.load(html);
  const bodyText = cleanText($("body").text()).normalize("NFKC");
  if (!TITLE_RE.test(bodyText)) {
    return {
      ok: false,
      reason: "Vaundy official page 缺少 HORO tour 标识",
      records: [],
      tourMonths: [],
      allRecordCount: 0,
    };
  }

  const allRecords = parseJapanSchedule($);
  if (!allRecords.length) {
    return {
      ok: false,
      reason: "HORO 页面未解析到日本场明确日期/会场/开场开演记录",
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
