function offerActionLabel(offer) {
  if (offer.urlKind !== "event_detail") return "前往官方渠道确认";
  if (["fan_club_lottery", "playguide_lottery"].includes(offer.saleType)) return "申请抽选";
  if (offer.saleType === "official_resale") return "查看官方转售";
  return "前往购票";
}

function result(action, application, offer) {
  return {
    ...action,
    applicationId: application?.id ?? null,
    offer: offer ?? null,
    url: action.url ?? offer?.url ?? null,
    urlKind: action.urlKind ?? offer?.urlKind ?? null,
  };
}

/** 申请状态只读取其关联 Offer；未知的结果、付款或出票时间保持 null。 */
export function selectApplicationNextAction(event, application, offer) {
  if (!application || ["lost", "cancelled"].includes(application.status)) return null;
  if (event.eventStatus === "cancelled") {
    return result({ label: "公演已取消", detail: "请按此申请关联的官方来源确认后续", dueAt: null, url: offer?.sourceUrl ?? null }, application, offer);
  }
  if (["postponed", "rescheduled"].includes(event.eventStatus)) {
    return result({ label: "确认变更后的申请安排", detail: "日期或安排发生变化", dueAt: null, url: offer?.sourceUrl ?? null }, application, offer);
  }
  if (event.eventStatus === "completed") return null;

  if (application.status === "ticketed") {
    return result({ label: "准备入场", detail: "确认此轮票券与行程", dueAt: `${event.date}T${event.startTime}:00+09:00`, url: null }, application, null);
  }
  if (application.status === "paid") {
    return result({ label: "等待出票", detail: "出票时间未说明时不推测", dueAt: null }, application, offer);
  }
  if (application.status === "won") {
    return result({
      label: offer?.paymentDeadline ? "完成付款" : "确认付款期限",
      detail: offer?.paymentDeadline ? "按关联官方渠道的期限完成付款" : "付款期限未说明",
      dueAt: offer?.paymentDeadline ?? null,
    }, application, offer);
  }
  if (application.status === "applied") {
    return result({
      label: offer?.resultAt ? "确认抽选结果" : "等待结果公布",
      detail: offer?.resultAt ? "按关联官方渠道公布时间确认" : "结果公布时间未说明",
      dueAt: offer?.resultAt ?? null,
    }, application, offer);
  }

  if (!offer) {
    return result({
      label: "完成个人申请准备",
      detail: "个人记录，未关联官方渠道",
      dueAt: null,
      url: null,
    }, application, null);
  }
  if (offer.inventoryStatus === "sold_out") {
    return result({ label: "确认此轮渠道状态", detail: "该渠道上次显示已售罄，不代表整个 Event 售罄", dueAt: null }, application, offer);
  }
  if (offer.saleStatus === "open") {
    return result({ label: "完成此轮申请", detail: offer.endAt ? "关联受付进行中" : "截止时间未说明", dueAt: offer.endAt }, application, offer);
  }
  if (offer.saleStatus === "not_started") {
    return result({ label: "等待此轮受付开始", detail: offer.startAt ? "官方已公布开始时间" : "开始时间未说明", dueAt: offer.startAt }, application, offer);
  }
  if (offer.saleStatus === "closed") {
    return result({ label: "确认此轮申请记录", detail: "受付结束不等于售罄", dueAt: null, url: offer.sourceUrl }, application, offer);
  }
  return result({ label: "确认此轮官方受付状态", detail: "当前受付状态未说明", dueAt: null }, application, offer);
}

function sortedOffers(offers) {
  return [...offers]
    .filter((offer) => !["support", "refund"].includes(offer.urlKind))
    .sort((left, right) => {
      const rank = { open: 0, not_started: 1, announced: 2, unknown: 3, closed: 4 };
      const inventoryRank = { available: 0, low: 1, unknown: 2, sold_out: 3 };
      return (rank[left.saleStatus] ?? 5) - (rank[right.saleStatus] ?? 5)
        || (inventoryRank[left.inventoryStatus] ?? 4) - (inventoryRank[right.inventoryStatus] ?? 4)
        || (left.endAt ?? left.startAt ?? "9999").localeCompare(right.endAt ?? right.startAt ?? "9999");
    });
}

function selectOfferOpportunity(event, actionable) {
  if (!actionable) return { label: "等待官方公布", detail: "尚无可确认的购票渠道", dueAt: null, url: null, urlKind: null, offer: null, applicationId: null };
  if (actionable.inventoryStatus === "sold_out") return { label: "该渠道显示已售罄", detail: "仅代表此 Offer；其他官方渠道需分别确认", dueAt: null, url: actionable.url, urlKind: actionable.urlKind, offer: actionable, applicationId: null };
  if (actionable.saleStatus === "open") return { label: offerActionLabel(actionable), detail: actionable.endAt ? "受付进行中" : "截止时间未说明", dueAt: actionable.endAt, url: actionable.url, urlKind: actionable.urlKind, offer: actionable, applicationId: null };
  if (actionable.saleStatus === "not_started") return { label: "等待受付开始", detail: actionable.startAt ? "官方已公布开始时间" : "开始时间未说明", dueAt: actionable.startAt, url: actionable.url, urlKind: actionable.urlKind, offer: actionable, applicationId: null };
  if (actionable.saleStatus === "closed") return { label: "等待后续官方渠道", detail: "受付结束不等于售罄", dueAt: null, url: actionable.sourceUrl, urlKind: actionable.urlKind, offer: actionable, applicationId: null };
  return { label: actionable.urlKind === "event_detail" ? "确认官方受付状态" : "前往官方渠道确认", detail: "当前受付状态未说明", dueAt: null, url: actionable.url, urlKind: actionable.urlKind, offer: actionable, applicationId: null };
}

export function selectTicketNextAction(event, plan, offers) {
  const sorted = sortedOffers(offers);
  const actionable = sorted[0] ?? null;
  if (event.eventStatus === "cancelled") return { label: "公演已取消", detail: "请查看官方来源", dueAt: null, url: actionable?.sourceUrl ?? null, urlKind: actionable?.urlKind ?? null, offer: actionable, applicationId: null };
  if (event.eventStatus === "postponed" || event.eventStatus === "rescheduled") return { label: "确认变更后的公演信息", detail: "日期或安排发生变化", dueAt: null, url: actionable?.sourceUrl ?? null, urlKind: actionable?.urlKind ?? null, offer: actionable, applicationId: null };
  if (plan?.tripStatus === "attended" || event.eventStatus === "completed") return { label: "已结束", detail: "没有待处理票务事项", dueAt: null, url: null, urlKind: null, offer: null, applicationId: null };

  const offerById = new Map(sorted.map((offer) => [offer.id, offer]));
  const applicationActions = (plan?.applications ?? [])
    .map((application) => selectApplicationNextAction(event, application, application.offerId ? offerById.get(application.offerId) ?? null : null))
    .filter(Boolean)
    .sort((left, right) => {
      const leftTime = left.dueAt ? Date.parse(left.dueAt) : Number.POSITIVE_INFINITY;
      const rightTime = right.dueAt ? Date.parse(right.dueAt) : Number.POSITIVE_INFINITY;
      return leftTime - rightTime || String(left.applicationId).localeCompare(String(right.applicationId));
    });
  return applicationActions[0] ?? selectOfferOpportunity(event, actionable);
}
