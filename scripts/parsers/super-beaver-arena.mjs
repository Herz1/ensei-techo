import * as cheerio from "cheerio";
import {
  cleanText,
  normalizeTime,
  toIsoDate,
} from "../event-ingest-lib.mjs";

const TITLE = "SUPER BEAVER 都会のラクダ TOUR 2026-2027 〜ラクダの人生、ゴーゴーゴー〜";
const TOUR_RE = /都会のラクダ\s+TOUR\s+(20\d{2})-(20\d{2})/iu;
const DATE_TOKEN = /(\d{2})\.(\d{2})/gu;
const DAY_PREFECTURE = /^(?:mon|tue|wed|thu|fri|sat|sun)[^\s]*\s+/iu;
const TIME_RE = /OPEN\s+(\d{1,2}:\d{2})\s*\/\s*START\s+(\d{1,2}:\d{2})/iu;
const TICKET_RE = /(指定席|着席限定席|注釈付き指定席|立見|車椅子)\s+([0-9][0-9,]*)円\(税込\)/gu;

function normalizeVenueName(value) {
  const normalized = cleanText(value).normalize("NFKC");
  if (normalized === "朱鷺メッセ 新潟コンベンションセンター") {
    return "朱鷺メッセ";
  }
  return normalized;
}

function arenaSection(bodyText) {
  const arenaIndex = bodyText.lastIndexOf("ARENA TOUR");
  if (arenaIndex < 0) return "";
  const tail = bodyText.slice(arenaIndex + "ARENA TOUR".length);
  const scheduleIndex = tail.indexOf("SCHEDULE");
  if (scheduleIndex < 0) return "";
  const scheduleTail = tail.slice(scheduleIndex + "SCHEDULE".length);
  const ticketIndex = scheduleTail.indexOf("TICKET");
  if (ticketIndex < 0) return "";
  return cleanText(scheduleTail.slice(0, ticketIndex));
}

function ticketTypesFrom(bodyText) {
  const arenaIndex = bodyText.lastIndexOf("ARENA TOUR");
  if (arenaIndex < 0) return [];
  const tail = bodyText.slice(arenaIndex);
  const ticketIndex = tail.indexOf("TICKET");
  if (ticketIndex < 0) return [];
  const ticketTail = tail.slice(ticketIndex + "TICKET".length);
  const stop = ticketTail.indexOf("枚数・年齢制限");
  const text = stop >= 0 ? ticketTail.slice(0, stop) : ticketTail;
  const results = [];
  for (const match of text.matchAll(TICKET_RE)) {
    const item = {
      name: cleanText(match[1]),
      priceJpy: Number(match[2].replaceAll(",", "")),
      taxIncluded: true,
      notes: [],
    };
    if (!results.some((candidate) => candidate.name === item.name)) {
      results.push(item);
    }
  }
  return results;
}

export function parseSuperBeaverArenaTour(html, sourceUrl, { months = [] } = {}) {
  const $ = cheerio.load(html);
  const bodyText = cleanText($("body").text()).normalize("NFKC");
  const tourMatch = bodyText.match(TOUR_RE);
  if (!tourMatch || !bodyText.includes("ARENA TOUR")) {
    return {
      ok: false,
      reason: "SUPER BEAVER official tour page 缺少目标 2026-2027 Arena Tour 标识",
      records: [],
    };
  }

  const section = arenaSection(bodyText);
  if (!section) {
    return {
      ok: false,
      reason: "SUPER BEAVER Arena Tour 缺少 SCHEDULE/TICKET 区段",
      records: [],
    };
  }

  const allowed = new Set(
    months.map(({ year, month }) =>
      `${Number(year)}-${String(Number(month)).padStart(2, "0")}`,
    ),
  );
  if (!allowed.size) {
    return { ok: false, reason: "SUPER BEAVER parser 需要明确目标月份窗口", records: [] };
  }

  const year = Number(tourMatch[2]);
  const ticketTypes = ticketTypesFrom(bodyText);
  const pricesJpy = [...new Set(ticketTypes.map((item) => item.priceJpy))].sort((a, b) => a - b);
  const matches = [...section.matchAll(DATE_TOKEN)];
  const records = [];

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const date = toIsoDate(year, match[1], match[2]);
    if (!date || !allowed.has(date.slice(0, 7))) continue;
    const segment = cleanText(section.slice(
      (match.index ?? 0) + match[0].length,
      index + 1 < matches.length ? matches[index + 1].index : section.length,
    ));
    const time = segment.match(TIME_RE);
    if (!time) continue;
    const venuePart = cleanText(segment.slice(0, time.index)).replace(DAY_PREFECTURE, "");
    const venueName = normalizeVenueName(venuePart);
    if (!venueName) continue;
    records.push({
      title: TITLE,
      artistNames: ["SUPER BEAVER"],
      venueName,
      date,
      openTime: normalizeTime(time[1]),
      startTime: normalizeTime(time[2]),
      ticketTypes,
      pricesJpy,
    });
  }

  return {
    ok: true,
    records: records.filter(
      (record, index, all) =>
        all.findIndex((candidate) =>
          candidate.date === record.date && candidate.venueName === record.venueName,
        ) === index,
    ),
  };
}
