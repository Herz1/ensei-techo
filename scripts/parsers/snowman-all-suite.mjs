import * as cheerio from "cheerio";
import { cleanText, normalizeTime, toIsoDate } from "../event-ingest-lib.mjs";

const TITLE = "Snow Man DOME TOUR 2026-2027 ALL SUITE";
const TITLE_RE = /Snow\s+Man\s+DOME\s+TOUR\s+2026-2027\s+ALL\s+SUITE/iu;
const DATE_START_RE = /(20\d{2})[.\/](\d{1,2})[.\/](\d{1,2})[（(][^）)]*[）)](\d{1,2}:\d{2})(?![-–―〜~])/gu;
const MEMBER_PRICE_RE = /(?:ファミリークラブ会員チケット|Family\s+Club\s+Member\s+Ticket)\s*([0-9][0-9,]*)\s*(?:円|yen)\s*[（(](?:税込|tax\s+included)[）)]/iu;

const VENUES = [
  ["大和ハウス プレミストドーム", "札幌ドーム"],
  ["バンテリンドーム ナゴヤ", "バンテリンドーム ナゴヤ"],
  ["みずほPayPayドーム福岡", "みずほPayPayドーム福岡"],
  ["東京ドーム", "東京ドーム"],
  ["京セラドーム大阪", "京セラドーム大阪"],
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
  const markers = VENUES.flatMap(([marker, venueName]) => {
    const compactMarker = compact(marker);
    const index = text.indexOf(compactMarker);
    return index < 0 ? [] : [{ index, length: compactMarker.length, venueName }];
  }).sort((a, b) => a.index - b.index);

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
        artistNames: ["Snow Man"],
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

function ticketTypesFrom(bodyText) {
  const match = bodyText.match(MEMBER_PRICE_RE);
  if (!match) return [];
  const priceJpy = Number(match[1].replaceAll(",", ""));
  if (!Number.isInteger(priceJpy) || priceJpy <= 0) return [];
  return [{
    name: "ファミリークラブ会員チケット",
    priceJpy,
    taxIncluded: true,
    notes: [],
  }];
}

export function parseSnowManAllSuite(
  html,
  sourceUrl,
  { months = [] } = {},
) {
  const $ = cheerio.load(html);
  const bodyText = cleanText($("body").text()).normalize("NFKC");
  if (!TITLE_RE.test(bodyText)) {
    return {
      ok: false,
      reason: "Snow Man official page 缺少 ALL SUITE tour 标识",
      records: [],
      tourMonths: [],
      allRecordCount: 0,
    };
  }

  const allRecords = parseSchedule(bodyText);
  if (!allRecords.length) {
    return {
      ok: false,
      reason: "ALL SUITE 页面未解析到明确日期/会场/开演时间记录",
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
