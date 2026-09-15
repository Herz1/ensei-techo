import * as cheerio from "cheerio";
import { cleanText, normalizeTime, toIsoDate } from "../event-ingest-lib.mjs";

const TITLE = "A.B.C-Z Concert Tour 2026 The Way of L.O.V-E";
const TITLE_RE = /A\.B\.C-Z\s+(?:Concert|LIVE)\s+Tour\s+2026\s+The\s+Way\s+of\s+L\.O\.V-E/iu;
const DATE_RE = /(20\d{2})[.\/](\d{1,2})[.\/](\d{1,2})[（(][^）)]*[）)]/gu;
const TIME_RE = /\d{1,2}:\d{2}/gu;
const MEMBER_PRICE_RE = /(?:ファミリークラブ会員チケット|Family\s+Club\s+Member\s+Ticket)\s*([0-9][0-9,]*)\s*(?:円|yen)\s*[（(](?:税込|tax\s+included)[）)]/iu;

const VENUES = [
  ["オリックス劇場", "オリックス劇場"],
  ["刈谷市総合文化センター 大ホール", "刈谷市総合文化センター 大ホール"],
  ["東京ガーデンシアター", "東京ガーデンシアター"],
  ["福岡サンパレス", "福岡サンパレス"],
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

function scheduleText(bodyText) {
  const scheduleIndex = bodyText.search(/\bSCHEDULE\b/iu);
  const ticketIndex = bodyText.search(/\bTICKET\b/iu);
  if (scheduleIndex < 0) return "";
  return bodyText.slice(
    scheduleIndex,
    ticketIndex > scheduleIndex ? ticketIndex : bodyText.length,
  );
}

function venueBlocks(schedule) {
  const text = compact(schedule);
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
  const schedule = scheduleText(bodyText);
  const records = [];

  for (const block of venueBlocks(schedule)) {
    const dateMatches = [...block.segment.matchAll(DATE_RE)];
    for (let index = 0; index < dateMatches.length; index += 1) {
      const dateMatch = dateMatches[index];
      const date = toIsoDate(dateMatch[1], dateMatch[2], dateMatch[3]);
      if (!date) continue;

      const segmentStart = (dateMatch.index ?? 0) + dateMatch[0].length;
      const segmentEnd = index + 1 < dateMatches.length
        ? dateMatches[index + 1].index
        : block.segment.length;
      const timeSegment = block.segment.slice(segmentStart, segmentEnd);
      const times = [...new Set(
        [...timeSegment.matchAll(TIME_RE)]
          .map((match) => normalizeTime(match[0]))
          .filter(Boolean),
      )];

      for (const startTime of times) {
        records.push({
          title: TITLE,
          artistNames: ["A.B.C-Z"],
          venueName: block.venueName,
          date,
          startTime,
        });
      }
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

export function parseAbczLove(
  html,
  sourceUrl,
  { months = [] } = {},
) {
  const $ = cheerio.load(html);
  const bodyText = cleanText($("body").text()).normalize("NFKC");
  if (!TITLE_RE.test(bodyText)) {
    return {
      ok: false,
      reason: "A.B.C-Z official page 缺少 The Way of L.O.V-E tour 标识",
      records: [],
      tourMonths: [],
      allRecordCount: 0,
    };
  }

  const allRecords = parseSchedule(bodyText);
  if (!allRecords.length) {
    return {
      ok: false,
      reason: "The Way of L.O.V-E 页面未解析到明确日期/会场/开演时间记录",
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
