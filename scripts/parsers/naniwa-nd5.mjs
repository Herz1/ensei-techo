import * as cheerio from "cheerio";
import { cleanText, normalizeTime, toIsoDate } from "../event-ingest-lib.mjs";

const TITLE = "なにわ男子 LIVE TOUR 2026 「ND⁵」";
const TITLE_RE = /なにわ男子\s+LIVE\s+TOUR\s+2026\s*[「"]?ND5[」"]?/iu;
const DATE_RE = /(20\d{2})[.\/](\d{1,2})[.\/](\d{1,2})[（(][^）)]*[）)]/gu;
const TIME_RE = /\d{1,2}:\d{2}/gu;
const MEMBER_PRICE_RE = /(?:ファミリークラブ会員チケット|Family\s+Club\s+Member\s+Ticket)\s*([0-9][0-9,]*)\s*(?:円|yen)\s*[（(](?:税込|tax\s+included)[）)]/iu;
const GENERAL_PRICE_RE = /(?:一般チケット(?:\s*[（(]プレイガイド[）)])?|General\s+tickets?(?:\s*[（(]ticket\s+agency[）)])?)\s*([0-9][0-9,]*)\s*(?:円|yen)\s*[（(](?:税込|tax\s+included)[）)]/iu;

const VENUES = [
  ["北海道立総合体育センター（北海きたえーる）", "北海きたえーる"],
  ["マリンメッセ福岡A館", "マリンメッセ福岡A館"],
  ["大阪城ホール", "大阪城ホール"],
  ["横浜アリーナ", "横浜アリーナ"],
  ["セキスイハイムスーパーアリーナ", "宮城セキスイハイムスーパーアリーナ"],
  ["朱鷺メッセ 新潟コンベンションセンター", "朱鷺メッセ"],
  ["あなぶきアリーナ香川", "あなぶきアリーナ香川"],
  ["エコパアリーナ", "静岡エコパアリーナ"],
  ["ららアリーナ 東京ベイ", "ららアリーナ 東京ベイ"],
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

  for (const [marker, venueName] of VENUES) {
    const compactMarker = compact(marker);
    let offset = 0;
    while (offset < text.length) {
      const index = text.indexOf(compactMarker, offset);
      if (index < 0) break;
      markers.push({ index, length: compactMarker.length, venueName });
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
          artistNames: ["なにわ男子"],
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

export function parseNaniwaNd5(
  html,
  sourceUrl,
  { months = [] } = {},
) {
  const $ = cheerio.load(html);
  const bodyText = cleanText($("body").text()).normalize("NFKC");
  if (!TITLE_RE.test(bodyText)) {
    return {
      ok: false,
      reason: "なにわ男子 official page 缺少 ND5 tour 标识",
      records: [],
      tourMonths: [],
      allRecordCount: 0,
    };
  }

  const allRecords = parseSchedule(bodyText);
  if (!allRecords.length) {
    return {
      ok: false,
      reason: "ND5 页面未解析到明确日期/会场/开演时间记录",
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
