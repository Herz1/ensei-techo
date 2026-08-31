"use client";

import { BellRing, Heart, MapPinned, Wallet } from "lucide-react";
import type { EventSummary, VenueSummary } from "@/lib/types";
import type { UserEventPlan } from "@/lib/store";
import { formatJpy, referenceCurrencyLabel } from "@/lib/currency";
import { minPrice } from "@/components/event/status";
import { planActualTicketTotal } from "@/lib/plan";
import { usePreferences } from "@/lib/store";

function Card({
  icon,
  iconCls,
  value,
  label,
  sub,
}: {
  icon: React.ReactNode;
  iconCls: string;
  value: string;
  label: string;
  sub: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-card-dark">
      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconCls}`}>
        {icon}
      </span>
      <p className="mt-2.5 truncate text-xl font-bold tabular-nums">{value}</p>
      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-0.5 truncate text-xs text-zinc-400 dark:text-zinc-500">{sub}</p>
    </div>
  );
}

export default function StatsCards({
  upcoming,
  past,
  followedCount,
  plans,
  venues,
}: {
  upcoming: EventSummary[];
  past: EventSummary[];
  followedCount: number;
  plans: UserEventPlan[];
  venues: VenueSummary[];
}) {
  const venueById = new Map(venues.map((venue) => [venue.id, venue]));
  const { preferences } = usePreferences();
  const planById = new Map(plans.map((plan) => [plan.eventId, plan]));
  const budget = upcoming.reduce(
    (sum, event) => {
      const plan = planById.get(event.id);
      return sum + ((plan ? planActualTicketTotal(plan) : null) ?? minPrice(event) ?? 0);
    },
    0,
  );
  const prefs = new Set(
    [...upcoming, ...past]
      .map((e) => venueById.get(e.venueId)?.prefecture)
      .filter(Boolean),
  );

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Card
        icon={<Heart size={16} />}
        iconCls="bg-pink-100 text-pink-500 dark:bg-pink-500/20 dark:text-pink-300"
        value={String(upcoming.length)}
        label="计划中的公演"
        sub={past.length > 0 ? `另有 ${past.length} 场已落幕` : "未来演出计划"}
      />
      <Card
        icon={<BellRing size={16} />}
        iconCls="bg-violet-100 text-violet-500 dark:bg-violet-500/20 dark:text-violet-300"
        value={String(followedCount)}
        label="关注艺人"
        sub="新公演与受付提醒"
      />
      <Card
        icon={<Wallet size={16} />}
        iconCls="bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300"
        value={formatJpy(budget)}
        label="票价预算"
        sub={`${preferences.currency === "JPY" ? "JPY 主显示" : referenceCurrencyLabel(budget, preferences.currency)} · 中签实付优先，否则最低票档`}
      />
      <Card
        icon={<MapPinned size={16} />}
        iconCls="bg-sky-100 text-sky-600 dark:bg-sky-500/20 dark:text-sky-300"
        value={`${prefs.size}`}
        label="远征足迹"
        sub="/ 47 都道府县"
      />
    </div>
  );
}
