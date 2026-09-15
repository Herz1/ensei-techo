import * as cheerio from "cheerio";
import { cleanText, normalizeTime, toIsoDate } from "../event-ingest-lib.mjs";

const TITLE = "ROCK FOR YOU LIVE TOUR";
const TITLE_RE = /ROCK\s+FOR\s+YOU\s+LIVE\s+TOUR/iu;
const DATE_RE = /(20\d{2})[.\/](\d{1,2})[.\/](\d{1,2})[（(][^）)]*[）)]/gu;
const TIME_RE = /\d{1,2}:\d{2}/gu;
const STANDARD_GROUP_RE = /大阪・愛知・福岡・東京・宮城・北海道公演/iu;
const STANDARD_DRINK_RE = /(?:別途)?ドリンク代(?:必要)?[（(]?\s*600\s*円[）)]?/iu;
const NO_DRINK_RE = /追加\s*東京公演[\s\S]{0,120}?ドリンク代なし/iu;

const TARGET_VENUES = [
  ["Zepp Haneda（TOKYO）", "Zepp Haneda(TOKYO)"],
  ["SENDAI GIGS", "SENDAI GIGS"],
  ["Zepp Sapporo", "Zepp Sapporo"],
  ["東京ガーデンシアター", "東京ガーデンシアター"],
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

function section(text, startPattern, endPattern) {
  const start = text.search(startPattern);
  if (start < 0) return "";
  const tail = text.slice(start);
  const relativeEnd = tail.search(endPattern);
  return relativeEnd > 0 ? tail.slice(0, relativeEnd) : tail;
}

function scheduleText(bodyText) {
  return section(bodyText, /\bSCHEDULE\b/iu, /\bTICKET\b/iu);
}

function ticketText(bodyText) {
  return section(bodyText, /\bTICKET\b/iu, /\bGOODS\b/iu);
}

function venueBlocks(schedule) {
  const text = compact(schedule);
  const markers = [];
  for (const [marker, venueName] of TARGET_VENUES) {
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
      if (!date || date < "2026-09-20") continue;
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
          artistNames: ["横山裕"],
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

function priceAfterGroup(block) {
  const group = block.match(STANDARD_GROUP_RE);
  if (!group || group.index === undefined) return undefined;
  const tail = block.slice(group.index + group[0].length, group.index + group[0].length + 120);
  const match = tail.match(/([0-9][0-9,]*)\s*円/iu);
  if (!match) return undefined;
  const value = Number(match[1].replaceAll(",", ""));
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function ticketFacts(bodyText) {
  const tickets = ticketText(bodyText);
  const memberBlock = section(
    tickets,
    /ファミリークラブ会員チケット/iu,
    /一般チケット(?:\s*[（(]プレイガイド[）)])?/iu,
  );
  const generalBlock = section(
    tickets,
    /一般チケット(?:\s*[（(]プレイガイド[）)])?/iu,
    /(?:発売中|GOODS)/iu,
  );
  const memberPrice = priceAfterGroup(memberBlock);
  const generalPrice = priceAfterGroup(generalBlock);
  const standardDrinkPublished = STANDARD_DRINK_RE.test(memberBlock) || STANDARD_DRINK_RE.test(generalBlock);
  const additionalTokyoNoDrink = NO_DRINK_RE.test(tickets);
  return {
    memberPrice,
    generalPrice,
    standardDrinkPublished,
    additionalTokyoNoDrink,
  };
}

function eventTicketFacts(facts, venueName) {
  const ticketTypes = [
    ...(facts.memberPrice ? [{
      name: "ファミリークラブ会員チケット",
      priceJpy: facts.memberPrice,
      taxIncluded: true,
      notes: [],
    }] : []),
    ...(facts.generalPrice ? [{
      name: "一般チケット",
      priceJpy: facts.generalPrice,
      taxIncluded: true,
      notes: [],
    }] : []),
  ];
  const isAdditionalTokyo = venueName === "東京ガーデンシアター";
  const additionalFeesPublished = isAdditionalTokyo
    ? facts.additionalTokyoNoDrink
    : facts.standardDrinkPublished;
  const additionalFees = isAdditionalTokyo
    ? []
    : facts.standardDrinkPublished
      ? [{ type: "drink", label: "ドリンク代", amountJpy: 600, required: true }]
      : [];
  return {
    ticketTypes,
    pricesJpy: [...new Set(ticketTypes.map((item) => item.priceJpy))].sort((a, b) => a - b),
    additionalFees,
    additionalFeesPublished,
  };
}

export function parseRockForYou(
  html,
  sourceUrl,
  { months = [] } = {},
) {
  const $ = cheerio.load(html);
  const bodyText = cleanText($("body").text()).normalize("NFKC");
  if (!TITLE_RE.test(bodyText)) {
    return {
      ok: false,
      reason: "横山裕 official page 缺少 ROCK FOR YOU LIVE TOUR 标识",
      records: [],
      tourMonths: [],
      allRecordCount: 0,
    };
  }

  const allRecords = parseSchedule(bodyText);
  if (!allRecords.length) {
    return {
      ok: false,
      reason: "ROCK FOR YOU 页面未解析到目标剩余段明确日程",
      records: [],
      tourMonths: [],
      allRecordCount: 0,
    };
  }

  const facts = ticketFacts(bodyText);
  const allowed = allowedMonthKeys(months);
  const tourMonths = [...new Set(allRecords.map((record) => monthKey(record.date)))].sort();
  const records = allRecords
    .filter((record) => allowed.has(monthKey(record.date)))
    .map((record) => ({
      ...record,
      openTime: undefined,
      ...eventTicketFacts(facts, record.venueName),
    }));

  return {
    ok: true,
    records,
    tourMonths,
    allRecordCount: allRecords.length,
  };
}
