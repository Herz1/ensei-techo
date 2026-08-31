export const TICKET_STALE_AFTER_DAYS = 30;

const DAY_MS = 86_400_000;

const URL_KIND_LABELS = {
  event_detail: "具体场次",
  search: "官方搜索页",
  generic_provider: "通用渠道页",
  support: "官方帮助页",
  refund: "官方退款页",
  unknown: "官方信息页",
};

export function ticketUrlKindLabel(urlKind) {
  return URL_KIND_LABELS[urlKind] ?? URL_KIND_LABELS.unknown;
}

export function ticketFreshness(lastVerifiedAt, now = new Date()) {
  const verifiedMs = typeof lastVerifiedAt === "string"
    ? Date.parse(lastVerifiedAt)
    : Number.NaN;
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(String(now));
  if (!Number.isFinite(verifiedMs) || !Number.isFinite(nowMs)) {
    return {
      recorded: false,
      verifiedAt: null,
      ageDays: null,
      isStale: true,
    };
  }
  const ageDays = Math.max(0, Math.floor((nowMs - verifiedMs) / DAY_MS));
  return {
    recorded: true,
    verifiedAt: new Date(verifiedMs).toISOString(),
    ageDays,
    isStale: nowMs - verifiedMs > TICKET_STALE_AFTER_DAYS * DAY_MS,
  };
}

/**
 * 过旧或未记录核验时间的 Offer 仍保留官方跳转和历史字段，但不能参与
 * “正在受付/实时库存”的当前状态判断。
 */
export function neutralizeStaleTicketOffer(offer, now = new Date()) {
  const freshness = ticketFreshness(offer?.lastVerifiedAt, now);
  if (!freshness.isStale) return offer;
  return {
    ...offer,
    saleStatus: "unknown",
    inventoryStatus: "unknown",
  };
}

export function trustedTicketOffers(offers, now = new Date()) {
  return (offers ?? []).map((offer) => neutralizeStaleTicketOffer(offer, now));
}

/** Event 级 SOLD OUT 只接受正式 Event 自身的明确状态，不从单个渠道推导。 */
export function deriveEventDisplayStatus(event, offers, today, now = new Date()) {
  if (event.date < today || event.eventStatus === "completed") return "ended";
  if (event.status === "sold_out") return "sold_out";
  const currentOffers = trustedTicketOffers(offers, now);
  if (currentOffers.some((offer) => offer.saleType === "official_resale" && offer.saleStatus === "open")) return "resale";
  if (currentOffers.some((offer) => ["fan_club_lottery", "playguide_lottery"].includes(offer.saleType) && offer.saleStatus === "open")) return "lottery";
  if (currentOffers.some((offer) => offer.saleType === "general_sale" && offer.saleStatus === "open")) return "on_sale";
  return "announced";
}
