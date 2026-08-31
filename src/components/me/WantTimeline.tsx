"use client";

import { CalendarDays, CheckCircle2, CircleDollarSign, ClipboardList } from "lucide-react";
import type { ArtistSummary, EventSummary, VenueSummary } from "@/lib/types";
import type { PlanSectionId } from "@/lib/plan";
import type { UserEventPlan } from "@/lib/store";
import {
  APPLICATION_STATUS_LABEL,
  planApplicationSummary,
  planSection,
  planStatusLabel,
  TRIP_STATUS_LABEL,
} from "@/lib/plan";
import EventRow from "@/components/event/EventRow";
import SectionTitle from "./SectionTitle";
import { formatManualTaskWallTime, manualTaskTimeZoneLabel } from "@/lib/deadline-core.mjs";

interface PlannedEvent {
  plan: UserEventPlan;
  event: EventSummary;
}

const SECTIONS: {
  id: PlanSectionId;
  title: string;
  sub: string;
  icon: React.ReactNode;
  accent: string;
}[] = [
  {
    id: "pending",
    title: "待处理",
    sub: "已加入计划或有准备中的申请",
    icon: <ClipboardList size={17} />,
    accent: "text-amber-600 dark:text-amber-300",
  },
  {
    id: "applied",
    title: "已申请",
    sub: "各轮申请分别等待结果或保留落选历史",
    icon: <CalendarDays size={17} />,
    accent: "text-violet-600 dark:text-violet-300",
  },
  {
    id: "admission",
    title: "已中签／待入场",
    sub: "继续完成付款、出票和行程准备",
    icon: <CircleDollarSign size={17} />,
    accent: "text-emerald-600 dark:text-emerald-300",
  },
  {
    id: "attended",
    title: "已参加",
    sub: "已完成的远征记录",
    icon: <CheckCircle2 size={17} />,
    accent: "text-sky-600 dark:text-sky-300",
  },
];

function PlanItem({ item, artists, venue }: { item: PlannedEvent; artists: ArtistSummary[]; venue?: VenueSummary }) {
  const { plan, event } = item;
  const summary = planApplicationSummary(plan);
  const pendingTasks = plan.manualTasks.filter((task) => !task.done);
  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-xs text-zinc-500 dark:text-zinc-400">
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
          {planStatusLabel(plan)}
        </span>
        {plan.tripStatus !== "not_planned" && plan.tripStatus !== "attended" && (
          <span>{TRIP_STATUS_LABEL[plan.tripStatus]}</span>
        )}
        <span>准备 {summary.preparing} · 已申请 {summary.applied} · 中签 {summary.won}</span>
        {plan.applications.map((application) => (
          <span key={application.id} className="rounded-full bg-violet-50 px-2 py-0.5 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300">
            {application.label} · {APPLICATION_STATUS_LABEL[application.status]}
          </span>
        ))}
        {pendingTasks.map((task) => (
          <span key={task.id} className="font-medium text-amber-600 dark:text-amber-300">
            {task.label} · {formatManualTaskWallTime(task)} · {manualTaskTimeZoneLabel(task)}
          </span>
        ))}
      </div>
      <EventRow event={event} artists={artists} venue={venue} />
    </div>
  );
}

export default function WantTimeline({ plans, events, artists, venues }: { plans: UserEventPlan[]; events: EventSummary[]; artists: ArtistSummary[]; venues: VenueSummary[] }) {
  const eventById = new Map(events.map((event) => [event.id, event]));
  const artistById = new Map(artists.map((artist) => [artist.id, artist]));
  const venueById = new Map(venues.map((venue) => [venue.id, venue]));
  const items = plans
    .map((plan) => ({ plan, event: eventById.get(plan.eventId) }))
    .filter((item): item is PlannedEvent => Boolean(item.event))
    .sort((left, right) => left.event.date.localeCompare(right.event.date));

  return (
    <section>
      <SectionTitle
        icon={<CalendarDays size={18} />}
        title="演出计划"
        sub="按每一轮申请汇总；历史状态互不覆盖"
      />
      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-2">
        {SECTIONS.map((section) => {
          const sectionItems = items.filter((item) => planSection(item.plan) === section.id);
          return (
            <section
              key={section.id}
              aria-labelledby={`plan-section-${section.id}`}
              className="min-w-0 rounded-2xl border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-900/30"
            >
              <div className="mb-3 flex items-center gap-2 px-1">
                <span className={section.accent}>{section.icon}</span>
                <div>
                  <h3 id={`plan-section-${section.id}`} className="text-sm font-bold">
                    {section.title}
                    <span className="ml-1.5 text-xs font-normal text-zinc-400">
                      {sectionItems.length}
                    </span>
                  </h3>
                  <p className="text-xs text-zinc-400">{section.sub}</p>
                </div>
              </div>
              {sectionItems.length ? (
                <div className="min-w-0 space-y-3">
                  {sectionItems.map((item) => (
                    <PlanItem key={item.plan.eventId} item={item} artists={item.event.artistIds.map((id) => artistById.get(id)).filter((artist): artist is ArtistSummary => Boolean(artist))} venue={venueById.get(item.event.venueId)} />
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-zinc-200 py-6 text-center text-xs text-zinc-400 dark:border-zinc-700">
                  暂无记录
                </p>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}
