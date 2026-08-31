import * as cheerio from "cheerio";
import { parseEmbeddedEventJson, parseEventJsonLd } from "./parsers/structured-event.mjs";
import {
  classifyTicketUrl,
  extractProviderEventId,
  recognizeTicketProvider,
} from "./ticket-offer-lib.mjs";

function asDateTime(match) {
  if (!match) return null;
  const [, year, month, day, hour = "00", minute = "00"] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(2, "0")}:${minute}+09:00`;
}

const DATE_TIME = /(20\d{2})[\/.年](\d{1,2})[\/.月](\d{1,2})日?(?:\([^)]*\))?\s*(?:(\d{1,2})[:：](\d{2}))?/u;

const RANGE_PATTERN = `(?:受付|申込|販売|発売|エントリー)(?:期間)?[^0-9]{0,80}${DATE_TIME.source}\\s*(?:[〜～~]|-(?=\\s*20))\\s*${DATE_TIME.source}`;

function compact(value) {
  return String(value ?? "").replace(/\s+/gu, " ").trim();
}

function matchKey(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("ja")
    .replace(/[\s・･\-_/()（）「」『』：:,.。]/gu, "");
}

function venueKey(value) {
  // Venue master data names Zepp venues with a regional suffix while
  // provider pages usually omit it (e.g. `Zepp Shinjuku(TOKYO)`).
  return matchKey(String(value ?? "").replace(/[（(](?:TOKYO|OSAKA|東京都|大阪府)[）)]/giu, ""));
}

function hasDate(text, date) {
  const match = String(date ?? "").match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/u);
  if (!match) return false;
  const [, year, month, day] = match;
  const normalizedText = matchKey(text);
  return [
    `${year}${month.padStart(2, "0")}${day.padStart(2, "0")}`,
    `${year}${Number(month)}${Number(day)}`,
  ].some((candidate) => normalizedText.includes(candidate));
}

function hasVenue(text, venueName) {
  const target = venueKey(venueName);
  const source = venueKey(text);
  return Boolean(target && source.includes(target));
}

function hasTime(text, startTime) {
  const target = matchKey(startTime);
  return !target || matchKey(text).includes(target);
}

function textMatchesContext(text, context) {
  return Boolean(
    context?.date &&
      context?.venueName &&
      hasDate(text, context.date) &&
      hasVenue(text, context.venueName) &&
      hasTime(text, context.startTime),
  );
}

function textMatchesDateVenue(text, context) {
  return Boolean(
    context?.date &&
      context?.venueName &&
      hasDate(text, context.date) &&
      hasVenue(text, context.venueName),
  );
}

function metadataMatchesContext(metadata, context) {
  return Boolean(
    metadata?.startDate &&
      context?.date &&
      metadata.startDate === context.date &&
      context?.venueName &&
      metadata?.venueName &&
      hasVenue(metadata.venueName, context.venueName) &&
      (!context.startTime || !metadata.startTime || metadata.startTime === context.startTime),
  );
}

function scopedEventNode($, context) {
  if (!context) return null;
  const selectors = [
    "article[class*='ticket-article']",
    ".lt-ticket-list-group",
  ];
  const nodes = selectors.flatMap((selector) => $(selector).toArray());
  const baseMatches = nodes.filter((node) => {
    const text = compact($(node).text());
    return Boolean(
      context.date &&
        context.venueName &&
        hasDate(text, context.date) &&
        hasVenue(text, context.venueName),
    );
  });
  if (baseMatches.length === 1) return baseMatches[0];
  return baseMatches.find((node) => hasTime($(node).text(), context.startTime)) ?? null;
}

function primarySaleSection(text) {
  const first = text.match(new RegExp(RANGE_PATTERN, "u"));
  if (!first || first.index === undefined) return text;
  const afterFirst = first.index + first[0].length;
  const next = text.slice(afterFirst).match(new RegExp(RANGE_PATTERN, "u"));
  const end = next?.index === undefined ? Math.min(text.length, afterFirst + 1200) : afterFirst + next.index;
  // 将紧邻的阶段标题一起保留（例如“先着★一般発売”在受付期間前）。
  return text.slice(Math.max(0, first.index - 120), end);
}

function primarySaleText($, scopedNode, text) {
  if (scopedNode) {
    const section = $(scopedNode).find("section.block-ticket").first();
    if (section.length) return compact(section.text());
    if ($(scopedNode).is(".lt-ticket-list-group")) return compact($(scopedNode).text());
  }
  return primarySaleSection(text);
}

function labelledDate(text, labels) {
  const labelMatch = text.match(new RegExp(`(?:${labels}).{0,100}`, "u"));
  return asDateTime(labelMatch?.[0].match(DATE_TIME));
}

function explicitRequirement(text, patterns) {
  for (const [pattern, label] of patterns) {
    if (pattern.test(text)) return label;
  }
  return null;
}

function rangeDates(text) {
  const rangeText = text.match(new RegExp(RANGE_PATTERN, "u"))?.[0];
  if (!rangeText) return [null, null];
  const matches = [...rangeText.matchAll(new RegExp(DATE_TIME.source, "gu"))];
  return [asDateTime(matches[0]), asDateTime(matches[1])];
}

function parseJsonLdOffers(html) {
  const $ = cheerio.load(html);
  const offers = [];
  $('script[type="application/ld+json"]').each((_, element) => {
    const text = $(element).text().trim();
    if (!text) return;
    try {
      const payload = JSON.parse(text);
      const walk = (value) => {
        if (!value || typeof value !== "object") return;
        if (Array.isArray(value)) return value.forEach(walk);
        const type = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
        if (type.some((item) => ["Offer", "AggregateOffer"].includes(item))) offers.push(value);
        Object.values(value).forEach(walk);
      };
      walk(payload);
    } catch {
      // 继续降级到内嵌 JSON、渠道规则和 DOM。
    }
  });
  return offers;
}

function inventoryFromSchema(value) {
  const text = String(value ?? "").toLowerCase();
  if (text.includes("soldout")) return "sold_out";
  if (text.includes("limitedavailability")) return "low";
  if (text.includes("instock")) return "available";
  return "unknown";
}

export function parseTicketPage(html, pageUrl, checkedAt, eventContext = null) {
  const $ = cheerio.load(html);
  const body = compact($("body").text());
  const jsonLd = parseEventJsonLd(html);
  const embedded = parseEmbeddedEventJson(html);
  const allStructured = [...jsonLd.events, ...embedded.events];
  const structured = eventContext
    ? allStructured.find((event) => metadataMatchesContext(event, eventContext)) ?? null
    : allStructured[0] ?? null;
  const scopedNode = scopedEventNode($, eventContext);
  // LivePocket's JSON-LD commonly uses midnight as a date-only sentinel
  // (`startDate: ...T00:00`). The visible event block still contains the
  // actual opening time. Treat the context as usable only when the page
  // text itself contains the supplied date, venue and time, then prefer
  // that observed context over the sentinel value.
  const textDateVenueMatched = Boolean(eventContext && textMatchesDateVenue(body, eventContext));
  const textContextMatched = Boolean(eventContext && textMatchesContext(body, eventContext));
  const structuredContextMatched = Boolean(eventContext && metadataMatchesContext(structured, eventContext));
  const contextMatched = !eventContext || Boolean(scopedNode || structuredContextMatched || textDateVenueMatched);
  const contextStartTime = textContextMatched && eventContext?.startTime ? eventContext.startTime : null;
  const structuredStartTime = structured?.startTime === "00:00" && contextStartTime
    ? contextStartTime
    : structured?.startTime;
  const contextDate = textDateVenueMatched ? eventContext.date : null;
  const contextVenueName = textDateVenueMatched ? eventContext.venueName : null;
  const scopedStartTime = scopedNode && hasTime($(scopedNode).text(), eventContext?.startTime)
    ? eventContext?.startTime ?? null
    : null;
  const metadataDate = structuredContextMatched ? structured?.startDate : contextDate ?? structured?.startDate;
  const metadataVenueName = structuredContextMatched ? structured?.venueName : contextVenueName ?? structured?.venueName;
  const metadataStartTime = structuredContextMatched
    ? structuredStartTime
    : contextStartTime ?? (structured?.startTime === "00:00" ? null : structured?.startTime);
  const scopeBody = scopedNode ? compact($(scopedNode).text()) : body;
  const allSchemaOffers = parseJsonLdOffers(html);
  const selectedPurchaseUrls = new Set(structured?.purchaseUrls ?? []);
  const schemaOffers = eventContext && selectedPurchaseUrls.size
    ? allSchemaOffers.filter((offer) => selectedPurchaseUrls.has(offer.url))
    : eventContext
      ? []
      : allSchemaOffers;
  const schemaOffer = schemaOffers.length === 1 ? schemaOffers[0] : null;
  const provider = recognizeTicketProvider(pageUrl);
  const providerEventId = extractProviderEventId(pageUrl);
  const [rangeStart, rangeEnd] = rangeDates(scopeBody);
  const startAt = schemaOffer?.validFrom ?? schemaOffer?.availabilityStarts ?? rangeStart;
  const endAt = schemaOffer?.validThrough ?? schemaOffer?.availabilityEnds ?? rangeEnd;
  const resultAt = labelledDate(scopeBody, "結果(?:確認|発表)|当落(?:確認|発表)");
  const paymentDeadline = labelledDate(scopeBody, "入金(?:期間|期限)|支払(?:期間|期限)");
  const ticketDisplayAt = labelledDate(scopeBody, "チケット(?:表示|ダウンロード)(?:開始|予定|可能)|表示開始|ダウンロード開始");
  const now = Date.parse(checkedAt);
  const currentSale = primarySaleText($, scopedNode, scopeBody);
  const saysOpen = /受付中|販売中|発売中/u.test(currentSale);
  const saysNotStarted = /受付開始前|販売開始前|発売開始前/u.test(currentSale);
  const saysClosed = /受付終了|販売終了|発売終了/u.test(currentSale);
  let saleStatus = "unknown";
  if (saysOpen && !saysClosed) saleStatus = "open";
  else if (saysNotStarted && !saysOpen && !saysClosed) saleStatus = "not_started";
  else if (saysClosed && !saysOpen) saleStatus = "closed";
  else if (!saysOpen && !saysClosed && startAt && Date.parse(startAt) > now) saleStatus = "not_started";
  else if (!saysOpen && !saysClosed && startAt && Date.parse(startAt) <= now && (!endAt || Date.parse(endAt) >= now)) saleStatus = "open";
  else if (!saysOpen && !saysClosed && endAt && Date.parse(endAt) < now) saleStatus = "closed";
  const schemaInventories = schemaOffers.map((offer) => inventoryFromSchema(offer.availability));
  const knownSchemaInventories = [...new Set(schemaInventories.filter((status) => status !== "unknown"))];
  let inventoryStatus = schemaOffers.length > 0 && knownSchemaInventories.length === 1 && schemaInventories.every((status) => status === knownSchemaInventories[0])
    ? knownSchemaInventories[0]
    : "unknown";
  if (inventoryStatus === "unknown" && schemaOffers.length <= 1 && /予定枚数終了|完売|SOLD\s*OUT/iu.test(currentSale)) inventoryStatus = "sold_out";
  else if (inventoryStatus === "unknown" && schemaOffers.length <= 1 && /残りわずか|残席わずか/u.test(currentSale)) inventoryStatus = "low";
  else if (inventoryStatus === "unknown" && schemaOffers.length <= 1 && /在庫あり/u.test(currentSale)) inventoryStatus = "available";
  let saleType = "other";
  if (/ファンクラブ(?:会員)?(?:限定|先行|抽選)|FC会員(?:限定|先行|抽選)/iu.test(currentSale)) saleType = "fan_club_lottery";
  else if (/公式リセール|定価リセール/u.test(currentSale)) saleType = "official_resale";
  else if (/抽選/u.test(currentSale)) saleType = "playguide_lottery";
  else if (/一般発売|先着/u.test(currentSale)) saleType = "general_sale";
  const eligibility = [];
  if (/ファンクラブ会員限定|FC会員限定/iu.test(scopeBody)) eligibility.push("ファンクラブ会員限定");
  if (/日本国内の(?:携帯)?電話番号/u.test(scopeBody)) eligibility.push("日本国内の電話番号が必要");
  const ticketApp = scopeBody.match(/AnyPASS|MOALA|チケプラ|ローチケ電子チケット|ticket\s*board/iu)?.[0] ?? null;
  const membershipRequirement = explicitRequirement(currentSale, [
    [/ファンクラブ会員限定|FC会員限定/iu, "ファンクラブ会員限定"],
    [/申込(?:み)?には.{0,40}(?:会員登録|会員アカウント).{0,20}(?:必要|必須)/iu, "申请需要会员账号"],
  ]);
  const regionRestriction = explicitRequirement(scopeBody, [
    [/日本国内(?:在住|居住)(?:者)?(?:のみ|限定)/iu, "仅限日本国内居住者"],
    [/日本国内の(?:携帯)?電話番号(?:が必要|必須)/iu, "需要日本国内电话号码"],
  ]);
  const phoneVerification = explicitRequirement(scopeBody, [
    [/SMS(?:による)?認証|SMS認証/iu, "需要 SMS 认证"],
    [/電話番号認証/iu, "需要电话号码认证"],
  ]);
  const companionRestriction = explicitRequirement(scopeBody, [
    [/同行者.{0,40}(?:事前登録|登録が必要|登録必須)/iu, "同行者需要事先登记"],
    [/同行者.{0,40}(?:スマートフォン|携帯電話).{0,20}(?:必要|必須)/iu, "同行者需要可用手机"],
    [/同行者.{0,40}本人確認/iu, "同行者可能需要本人确认"],
  ]);
  const ticketDistribution = explicitRequirement(scopeBody, [
    [/(?:チケット|電子チケット).{0,40}(?:分配不可|分配できません|譲渡不可)/iu, "票券不可分配"],
    [/(?:同行者|チケット).{0,40}(?:分配が必要|分配必須)/iu, "需要向同行者分配票券"],
  ]);
  const parserUsed = schemaOffers.length || jsonLd.events.length
    ? "json_ld"
    : embedded.events.length
      ? "structured_json"
      : provider.key !== "other"
        ? "site_specific"
        : "simple_dom";
  return {
    metadata: {
      title: structured?.title
        ?? $("meta[property='og:title']").attr("content")
        ?? ($("h1").first().text().trim() || null),
      date: metadataDate ?? (scopedNode ? eventContext?.date ?? null : null),
      startTime: metadataStartTime ?? scopedStartTime,
      venueName: metadataVenueName ?? (scopedNode ? eventContext?.venueName ?? null : null),
      artistNames: structured?.artistNames ?? [],
    },
    offerBase: {
      provider: provider.key,
      providerLabel: provider.label,
      providerEventId,
      url: pageUrl,
      urlKind: classifyTicketUrl(pageUrl),
      saleType,
      saleStatus,
      inventoryStatus,
      startAt,
      endAt,
      resultAt,
      paymentDeadline,
      eligibility,
      requiresJapanesePhone: /日本国内の(?:携帯)?電話番号/u.test(scopeBody) ? true : null,
      identityCheck: /本人確認(?:が必要|は必須|必須|あり|を実施|を行|の実施)|顔写真(?:付き|つき)?の本人確認/u.test(scopeBody) ? true : null,
      ticketApp,
      membershipRequirement,
      regionRestriction,
      phoneVerification,
      companionRestriction,
      ticketDistribution,
      ticketDisplayAt,
      sourceUrl: pageUrl,
      lastVerifiedAt: checkedAt,
      derivedFromLegacy: false,
    },
    parserUsed,
    contextMatched,
  };
}
