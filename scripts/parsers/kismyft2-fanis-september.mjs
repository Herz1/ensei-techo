import * as cheerio from "cheerio";
import { cleanText, normalizeTime, toIsoDate } from "../event-ingest-lib.mjs";

const TITLE = "Kis-My-Ft2 LIVE TOUR 2026 fan IS・・・・・・";
const TITLE_RE = /Kis-My-Ft2\s+LIVE\s+TOUR\s+2026\s+fan\s+IS\s*・{3,}/iu;
const DATE_RE = /(20\d{2})[.\/](\d{1,2})[.\/](\d{1,2})[（(][^）)]*[）)]/gu;
const TIME_RE = /\d{1,2}:\d{2}/gu;
const MEMBER_PRICE_RE = /(?:ファミリークラブ会員チケット|Family\s+Club\s+Member\s+Ticket)\s*([0-9][0-9,]*)\s*(?:円|yen)\s*[（(](?:税込|tax\s+included)[）)]/iu;
const GENERAL_PRICE_RE = /(?:一般チケット(?:\s*[（(]プレイガイド[）)])?|General\s+tickets?(?:\s*[（(]ticket\s+agency[）)])?)\s*([0-9][0-9,]*)\s*(?:円|yen)\s*[（(](?:税込|tax\s+included)[）)]/iu;

const SEPTEMBER_VENUES = [
  ["ららアリーナ 東京ベイ", "ららアリーナ 東京ベイ"],
  ["広島グリーンアリーナ", "広島グリーンアリーナ"],
  ["朱鷺メッセ 新潟コンベンションセンター", "朱鷺メッセ"],
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
  const markers = [];
  for (const [marker, venueName] of SEPTEMBER_VENUES) {
    const compactMarker = compact(marker);
    const index = text.indexOf(compactMarker);
    if (index >= 0) markers.push({ index, length: compactMarker.length, venueName });
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
  for (const block of venueBlocks(scheduleText(bodyText))) {
    const dateMatches = [...block.segment.matchAll(DATE_RE)];
    for (let index = 0; index < dateMatches.length; index += 1) {
      const dateMatch = dateMatches[index];
      const date = toIsoDate(dateMatch[1], dateMatch[2], dateMatch[3]);
      if (!date || !date.startsWith("2026-09-")) continue;
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
          artistNames: ["Kis-My-Ft2"],
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

function parsePrice(bodyText, pattern) {
  const match = bodyText.match(pattern);
  if (!match) return undefined;
  const value = Number(match[1].replaceAll(",", ""));
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function ticketTypesFrom(bodyText) {
  const member = parsePrice(bodyText, MEMBER_PRICE_RE);
  const general = parsePrice(bodyText, GENERAL_PRICE_RE);
  return [
    ...(member ? [{ name: "ファミリークラブ会員チケット", priceJpy: member, taxIncluded: true, notes: [] }] : []),
    ...(general ? [{ name: "一般チケット", priceJpy: general, taxIncluded: true, notes: [] }] : []),
  ];
}

export function parseKismyft2FanisSeptember(
  html,
  sourceUrl,
  { months = [] } = {},
) {
  const $ = cheerio.load(html);
  const bodyText = cleanText($("body").text()).normalize("NFKC");
  if (!TITLE_RE.test(bodyText)) {
    return {
      ok: false,
      reason: "Kis-My-Ft2 official page 缺少 fan IS tour 标识",
      records: [],
      tourMonths: [],
      allRecordCount: 0,
    };
  }

  const allRecords = parseSchedule(bodyText);
  if (!allRecords.length) {
    return {
      ok: false,
      reason: "fan IS 页面未解析到 2026-09 日本最终段日程",
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
