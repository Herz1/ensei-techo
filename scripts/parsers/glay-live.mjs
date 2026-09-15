import * as cheerio from "cheerio";
import {
  cleanText,
  normalizeTime,
  toIsoDate,
} from "../event-ingest-lib.mjs";

const TOUR_TITLE = "GLAY ARENA TOUR 2026-2027 “EXOFIRE”";
const TOUR_TITLE_RE = /GLAY\s+ARENA\s+TOUR\s+(20\d{2})-(20\d{2})\s+[“\"]EXOFIRE[”\"]/iu;
const DATE_RE = /(?:(20\d{2})\.)?(\d{1,2})\.(\d{1,2})[（(][^）)]*[）)]/u;
const TIME_RE = /(\d{1,2}:\d{2})\s*\/\s*(\d{1,2}:\d{2})/u;

function allowedMonthKeys(months) {
  return new Set(
    months.map(({ year, month }) =>
      `${Number(year)}-${String(Number(month)).padStart(2, "0")}`,
    ),
  );
}

function normalizeUrl(value, base) {
  try {
    return new URL(value, base).href;
  } catch {
    return undefined;
  }
}

function normalizeVenueName(value) {
  const normalized = cleanText(value)
    .replace(/^(?:宮城|東京|新潟|北海道|兵庫|神奈川)・/u, "")
    .replace(/^マリンメッセ福岡\s+A館$/u, "マリンメッセ福岡A館");
  if (normalized === "函館サーモン・まるなまアリーナ(函館アリーナ)") {
    return "函館サーモン・まるなまアリーナ（函館アリーナ）";
  }
  return normalized;
}

function tourTable($) {
  return $("table").toArray().find((table) => {
    const text = cleanText($(table).text());
    return (
      text.includes("日程") &&
      text.includes("会場") &&
      text.includes("開場/開演") &&
      text.includes("お問い合わせ")
    );
  });
}

function externalLinks($, row, sourceUrl) {
  const sourceHost = new URL(sourceUrl).hostname;
  return $(row).find("a[href]").toArray()
    .map((anchor) => normalizeUrl($(anchor).attr("href"), sourceUrl))
    .filter(Boolean)
    .filter((url) => new URL(url).hostname !== sourceHost);
}

export function parseGlayLivePage(html, sourceUrl, { months = [] } = {}) {
  const $ = cheerio.load(html);
  const bodyText = cleanText($("body").text()).normalize("NFKC");
  const tourMatch = bodyText.match(TOUR_TITLE_RE);
  if (!tourMatch) {
    return {
      ok: false,
      reason: "GLAY official LIVE page 未找到目标 ARENA TOUR 标识",
      records: [],
    };
  }

  const table = tourTable($);
  if (!table) {
    return {
      ok: false,
      reason: "GLAY ARENA TOUR 日程表缺少必要表头，页面结构可能已变化",
      records: [],
    };
  }

  const allowed = allowedMonthKeys(months);
  if (!allowed.size) {
    return { ok: false, reason: "GLAY parser 需要明确目标月份窗口", records: [] };
  }

  let currentYear = Number(tourMatch[1]);
  let currentVenueName;
  let currentPromoterUrl;
  const records = [];

  for (const row of $(table).find("tr").toArray()) {
    const cells = $(row).find("td").toArray().map((cell) => ({
      node: cell,
      text: cleanText($(cell).text()).normalize("NFKC"),
      hasLink: $(cell).find("a[href]").length > 0,
    }));
    if (!cells.length) continue;

    const dateCell = cells.find((cell) => DATE_RE.test(cell.text));
    if (!dateCell) continue;
    const dateMatch = dateCell.text.match(DATE_RE);
    if (!dateMatch) continue;
    if (dateMatch[1]) currentYear = Number(dateMatch[1]);
    const date = toIsoDate(currentYear, dateMatch[2], dateMatch[3]);
    if (!date) continue;

    const timeCell = cells.find((cell) => TIME_RE.test(cell.text));
    const timeMatch = timeCell?.text.match(TIME_RE);
    const openTime = normalizeTime(timeMatch?.[1]);
    const startTime = normalizeTime(timeMatch?.[2]);

    const venueCell = cells.find((cell) =>
      cell.node !== dateCell.node &&
      cell.node !== timeCell?.node &&
      !cell.hasLink &&
      cell.text &&
      !/(?:TEL|平日|全日|info@|月|火|水|木|金|土|日)/iu.test(cell.text),
    );
    if (venueCell?.text) {
      currentVenueName = normalizeVenueName(venueCell.text);
      currentPromoterUrl = undefined;
    }

    const links = externalLinks($, row, sourceUrl);
    if (links.length) currentPromoterUrl = links[0];

    if (!currentVenueName || !allowed.has(date.slice(0, 7))) continue;
    records.push({
      title: TOUR_TITLE,
      artistNames: ["GLAY"],
      venueName: currentVenueName,
      date,
      openTime,
      startTime,
      promoterUrl: currentPromoterUrl,
    });
  }

  return {
    ok: true,
    records: records.filter(
      (record, index, all) =>
        all.findIndex((candidate) =>
          candidate.date === record.date &&
          candidate.venueName === record.venueName &&
          candidate.startTime === record.startTime,
        ) === index,
    ),
  };
}
