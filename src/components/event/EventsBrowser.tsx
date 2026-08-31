"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CalendarDays,
  Check,
  List,
  Map as MapIcon,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type {
  ArtistSummary,
  EventSummary,
  EventType,
  RegionId,
  VenueSummary,
  VenueTier,
} from "@/lib/types";
import { prefectures, regionNames } from "@/data/prefectures";
import { addDays, formatJaDate, todayJst } from "@/lib/time";
import { useFollows } from "@/lib/store";
import MapClient from "@/components/map/MapClient";
import EventRow from "./EventRow";
import { minPrice } from "./status";
import { actionableTicketOffersOf, ticketOffersOf } from "@/lib/ticket-offer";

type View = "list" | "calendar" | "map";
type StatusFilter = "all" | "selling" | "sold_out" | "announced" | "ended";
type SaleFilter = "all" | "open" | "upcoming";
type SortKey = "date" | "deadline" | "price";

const VIEW_TABS: { key: View; label: string; icon: React.ReactNode }[] = [
  { key: "list", label: "列表", icon: <List size={14} /> },
  { key: "calendar", label: "日历", icon: <CalendarDays size={14} /> },
  { key: "map", label: "地图", icon: <MapIcon size={14} /> },
];

const FIELD =
  "h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 outline-none focus:border-violet-400 dark:border-zinc-700 dark:bg-card-dark dark:text-zinc-200";

function matchQuery(
  event: EventSummary,
  query: string,
  artistById: ReadonlyMap<string, ArtistSummary>,
  venueById: ReadonlyMap<string, VenueSummary>,
): boolean {
  const needle = query.toLowerCase();
  if (
    event.titleJa.toLowerCase().includes(needle) ||
    event.titleZh.toLowerCase().includes(needle) ||
    event.tourName?.toLowerCase().includes(needle)
  ) return true;
  const venue = venueById.get(event.venueId);
  if (
    venue &&
    (venue.nameJa.toLowerCase().includes(needle) ||
      venue.nameZh?.toLowerCase().includes(needle) ||
      venue.city?.toLowerCase().includes(needle))
  ) return true;
  return event.artistIds.some((id) => {
    const artist = artistById.get(id);
    if (!artist) return false;
    return [artist.nameJa, artist.nameZh, artist.romaji, artist.kana, ...artist.aliases]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle));
  });
}

function actionDate(event: EventSummary): string | null {
  const offers = actionableTicketOffersOf(event);
  const open = offers
    .filter((offer) => offer.saleStatus === "open" && offer.endAt)
    .sort((left, right) => String(left.endAt).localeCompare(String(right.endAt)))[0];
  if (open?.endAt) return open.endAt.slice(0, 10);
  const upcoming = offers
    .filter((offer) => offer.saleStatus === "not_started" && offer.startAt)
    .sort((left, right) => String(left.startAt).localeCompare(String(right.startAt)))[0];
  return upcoming?.startAt?.slice(0, 10) ?? null;
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="text-xs font-semibold text-zinc-500">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={FIELD}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

export default function EventsBrowser({
  events,
  artists,
  venues,
}: {
  events: EventSummary[];
  artists: ArtistSummary[];
  venues: VenueSummary[];
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const today = todayJst();
  const { items: followedIds } = useFollows();
  const followedSet = useMemo(() => new Set(followedIds), [followedIds]);
  const artistById = useMemo(
    () => new Map(artists.map((artist) => [artist.id, artist])),
    [artists],
  );
  const venueById = useMemo(
    () => new Map(venues.map((venue) => [venue.id, venue])),
    [venues],
  );

  const legacyDate = searchParams.get("date");
  const view = (["list", "calendar", "map"].includes(searchParams.get("view") ?? "")
    ? searchParams.get("view")
    : "list") as View;
  const start = searchParams.get("start") ?? (
    legacyDate === "today" || legacyDate === "week" || legacyDate === "month"
      ? today
      : ""
  );
  const end = searchParams.get("end") ?? (
    legacyDate === "today"
      ? today
      : legacyDate === "week"
        ? addDays(today, 7)
        : legacyDate === "month"
          ? addDays(today, 30)
          : ""
  );
  const region = searchParams.get("region") ?? "all";
  const prefecture = searchParams.get("pref") ?? "all";
  const type = searchParams.get("type") ?? "all";
  const status = (searchParams.get("status") ?? "all") as StatusFilter;
  const sale = (searchParams.get("sale") === "soon"
    ? "upcoming"
    : searchParams.get("sale") ?? "all") as SaleFilter;
  const tier = searchParams.get("tier") ?? "all";
  const sort = (searchParams.get("sort") ?? "date") as SortKey;
  const followedOnly = searchParams.get("followed") === "1";
  const officialOnly = searchParams.get("official") === "1";
  const query = searchParams.get("q") ?? "";
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const queryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!mobileFiltersOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileFiltersOpen(false);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [mobileFiltersOpen]);

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (!value || value === "all" || (key === "view" && value === "list")) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    }
    next.delete("date");
    const queryString = next.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
  };

  const filtered = useMemo(() => {
    let list = events.filter((event) =>
      status === "ended" ? event.status === "ended" : event.date >= today,
    );
    if (query) list = list.filter((event) => matchQuery(event, query, artistById, venueById));
    if (start) list = list.filter((event) => event.date >= start);
    if (end) list = list.filter((event) => event.date <= end);
    if (followedOnly) {
      list = list.filter((event) =>
        event.artistIds.some((artistId) => followedSet.has(artistId)),
      );
    }
    if (officialOnly) {
      list = list.filter((event) =>
        ticketOffersOf(event).some((offer) => offer.urlKind === "event_detail"),
      );
    }
    if (sale === "open") {
      list = list.filter((event) => actionableTicketOffersOf(event).some((offer) => offer.saleStatus === "open"));
    }
    if (sale === "upcoming") {
      list = list.filter((event) => actionableTicketOffersOf(event).some((offer) => offer.saleStatus === "not_started"));
    }
    if (region !== "all") {
      const prefectureIds = new Set(
        prefectures
          .filter((item) => item.region === region)
          .map((item) => item.id),
      );
      list = list.filter((event) => {
        const venue = venueById.get(event.venueId);
        return venue ? prefectureIds.has(venue.prefecture) : false;
      });
    }
    if (prefecture !== "all") {
      list = list.filter(
        (event) => venueById.get(event.venueId)?.prefecture === prefecture,
      );
    }
    if (tier !== "all") {
      list = list.filter((event) => venueById.get(event.venueId)?.tier === tier);
    }
    if (type !== "all") {
      list = list.filter((event) => event.type === (type as EventType));
    }
    if (status === "selling") {
      list = list.filter((event) => ["lottery", "on_sale", "resale"].includes(event.status));
    }
    if (status === "sold_out") list = list.filter((event) => event.status === "sold_out");
    if (status === "announced") list = list.filter((event) => event.status === "announced");

    return [...list].sort((left, right) => {
      if (sort === "deadline") {
        const leftAction = actionDate(left) ?? "9999-12-31";
        const rightAction = actionDate(right) ?? "9999-12-31";
        const compared = leftAction.localeCompare(rightAction);
        if (compared !== 0) return compared;
      }
      if (sort === "price") {
        const leftPrice = minPrice(left) ?? Number.MAX_SAFE_INTEGER;
        const rightPrice = minPrice(right) ?? Number.MAX_SAFE_INTEGER;
        if (leftPrice !== rightPrice) return leftPrice - rightPrice;
      }
      const dateCompared = left.date.localeCompare(right.date);
      return dateCompared !== 0 ? dateCompared : left.startTime.localeCompare(right.startTime);
    });
  }, [artistById, end, events, followedOnly, followedSet, officialOnly, prefecture, query, region, sale, sort, start, status, tier, today, type, venueById]);

  const activePrefectures = region === "all"
    ? prefectures
    : prefectures.filter((item) => item.region === (region as RegionId));
  const mapEventIds = useMemo(() => filtered.map((event) => event.id), [filtered]);
  const calendarGroups = useMemo(() => {
    const groups = new Map<string, EventSummary[]>();
    for (const event of filtered.slice(0, 120)) {
      groups.set(event.date, [...(groups.get(event.date) ?? []), event]);
    }
    return [...groups.entries()];
  }, [filtered]);

  const activeFilters: { key: string; label: string; clear: Record<string, null> }[] = [
    ...(start || end ? [{ key: "date", label: `日期 ${start || "不限"} ～ ${end || "不限"}`, clear: { start: null, end: null } }] : []),
    ...(region !== "all" ? [{ key: "region", label: regionNames[region as RegionId]?.zh ?? region, clear: { region: null, pref: null } }] : []),
    ...(prefecture !== "all" ? [{ key: "pref", label: prefectures.find((item) => item.id === prefecture)?.nameZh ?? prefecture, clear: { pref: null } }] : []),
    ...(type !== "all" ? [{ key: "type", label: { oneman: "ワンマン", taiban: "対バン", fes: "音乐节", idol_seiyu: "偶像／声优", release_event: "リリイベ" }[type] ?? type, clear: { type: null } }] : []),
    ...(status !== "all" ? [{ key: "status", label: { selling: "受付／发售中", sold_out: "已售罄", announced: "已公布", ended: "已结束" }[status] ?? status, clear: { status: null } }] : []),
    ...(sale !== "all" ? [{ key: "sale", label: sale === "open" ? "售票／受付中" : "即将开票", clear: { sale: null } }] : []),
    ...(tier !== "all" ? [{ key: "tier", label: `场馆 ${tier}`, clear: { tier: null } }] : []),
    ...(followedOnly ? [{ key: "followed", label: "仅关注艺人", clear: { followed: null } }] : []),
    ...(officialOnly ? [{ key: "official", label: "有具体购票页", clear: { official: null } }] : []),
    ...(sort !== "date" ? [{ key: "sort", label: sort === "deadline" ? "按最近截止" : "按最低价格", clear: { sort: null } }] : []),
  ];

  const renderViewTabs = () => (
    <div className="inline-flex rounded-full border border-zinc-200 bg-white p-1 dark:border-zinc-700 dark:bg-card-dark">
      {VIEW_TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          aria-pressed={view === tab.key}
          onClick={() => update({ view: tab.key })}
          className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
            view === tab.key ? "bg-brand text-white" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          }`}
        >
          {tab.icon}{tab.label}
        </button>
      ))}
    </div>
  );

  const renderFilterControls = () => (
    <div className="grid gap-3 sm:grid-cols-2 md:flex md:flex-wrap md:items-end md:gap-2">
      <label className="text-xs font-semibold text-zinc-500">
        开始日期
        <input type="date" value={start} onChange={(event) => update({ start: event.target.value || null })} className={`mt-1 block w-full ${FIELD}`} />
      </label>
      <label className="text-xs font-semibold text-zinc-500">
        结束日期
        <input type="date" value={end} onChange={(event) => update({ end: event.target.value || null })} className={`mt-1 block w-full ${FIELD}`} />
      </label>
      <div className="flex gap-1 sm:col-span-2 lg:col-span-1">
        {[
          { label: "今天", days: 0 },
          { label: "7 天", days: 7 },
          { label: "30 天", days: 30 },
        ].map((quick) => (
          <button key={quick.label} type="button" onClick={() => update({ start: today, end: addDays(today, quick.days) })} className="min-h-11 flex-1 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-500 hover:border-violet-300 lg:flex-none dark:border-zinc-700 dark:bg-card-dark">{quick.label}</button>
        ))}
      </div>
      <button type="button" aria-pressed={followedOnly} onClick={() => update({ followed: followedOnly ? null : "1" })} className={`inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border px-3 text-xs font-semibold ${followedOnly ? "border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" : "border-zinc-200 bg-white text-zinc-500 dark:border-zinc-700 dark:bg-card-dark"}`}>
        {followedOnly && <Check size={12} />} 仅关注艺人
      </button>
      <button type="button" aria-pressed={officialOnly} onClick={() => update({ official: officialOnly ? null : "1" })} className={`inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border px-3 text-xs font-semibold ${officialOnly ? "border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" : "border-zinc-200 bg-white text-zinc-500 dark:border-zinc-700 dark:bg-card-dark"}`}>
        {officialOnly && <Check size={12} />} 有具体购票页
      </button>
      <Select label="售票阶段" value={sale} onChange={(value) => update({ sale: value })} options={[
        { value: "all", label: "全部售票阶段" },
        { value: "open", label: "售票／受付中" },
        { value: "upcoming", label: "即将开票" },
      ]} />
      <Select label="场馆等级" value={tier} onChange={(value) => update({ tier: value })} options={[
        { value: "all", label: "全部场馆等级" },
        { value: "livehouse", label: "Livehouse" },
        { value: "hall", label: "音乐厅" },
        { value: "arena", label: "竞技馆" },
        { value: "dome", label: "巨蛋" },
        { value: "stadium", label: "体育场" },
      ] satisfies { value: VenueTier | "all"; label: string }[]} />
      <Select label="地区" value={region} onChange={(value) => update({ region: value, pref: null })} options={[
        { value: "all", label: "全部地区" },
        ...Object.entries(regionNames).map(([value, name]) => ({ value, label: name.zh })),
      ]} />
      <Select label="都道府县" value={prefecture} onChange={(value) => update({ pref: value })} options={[
        { value: "all", label: "全部都道府县" },
        ...activePrefectures.map((item) => ({ value: item.id, label: item.nameZh })),
      ]} />
      <Select label="公演类型" value={type} onChange={(value) => update({ type: value })} options={[
        { value: "all", label: "全部类型" },
        { value: "oneman", label: "ワンマン" },
        { value: "idol_seiyu", label: "偶像／声优" },
        { value: "taiban", label: "対バン" },
        { value: "fes", label: "音乐节" },
        { value: "release_event", label: "リリイベ" },
      ]} />
      <Select label="公演状态" value={status} onChange={(value) => update({ status: value })} options={[
        { value: "all", label: "全部状态" },
        { value: "selling", label: "受付／发售中" },
        { value: "announced", label: "已公布" },
        { value: "sold_out", label: "已售罄" },
        { value: "ended", label: "已结束" },
      ]} />
      <Select label="排序" value={sort} onChange={(value) => update({ sort: value })} options={[
        { value: "date", label: "按公演日期" },
        { value: "deadline", label: "按最近截止" },
        { value: "price", label: "按最低价格" },
      ]} />
    </div>
  );

  return (
    <div>
      <div className="sticky top-14 z-30 -mx-4 border-b border-zinc-200 bg-surface/95 px-4 py-3 backdrop-blur-md md:hidden dark:border-zinc-800 dark:bg-surface-dark/95">
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            update({ q: queryInputRef.current?.value.trim() || null });
          }}
        >
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">搜索公演</span>
            <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-400" />
            <input
              key={query}
              ref={queryInputRef}
              defaultValue={query}
              placeholder="搜索艺人、场地或巡演"
              className="h-11 w-full rounded-xl border border-zinc-200 bg-white pr-3 pl-9 text-sm outline-none dark:border-zinc-700 dark:bg-card-dark"
            />
          </label>
          <button type="submit" className="sr-only">执行搜索</button>
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={mobileFiltersOpen}
            onClick={() => setMobileFiltersOpen(true)}
            className="relative inline-flex h-11 items-center gap-1 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-600 dark:border-zinc-700 dark:bg-card-dark dark:text-zinc-300"
          >
            <SlidersHorizontal size={16} /> 筛选
            {activeFilters.length > 0 && <span className="rounded-full bg-violet-600 px-1.5 text-xs text-white">{activeFilters.length}</span>}
          </button>
        </form>
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">{filtered.length} 场结果</p>
          {renderViewTabs()}
        </div>
        {activeFilters.length > 0 && (
          <div aria-label="已启用筛选" className="mt-2 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {activeFilters.map((filter) => (
              <button key={filter.key} type="button" onClick={() => update(filter.clear)} aria-label={`移除筛选：${filter.label}`} className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full bg-violet-50 px-3 text-xs font-semibold text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                {filter.label} <X size={12} />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="sticky top-14 z-30 -mx-4 hidden border-b border-zinc-200 bg-surface/95 px-4 py-3 backdrop-blur-md md:block dark:border-zinc-800 dark:bg-surface-dark/95">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {renderViewTabs()}
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-zinc-500">{filtered.length} 场结果</span>
            <button type="button" onClick={() => router.replace(pathname, { scroll: false })} className="inline-flex min-h-10 items-center gap-1 px-2 text-xs font-semibold text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">
              <RotateCcw size={13} /> 清除筛选
            </button>
          </div>
        </div>
        <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          {renderFilterControls()}
        </div>
        {query && <p className="mt-2 text-xs text-zinc-500">搜索「<span className="font-semibold text-brand-strong">{query}</span>」</p>}
      </div>

      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/45 md:hidden" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setMobileFiltersOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="mobile-filter-title" className="max-h-[88dvh] w-full overflow-hidden rounded-t-3xl bg-white shadow-2xl dark:bg-zinc-900">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <div>
                <h2 id="mobile-filter-title" className="text-base font-bold">筛选与排序</h2>
                <p className="text-xs text-zinc-400">当前 {filtered.length} 场结果</p>
              </div>
              <button type="button" aria-label="关闭筛选" onClick={() => setMobileFiltersOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"><X size={18} /></button>
            </div>
            <div className="max-h-[calc(88dvh-8rem)] overflow-y-auto p-4 pb-8">
              {renderFilterControls()}
              <div className="mt-5 flex gap-2">
                <button type="button" onClick={() => router.replace(pathname, { scroll: false })} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-xl border border-zinc-300 text-sm font-semibold text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"><RotateCcw size={14} /> 清除</button>
                <button type="button" onClick={() => setMobileFiltersOpen(false)} className="min-h-11 flex-[2] rounded-xl bg-violet-600 text-sm font-bold text-white">查看 {filtered.length} 场公演</button>
              </div>
            </div>
          </section>
        </div>
      )}

      <div className="mt-4 mb-3 hidden items-center justify-between text-xs text-zinc-400 md:flex">
        <p>筛选状态保存在当前 URL，可复制分享</p>
      </div>

      {view === "map" ? (
        <div className="h-[calc(100dvh-14rem)] min-h-[520px] overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <MapClient eventIds={mapEventIds} events={events} venues={venues} />
        </div>
      ) : view === "calendar" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {calendarGroups.map(([date, dateEvents]) => (
            <section key={date} className="rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-card-dark">
              <h2 className="mb-2 text-sm font-bold text-zinc-600 dark:text-zinc-300">{formatJaDate(date)} <span className="ml-1 text-xs font-normal text-zinc-400">{dateEvents.length} 场</span></h2>
              <div className="space-y-2">
                {dateEvents.map((event) => <EventRow key={event.id} event={event} artists={event.artistIds.map((id) => artistById.get(id)).filter((artist): artist is ArtistSummary => Boolean(artist))} venue={venueById.get(event.venueId)} />)}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.slice(0, 120).map((event) => <EventRow key={event.id} event={event} artists={event.artistIds.map((id) => artistById.get(id)).filter((artist): artist is ArtistSummary => Boolean(artist))} venue={venueById.get(event.venueId)} />)}
        </div>
      )}

      {filtered.length === 0 && (
        <p className="rounded-2xl border border-dashed border-zinc-300 py-16 text-center text-sm text-zinc-400 dark:border-zinc-700">没有符合条件的公演，请调整筛选。</p>
      )}
      {view !== "map" && filtered.length > 120 && (
        <p className="py-4 text-center text-xs text-zinc-400">仅显示前 120 条，请继续缩小日期或地区范围。</p>
      )}
    </div>
  );
}
