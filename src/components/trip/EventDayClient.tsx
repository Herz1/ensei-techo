"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BatteryCharging, CheckCircle2, Circle, Clock3, ExternalLink, IdCard, MapPin, Navigation, Printer, Route, Smartphone, Ticket, Users, Wifi } from "lucide-react";
import type { EventSummary, VenueSummary } from "@/lib/types";
import { READINESS_STATUS_LABEL } from "@/lib/plan";
import { useEventPlans } from "@/lib/store";
import { eventChecklistSuggestions, countdownLabel } from "@/lib/event-day";
import { ticketOffersOf } from "@/lib/ticket-offer";
import { buildTripTimeline, estimatedEnd, mapsRouteUrl, venueDestination } from "@/lib/trip";
import { newTripItemId, type TripChecklistItem, useTripPlans } from "@/lib/trip-store";
import { jstDate } from "@/lib/time";

const CARD = "rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-card-dark";
const SOURCE_LABEL = { event_requirement: "本场官方要求", platform_advice: "平台／通用建议", default: "基础清单", manual: "个人添加" } as const;

function display(value: string | undefined | null) { return value?.trim() || "未说明"; }

export default function EventDayClient({ tripId, events, venues }: { tripId: string; events: EventSummary[]; venues: VenueSummary[] }) {
  const { trips, updateTrip } = useTripPlans();
  const { getPlan } = useEventPlans();
  const eventById = useMemo(() => new Map(events.map((event) => [event.id, event])), [events]);
  const venueById = useMemo(() => new Map(venues.map((venue) => [venue.id, venue])), [venues]);
  const catalog = useMemo(() => ({ eventById, venueById }), [eventById, venueById]);
  const trip = trips.find((item) => item.id === tripId);
  const formalEvents = useMemo(() => trip?.eventIds.map((id) => eventById.get(id)).filter((event): event is NonNullable<typeof event> => Boolean(event)) ?? [], [eventById, trip]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  if (!trip) return <div className="mx-auto max-w-xl px-4 py-20 text-center"><h1 className="text-xl font-bold">远征不存在或仍在读取</h1><Link href="/trips" prefetch={false} className="mt-5 inline-flex rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white">返回远征</Link></div>;
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const event = formalEvents.find((item) => item.id === selectedEventId)
    ?? formalEvents.find((item) => item.date === today)
    ?? formalEvents[0];
  if (!event) return <div className="mx-auto max-w-xl px-4 py-20 text-center"><h1 className="text-xl font-bold">此远征没有可用演出</h1><Link href={`/trips/${trip.id}`} prefetch={false} className="mt-5 inline-flex rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white">返回远征详情</Link></div>;

  const saveChecklist = (checklist: TripChecklistItem[]) => updateTrip(trip.id, { checklist });
  const venue = venueById.get(event.venueId);
  const plan = getPlan(event.id);
  const application = plan?.applications.findLast((item) => ["ticketed", "paid", "won"].includes(item.status));
  const linkedOffer = application?.offerId ? ticketOffersOf(event).find((offer) => offer.id === application.offerId) : undefined;
  const confirmedOffers = ticketOffersOf(event).filter((offer) => offer.matchLevel === "confirmed");
  const ticketApp = linkedOffer?.ticketApp ?? confirmedOffers.find((offer) => offer.ticketApp)?.ticketApp;
  const identityCheck = linkedOffer?.identityCheck ?? confirmedOffers.find((offer) => offer.identityCheck !== null)?.identityCheck ?? null;
  const suggestions = eventChecklistSuggestions(event);
  const dayItems = buildTripTimeline(trip, catalog).filter((item) => item.date === event.date && item.time);
  const timedItems = dayItems.map((item) => ({ item, timestamp: jstDate(item.date, item.time!).getTime() }));
  const next = timedItems.find((entry) => entry.timestamp > now);
  const end = estimatedEnd(event, trip);
  const eventOpen = jstDate(event.date, event.openTime).getTime();
  const isEventNow = now >= eventOpen && now < end.timestamp;
  const current = isEventNow
    ? { title: event.titleJa, detail: now < jstDate(event.date, event.startTime).getTime() ? "已开场，等待开演" : "演出进行区间" }
    : [...timedItems].reverse().find((entry) => entry.timestamp <= now)?.item;
  const returnLeg = [...trip.travelLegs]
    .filter((leg) => leg.departAt && jstDate(leg.departAt.slice(0, 10), leg.departAt.slice(11, 16)).getTime() > jstDate(event.date, event.startTime).getTime())
    .sort((left, right) => left.departAt!.localeCompare(right.departAt!))[0];
  const origin = trip.origin?.trim();
  const destination = venue ? venueDestination(venue) : event.titleJa;
  const currentTimeLabel = new Date(now).toLocaleTimeString("zh-CN", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false });
  const toggleSuggestion = (label: string, source: "event_requirement" | "platform_advice") => {
    const existing = trip.checklist.find((item) => item.eventId === event.id && item.source === source && item.label === label);
    if (existing) saveChecklist(trip.checklist.map((item) => item.id === existing.id ? { ...item, done: !item.done } : item));
    else saveChecklist([...trip.checklist, { id: newTripItemId("check"), label, done: true, source, eventId: event.id }]);
  };

  return (
    <div className="trip-print mx-auto max-w-4xl px-4 py-4 sm:py-6">
      <div className="print-hide flex items-center justify-between gap-3"><Link href={`/trips/${trip.id}`} prefetch={false} className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-zinc-500"><ArrowLeft size={13} /> 返回远征详情</Link><button type="button" onClick={() => window.print()} className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-zinc-200 px-3 text-xs font-semibold dark:border-zinc-700"><Printer size={13} /> 打印演出日卡片</button></div>
      <section aria-label="Now Next 倒计时" className="mt-2 grid gap-3 sm:grid-cols-3">
        <div className={CARD}><p className="text-xs font-bold text-zinc-400">当前时间 · Now（JST）</p><p className="mt-2 text-2xl font-bold tabular-nums">{currentTimeLabel}</p><p className="mt-1 text-xs text-zinc-500">{current?.title ?? "当前暂无进行中项"}{"detail" in (current ?? {}) && current?.detail ? ` · ${current.detail}` : ""}</p></div>
        <div className={CARD}><p className="text-xs font-bold text-zinc-400">下一项 · Next</p><p className="mt-2 text-base font-bold">{next?.item.title ?? "今日已无后续定时项"}</p><p className="mt-1 text-xs text-zinc-500">{next ? `${next.item.time} JST` : "待确认"}</p></div>
        <div className="rounded-2xl bg-zinc-900 p-4 text-white dark:bg-white dark:text-zinc-900"><p className="flex items-center gap-1 text-xs font-bold opacity-60"><Clock3 size={13} /> 倒计时</p><p className="mt-2 text-xl font-bold tabular-nums">{next ? countdownLabel(next.timestamp, now) : "—"}</p><p className="mt-1 text-xs opacity-60">设备每 30 秒刷新</p></div>
      </section>

      <header className="mt-4 rounded-3xl bg-gradient-to-br from-violet-700 to-fuchsia-600 p-5 text-white">
        <p className="text-xs font-bold tracking-[0.2em] text-violet-100">EVENT DAY · LOCAL ONLY</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-bold">演出日模式</h1><p className="mt-1 text-sm text-violet-100">{trip.name}</p></div>{formalEvents.length > 1 && <select aria-label="选择演出日公演" value={event.id} onChange={(input) => setSelectedEventId(input.target.value)} className="print-hide min-h-11 rounded-xl bg-white/15 px-3 text-sm font-bold text-white outline-none">{formalEvents.map((item) => <option key={item.id} value={item.id} className="text-zinc-900">{item.date} · {item.titleJa}</option>)}</select>}</div>
        <p className="mt-4 text-lg font-bold">{event.titleJa}</p><p className="mt-1 text-sm text-violet-100">{event.date} · {event.openTime} 开场 / {event.startTime} 开演 JST</p><p className="mt-1 text-xs text-violet-100">官方来源核验：{new Date(event.verification.checkedAt).toLocaleString("zh-CN", { timeZone: "Asia/Tokyo", hour12: false })} JST</p>
      </header>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <section className={CARD}><h2 className="flex items-center gap-2 font-bold"><Ticket size={16} /> 票券与入场</h2><dl className="mt-3 grid grid-cols-[6rem_1fr] gap-x-2 gap-y-2 text-sm"><dt className="text-zinc-400">个人票务状态</dt><dd>{application ? application.status === "ticketed" ? "已出票" : application.status === "paid" ? "已付款" : "已中签" : "未说明"}</dd><dt className="text-zinc-400">电子票 App</dt><dd>{display(ticketApp)}</dd><dt className="text-zinc-400">座位</dt><dd>{display(application?.seatNote)}</dd><dt className="text-zinc-400">同行者</dt><dd>{display(application?.companionNote)}</dd><dt className="text-zinc-400">本人确认证件</dt><dd>{identityCheck === true ? "本场官方要求" : identityCheck === false ? "本场官方明确不要求" : "未说明"}</dd></dl></section>
        <section className={CARD}><h2 className="flex items-center gap-2 font-bold"><MapPin size={16} /> 场馆</h2><p className="mt-3 text-sm font-bold">{venue?.nameJa ?? "未说明"}</p><p className="mt-1 text-xs text-zinc-500">{[venue?.city, venue?.stations[0] && `${venue.stations[0].station}站步行约 ${venue.stations[0].walkMin} 分钟`].filter(Boolean).join(" · ") || "交通未说明"}</p><p className="mt-3 text-xs text-zinc-400">寄物／储物柜</p><p className="mt-1 text-sm">{display(venue?.lockers)}</p></section>
        <section className={CARD}><h2 className="flex items-center gap-2 font-bold"><Smartphone size={16} /> 设备准备</h2><div className="mt-3 space-y-2 text-sm"><p className="flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1 text-zinc-500"><BatteryCharging size={14} /> 电量与设备</span><b>{application ? READINESS_STATUS_LABEL[application.readiness.phoneDevice] : "待确认"}</b></p><p className="flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1 text-zinc-500"><Wifi size={14} /> 网络／离线票面</span><b>待个人确认</b></p><p className="flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1 text-zinc-500"><IdCard size={14} /> 证件准备</span><b>{application ? READINESS_STATUS_LABEL[application.readiness.identityDocument] : "待确认"}</b></p><p className="flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1 text-zinc-500"><Users size={14} /> 同行者准备</span><b>{application ? READINESS_STATUS_LABEL[application.readiness.companion] : "待确认"}</b></p></div></section>
        <section className={CARD}><h2 className="flex items-center gap-2 font-bold"><Navigation size={16} /> 路线与返程</h2><div className="print-hide mt-3 flex flex-wrap gap-2">{origin ? <><a href={mapsRouteUrl(origin, destination)} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-violet-600 px-3 text-xs font-bold text-white"><Route size={13} /> 去程路线 <ExternalLink size={11} /></a><a href={mapsRouteUrl(destination, origin)} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-violet-300 px-3 text-xs font-bold text-violet-700 dark:border-violet-700 dark:text-violet-300"><Route size={13} /> 返程路线 <ExternalLink size={11} /></a></> : <p className="text-xs text-amber-600">出发地未说明，暂不生成路线。</p>}</div><p className="mt-3 text-xs text-zinc-400">返程</p><p className="mt-1 text-sm font-semibold">{returnLeg ? `${returnLeg.departAt!.replace("T", " ")} · ${returnLeg.from} → ${returnLeg.to}` : trip.returnAt ? `${trip.returnAt.replace("T", " ")} · ${trip.returnNote ?? "个人填写"}` : "未说明"}</p><p className="mt-1 text-xs text-zinc-400">{returnLeg ? (returnLeg.status === "confirmed" ? "个人确认" : "个人估算") : "不会推测终电或实时班次"}</p></section>
      </div>

      <section className={`${CARD} mt-4`}><div className="flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 font-bold"><CheckCircle2 size={16} /> 演出日检查清单</h2><span className="text-xs text-zinc-400">未完成项优先</span></div><div className="mt-3 space-y-2">{[...trip.checklist].sort((left, right) => Number(left.done) - Number(right.done)).map((item) => <button key={item.id} type="button" aria-label={`${item.done ? "取消完成" : "标记完成"}：${item.label}`} onClick={() => saveChecklist(trip.checklist.map((check) => check.id === item.id ? { ...check, done: !check.done } : check))} className="flex min-h-11 w-full items-center gap-2 rounded-xl bg-zinc-50 px-3 text-left text-sm dark:bg-zinc-800/70">{item.done ? <CheckCircle2 size={17} className="shrink-0 text-violet-500" /> : <Circle size={17} className="shrink-0 text-zinc-300" />}<span className={`min-w-0 flex-1 ${item.done ? "text-zinc-400 line-through" : ""}`}>{item.label}</span><span className="shrink-0 text-[10px] font-bold text-zinc-400">{SOURCE_LABEL[item.source ?? "default"]}</span></button>)}{suggestions.filter((suggestion) => !trip.checklist.some((item) => item.eventId === event.id && item.source === suggestion.source && item.label === suggestion.label)).map((suggestion) => <button key={suggestion.id} type="button" aria-label={`标记完成：${suggestion.label}`} onClick={() => toggleSuggestion(suggestion.label, suggestion.source)} className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-dashed border-zinc-300 px-3 text-left text-sm dark:border-zinc-700"><Circle size={17} className="shrink-0 text-zinc-300" /><span className="min-w-0 flex-1">{suggestion.label}</span><span className={`shrink-0 text-[10px] font-bold ${suggestion.source === "event_requirement" ? "text-emerald-600" : "text-amber-600"}`}>{SOURCE_LABEL[suggestion.source]}</span></button>)}</div><p className="mt-3 text-xs text-zinc-400">“本场官方要求”只来自当前 Event 的已确认票务字段；“平台／通用建议”不是本场资格事实。</p></section>
    </div>
  );
}
