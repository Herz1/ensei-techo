import * as cheerio from "cheerio";
import {
  cleanText,
  normalizeTime,
  toIsoDate,
} from "../event-ingest-lib.mjs";

const TITLE = "GENERATIONS LIVE TOUR 2026 “PARALLEL QUEST”";
const TITLE_RE = /GENERATIONS\s+LIVE\s+TOUR\s+2026\s+[“\"]PARALLEL\s+QUEST[”\"]/iu;
const DATE_RE = /(?:(20\d{2})[.\/-])?(\d{1,2})\/(\d{1,2})[（(][^）)]*[）)]/gu;
const TIME_RE = /(?:開場|OPEN)\s*(\d{1,2}:\d{2})\s*[／/]\s*(?:開演|START)\s*(\d{1,2}:\d{2})/iu;

const AREA_PREFIX = /^(?:北海道|青森|岩手|宮城|秋田|山形|福島|茨城|栃木|群馬|埼玉|千葉|東京|神奈川|新潟|富山|石川|福井|山梨|長野|岐阜|静岡|愛知|三重|滋賀|京都|大阪|兵庫|奈良|和歌山|鳥取|島根|岡山|広島|山口|徳島|香川|愛媛|高知|福岡|佐賀|長崎|熊本|大分|宮崎|鹿児島|沖縄)\s+/u;

function normalizeVenueName(value) {
  const normalized = cleanText(value)
    .normalize("NFKC")
    .replace(AREA_PREFIX, "")
    .replace(/^マリンメッセ福岡\s+A館$/u, "マリンメッセ福岡A館")
    .replace(/^北海道立総合体育センター\s+北海きたえーる$/u, "北海きたえーる");
  if (normalized === "グリーンアリーナ") return "広島グリーンアリーナ";
  return normalized;
}

function allowedMonthKeys(months) {
  return new Set(
    months.map(({ year, month }) =>
      `${Number(year)}-${String(Number(month)).padStart(2, "0")}`,
    ),
  );
}

function monthKey(date) {
  return date.slice(0, 7);
}

function parseAllRecords(bodyText) {
  const matches = [...bodyText.matchAll(DATE_RE)];
  const records = [];
  let currentYear = 2026;

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    if (match[1]) currentYear = Number(match[1]);
    const date = toIsoDate(currentYear, match[2], match[3]);
    if (!date) continue;

    const segment = cleanText(bodyText.slice(
      (match.index ?? 0) + match[0].length,
      index + 1 < matches.length ? matches[index + 1].index : bodyText.length,
    )).normalize("NFKC");
    const time = segment.match(TIME_RE);
    if (!time || time.index === undefined) continue;

    const venuePart = cleanText(segment.slice(0, time.index));
    const venueName = normalizeVenueName(venuePart);
    const openTime = normalizeTime(time[1]);
    const startTime = normalizeTime(time[2]);
    if (!venueName || !openTime || !startTime) continue;
    if (venueName.length > 100) continue;

    records.push({
      title: TITLE,
      artistNames: ["GENERATIONS"],
      venueName,
      date,
      openTime,
      startTime,
    });
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

export function parseGenerationsParallelQuest(
  html,
  sourceUrl,
  { months = [] } = {},
) {
  const $ = cheerio.load(html);
  const bodyText = cleanText($("body").text()).normalize("NFKC");
  if (!TITLE_RE.test(bodyText)) {
    return {
      ok: false,
      reason: "GENERATIONS official page 缺少 PARALLEL QUEST tour 标识",
      records: [],
      tourMonths: [],
    };
  }

  const allRecords = parseAllRecords(bodyText);
  if (!allRecords.length) {
    return {
      ok: false,
      reason: "PARALLEL QUEST 页面未解析到明确日期/会场/开场开演记录",
      records: [],
      tourMonths: [],
    };
  }

  const allowed = allowedMonthKeys(months);
  const tourMonths = [...new Set(allRecords.map((record) => monthKey(record.date)))].sort();
  const records = allRecords.filter((record) => allowed.has(monthKey(record.date)));

  return {
    ok: true,
    records,
    tourMonths,
    allRecordCount: allRecords.length,
  };
}
