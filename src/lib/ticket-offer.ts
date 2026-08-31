import type {
  EventItem,
  PhaseKind,
  TicketOffer,
  TicketProvider,
  TicketSaleStatus,
  TicketSaleType,
  TicketUrlKind,
} from "./types";
import type { TicketApplication, UserEventPlan } from "./store";
import { selectApplicationNextAction, selectTicketNextAction } from "./ticket-action-core.mjs";
import {
  neutralizeStaleTicketOffer,
  ticketFreshness,
  ticketUrlKindLabel as coreTicketUrlKindLabel,
  trustedTicketOffers,
} from "./ticket-trust-core.mjs";

export type TicketEventContext = Pick<
  EventItem,
  | "id"
  | "date"
  | "startTime"
  | "eventStatus"
  | "phases"
  | "ticketLinks"
  | "ticketOffers"
  | "eligibility"
> & {
  verification: Pick<EventItem["verification"], "checkedAt">;
};

const PROVIDER_LABELS: Record<TicketProvider, string> = {
  eplus: "e+",
  pia: "チケットぴあ",
  lawson: "ローチケ",
  ticketbook: "ticketbook",
  other: "其他官方渠道",
};

const TRACKING_PARAMS = new Set([
  "fbclid", "gclid", "igshid", "ref", "source",
  "utm_campaign", "utm_content", "utm_medium", "utm_source", "utm_term",
]);

export function canonicalizeTicketUrl(value: string): string | null {
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

export function recognizeTicketProvider(value: string): {
  key: TicketProvider;
  label: string;
} {
  const canonical = canonicalizeTicketUrl(value);
  if (!canonical) return { key: "other", label: PROVIDER_LABELS.other };
  const hostname = new URL(canonical).hostname;
  const key: TicketProvider = /(?:^|\.)eplus\.jp$/u.test(hostname)
    ? "eplus"
    : /(?:^|\.)(?:t\.)?pia\.jp$/u.test(hostname)
      ? "pia"
      : /(?:^|\.)l-tike\.com$/u.test(hostname)
        ? "lawson"
        : /(?:^|\.)ticketbook\.jp$/u.test(hostname)
          ? "ticketbook"
          : "other";
  return { key, label: PROVIDER_LABELS[key] };
}

export function classifyTicketUrl(value: string): TicketUrlKind {
  const canonical = canonicalizeTicketUrl(value);
  if (!canonical) return "unknown";
  const url = new URL(canonical);
  const pathAndQuery = `${url.pathname}${url.search}`.toLowerCase();
  const provider = recognizeTicketProvider(canonical).key;
  if (/(?:^|[\/_-])refund\d*(?:[\/_\.-]|$)|haraimodoshi|払い戻し|払戻/u.test(pathAndQuery)) return "refund";
  if (/(?:^|[\/_-])(?:help|faq|support|guide|contact)(?:[\/_\.-]|$)|\/hc\//u.test(pathAndQuery)) return "support";
  if (/(?:\/search(?:[_/-]|\/)|[?&](?:kw|keyword|q)=|search_all\.do)/u.test(pathAndQuery)) return "search";
  if (provider === "eplus") {
    if (/\/sf\/detail\//u.test(url.pathname)) return "event_detail";
    if (/^\/(?:sf|service|sitemap)?\/?$/u.test(url.pathname)) return "generic_provider";
    return "event_detail";
  }
  if (provider === "pia") {
    if (/\/event\/event\.do/u.test(url.pathname) && /[?&](?:eventCd|eventBundleCd)=/iu.test(url.search)) return "event_detail";
    return "generic_provider";
  }
  if (provider === "lawson") {
    if (/\/mevent\//u.test(url.pathname) && /[?&]mid=/iu.test(url.search)) return "event_detail";
    if (/\/artist\//u.test(url.pathname) || /^\/(?:concert)?\/?$/u.test(url.pathname)) return "generic_provider";
    return "event_detail";
  }
  if (provider === "ticketbook") {
    return /\/(?:event|detail|ticket)\//u.test(url.pathname) ? "event_detail" : "generic_provider";
  }
  if (/(?:livepocket\.jp\/(?:e|ticket)|tiget\.net\/events|t-dv\.com\/)/u.test(`${url.hostname}${url.pathname}`)) return "event_detail";
  return "unknown";
}

export function extractProviderEventId(value: string): string | null {
  const canonical = canonicalizeTicketUrl(value);
  if (!canonical) return null;
  const url = new URL(canonical);
  const provider = recognizeTicketProvider(canonical).key;
  if (provider === "eplus") return url.pathname.match(/\/sf\/detail\/([^/?]+)/u)?.[1] ?? null;
  if (provider === "pia") return url.searchParams.get("eventCd") ?? url.searchParams.get("eventBundleCd");
  if (provider === "lawson") return url.searchParams.get("mid");
  if (provider === "ticketbook") return url.searchParams.get("info") ?? url.pathname.split("/").filter(Boolean).at(-1) ?? null;
  return null;
}

export function ticketOfferId(eventId: string, provider: TicketProvider, providerEventId: string | null, url: string): string {
  return providerEventId
    ? `offer:${provider}:${providerEventId}`
    : `offer:${eventId}:${provider}:${encodeURIComponent(canonicalizeTicketUrl(url) ?? url)}`;
}

function saleType(kind?: PhaseKind): TicketSaleType {
  if (kind === "fc_lottery") return "fan_club_lottery";
  if (kind === "playguide_lottery") return "playguide_lottery";
  if (kind === "general") return "general_sale";
  if (kind === "resale") return "official_resale";
  return "other";
}

function phaseSaleStatus(status?: "upcoming" | "open" | "closed"): TicketSaleStatus {
  if (status === "upcoming") return "not_started";
  return status ?? "unknown";
}

export function deriveLegacyTicketOffers(event: TicketEventContext): TicketOffer[] {
  const urls = new Map<string, { url: string; phases: EventItem["phases"] }>();
  for (const phase of event.phases) {
    if (!phase.url) continue;
    const canonical = canonicalizeTicketUrl(phase.url);
    if (!canonical) continue;
    if (["support", "refund"].includes(classifyTicketUrl(canonical))) continue;
    const entry = urls.get(canonical) ?? { url: canonical, phases: [] };
    entry.phases.push(phase);
    urls.set(canonical, entry);
  }
  for (const link of event.ticketLinks) {
    const canonical = canonicalizeTicketUrl(link.url);
    if (canonical && !["support", "refund"].includes(classifyTicketUrl(canonical)) && !urls.has(canonical)) urls.set(canonical, { url: canonical, phases: [] });
  }
  return [...urls.values()].map(({ url, phases }) => {
    const phase = [...phases].sort((left, right) => {
      const rank = { open: 0, upcoming: 1, closed: 2 };
      return rank[left.status] - rank[right.status] || left.start.localeCompare(right.start);
    })[0];
    const provider = recognizeTicketProvider(url);
    const providerEventId = extractProviderEventId(url);
    return {
      id: ticketOfferId(event.id, provider.key, providerEventId, url),
      eventId: event.id,
      provider: provider.key,
      providerLabel: provider.label,
      providerEventId,
      url,
      urlKind: classifyTicketUrl(url),
      saleType: saleType(phase?.kind),
      saleStatus: phaseSaleStatus(phase?.status),
      inventoryStatus: "unknown",
      startAt: phase ? `${phase.start}T00:00:00+09:00` : null,
      endAt: phase ? `${phase.end}T23:59:59+09:00` : null,
      resultAt: null,
      paymentDeadline: null,
      eligibility: phase?.kind === "fc_lottery"
        ? event.eligibility.map((rule) => `${rule.appliesTo}：${rule.label}`)
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
      lastVerifiedAt: event.verification.checkedAt,
      matchLevel: "confirmed",
      derivedFromLegacy: true,
    };
  });
}

export function ticketOffersOf(event: TicketEventContext): TicketOffer[] {
  return event.ticketOffers?.length ? event.ticketOffers : deriveLegacyTicketOffers(event);
}

export interface TicketFreshness {
  recorded: boolean;
  verifiedAt: string | null;
  ageDays: number | null;
  isStale: boolean;
}

export function getTicketFreshness(
  offer: Pick<TicketOffer, "lastVerifiedAt">,
  now = new Date(),
): TicketFreshness {
  return ticketFreshness(offer.lastVerifiedAt, now) as TicketFreshness;
}

export function ticketUrlKindLabel(urlKind: TicketUrlKind): string {
  return coreTicketUrlKindLabel(urlKind) as string;
}

export function ticketOfferCtaLabel(offer: TicketOffer): string {
  if (offer.urlKind === "generic_provider") return "打开官方渠道页";
  if (offer.urlKind === "search") return "打开官方搜索页";
  if (offer.urlKind !== "event_detail") return "查看官方信息";
  if (offer.inventoryStatus === "sold_out") return "查看官方页面";
  if (["fan_club_lottery", "playguide_lottery"].includes(offer.saleType)) return "打开官方抽选页";
  if (offer.saleType === "official_resale") return "查看官方转售";
  return "打开官方购票页";
}

/**
 * 这些内容只是安全的操作提醒，不是本场活动的资格或设备要求。
 * 事件特定要求必须来自 TicketOffer 的明确字段。
 */
export function platformPreparationAdvice(offer: Pick<TicketOffer, "providerLabel">): string {
  return `申请前确认可登录 ${offer.providerLabel}，并在本场官方页面核对账号、手机号、电子票和同行者规则。`;
}

export function neutralizeStaleOffer(
  offer: TicketOffer,
  now = new Date(),
): TicketOffer {
  return neutralizeStaleTicketOffer(offer, now) as TicketOffer;
}

export function actionableTicketOffersOf(
  event: TicketEventContext,
  now = new Date(),
): TicketOffer[] {
  return trustedTicketOffers(ticketOffersOf(event), now) as TicketOffer[];
}

export function getRefreshPriority(offer: TicketOffer, now = new Date()): "high" | "medium" | "low" {
  if (offer.saleStatus === "open") return "high";
  const next = offer.startAt ? Date.parse(offer.startAt) : Number.NaN;
  if (Number.isFinite(next) && next >= now.getTime() && next - now.getTime() <= 7 * 86_400_000) return "high";
  if (offer.saleStatus === "not_started" || offer.saleStatus === "unknown") return "medium";
  return "low";
}

export function normalizeTicketOfferSaleStatus(offer: TicketOffer, now = new Date()): TicketOffer {
  const nowMs = now.getTime();
  const startMs = offer.startAt ? Date.parse(offer.startAt) : Number.NaN;
  const endMs = offer.endAt ? Date.parse(offer.endAt) : Number.NaN;
  if (Number.isFinite(endMs) && endMs < nowMs) return { ...offer, saleStatus: "closed" };
  if (offer.saleStatus === "closed") return offer;
  if (Number.isFinite(startMs) && startMs > nowMs) return { ...offer, saleStatus: "not_started" };
  if (Number.isFinite(startMs) && startMs <= nowMs && (!Number.isFinite(endMs) || endMs >= nowMs)) return { ...offer, saleStatus: "open" };
  return offer;
}

export interface TicketNextAction {
  label: string;
  detail: string;
  dueAt: string | null;
  url: string | null;
  urlKind: TicketUrlKind | null;
  offer: TicketOffer | null;
  applicationId: string | null;
}

export function getNextTicketAction(event: TicketEventContext, plan?: UserEventPlan): TicketNextAction {
  return selectTicketNextAction(event, plan, actionableTicketOffersOf(event)) as TicketNextAction;
}

export function getApplicationNextAction(
  event: TicketEventContext,
  application: TicketApplication,
): TicketNextAction | null {
  const offer = application.offerId
    ? actionableTicketOffersOf(event).find((item) => item.id === application.offerId) ?? null
    : null;
  return selectApplicationNextAction(event, application, offer) as TicketNextAction | null;
}

export function getOfferNextAction(event: TicketEventContext, offer: TicketOffer): TicketNextAction {
  return selectTicketNextAction(event, undefined, [neutralizeStaleOffer(offer)]) as TicketNextAction;
}
