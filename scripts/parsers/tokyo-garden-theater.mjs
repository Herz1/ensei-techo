import * as cheerio from "cheerio";
import {
  cleanText,
  normalizeName,
  normalizeTime,
  toIsoDate,
} from "../event-ingest-lib.mjs";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const DETAIL_PATH = /\/tokyo_garden_theater\/schedule\/\d+\/?$/u;
const PERFORMANCE = /(20\d{2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*[（(][^）)]*[）)]\s*〖?開場〗?\s*(\d{1,2}:\d{2})\s*〖?開演〗?\s*(\d{1,2}:\d{2})/gu;
const EVENT_SIGNAL = /(?:\bLIVE\b|\bTOUR\b|\bCONCERT\b|\bFES(?:TIVAL)?\b|\bFANMEETING\b|\bPARTY\b|ライブ|コンサート|ツアー|フェス|パーティー|公演|祭)/iu;
const GENERIC_IDENTITY = /^(?:EVENT|イベント詳細|コンサート・ショー|OPEN\s*\/\s*START|INFORMATION|お問い合わせ|チケット購入|イベントカレンダー\(一覧\))$/iu;

function normalizeUrl(value, base) {
  try {
    return new URL(value, base).href;
  } catch {
    return undefined;
  }
}

function expectedMonthMarkers(year, month) {
  const name = MONTH_NAMES[Number(month) - 1];
  return [
    `${Number(year)}${Number(month)}月`,
    `${Number(year)} ${name}.`,
    `${Number(year)}${name}.`,
  ];
}

function detailContext($, anchor) {
  const ancestors = [anchor, ...$(anchor).parents("li,article,section,div").toArray()];
  return ancestors
    .map((node) => cleanText($(node).text()))
    .find((text) => text.includes("コンサート・ショー") && text.length <= 600) ?? "";
}

export function parseTokyoGardenTheaterScheduleLinks(
  html,
  sourceUrl,
  { year, month } = {},
) {
  const $ = cheerio.load(html);
  const bodyText = cleanText($("body").text());
  const markers = expectedMonthMarkers(year, month);
  if (!bodyText.includes("開催予定のイベント") || !markers.some((marker) => bodyText.includes(marker))) {
    return {
      ok: false,
      reason: `東京ガーデンシアター月页缺少目标年月 ${year}-${String(month).padStart(2, "0")} 标识，查询参数或页面结构可能已变化`,
      links: [],
    };
  }

  const links = [];
  for (const anchor of $("a[href]").toArray()) {
    const url = normalizeUrl($(anchor).attr("href"), sourceUrl);
    if (!url) continue;
    let pathname;
    try {
      pathname = new URL(url).pathname;
    } catch {
      continue;
    }
    if (!DETAIL_PATH.test(pathname)) continue;
    const context = detailContext($, anchor);
    if (!context.includes("コンサート・ショー")) continue;
    links.push({
      url,
      discoveryText: context,
    });
  }

  return {
    ok: true,
    links: links.filter(
      (item, index, all) => all.findIndex((candidate) => candidate.url === item.url) === index,
    ),
  };
}

function leafTexts($) {
  const selectors = "h1,h2,h3,h4,h5,h6,p,li,dd,dt,strong,b,span";
  const values = [];
  for (const node of $(selectors).toArray()) {
    if ($(node).find(selectors).length) continue;
    const value = cleanText($(node).text());
    if (!value || value.length > 220 || GENERIC_IDENTITY.test(value)) continue;
    if (!values.includes(value)) values.push(value);
  }
  return values;
}

function identityCandidates($) {
  const values = leafTexts($).filter((value) => {
    if (/^20\d{2}\s*\/\s*\d{1,2}\s*\/\s*\d{1,2}/u.test(value)) return false;
    if (/^[¥￥]?\s*[\d,]+\s*円?$/u.test(value)) return false;
    if (/^(?:TEL|URL)\b/iu.test(value)) return false;
    return true;
  });
  const categoryIndex = values.findIndex((value) => value === "コンサート・ショー");
  if (categoryIndex < 0) return values;
  return values.slice(Math.max(0, categoryIndex - 2), categoryIndex + 4);
}

function pickIdentity($, discoveryText, knownArtistNames = new Set()) {
  const candidates = identityCandidates($);
  const known = candidates.filter((value) => knownArtistNames.has(normalizeName(value)));
  const eventCandidates = candidates.filter((value) => EVENT_SIGNAL.test(value));
  const title = (eventCandidates.length
    ? eventCandidates.slice().sort((a, b) => b.length - a.length)[0]
    : candidates.slice().sort((a, b) => b.length - a.length)[0]) ?? "";

  const artistNames = [];
  for (const candidate of known) {
    if (normalizeName(candidate) !== normalizeName(title) && !artistNames.includes(candidate)) {
      artistNames.push(candidate);
    }
  }
  if (!artistNames.length) {
    const normalizedDiscovery = normalizeName(discoveryText);
    for (const candidate of candidates) {
      const normalized = normalizeName(candidate);
      if (
        normalized &&
        normalized !== normalizeName(title) &&
        normalizedDiscovery.includes(normalized) &&
        knownArtistNames.has(normalized) &&
        !artistNames.includes(candidate)
      ) {
        artistNames.push(candidate);
      }
    }
  }

  return { title, artistNames };
}

function parsePerformances(text) {
  const records = [];
  for (const match of text.matchAll(PERFORMANCE)) {
    const date = toIsoDate(match[1], match[2], match[3]);
    if (!date) continue;
    records.push({
      date,
      openTime: normalizeTime(match[4]),
      startTime: normalizeTime(match[5]),
    });
  }
  return records;
}

function ticketTypeLines($) {
  const values = leafTexts($);
  const results = [];
  for (const value of values) {
    if (/^[※*・]/u.test(value)) continue;
    const match = value.match(/^(.{1,70}?)[\s　]*[¥￥]\s*([0-9][0-9,]*)\s*(?:円)?(?:[（(]税込[)）])?$/u) ??
      value.match(/^(.{1,70}?)[\s　]+([0-9][0-9,]*)\s*円(?:[（(]税込[)）])?$/u);
    if (!match) continue;
    const name = cleanText(match[1]).replace(/[：:\s]+$/u, "");
    const priceJpy = Number(match[2].replaceAll(",", ""));
    if (!name || !Number.isInteger(priceJpy) || priceJpy <= 0 || priceJpy >= 1_000_000) continue;
    if (results.some((item) => item.name === name && item.priceJpy === priceJpy)) continue;
    results.push({
      name,
      priceJpy,
      taxIncluded: /税込/u.test(value) ? true : null,
      notes: [],
    });
  }
  return results;
}

function eligibilityFrom(text) {
  const rules = [];
  const patterns = [
    /\d+歳未満[^。]{0,80}(?:入場不可|チケット(?:が)?必要|チケット必須)/u,
    /\d+歳以上[^。]{0,80}(?:チケット(?:が)?必要|チケット必須|有料)/u,
    /(?:お1人様)?1公演につき\s*\d+枚(?:まで)?/u,
    /車椅子[^。]{0,80}(?:受付|応募|申込|申し込み)/u,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern)?.[0];
    if (!match) continue;
    const label = cleanText(match);
    if (rules.some((rule) => rule.label === label)) continue;
    rules.push({
      label,
      appliesTo: /枚/u.test(label) ? "申込条件" : "入場条件",
    });
  }
  return rules;
}

function externalLinkEntries($, sourceUrl) {
  const sourceHost = new URL(sourceUrl).hostname;
  return $("a[href]").toArray().map((anchor) => {
    const url = normalizeUrl($(anchor).attr("href"), sourceUrl);
    if (!url) return null;
    const host = new URL(url).hostname;
    if (host === sourceHost) return null;
    const label = cleanText($(anchor).text());
    const contexts = [anchor, ...$(anchor).parents("li,p,div,section,article").toArray()]
      .map((node) => cleanText($(node).text()))
      .filter((value) => value.length <= 700);
    return { url, label, contexts };
  }).filter(Boolean);
}

function classifyLinks($, sourceUrl) {
  const entries = externalLinkEntries($, sourceUrl);
  const purchaseUrls = [];
  let promoterUrl;
  let officialEventUrl;
  for (const entry of entries) {
    if (entry.contexts.some((value) => value.includes("チケット購入"))) {
      if (!purchaseUrls.includes(entry.url)) purchaseUrls.push(entry.url);
      continue;
    }
    if (!promoterUrl && entry.contexts.some((value) => value.includes("お問い合わせ"))) {
      promoterUrl = entry.url;
      continue;
    }
    if (!officialEventUrl && /オフィシャルサイト|公式サイト/iu.test(entry.label)) {
      officialEventUrl = entry.url;
    }
  }
  return { purchaseUrls, promoterUrl, officialEventUrl };
}

export function parseTokyoGardenTheaterDetail(
  html,
  sourceUrl,
  { discoveryText = "", knownArtistNames = new Set() } = {},
) {
  const $ = cheerio.load(html);
  const bodyText = cleanText($("body").text());
  if (!bodyText.includes("イベント詳細") || !bodyText.includes("コンサート・ショー") || !bodyText.includes("OPEN / START")) {
    return {
      ok: false,
      reason: "東京ガーデンシアター详情页缺少 event/category/OPEN START 标识，可能不是音乐详情或页面结构已变化",
      records: [],
    };
  }

  const performances = parsePerformances(bodyText);
  if (!performances.length) {
    return {
      ok: false,
      reason: "東京ガーデンシアター详情页未解析到明确 OPEN / START 场次",
      records: [],
    };
  }

  const { title, artistNames } = pickIdentity($, discoveryText, knownArtistNames);
  if (!title) {
    return {
      ok: false,
      reason: "東京ガーデンシアター详情页未解析到可用标题",
      records: [],
    };
  }

  const ticketTypes = ticketTypeLines($);
  const pricesJpy = [...new Set(ticketTypes.map((item) => item.priceJpy))].sort((a, b) => a - b);
  const eligibility = eligibilityFrom(bodyText);
  const links = classifyLinks($, sourceUrl);

  return {
    ok: true,
    records: performances.map((performance) => ({
      title,
      artistNames,
      ...performance,
      ticketTypes,
      pricesJpy,
      eligibility,
      ...links,
    })),
  };
}
