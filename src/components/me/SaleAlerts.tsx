"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlarmClock, BellRing, CalendarClock, ExternalLink, Ticket } from "lucide-react";
import type { ArtistSummary, EventSummary, TicketOffer } from "@/lib/types";
import type { UserEventPlan } from "@/lib/store";
import {
  getApplicationNextAction,
  getOfferNextAction,
  ticketOffersOf,
} from "@/lib/ticket-offer";
import {
  calendarDateKey,
  formatManualTaskWallTime,
  manualTaskTimeZoneLabel,
} from "@/lib/deadline-core.mjs";
import OfficialInstant from "@/components/ui/OfficialInstant";
import SectionTitle from "./SectionTitle";

type ActionGroupId = "overdue" | "today" | "week" | "later" | "unknown";

interface NextStepItem {
  key: string;
  event: EventSummary;
  title: string;
  dueAt: string | null;
  dueText: string;
  timeZone: string;
  kind: "application" | "offer" | "manual";
  sourceLabel: string;
  url?: string;
}

const GROUPS: { id: ActionGroupId; title: string; hint: string }[] = [
  { id: "overdue", title: "已逾期", hint: "时间已过，请确认实际处理状态" },
  { id: "today", title: "今天", hint: "按事项对应时区判断" },
  { id: "week", title: "未来 7 天", hint: "即将需要处理" },
  { id: "later", title: "更晚", hint: "已有明确时间" },
  { id: "unknown", title: "时间未公布", hint: "不会自动推测结果、付款或出票时间" },
];

function formatOfficialAt(value: string | null): string {
  if (!value) return "时间未公布";
  return `${new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Tokyo",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value))} JST`;
}

function actionGroup(item: NextStepItem, nowMs: number): ActionGroupId {
  const dueMs = item.dueAt ? Date.parse(item.dueAt) : Number.NaN;
  if (!Number.isFinite(dueMs)) return "unknown";
  if (dueMs < nowMs) return "overdue";
  const dueDate = calendarDateKey(dueMs, item.timeZone);
  const today = calendarDateKey(nowMs, item.timeZone);
  if (dueDate && dueDate === today) return "today";
  return dueMs <= nowMs + 7 * 86_400_000 ? "week" : "later";
}

function offerItem(event: EventSummary, offer: TicketOffer, sourceLabel: string): NextStepItem | null {
  const next = getOfferNextAction(event, offer);
  if (next.label === "已结束") return null;
  return {
    key: `offer-${event.id}-${offer.id}`,
    event,
    title: next.label,
    dueAt: next.dueAt,
    dueText: formatOfficialAt(next.dueAt),
    timeZone: "Asia/Tokyo",
    kind: "offer",
    sourceLabel,
    ...(next.url ? { url: next.url } : {}),
  };
}

export default function SaleAlerts({ plans, followed, events, compact = false }: { plans: UserEventPlan[]; followed: ArtistSummary[]; events: EventSummary[]; compact?: boolean }) {
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    const updateNow = () => setNowMs(Date.now());
    updateNow();
    const timer = window.setInterval(updateNow, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const steps = useMemo(() => {
    const eventById = new Map(events.map((event) => [event.id, event]));
    const planById = new Map(plans.map((plan) => [plan.eventId, plan]));
    const followedIds = new Set(followed.map((artist) => artist.id));
    const list: NextStepItem[] = [];

    for (const plan of plans) {
      const event = eventById.get(plan.eventId);
      if (!event || plan.tripStatus === "attended") continue;
      for (const task of plan.manualTasks) {
        if (task.done) continue;
        const application = task.linkedApplicationId
          ? plan.applications.find((item) => item.id === task.linkedApplicationId)
          : undefined;
        list.push({
          key: `manual-${event.id}-${task.id}`,
          event,
          title: task.label,
          dueAt: task.dueAt,
          dueText: `${formatManualTaskWallTime(task)} · ${manualTaskTimeZoneLabel(task)}`,
          timeZone: task.timeZone,
          kind: "manual",
          sourceLabel: application ? `个人任务 · ${application.label}` : "个人任务",
        });
      }

      const linkedOfferIds = new Set(plan.applications.flatMap((application) => application.offerId ? [application.offerId] : []));
      for (const application of plan.applications) {
        const next = getApplicationNextAction(event, application);
        if (!next) continue;
        const linked = Boolean(application.offerId && ticketOffersOf(event).some((offer) => offer.id === application.offerId));
        list.push({
          key: `application-${event.id}-${application.id}`,
          event,
          title: next.label,
          dueAt: next.dueAt,
          dueText: formatOfficialAt(next.dueAt),
          timeZone: "Asia/Tokyo",
          kind: "application",
          sourceLabel: linked ? `申请 · ${application.label}` : `个人申请 · ${application.label}`,
          ...(next.url ? { url: next.url } : {}),
        });
      }

      for (const offer of ticketOffersOf(event)) {
        if (["support", "refund"].includes(offer.urlKind) || linkedOfferIds.has(offer.id)) continue;
        const item = offerItem(event, offer, `未记录申请 · ${offer.providerLabel}`);
        if (item) list.push(item);
      }

      if (plan.applications.length === 0 && ticketOffersOf(event).length === 0) {
        list.push({
          key: `unpublished-${event.id}`,
          event,
          title: "等待官方公布",
          dueAt: null,
          dueText: "时间未公布",
          timeZone: "Asia/Tokyo",
          kind: "offer",
          sourceLabel: "演出计划",
        });
      }
    }

    for (const event of events) {
      if (planById.has(event.id) || !event.artistIds.some((id) => followedIds.has(id))) continue;
      for (const offer of ticketOffersOf(event)) {
        if (["support", "refund"].includes(offer.urlKind)) continue;
        const artist = followed.find((item) => event.artistIds.includes(item.id));
        const item = offerItem(event, offer, `关注 · ${artist?.nameJa ?? "艺人"}`);
        if (item) list.push(item);
      }
    }

    return list.sort((left, right) => {
      const leftTime = left.dueAt ? Date.parse(left.dueAt) : Number.POSITIVE_INFINITY;
      const rightTime = right.dueAt ? Date.parse(right.dueAt) : Number.POSITIVE_INFINITY;
      return leftTime - rightTime || left.key.localeCompare(right.key);
    });
  }, [plans, followed, events]);

  const grouped = useMemo(() => Object.fromEntries(GROUPS.map((group) => [
    group.id,
    steps.filter((item) => actionGroup(item, nowMs) === group.id),
  ])) as Record<ActionGroupId, NextStepItem[]>, [steps, nowMs]);
  const visibleGroups = compact
    ? GROUPS.filter((group) => grouped[group.id].length > 0)
    : GROUPS;

  return (
    <section>
      <SectionTitle icon={<AlarmClock size={18} />} title="行动中心" sub="按紧迫度排列；官方事项与个人任务分开标明" />
      {visibleGroups.length ? <div className="divide-y divide-zinc-200 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-card-dark">
        {visibleGroups.map((group) => (
          <section key={group.id} aria-labelledby={`action-group-${group.id}`} className="p-3 sm:p-4">
            <div className="mb-2 flex items-baseline justify-between gap-2 px-1">
              <h3 id={`action-group-${group.id}`} className={`text-sm font-bold ${group.id === "overdue" ? "text-red-500" : group.id === "unknown" ? "text-amber-600 dark:text-amber-300" : ""}`}>{group.title} <span className="ml-1 text-xs font-normal text-zinc-400">{grouped[group.id].length}</span></h3>
              <p className="text-xs text-zinc-400">{group.hint}</p>
            </div>
            {grouped[group.id].length ? (
              <ul className="space-y-2">
                {grouped[group.id].slice(0, compact ? 4 : undefined).map((item) => (
                  <li key={item.key} className="flex flex-col gap-3 rounded-xl bg-zinc-50 px-3.5 py-3 sm:flex-row sm:items-center dark:bg-zinc-900/60">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${item.kind === "manual" ? "bg-amber-100 text-amber-600 dark:bg-amber-500/20" : item.kind === "application" ? "bg-violet-100 text-violet-600 dark:bg-violet-500/20" : "bg-sky-100 text-sky-600 dark:bg-sky-500/20"}`}>
                      {item.kind === "manual" ? <CalendarClock size={14} /> : <Ticket size={14} />}
                    </span>
                    <Link href={`/events/${item.event.id}#plan-manager`} prefetch={false} className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-xs"><span className="font-bold text-zinc-700 dark:text-zinc-200">{item.title}</span><span className="rounded bg-white px-1.5 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800">{item.sourceLabel}</span></p>
                      <p className="mt-0.5 truncate text-sm font-semibold hover:text-brand-strong">{item.event.titleJa}</p>
                    </Link>
                    <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
                      <p className={`text-right text-xs font-bold tabular-nums ${group.id === "overdue" ? "text-red-500" : group.id === "unknown" ? "text-amber-600 dark:text-amber-300" : "text-zinc-600 dark:text-zinc-300"}`}>
                        {group.id === "overdue" ? "已逾期 · " : ""}
                        {item.kind === "manual"
                          ? item.dueText
                          : <OfficialInstant value={item.dueAt} emptyLabel="时间未公布" localClassName="mt-1 text-xs font-normal text-zinc-400" />}
                      </p>
                      {item.url ? <a href={item.url} target="_blank" rel="noreferrer" aria-label={`打开官方渠道：${item.sourceLabel}`} className="inline-flex h-11 w-11 items-center justify-center rounded-full text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-500/10"><ExternalLink size={14} /></a> : <BellRing size={14} className="text-zinc-300" />}
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="py-4 text-center text-xs text-zinc-400">暂无事项</p>}
            {compact && grouped[group.id].length > 4 && (
              <Link href="/me" prefetch={false} className="mt-2 inline-flex min-h-11 items-center text-xs font-semibold text-violet-600 dark:text-violet-300">查看其余 {grouped[group.id].length - 4} 项</Link>
            )}
          </section>
        ))}
      </div> : (
        <p className="rounded-2xl border border-dashed border-zinc-300 py-8 text-center text-sm text-zinc-400 dark:border-zinc-700">当前没有需要处理的票务动作。</p>
      )}
    </section>
  );
}
