import * as cheerio from "cheerio";
import { cleanText, normalizeTime, toIsoDate } from "../event-ingest-lib.mjs";

const TITLE = "TAKUYA KIMURA Live Tour 2026 Checkpoint";
const TITLE_RE = /TAKUYA\s+KIMURA\s+Live\s+Tour\s+2026\s+Checkpoint/iu;
const DATE_RE = /(20\d{2})[.\/](\d{1,2})[.\/](\d{1,2})[（(][^）)]*[）)]/gu;
const TIME_RE = /\d{1,2}:\d{2}/gu;
const MEMBER_PRICE_RE = /(?:ファミリークラブ会員チケット|Family\s+Club\s+Member\s+Ticket)\s*([0-9][0-9,]*)\s*(?:円|yen)\s*[（(](?:税込|tax\s+included)[）)]/iu;
const GENERAL_PRICE_RE = /(?:一般チケット(?:\s*[（(]プレイガイド[）)])?|General\s+tickets?(?:\s*[（(]ticket\s+agency[）)])?)\s*([0-9][0-9,]*)\s*(?:円|yen)\s*[（(](?:税込|tax\s+included)[）)]/iu;

const VENUE_MARKERS = [
  ["GLION ARENA KOBE", "GLION ARENA KOBE", true],
  ["INSPIRE ARENA", undefined, false],
  ["マリンメッセ福岡A館", "マリンメッセ福岡A館", true],
  ["Taipei Music Center", undefined, false],
  ["ららアリーナ 東京ベイ", "ららアリーナ 東京ベイ", true],
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

function ticketText(bodyText) {
  const ticketIndex = bodyText.search(/\bTICKET\b/iu);
  const goodsIndex = bodyText.search(/\bGOODS\b/iu);
  if (ticketIndex < 0) return "";
  return bodyText.slice(
    ticketIndex,
    goodsIndex > ticketIndex ? goodsIndex : bodyText.length,
  );
}

function venueBlocks(schedule) {
  const text = compact(schedule);
  const markers = [];

  for (const [marker, venueName, isJapan] of VENUE_MARKERS) {
    const compactMarker = compact(marker);
    let offset = 0;
    while (offset < text.length) {
      const index = text.indexOf(compactMarker, offset);
      if (index < 0) break;
      markers.push({ index, length: compactMarker.length, venueName, isJapan });
      offset = index + compactMarker.length;
    }
  }

  markers.sort((a, b) => a.index - b.index || b.length - a.length);
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
    if (!block.isJapan || !block.venueName) continue;
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
          artistNames: ["木村拓哉"],
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

function parsePrice(text, pattern) {
  const match = text.match(pattern);
  if (!match) return undefined;
  const price = Number(match[1].replaceAll(",", ""));
  return Number.isInteger(price) && price > 0 ? price : undefined;
}

function ticketTypesForVenue(bodyText, venueName) {
  const tickets = ticketText(bodyText);
  const member = parsePrice(tickets, MEMBER_PRICE_RE);
  const general = parsePrice(tickets, GENERAL_PRICE_RE);
  const fukuokaGeneralPublished = /福岡公演|Fukuoka\s+Performance/iu.test(tickets);
  return [
    ...(member ? [{ name: "ファミリークラブ会員チケット", priceJpy: member, taxIncluded: true, notes: [] }] : []),
    ...(venueName === "マリンメッセ福岡A館" && general && fukuokaGeneralPublished
      ? [{ name: "一般チケット", priceJpy: general, taxIncluded: true, notes: ["福岡公演"] }]
      : []),
  ];
}

export function parseTakuyaCheckpoint(
  html,
  sourceUrl,
  { months = [] } = {},
) {
  const $ = cheerio.load(html);
  const bodyText = cleanText($("body").text()).normalize("NFKC");
  if (!TITLE_RE.test(bodyText)) {
    return {
      ok: false,
      reason: "木村拓哉 official page 缺少 Checkpoint tour 标识",
      records: [],
      tourMonths: [],
      allRecordCount: 0,
    };
  }

  const allRecords = parseSchedule(bodyText);
  if (!allRecords.length) {
    return {
      ok: false,
      reason: "Checkpoint 页面未解析到日本公演的明确日期/会场/开演时间记录",
      records: [],
      tourMonths: [],
      allRecordCount: 0,
    };
  }

  const allowed = allowedMonthKeys(months);
  const tourMonths = [...new Set(allRecords.map((record) => monthKey(record.date)))].sort();
  const records = allRecords
    .filter((record) => allowed.has(monthKey(record.date)))
    .map((record) => {
      const ticketTypes = ticketTypesForVenue(bodyText, record.venueName);
      return {
        ...record,
        openTime: undefined,
        ticketTypes,
        pricesJpy: [...new Set(ticketTypes.map((item) => item.priceJpy))].sort((a, b) => a - b),
      };
    });

  return {
    ok: true,
    records,
    tourMonths,
    allRecordCount: allRecords.length,
  };
}
