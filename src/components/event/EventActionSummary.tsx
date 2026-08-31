"use client";

import { AlertTriangle, CheckCircle2, ExternalLink, TicketCheck } from "lucide-react";
import type { EventItem } from "@/lib/types";
import { planStatusLabel } from "@/lib/plan";
import { useEventPlans } from "@/lib/store";
import {
  getNextTicketAction,
  getTicketFreshness,
  ticketOfferCtaLabel,
  ticketUrlKindLabel,
} from "@/lib/ticket-offer";
import OfficialInstant from "@/components/ui/OfficialInstant";

function verifiedDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

export default function EventActionSummary({ event }: { event: EventItem }) {
  const { getPlan, upsertPlan } = useEventPlans();
  const plan = getPlan(event.id);
  const next = getNextTicketAction(event, plan);
  const freshness = getTicketFreshness({
    lastVerifiedAt: next.offer?.lastVerifiedAt ?? event.verification.checkedAt,
  });
  const sourceIdentity = next.offer
    ? `${next.offer.providerLabel} · ${ticketUrlKindLabel(next.offer.urlKind)}`
    : `演出官方来源 · ${event.verification.sources.length} 项`;

  return (
    <section aria-labelledby="event-action-summary-title" className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-card-dark">
      <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-1 font-bold text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
              <TicketCheck size={13} /> {plan ? planStatusLabel(plan) : "尚未加入计划"}
            </span>
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
              官方来源
            </span>
            <span className="text-zinc-500 dark:text-zinc-400">{sourceIdentity}</span>
          </div>
          <p id="event-action-summary-title" className="mt-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400">最重要的下一步</p>
          <p className="mt-1 text-lg font-bold">{next.label}</p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{next.detail}</p>
          <div className="mt-3 flex flex-wrap items-start gap-x-5 gap-y-2 text-xs">
            <div>
              <p className="font-semibold text-zinc-400">截止时间</p>
              <OfficialInstant value={next.dueAt} emptyLabel="未说明" className={next.dueAt ? "mt-1 font-bold text-zinc-700 dark:text-zinc-200" : "mt-1 font-bold text-amber-600 dark:text-amber-300"} />
            </div>
            <div>
              <p className="font-semibold text-zinc-400">最近核验</p>
              <p className={`mt-1 inline-flex items-center gap-1 font-bold ${freshness.isStale ? "text-amber-600 dark:text-amber-300" : "text-emerald-600 dark:text-emerald-300"}`}>
                {freshness.isStale ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}
                {freshness.recorded && freshness.verifiedAt ? verifiedDate(freshness.verifiedAt) : "未记录"}
                {freshness.isStale ? " · 信息可能过旧" : " · 当前核验有效"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-stretch gap-2 sm:min-w-44">
          {next.url && next.offer ? (
            <a href={next.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-bold text-white hover:bg-violet-700">
              {ticketOfferCtaLabel(next.offer)} <ExternalLink size={14} />
            </a>
          ) : !plan ? (
            <button type="button" onClick={() => upsertPlan(event.id)} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-violet-600 px-4 text-sm font-bold text-white hover:bg-violet-700">加入计划</button>
          ) : (
            <a href="#plan-manager" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-violet-600 px-4 text-sm font-bold text-white hover:bg-violet-700">管理计划</a>
          )}
          {(next.url || plan) && (
            <a href="#plan-manager" className="inline-flex min-h-11 items-center justify-center text-xs font-semibold text-zinc-500 hover:text-violet-600 dark:text-zinc-400 dark:hover:text-violet-300">
              {plan ? "编辑申请与个人任务" : "加入个人计划"}
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
