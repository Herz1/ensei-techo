const PROVIDER_HOSTS = [
  ["eplus", /(?:^|\.)eplus\.jp$/u],
  ["pia", /(?:^|\.)(?:t\.)?pia\.jp$/u],
  ["lawson", /(?:^|\.)l-tike\.com$/u],
  ["ticketbook", /(?:^|\.)ticketbook\.jp$/u],
];

const PROVIDER_LABELS = {
  eplus: "e+",
  pia: "チケットぴあ",
  lawson: "ローチケ",
  ticketbook: "ticketbook",
  other: "其他官方渠道",
};

const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "igshid",
  "ref",
  "source",
  "utm_campaign",
  "utm_content",
  "utm_medium",
  "utm_source",
  "utm_term",
]);

export function canonicalizeTicketUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/u, "");
    return url.toString();
  } catch {
    return null;
  }
}

export function recognizeTicketProvider(value) {
  const canonicalUrl = canonicalizeTicketUrl(value);
  if (!canonicalUrl) return { key: "other", label: PROVIDER_LABELS.other };
  const hostname = new URL(canonicalUrl).hostname;
  const match = PROVIDER_HOSTS.find(([, pattern]) => pattern.test(hostname));
  const key = match?.[0] ?? "other";
  return { key, label: PROVIDER_LABELS[key] };
}

export function classifyTicketUrl(value) {
  const canonicalUrl = canonicalizeTicketUrl(value);
  if (!canonicalUrl) return "unknown";
  const url = new URL(canonicalUrl);
  const pathAndQuery = `${url.pathname}${url.search}`.toLowerCase();
  const provider = recognizeTicketProvider(canonicalUrl).key;

  if (/(?:^|[\/_-])refund\d*(?:[\/_\.-]|$)|haraimodoshi|払い戻し|払戻/u.test(pathAndQuery)) {
    return "refund";
  }
  if (/(?:^|[\/_-])(?:help|faq|support|guide|contact)(?:[\/_\.-]|$)|\/hc\//u.test(pathAndQuery)) {
    return "support";
  }
  if (/(?:\/search(?:[_/-]|\/)|[?&](?:kw|keyword|q)=|search_all\.do)/u.test(pathAndQuery)) {
    return "search";
  }

  if (provider === "eplus") {
    if (/\/sf\/detail\//u.test(url.pathname)) return "event_detail";
    return "generic_provider";
  }
  if (provider === "pia") {
    if (/\/event\/event\.do/u.test(url.pathname) && /[?&](?:eventCd|eventBundleCd)=/iu.test(url.search)) {
      return "event_detail";
    }
    if (/\/artist\/|artists\.do/u.test(url.pathname) || /^\/(?:pia)?\/?$/u.test(url.pathname)) {
      return "generic_provider";
    }
    return "generic_provider";
  }
  if (provider === "lawson") {
    // canonicalizeTicketUrl removes a trailing slash, so accept both
    // `/mevent/` and the canonical `/mevent` form.
    if (/\/mevent(?:\/|$)/u.test(url.pathname) && /[?&]mid=/iu.test(url.search)) return "event_detail";
    return "generic_provider";
  }
  if (provider === "ticketbook") {
    return /\/(?:event|detail|ticket)\//u.test(url.pathname)
      ? "event_detail"
      : "generic_provider";
  }

  if (/(?:livepocket\.jp\/(?:e|ticket)|tiget\.net\/events|t-dv\.com\/)/u.test(`${url.hostname}${url.pathname}`)) {
    return "event_detail";
  }
  return "unknown";
}

export function extractProviderEventId(value) {
  const canonicalUrl = canonicalizeTicketUrl(value);
  if (!canonicalUrl) return null;
  const url = new URL(canonicalUrl);
  const provider = recognizeTicketProvider(canonicalUrl).key;
  if (provider === "eplus") {
    return url.pathname.match(/\/sf\/detail\/([^/?]+)/u)?.[1] ?? null;
  }
  if (provider === "pia") {
    return url.searchParams.get("eventCd") ?? url.searchParams.get("eventBundleCd");
  }
  if (provider === "lawson") return url.searchParams.get("mid");
  if (provider === "ticketbook") {
    return url.searchParams.get("info") ?? url.pathname.split("/").filter(Boolean).at(-1) ?? null;
  }
  return null;
}

export function ticketOfferId(eventId, provider, providerEventId, url) {
  return providerEventId
    ? `offer:${provider}:${providerEventId}`
    : `offer:${eventId}:${provider}:${encodeURIComponent(canonicalizeTicketUrl(url) ?? url)}`;
}

function saleType(kind) {
  if (kind === "fc_lottery") return "fan_club_lottery";
  if (kind === "playguide_lottery") return "playguide_lottery";
  if (kind === "general") return "general_sale";
  if (kind === "resale") return "official_resale";
  return "other";
}

function saleStatus(status) {
  if (status === "upcoming") return "not_started";
  if (["open", "closed"].includes(status)) return status;
  return "unknown";
}

export function buildLegacyTicketOffers({
  eventId,
  phases = [],
  ticketLinks = [],
  eligibility = [],
  lastVerifiedAt,
  explicitSoldOut = false,
}) {
  const urls = new Map();
  for (const phase of phases) {
    if (!phase.url) continue;
    const canonicalUrl = canonicalizeTicketUrl(phase.url);
    if (!canonicalUrl) continue;
    if (["support", "refund"].includes(classifyTicketUrl(canonicalUrl))) continue;
    const current = urls.get(canonicalUrl) ?? { url: canonicalUrl, phases: [] };
    current.phases.push(phase);
    urls.set(canonicalUrl, current);
  }
  for (const link of ticketLinks) {
    const canonicalUrl = canonicalizeTicketUrl(link.url);
    if (canonicalUrl && !["support", "refund"].includes(classifyTicketUrl(canonicalUrl)) && !urls.has(canonicalUrl)) {
      urls.set(canonicalUrl, { url: canonicalUrl, phases: [] });
    }
  }
  return [...urls.values()].map(({ url, phases: linkedPhases }) => {
    const phase = [...linkedPhases].sort((left, right) => {
      const rank = { open: 0, upcoming: 1, closed: 2 };
      return (rank[left.status] ?? 3) - (rank[right.status] ?? 3)
        || String(left.start ?? "").localeCompare(String(right.start ?? ""));
    })[0];
    const provider = recognizeTicketProvider(url);
    const providerEventId = extractProviderEventId(url);
    return {
      id: ticketOfferId(eventId, provider.key, providerEventId, url),
      eventId,
      provider: provider.key,
      providerLabel: provider.label,
      providerEventId,
      url,
      urlKind: classifyTicketUrl(url),
      saleType: saleType(phase?.kind),
      saleStatus: saleStatus(phase?.status),
      inventoryStatus: explicitSoldOut ? "sold_out" : "unknown",
      startAt: phase ? `${phase.start}T00:00:00+09:00` : null,
      endAt: phase ? `${phase.end}T23:59:59+09:00` : null,
      resultAt: null,
      paymentDeadline: null,
      eligibility: phase?.kind === "fc_lottery"
        ? eligibility.map((rule) => `${rule.appliesTo}：${rule.label}`)
        : [],
      requiresJapanesePhone: null,
      identityCheck: null,
      ticketApp: null,
      membershipRequirement: null,
      regionRestriction: null,
      phoneVerification: null,
      companionRestriction: null,
      ticketDistribution: null,
      ticketDisplayAt: null,
      sourceUrl: url,
      lastVerifiedAt,
      matchLevel: "confirmed",
      derivedFromLegacy: true,
    };
  });
}

export function getTicketUrlAction(value) {
  const quality = classifyTicketUrl(value);
  if (quality === "event_detail") return "purchase";
  if (quality === "generic_provider") return "provider";
  if (quality === "search") return "search";
  if (quality === "support") return "support";
  if (quality === "refund") return "refund";
  return "source";
}

export function getRefreshPriority(offer, now = new Date()) {
  if (offer.saleStatus === "open") return "high";
  const next = offer.startAt ? Date.parse(offer.startAt) : Number.NaN;
  if (Number.isFinite(next) && next >= now.getTime() && next - now.getTime() <= 7 * 86_400_000) return "high";
  if (offer.saleStatus === "not_started" || offer.saleStatus === "unknown") return "medium";
  return "low";
}

export function normalizeTicketOfferSaleStatus(offer, now = new Date()) {
  const nowMs = now.getTime();
  const startMs = offer.startAt ? Date.parse(offer.startAt) : Number.NaN;
  const endMs = offer.endAt ? Date.parse(offer.endAt) : Number.NaN;
  if (Number.isFinite(endMs) && endMs < nowMs) return { ...offer, saleStatus: "closed" };
  if (offer.saleStatus === "closed") return offer;
  if (Number.isFinite(startMs) && startMs > nowMs) return { ...offer, saleStatus: "not_started" };
  if (Number.isFinite(startMs) && startMs <= nowMs && (!Number.isFinite(endMs) || endMs >= nowMs)) {
    return { ...offer, saleStatus: "open" };
  }
  return offer;
}
