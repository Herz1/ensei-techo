import type { EventSummary } from "@/lib/types";
import { platformPreparationAdvice, ticketOffersOf } from "@/lib/ticket-offer";
import type { TripChecklistSource } from "@/lib/trip-store";

export interface EventChecklistSuggestion {
  id: string;
  label: string;
  source: Exclude<TripChecklistSource, "default" | "manual">;
  eventId: string;
}

export function eventChecklistSuggestions(event: EventSummary): EventChecklistSuggestion[] {
  const values: Omit<EventChecklistSuggestion, "id">[] = [];
  const offers = ticketOffersOf(event).filter((offer) => offer.matchLevel === "confirmed");
  for (const offer of offers) {
    const eventRequirements = [
      offer.membershipRequirement && `会员／账号：${offer.membershipRequirement}`,
      offer.regionRestriction && `地区限制：${offer.regionRestriction}`,
      offer.phoneVerification && `电话认证：${offer.phoneVerification}`,
      offer.requiresJapanesePhone === true && "本场要求日本手机号",
      offer.identityCheck === true && "本场要求本人确认证件",
      offer.ticketApp && `电子票 App：${offer.ticketApp}`,
      offer.companionRestriction && `同行者：${offer.companionRestriction}`,
      offer.ticketDistribution && `票券分配：${offer.ticketDistribution}`,
      offer.ticketDisplayAt && `票券显示：${offer.ticketDisplayAt}`,
    ].filter((label): label is string => Boolean(label));
    for (const label of eventRequirements) values.push({ label, source: "event_requirement", eventId: event.id });
    values.push({ label: platformPreparationAdvice(offer), source: "platform_advice", eventId: event.id });
  }
  values.push(
    { label: "确认个人付款状态（通用准备建议）", source: "platform_advice", eventId: event.id },
    { label: "同行者设备与票券准备（通用准备建议）", source: "platform_advice", eventId: event.id },
    { label: "手机电量与充电设备（通用准备建议）", source: "platform_advice", eventId: event.id },
    { label: "现场可用网络与离线票面（通用准备建议）", source: "platform_advice", eventId: event.id },
    { label: "交通与住宿安排（通用准备建议）", source: "platform_advice", eventId: event.id },
    { label: "核对场馆寄物信息（通用准备建议）", source: "platform_advice", eventId: event.id },
  );
  const seen = new Set<string>();
  return values.flatMap((item, index) => {
    const key = `${item.source}:${item.label}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ ...item, id: `suggestion-${event.id}-${index + 1}` }];
  });
}

export function countdownLabel(targetTimestamp: number, nowTimestamp: number): string {
  const difference = Math.max(0, targetTimestamp - nowTimestamp);
  const totalMinutes = Math.floor(difference / 60_000);
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  return [days ? `${days} 天` : "", hours ? `${hours} 小时` : "", `${minutes} 分钟`].filter(Boolean).join(" ");
}
