"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Circle,
  Download,
  ExternalLink,
  FileJson,
  Luggage,
  MapPin,
  Plus,
  Printer,
  RotateCcw,
  Route,
  Save,
  Ticket,
  Train,
  Trash2,
  X,
} from "lucide-react";
import { prefectureById } from "@/data/prefectures";
import type { EventSummary, VenueSummary } from "@/lib/types";
import { formatJpy, referenceCurrencyLabel } from "@/lib/currency";
import { buildTripIcs, downloadFile } from "@/lib/ics";
import { planStatusLabel } from "@/lib/plan";
import { containsSensitivePersonalData, useEventPlans, usePreferences } from "@/lib/store";
import {
  BUDGET_LABELS,
  newTripItemId,
  TRAVEL_LEG_LABELS,
  type TripCustomItemKind,
  type TripPlan,
  type TravelLegStatus,
  type TravelLegType,
  useTripPlans,
} from "@/lib/trip-store";
import {
  buildTripTimeline,
  detectTripConflicts,
  estimatedEnd,
  mapsRouteUrl,
  venueDestination,
} from "@/lib/trip";
import { formatJaDate, todayJst } from "@/lib/time";

const FIELD = "mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-violet-400 dark:border-zinc-700 dark:bg-zinc-900";
const TEXTAREA = "mt-1 min-h-20 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 dark:border-zinc-700 dark:bg-zinc-900";
const SECONDARY = "inline-flex items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-600 hover:border-violet-300 hover:text-brand-strong dark:border-zinc-700 dark:bg-card-dark dark:text-zinc-300";

function BasicsForm({ trip, save }: { trip: TripPlan; save: (patch: Partial<TripPlan>) => void }) {
  const [name, setName] = useState(trip.name);
  const [startDate, setStartDate] = useState(trip.startDate);
  const [endDate, setEndDate] = useState(trip.endDate);
  const [origin, setOrigin] = useState(trip.origin ?? "");
  return (
    <form onSubmit={(event) => { event.preventDefault(); save({ name, startDate, endDate, origin: origin.trim() || undefined }); }} className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-semibold text-zinc-500 sm:col-span-2">远征名称<input value={name} onChange={(event) => setName(event.target.value)} className={FIELD} /></label>
      <label className="text-xs font-semibold text-zinc-500">开始日期<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className={FIELD} /></label>
      <label className="text-xs font-semibold text-zinc-500">结束日期<input type="date" min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} className={FIELD} /></label>
      <label className="text-xs font-semibold text-zinc-500 sm:col-span-2">常用出发地<input value={origin} onChange={(event) => setOrigin(event.target.value)} placeholder="未说明" className={FIELD} /></label>
      <button type="submit" className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-zinc-900 px-4 py-2.5 text-xs font-bold text-white sm:col-span-2 dark:bg-white dark:text-zinc-900"><Save size={13} /> 保存基本信息</button>
    </form>
  );
}

function JourneyNotes({ trip, save }: { trip: TripPlan; save: (patch: Partial<TripPlan>) => void }) {
  const [arrivalAt, setArrivalAt] = useState(trip.arrivalAt ?? "");
  const [arrivalNote, setArrivalNote] = useState(trip.arrivalNote ?? "");
  const [stayAt, setStayAt] = useState(trip.stayAt ?? "");
  const [stayNote, setStayNote] = useState(trip.stayNote ?? "");
  const [returnAt, setReturnAt] = useState(trip.returnAt ?? "");
  const [returnNote, setReturnNote] = useState(trip.returnNote ?? "");
  return (
    <form onSubmit={(event) => { event.preventDefault(); save({ arrivalAt: arrivalAt || undefined, arrivalNote: arrivalNote.trim() || undefined, stayAt: stayAt || undefined, stayNote: stayNote.trim() || undefined, returnAt: returnAt || undefined, returnNote: returnNote.trim() || undefined }); }} className="grid gap-4 lg:grid-cols-3">
      {[
        { label: "抵达／去程", at: arrivalAt, setAt: setArrivalAt, note: arrivalNote, setNote: setArrivalNote, placeholder: "航班、列车、集合等" },
        { label: "住宿", at: stayAt, setAt: setStayAt, note: stayNote, setNote: setStayNote, placeholder: "酒店、入住和寄存说明" },
        { label: "返程", at: returnAt, setAt: setReturnAt, note: returnNote, setNote: setReturnNote, placeholder: "返程车次或待确认事项" },
      ].map((item) => (
        <div key={item.label} className="rounded-2xl border border-zinc-200 p-3 dark:border-zinc-700">
          <p className="text-sm font-bold">{item.label}</p>
          <label className="mt-2 block text-xs font-semibold text-zinc-500">日期与时间<input type="datetime-local" value={item.at} onChange={(event) => item.setAt(event.target.value)} className={FIELD} /></label>
          <label className="mt-2 block text-xs font-semibold text-zinc-500">备注<textarea value={item.note} onChange={(event) => item.setNote(event.target.value)} placeholder={item.placeholder} className={TEXTAREA} /></label>
        </div>
      ))}
      <button type="submit" className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-zinc-900 px-4 py-2.5 text-xs font-bold text-white lg:col-span-3 dark:bg-white dark:text-zinc-900"><Save size={13} /> 保存交通与住宿</button>
    </form>
  );
}

function TravelLegEditor({ trip, save }: { trip: TripPlan; save: (patch: Partial<TripPlan>) => void }) {
  const [type, setType] = useState<TravelLegType>("train");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [depart, setDepart] = useState("");
  const [arrive, setArrive] = useState("");
  const [duration, setDuration] = useState("");
  const [status, setStatus] = useState<TravelLegStatus>("estimated");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const add = () => {
    if (!from.trim() || !to.trim()) { setError("请填写出发地和到达地；未知时间可以留空。"); return; }
    if (containsSensitivePersonalData(from, to, reference, note)) { setError("未保存：请删除手机号、证件号、银行卡号、验证码或密码。"); return; }
    save({
      travelLegs: [...trip.travelLegs, {
        id: newTripItemId("travel"),
        type,
        from: from.trim(),
        to: to.trim(),
        ...(depart ? { departAt: depart } : {}),
        ...(arrive ? { arriveAt: arrive } : {}),
        ...(duration ? { durationMinutes: Number(duration) } : {}),
        status,
        ...(reference.trim() ? { referenceUrl: reference.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      }],
    });
    setFrom(""); setTo(""); setDepart(""); setArrive(""); setDuration(""); setReference(""); setNote(""); setError("");
  };

  return (
    <div>
      <div className="space-y-2">
        {trip.travelLegs.map((leg) => (
          <article key={leg.id} data-travel-leg-id={leg.id} className="rounded-2xl border border-zinc-200 p-3 dark:border-zinc-700">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><p className="text-sm font-bold">{TRAVEL_LEG_LABELS[leg.type]} · {leg.from} → {leg.to}</p><p className="mt-1 text-xs text-zinc-400">出发 {leg.departAt?.replace("T", " ") ?? "未说明"} · 到达 {leg.arriveAt?.replace("T", " ") ?? "未说明"} · {leg.durationMinutes !== undefined ? `${leg.durationMinutes} 分钟` : "时长未说明"}</p></div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${leg.status === "confirmed" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"}`}>{leg.status === "confirmed" ? "个人确认" : "个人估算"}</span>
            </div>
            {(leg.referenceUrl || leg.note) && <p className="mt-2 text-xs text-zinc-500">{[leg.referenceUrl && `参考：${leg.referenceUrl}`, leg.note].filter(Boolean).join(" · ")}</p>}
            <div className="print-hide mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => save({ travelLegs: trip.travelLegs.map((item) => item.id === leg.id ? { ...item, status: item.status === "confirmed" ? "estimated" : "confirmed" } : item) })} className={SECONDARY}>{leg.status === "confirmed" ? "改为个人估算" : "标记个人确认"}</button>
              <button type="button" aria-label={`删除交通段：${leg.from} 到 ${leg.to}`} onClick={() => save({ travelLegs: trip.travelLegs.filter((item) => item.id !== leg.id) })} className="inline-flex min-h-10 items-center gap-1 px-2 text-xs font-semibold text-red-400"><Trash2 size={12} /> 删除</button>
            </div>
          </article>
        ))}
        {trip.travelLegs.length === 0 && <p className="rounded-xl border border-dashed border-zinc-300 py-5 text-center text-xs text-zinc-400 dark:border-zinc-700">尚未添加交通段；不会自动查询或推测班次。</p>}
      </div>
      <div className="print-hide mt-3 grid gap-2 border-t border-zinc-100 pt-3 sm:grid-cols-2 lg:grid-cols-3 dark:border-zinc-800">
        <label className="text-xs font-semibold text-zinc-500">类型<select aria-label="交通段类型" value={type} onChange={(event) => setType(event.target.value as TravelLegType)} className={FIELD}>{Object.entries(TRAVEL_LEG_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="text-xs font-semibold text-zinc-500">状态<select aria-label="交通段状态" value={status} onChange={(event) => setStatus(event.target.value as TravelLegStatus)} className={FIELD}><option value="estimated">个人估算</option><option value="confirmed">个人确认</option></select></label>
        <label className="text-xs font-semibold text-zinc-500">出发地<input aria-label="交通段出发地" value={from} onChange={(event) => setFrom(event.target.value)} placeholder="未说明" className={FIELD} /></label>
        <label className="text-xs font-semibold text-zinc-500">到达地<input aria-label="交通段到达地" value={to} onChange={(event) => setTo(event.target.value)} placeholder="未说明" className={FIELD} /></label>
        <label className="text-xs font-semibold text-zinc-500">出发时间（JST）<input aria-label="交通段出发时间" type="datetime-local" value={depart} onChange={(event) => setDepart(event.target.value)} className={FIELD} /></label>
        <label className="text-xs font-semibold text-zinc-500">到达时间（JST）<input aria-label="交通段到达时间" type="datetime-local" value={arrive} onChange={(event) => setArrive(event.target.value)} className={FIELD} /></label>
        <label className="text-xs font-semibold text-zinc-500">时长（分钟）<input aria-label="交通段时长" type="number" min="0" max="10080" value={duration} onChange={(event) => setDuration(event.target.value)} placeholder="未说明" className={FIELD} /></label>
        <label className="text-xs font-semibold text-zinc-500">参考链接<input aria-label="交通段参考链接" type="url" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="https://…（可选）" className={FIELD} /></label>
        <label className="text-xs font-semibold text-zinc-500 lg:col-span-3">备注<textarea aria-label="交通段备注" value={note} onChange={(event) => setNote(event.target.value)} placeholder="仅保存在本机" className={TEXTAREA} /></label>
        <button type="button" onClick={add} className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl bg-sky-600 px-4 text-xs font-bold text-white sm:col-span-2 lg:col-span-3"><Plus size={12} /> 添加交通段</button>
        {error && <p role="alert" className="text-xs font-semibold text-red-500 sm:col-span-2 lg:col-span-3">{error}</p>}
      </div>
    </div>
  );
}

export default function TripDetailClient({ tripId, events, venues }: { tripId: string; events: EventSummary[]; venues: VenueSummary[] }) {
  const router = useRouter();
  const eventById = useMemo(() => new Map(events.map((event) => [event.id, event])), [events]);
  const venueById = useMemo(() => new Map(venues.map((venue) => [venue.id, venue])), [venues]);
  const catalog = useMemo(() => ({ eventById, venueById }), [eventById, venueById]);
  const { trips, updateTrip, deleteTrip, removeEvent } = useTripPlans();
  const { getPlan, upsertPlan } = useEventPlans();
  const { preferences } = usePreferences();
  const [armedDelete, setArmedDelete] = useState(false);
  const [customDate, setCustomDate] = useState("");
  const [customTime, setCustomTime] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [customKind, setCustomKind] = useState<TripCustomItemKind>("todo");
  const [newCheck, setNewCheck] = useState("");
  const trip = trips.find((item) => item.id === tripId);

  if (!trip) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <Luggage size={32} className="mx-auto text-zinc-300" />
        <h1 className="mt-4 text-xl font-bold">远征不存在或仍在读取</h1>
        <p className="mt-2 text-sm text-zinc-400">如果刚打开页面，请稍候；本机没有该 ID 时可返回远征列表。</p>
        <Link href="/trips" prefetch={false} className="mt-5 inline-flex rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white">返回远征</Link>
      </div>
    );
  }

  const save = (patch: Partial<TripPlan>) => updateTrip(trip.id, patch);
  const formalEvents = trip.eventIds
    .map((eventId) => eventById.get(eventId))
    .filter((event): event is NonNullable<typeof event> => Boolean(event));
  const missingEventIds = trip.eventIds.filter((eventId) => !eventById.has(eventId));
  const timeline = buildTripTimeline(trip, catalog);
  const today = todayJst();
  const nextItem = timeline.find((item) => item.date >= today) ?? timeline[0];
  const allConflicts = detectTripConflicts(trip, catalog);
  const activeConflicts = allConflicts.filter((conflict) => !trip.ignoredConflictKeys.includes(conflict.key));
  const ignoredConflicts = allConflicts.filter((conflict) => trip.ignoredConflictKeys.includes(conflict.key));
  const budgetTotal = trip.budgetItems.reduce((sum, item) => sum + item.amountJpy, 0);
  const completedChecks = trip.checklist.filter((item) => item.done).length;

  const addCustom = () => {
    if (!customDate || !customLabel.trim()) return;
    save({ customItems: [...trip.customItems, { id: newTripItemId("custom"), date: customDate, ...(customTime ? { time: customTime } : {}), label: customLabel.trim(), kind: customKind }] });
    setCustomLabel("");
    setCustomTime("");
  };

  const exportJson = () => {
    downloadFile(`ensei-trip-${trip.id}.json`, JSON.stringify({ app: "ensei-techo", version: 2, exportedAt: new Date().toISOString(), trip }, null, 2), "application/json");
  };
  const exportCalendar = () => {
    downloadFile(`ensei-trip-${trip.id}.ics`, buildTripIcs(trip, formalEvents.map((event) => ({ event, venue: venueById.get(event.venueId) }))), "text/calendar;charset=utf-8");
  };

  return (
    <div className="trip-print mx-auto max-w-6xl px-4 py-4 sm:py-6">
      <Link href="/trips" prefetch={false} className="print-hide inline-flex items-center gap-1 text-xs font-semibold text-zinc-400 hover:text-zinc-700"><ArrowLeft size={13} /> 返回远征</Link>
      <header className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-violet-500">TRIP PLAN · LOCAL ONLY</p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{trip.name}</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{formatJaDate(trip.startDate)}{trip.endDate !== trip.startDate ? ` 〜 ${formatJaDate(trip.endDate)}` : ""} · {trip.origin || "出发地未说明"}</p>
        </div>
        <div className="print-hide flex flex-wrap gap-2">
          {formalEvents.length > 0 && <Link href={`/trips/${trip.id}/day`} prefetch={false} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-xs font-bold text-white">演出日模式</Link>}
          <button type="button" onClick={exportJson} className={SECONDARY}><FileJson size={13} /> JSON</button>
          <button type="button" onClick={exportCalendar} disabled={!formalEvents.length} className={SECONDARY}><Download size={13} /> ICS</button>
          <button type="button" onClick={() => window.print()} className={SECONDARY}><Printer size={13} /> 打印</button>
          <button type="button" onClick={() => { if (!armedDelete) { setArmedDelete(true); return; } deleteTrip(trip.id); router.push("/trips"); }} className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold ${armedDelete ? "bg-red-500 text-white" : "border border-red-200 text-red-500 dark:border-red-500/40"}`}><Trash2 size={13} /> {armedDelete ? "再点一次删除远征" : "删除远征"}</button>
        </div>
      </header>

      {nextItem && (
        <section className="mt-5 rounded-2xl bg-violet-600 p-4 text-white">
          <p className="text-xs font-semibold tracking-widest text-violet-100">下一项行程</p>
          <div className="mt-1 flex items-end justify-between gap-3">
            <div><p className="text-lg font-bold">{nextItem.title}</p><p className="mt-1 text-xs text-violet-100">{nextItem.detail ?? "详细信息待确认"}</p></div>
            <p className="shrink-0 text-right font-bold tabular-nums">{nextItem.date.slice(5).replace("-", "/")}<br /><span className="text-xl">{nextItem.time ?? "待确认"}</span></p>
          </div>
        </section>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <section className="print-hide rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-card-dark">
            <h2 className="mb-4 text-base font-bold">基本信息</h2>
            <BasicsForm key={`basics-${trip.id}`} trip={trip} save={save} />
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-card-dark">
            <div className="flex items-center justify-between gap-2"><h2 className="text-base font-bold">公演与路线</h2><Link href={`/events?start=${trip.startDate}&end=${trip.endDate}`} prefetch={false} className="print-hide text-xs font-semibold text-violet-500 hover:text-violet-700">添加更多公演</Link></div>
            <div className="mt-4 space-y-3">
              {formalEvents.map((event) => {
                const venue = venueById.get(event.venueId);
                const prefecture = venue ? prefectureById.get(venue.prefecture) : undefined;
                const end = estimatedEnd(event, trip);
                const plan = getPlan(event.id);
                const destination = venue ? venueDestination(venue) : event.titleJa;
                const origin = trip.origin?.trim();
                return (
                  <article key={event.id} className="rounded-2xl border border-zinc-200 p-3.5 dark:border-zinc-700">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div><Link href={`/events/${event.id}`} prefetch={false} className="font-bold hover:text-brand-strong">{event.titleJa}</Link><p className="mt-1 text-xs text-zinc-400">{formatJaDate(event.date)} · {event.openTime} 开场 / {event.startTime} 开演 JST</p></div>
                      {plan ? <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">{planStatusLabel(plan)}</span> : <button type="button" onClick={() => upsertPlan(event.id, { intent: "committed", tripStatus: "planning" })} className="print-hide rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">重新加入个人计划</button>}
                    </div>
                    <p className="mt-2 flex items-center gap-1 text-xs text-zinc-500"><MapPin size={12} /> {[prefecture?.nameZh, venue?.city, venue?.nameJa].filter(Boolean).join(" · ") || "场馆待确认"}</p>
                    <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/60">
                      <div className="mr-auto"><p className="text-xs text-zinc-400">结束时间</p><p className="text-sm font-bold">{end.date !== event.date ? `${end.date.slice(5).replace("-", "/")} ` : ""}{end.time} <span className="text-xs font-normal text-zinc-400">{end.estimated ? "估算（开演后 150 分钟）" : "个人确认"}</span></p></div>
                      <label className="print-hide text-xs font-semibold text-zinc-400">覆盖结束时间<input type="time" value={trip.eventEndOverrides[event.id] ?? ""} onChange={(input) => { const overrides = { ...trip.eventEndOverrides }; if (input.target.value) overrides[event.id] = input.target.value; else delete overrides[event.id]; save({ eventEndOverrides: overrides }); }} className="mt-1 block h-10 rounded-lg border border-zinc-200 bg-white px-2 text-xs dark:border-zinc-700 dark:bg-zinc-900" /></label>
                    </div>
                    <div className="print-hide mt-3 flex flex-wrap gap-2">
                      {origin ? <>
                        <a href={mapsRouteUrl(origin, destination)} target="_blank" rel="noreferrer" className={SECONDARY}><Route size={13} /> 去程路线 <ExternalLink size={11} /></a>
                        <a href={mapsRouteUrl(destination, origin)} target="_blank" rel="noreferrer" className={SECONDARY}><Route size={13} /> 返程路线 <ExternalLink size={11} /></a>
                        <a href={mapsRouteUrl(destination, origin)} target="_blank" rel="noreferrer" title="打开后请在地图服务中自行选择末班时间" className={SECONDARY}><Train size={13} /> 终电查询 <ExternalLink size={11} /></a>
                      </> : <span className="text-xs text-amber-600 dark:text-amber-300">设置出发地后可查询去程、返程和终电。</span>}
                      <button type="button" onClick={() => removeEvent(trip.id, event.id)} className="ml-auto inline-flex items-center gap-1 px-2 py-2 text-xs font-semibold text-red-400 hover:text-red-600"><X size={12} /> 从远征移除</button>
                    </div>
                  </article>
                );
              })}
              {missingEventIds.map((eventId) => <div key={eventId} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-500/10 dark:text-amber-300"><b>缺失演出引用</b> · {eventId}<br />正式演出库中找不到该 ID，远征仍保留引用，不会崩溃。</div>)}
              {trip.eventIds.length === 0 && <p className="rounded-xl border border-dashed border-zinc-300 py-8 text-center text-sm text-zinc-400 dark:border-zinc-700">尚未添加公演。</p>}
            </div>
            <p className="print-hide mt-3 text-xs text-zinc-400">路线由 Google Maps 提供；“终电查询”不会承诺实时班次，打开后请自行选择日期与末班时间。</p>
          </section>

          <section className="print-hide rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-card-dark">
            <h2 className="mb-4 text-base font-bold">交通与住宿事项</h2>
            <JourneyNotes key={`notes-${trip.id}`} trip={trip} save={save} />
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-card-dark">
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-bold">交通段</h2><span className="text-xs text-zinc-400">手动记录 · 不查询实时班次</span></div>
            <div className="mt-4"><TravelLegEditor trip={trip} save={save} /></div>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-card-dark">
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-bold">按日期与时间的行程</h2><span className="text-xs text-zinc-400">全部时间按 JST 整理</span></div>
            <div className="mt-4 space-y-0">
              {timeline.map((item, index) => <div key={item.id} className="relative flex gap-3 pb-5"><div className="relative flex w-14 shrink-0 justify-end"><span className="text-xs font-bold tabular-nums">{item.time ?? "待确认"}</span>{index < timeline.length - 1 && <span className="absolute top-5 right-[-13px] h-full w-px bg-zinc-200 dark:bg-zinc-700" />}</div><span className={`relative z-10 mt-1 h-3 w-3 shrink-0 rounded-full ${item.kind === "event" ? "bg-violet-500" : item.kind === "travel" ? "bg-sky-500" : "bg-amber-400"}`} /><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-zinc-400">{item.date.replaceAll("-", "/")} {item.kind === "travel" ? `· ${item.status === "confirmed" ? "个人确认" : "个人估算"}` : ""}</p><p className="text-sm font-semibold">{item.title}</p>{item.detail && <p className="mt-0.5 text-xs text-zinc-400">{item.detail}</p>}</div>{item.kind === "custom" && <button type="button" aria-label={`删除行程事项：${item.title}`} onClick={() => save({ customItems: trip.customItems.filter((custom) => custom.id !== item.id) })} className="print-hide inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"><Trash2 size={15} /></button>}</div>)}
              {timeline.length === 0 && <p className="py-8 text-center text-sm text-zinc-400">添加公演或自定义事项后生成行程。</p>}
            </div>
            <div className="print-hide grid gap-2 border-t border-zinc-100 pt-3 sm:grid-cols-5 dark:border-zinc-800">
              <input type="date" aria-label="自定义事项日期" value={customDate} onChange={(event) => setCustomDate(event.target.value)} className={FIELD} />
              <input type="time" aria-label="自定义事项时间" value={customTime} onChange={(event) => setCustomTime(event.target.value)} className={FIELD} />
              <select aria-label="自定义事项类型" value={customKind} onChange={(event) => setCustomKind(event.target.value as TripCustomItemKind)} className={FIELD}><option value="todo">待办</option><option value="transport">交通</option><option value="stay">住宿</option></select>
              <input aria-label="自定义事项内容" value={customLabel} onChange={(event) => setCustomLabel(event.target.value)} placeholder="自定义事项" className={FIELD} />
              <button type="button" onClick={addCustom} disabled={!customDate || !customLabel.trim()} className="inline-flex items-center justify-center gap-1 rounded-xl bg-violet-600 px-3 text-xs font-bold text-white disabled:opacity-40"><Plus size={12} /> 添加</button>
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-card-dark">
            <div className="flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-base font-bold"><AlertTriangle size={16} className={activeConflicts.length ? "text-amber-500" : "text-emerald-500"} /> 冲突检查</h2><label className="print-hide text-xs font-semibold text-zinc-400">缓冲分钟<input type="number" min="0" max="720" step="15" value={trip.bufferMinutes} onChange={(event) => save({ bufferMinutes: Number(event.target.value) })} className="ml-1 h-10 w-20 rounded-lg border border-zinc-200 px-2 text-xs dark:border-zinc-700 dark:bg-zinc-900" /></label></div>
            <div className="mt-3 space-y-2">
              {activeConflicts.map((conflict) => <div key={conflict.key} className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"><p className="font-bold">{conflict.title}</p><p className="mt-1 leading-relaxed">{conflict.detail}</p><button type="button" onClick={() => save({ ignoredConflictKeys: [...trip.ignoredConflictKeys, conflict.key] })} className="print-hide mt-2 text-xs font-bold underline">忽略此提示</button></div>)}
              {activeConflicts.length === 0 && <p className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">当前没有未忽略的同日重叠、跨都道府县或缓冲不足提示。</p>}
              {ignoredConflicts.length > 0 && <details className="print-hide"><summary className="cursor-pointer text-xs font-semibold text-zinc-400">已忽略 {ignoredConflicts.length} 条</summary><div className="mt-2 space-y-1">{ignoredConflicts.map((conflict) => <button key={conflict.key} type="button" onClick={() => save({ ignoredConflictKeys: trip.ignoredConflictKeys.filter((key) => key !== conflict.key) })} className="flex w-full items-center justify-between rounded-lg bg-zinc-50 p-2 text-left text-xs dark:bg-zinc-800"><span>{conflict.title}</span><RotateCcw size={13} aria-hidden="true" /></button>)}</div></details>}
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-card-dark">
            <h2 className="flex items-center gap-2 text-base font-bold"><Ticket size={16} /> 预算</h2>
            <div className="mt-3 space-y-2">{trip.budgetItems.map((item) => <label key={item.id} className="flex items-center gap-2 text-xs"><span className="w-12 shrink-0 font-semibold text-zinc-500">{BUDGET_LABELS[item.category]}</span><input aria-label={`预算：${BUDGET_LABELS[item.category]}`} type="number" min="0" step="100" value={item.amountJpy} onChange={(event) => save({ budgetItems: trip.budgetItems.map((budget) => budget.id === item.id ? { ...budget, amountJpy: Math.max(0, Math.round(Number(event.target.value))) } : budget) })} className="h-9 min-w-0 flex-1 rounded-lg border border-zinc-200 px-2 text-right text-xs tabular-nums dark:border-zinc-700 dark:bg-zinc-900" /><span className="text-zinc-400">JPY</span></label>)}</div>
            <div className="mt-4 rounded-xl bg-violet-50 p-3 dark:bg-violet-500/10"><p className="text-xs text-zinc-500">预算合计</p><p className="mt-1 text-xl font-bold tabular-nums">{formatJpy(budgetTotal)}</p><p className="text-xs font-semibold text-violet-600 dark:text-violet-300">{referenceCurrencyLabel(budgetTotal, preferences.currency)}</p><p className="mt-1 text-xs text-zinc-400">参考汇率，非实时；付款以实际账单为准。</p></div>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-card-dark">
            <h2 className="flex items-center justify-between gap-2 text-base font-bold"><span className="inline-flex items-center gap-2"><CheckCircle2 size={16} /> 检查清单</span><span className="text-xs font-normal text-zinc-400">{completedChecks}/{trip.checklist.length}</span></h2>
            <div className="mt-3 space-y-2">{trip.checklist.map((item) => <div key={item.id} className="flex items-center gap-2"><button type="button" aria-label={`${item.done ? "取消完成" : "标记完成"}：${item.label}`} onClick={() => save({ checklist: trip.checklist.map((check) => check.id === item.id ? { ...check, done: !check.done } : check) })} className="shrink-0 text-violet-500">{item.done ? <CheckCircle2 size={18} /> : <Circle size={18} />}</button><input defaultValue={item.label} onBlur={(event) => { const label = event.target.value.trim(); if (label && label !== item.label) save({ checklist: trip.checklist.map((check) => check.id === item.id ? { ...check, label } : check) }); }} className={`min-w-0 flex-1 bg-transparent text-xs outline-none ${item.done ? "text-zinc-400 line-through" : ""}`} /><button type="button" aria-label={`删除检查项：${item.label}`} onClick={() => save({ checklist: trip.checklist.filter((check) => check.id !== item.id) })} className="print-hide p-1 text-zinc-300 hover:text-red-500"><Trash2 size={12} /></button></div>)}</div>
            <div className="print-hide mt-3 flex gap-2"><input value={newCheck} onChange={(event) => setNewCheck(event.target.value)} placeholder="新增检查事项" className="h-9 min-w-0 flex-1 rounded-lg border border-zinc-200 px-2 text-xs dark:border-zinc-700 dark:bg-zinc-900" /><button type="button" aria-label="添加检查事项" disabled={!newCheck.trim()} onClick={() => { save({ checklist: [...trip.checklist, { id: newTripItemId("check"), label: newCheck.trim(), done: false }] }); setNewCheck(""); }} className="rounded-lg bg-zinc-900 px-3 text-xs font-bold text-white disabled:opacity-40 dark:bg-white dark:text-zinc-900"><Plus size={12} /></button></div>
          </section>
        </aside>
      </div>
    </div>
  );
}
