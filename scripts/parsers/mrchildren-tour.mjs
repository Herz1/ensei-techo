import * as cheerio from "cheerio";
import {
  cleanText,
  normalizeTime,
  toIsoDate,
} from "../event-ingest-lib.mjs";

const TITLE = "Mr.Children Tour 2026 “Saturday in the park”";
const TITLE_RE = /Mr\.Children\s+Tour\s+2026\s+[“\"]Saturday in the park[”\"]/iu;
const SCHEDULE_RE = /(20\d{2})\.(\d{1,2})\.(\d{1,2})\s+(?:mon|tue|wed|thu|fri|sat|sun)\s+(.{1,120}?)\s+開場\s*(\d{1,2}:\d{2})\s*[／/]\s*開演\s*(\d{1,2}:\d{2})/giu;
const AREA_PREFIX = /^(?:千葉|神奈川|愛知|宮城|福岡|大阪|香川|北海道|福井|静岡|東京|佐賀|広島)\s+/u;
const CANCELLED = new Set([
  "2026-05-30|大阪城ホール",
  "2026-05-31|大阪城ホール",
]);
const STANDING_VENUES = new Set([
  "横浜アリーナ",
  "日本ガイシホール",
  "宮城セキスイハイムスーパーアリーナ",
  "マリンメッセ福岡A館",
  "大阪城ホール",
  "あなぶきアリーナ香川",
  "ぴあアリーナMM",
  "北海きたえーる",
  "サンドーム福井",
  "SAGAアリーナ",
]);

function normalizeVenueName(value) {
  const normalized = cleanText(value)
    .normalize("NFKC")
    .replace(AREA_PREFIX, "")
    .replace(/^マリンメッセ福岡\s+A館$/u, "マリンメッセ福岡A館");
  if (normalized === "北海道立総合体育センター 北海きたえーる") {
    return "北海きたえーる";
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

function priceFor(bodyText, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = bodyText.match(new RegExp(`${escaped}\\s*[¥￥]?\\s*([0-9][0-9,]*)`, "u"));
  if (!match) return undefined;
  const price = Number(match[1].replaceAll(",", ""));
  return Number.isInteger(price) && price > 0 ? price : undefined;
}

function ticketTypesFor(bodyText, venueName) {
  const results = [];
  for (const name of ["指定席", "注釈付指定席"]) {
    const priceJpy = priceFor(bodyText, name);
    if (priceJpy) results.push({ name, priceJpy, taxIncluded: true, notes: [] });
  }
  if (STANDING_VENUES.has(venueName)) {
    const priceJpy = priceFor(bodyText, "後方立見");
    if (priceJpy) results.push({ name: "後方立見", priceJpy, taxIncluded: true, notes: [] });
  }
  return results;
}

export function parseMrChildrenTour(html, sourceUrl, { months = [] } = {}) {
  const $ = cheerio.load(html);
  const bodyText = cleanText($("body").text()).normalize("NFKC");
  if (!TITLE_RE.test(bodyText)) {
    return {
      ok: false,
      reason: "Mr.Children official tour page 缺少目标 2026 tour 标识",
      records: [],
    };
  }

  const allowed = allowedMonthKeys(months);
  if (!allowed.size) {
    return { ok: false, reason: "Mr.Children parser 需要明确目标月份窗口", records: [] };
  }

  const records = [];
  for (const match of bodyText.matchAll(SCHEDULE_RE)) {
    const date = toIsoDate(match[1], match[2], match[3]);
    if (!date || !allowed.has(date.slice(0, 7))) continue;
    const venueName = normalizeVenueName(match[4]);
    if (!venueName || CANCELLED.has(`${date}|${venueName}`)) continue;
    const openTime = normalizeTime(match[5]);
    const startTime = normalizeTime(match[6]);
    if (!openTime || !startTime) continue;
    const ticketTypes = ticketTypesFor(bodyText, venueName);
    records.push({
      title: TITLE,
      artistNames: ["Mr.Children"],
      venueName,
      date,
      openTime,
      startTime,
      ticketTypes,
      pricesJpy: [...new Set(ticketTypes.map((item) => item.priceJpy))].sort((a, b) => a - b),
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
