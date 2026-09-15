import * as cheerio from "cheerio";
import { cleanText, normalizeTime, toIsoDate } from "../event-ingest-lib.mjs";

const TITLE = "M!LK ARENA TOUR 2026-2027「シャカリキレボリューション」";
const TITLE_RE = /M!LK\s+ARENA\s+TOUR\s+2026-2027\s*[「"]?シャカリキレボリューション[」"]?/iu;
const DATE_RE = /(20\d{2})(?:年|\s+|[.\/])(\d{1,2})(?:月|[.\/])(\d{1,2})(?:日)?[（(][^）)]*[）)]/gu;
const OPEN_START_RE = /OPEN\s*(\d{1,2}:\d{2})\s*(?:\/|／)?\s*START\s*(\d{1,2}:\d{2})/giu;

const VENUES = [
  ["マリンメッセ福岡B館", "マリンメッセ福岡B館"],
  ["ゼビオアリーナ仙台", "ゼビオアリーナ仙台"],
  ["ぴあアリーナMM", "ぴあアリーナMM"],
  ["Aichi Sky Expo(愛知県国際展示場) ホールA", "Aichi Sky Expo(愛知県国際展示場) ホールA"],
  ["大阪城ホール", "大阪城ホール"],
  ["横浜アリーナ", "横浜アリーナ"],
];

function monthKey(date) {
  return date.slice(0, 7);
}

function allowedMonthKeys(months) {
  return new Set(months.map(({ year, month }) =>
    `${Number(year)}-${String(Number(month)).padStart(2, "0")}`,
  ));
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
  return section(bodyText, /\bTICKET\b/iu, /(?:\bGOODS\b|\bMAP\b|\bFANCLUB\b)/iu);
}

function venueMarkers(schedule) {
  const text = compact(schedule);
  const markers = [];
  for (const [marker, venueName] of VENUES) {
    const compactMarker = compact(marker);
    const index = text.indexOf(compactMarker);
    if (index >= 0) markers.push({ index, length: compactMarker.length, venueName });
  }
  return {
    text,
    markers: markers.sort((a, b) => a.index - b.index),
  };
}

function parseSchedule(bodyText) {
  const { text, markers } = venueMarkers(scheduleText(bodyText));
  const records = [];

  for (let markerIndex = 0; markerIndex < markers.length; markerIndex += 1) {
    const marker = markers[markerIndex];
    const previous = markerIndex > 0 ? markers[markerIndex - 1] : null;
    const segmentStart = previous ? previous.index + previous.length : 0;
    const segment = text.slice(segmentStart, marker.index);
    const dateMatches = [...segment.matchAll(DATE_RE)];

    for (let dateIndex = 0; dateIndex < dateMatches.length; dateIndex += 1) {
      const dateMatch = dateMatches[dateIndex];
      const date = toIsoDate(dateMatch[1], dateMatch[2], dateMatch[3]);
      if (!date) continue;
      const timeStart = (dateMatch.index ?? 0) + dateMatch[0].length;
      const timeEnd = dateIndex + 1 < dateMatches.length
        ? dateMatches[dateIndex + 1].index
        : segment.length;
      const timeSegment = segment.slice(timeStart, timeEnd);
      const pairs = [...timeSegment.matchAll(OPEN_START_RE)];

      for (const pair of pairs) {
        const openTime = normalizeTime(pair[1]);
        const startTime = normalizeTime(pair[2]);
        if (!openTime || !startTime) continue;
        records.push({
          title: TITLE,
          artistNames: ["M!LK"],
          venueName: marker.venueName,
          date,
          openTime,
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

function parsePrice(text, seatName) {
  const escaped = seatName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = text.match(new RegExp(`${escaped}\\s*[|｜]?\\s*([0-9][0-9,]*)\\s*円`, "iu"));
  if (!match) return undefined;
  const value = Number(match[1].replaceAll(",", ""));
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function ticketTypesFrom(bodyText) {
  const tickets = ticketText(bodyText);
  const names = ["指定席", "ファミリー席", "着席指定席"];
  return names.flatMap((name) => {
    const priceJpy = parsePrice(tickets, name);
    return priceJpy
      ? [{ name, priceJpy, taxIncluded: true, notes: [] }]
      : [];
  });
}

function pageLooksCorrect(bodyText) {
  if (TITLE_RE.test(bodyText)) return true;
  const schedule = scheduleText(bodyText);
  return /マリンメッセ福岡B館/u.test(schedule) &&
    /横浜アリーナ/u.test(schedule) &&
    /\bTICKET\b/iu.test(bodyText);
}

export function parseMilkShakariki(
  html,
  sourceUrl,
  { months = [] } = {},
) {
  const $ = cheerio.load(html);
  const bodyText = cleanText($("body").text()).normalize("NFKC");
  if (!pageLooksCorrect(bodyText)) {
    return {
      ok: false,
      reason: "M!LK official page 缺少 Shakariki tour 标识或关键 schedule markers",
      records: [],
      tourMonths: [],
      allRecordCount: 0,
    };
  }

  const allRecords = parseSchedule(bodyText);
  if (!allRecords.length) {
    return {
      ok: false,
      reason: "Shakariki 页面未解析到明确日期/OPEN/START/会场记录",
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
