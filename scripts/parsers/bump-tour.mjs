import * as cheerio from "cheerio";
import {
  cleanText,
  normalizeTime,
  toIsoDate,
} from "../event-ingest-lib.mjs";

const TITLE = "BUMP OF CHICKEN TOUR 2026-2027 Ratio Clavis";
const TITLE_RE = /BUMP\s+OF\s+CHICKEN\s+TOUR\s+2026-2027\s+Ratio\s+Clavis/iu;
const SCHEDULE_RE = /(20\d{2})\/(\d{1,2})\/(\d{1,2})[（(][^）)]*[）)]\s+(.{1,120}?)\s+OPEN\s*(\d{1,2}:\d{2})\s*[／/]\s*START\s*(\d{1,2}:\d{2})/giu;
const REGION_PREFIX = /^(?:宮城|北海道|東京|兵庫|香川|広島|福岡|愛知|大阪)公演\s*/u;
const TICKET_RE = /(アリーナS指定|スタンドA指定|スタンドA着席指定|スタンドA車椅子指定|スタンドBステージサイド指定)\s*[:：]\s*([0-9][0-9,]*)円\s*[（(]税込[)）]/gu;

function normalizeVenueName(value) {
  const normalized = cleanText(value)
    .normalize("NFKC")
    .replace(REGION_PREFIX, "");
  if (normalized === "北海道立総合体育センター 北海きたえーる") {
    return "北海きたえーる";
  }
  if (normalized === "グリーンアリーナ") {
    return "広島グリーンアリーナ";
  }
  return normalized;
}

function allowedMonthKeys(months) {
  return new Set(
    months.map(({ year, month }) =>
      `${Number(year)}-${String(Number(month)).padStart(2, "0")}`,
    ),
  );
}

function ticketTypesFrom(bodyText) {
  const results = [];
  for (const match of bodyText.matchAll(TICKET_RE)) {
    const name = cleanText(match[1]);
    const priceJpy = Number(match[2].replaceAll(",", ""));
    if (!name || !Number.isInteger(priceJpy) || priceJpy <= 0) continue;
    if (results.some((item) => item.name === name)) continue;
    results.push({ name, priceJpy, taxIncluded: true, notes: [] });
  }
  return results;
}

export function parseBumpTour(html, sourceUrl, { months = [] } = {}) {
  const $ = cheerio.load(html);
  const bodyText = cleanText($("body").text()).normalize("NFKC");
  if (!TITLE_RE.test(bodyText)) {
    return {
      ok: false,
      reason: "BUMP OF CHICKEN official page 缺少 Ratio Clavis tour 标识",
      records: [],
    };
  }

  const allowed = allowedMonthKeys(months);
  if (!allowed.size) {
    return { ok: false, reason: "BUMP parser 需要明确目标月份窗口", records: [] };
  }

  const ticketTypes = ticketTypesFrom(bodyText);
  const pricesJpy = [...new Set(ticketTypes.map((item) => item.priceJpy))].sort((a, b) => a - b);
  const records = [];

  for (const match of bodyText.matchAll(SCHEDULE_RE)) {
    const date = toIsoDate(match[1], match[2], match[3]);
    if (!date || !allowed.has(date.slice(0, 7))) continue;
    const venueName = normalizeVenueName(match[4]);
    const openTime = normalizeTime(match[5]);
    const startTime = normalizeTime(match[6]);
    if (!venueName || !openTime || !startTime) continue;
    records.push({
      title: TITLE,
      artistNames: ["BUMP OF CHICKEN"],
      venueName,
      date,
      openTime,
      startTime,
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
