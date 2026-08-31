"use client";

import { useState } from "react";
import {
  CalendarClock,
  Check,
  ChevronDown,
  Circle,
  ExternalLink,
  Heart,
  Plus,
  ShieldCheck,
  TicketCheck,
  Trash2,
  X,
} from "lucide-react";
import type { EventSummary } from "@/lib/types";
import type {
  DisplayTimeZone,
  ReadinessKey,
  ReadinessStatus,
  TicketApplication,
  TicketApplicationStatus,
  TripStatus,
  UserEventPlan,
} from "@/lib/store";
import {
  containsSensitivePersonalData,
  READINESS_KEYS,
  useEventPlans,
  usePreferences,
} from "@/lib/store";
import {
  APPLICATION_STATUS_LABEL,
  planApplicationSummary,
  planStatusLabel,
  READINESS_LABEL,
  READINESS_STATUS_LABEL,
  TRIP_STATUS_LABEL,
} from "@/lib/plan";
import {
  createDeadlineTiming,
  formatManualTaskWallTime,
  manualTaskTimeZoneLabel,
} from "@/lib/deadline-core.mjs";
import { ticketOffersOf } from "@/lib/ticket-offer";
import PostTicketTripPrompt from "@/components/trip/PostTicketTripPrompt";

const FIELD =
  "mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-violet-400 dark:border-zinc-700 dark:bg-zinc-900";
const SENSITIVE_WARNING = "未保存：请勿填写密码、完整手机号、证件号、银行卡号或验证码。";

function ApplicationCard({
  application,
  plan,
  update,
  remove,
  updatePlan,
  event,
  artistName,
}: {
  application: TicketApplication;
  plan: UserEventPlan;
  update: (patch: Partial<TicketApplication>) => void;
  remove: () => void;
  updatePlan: (patch: Partial<UserEventPlan>) => void;
  event?: EventSummary;
  artistName?: string;
}) {
  const linkedOffer = event && application.offerId
    ? ticketOffersOf(event).find((offer) => offer.id === application.offerId)
    : undefined;
  const [error, setError] = useState("");

  const setStatus = (status: TicketApplicationStatus) => {
    update({
      status,
      ...(status === "applied" && !application.appliedAt
        ? { appliedAt: new Date().toISOString() }
        : {}),
    });
    if (["won", "paid"].includes(status)) updatePlan({ intent: "committed", tripStatus: "planning" });
    if (status === "ticketed") updatePlan({ intent: "committed", tripStatus: "ready" });
  };

  return (
    <article
      data-application-id={application.id}
      className="rounded-2xl border border-zinc-200 bg-white p-3.5 dark:border-zinc-700 dark:bg-zinc-900/60"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{application.label}</p>
          <p className="mt-0.5 text-xs text-zinc-400">
            {linkedOffer
              ? `${linkedOffer.providerLabel} · 已关联官方渠道`
              : "个人记录，未关联官方渠道"}
          </p>
        </div>
        <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-bold text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
          {APPLICATION_STATUS_LABEL[application.status]}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {application.status === "preparing" && (
          <button type="button" onClick={() => setStatus("applied")} className="rounded-full bg-violet-600 px-3 py-1.5 text-xs font-bold text-white">
            标记已申请
          </button>
        )}
        {application.status === "applied" && (
          <>
            <button type="button" onClick={() => setStatus("won")} className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white">
              记录中签
            </button>
            <button type="button" onClick={() => setStatus("lost")} className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-bold text-zinc-600 dark:border-zinc-600 dark:text-zinc-300">
              记录落选
            </button>
          </>
        )}
        {application.status === "won" && (
          <button type="button" onClick={() => setStatus("paid")} className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white">
            标记已付款
          </button>
        )}
        {application.status === "paid" && (
          <button type="button" onClick={() => setStatus("ticketed")} className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white">
            标记已出票
          </button>
        )}
        {!["lost", "ticketed", "cancelled"].includes(application.status) && (
          <button type="button" onClick={() => setStatus("cancelled")} className="rounded-full px-3 py-1.5 text-xs font-semibold text-zinc-400 hover:text-red-500">
            取消此轮
          </button>
        )}
      </div>

      {["won", "paid", "ticketed"].includes(application.status) && event && (
        <PostTicketTripPrompt event={event} artistName={artistName} plan={plan} />
      )}

      <details className="group mt-3 border-t border-zinc-100 pt-2 dark:border-zinc-800">
        <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-semibold text-zinc-500">
          申请详情与准备状态
          <ChevronDown size={13} className="transition group-open:rotate-180" />
        </summary>
        <form
          className="mt-3 grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const text = (name: string) => String(form.get(name) ?? "").trim();
            const values = [
              text("label"), text("provider"), text("round"), text("accountAlias"),
              text("seatNote"), text("companionNote"), text("privateNote"),
            ];
            if (containsSensitivePersonalData(...values)) {
              setError(SENSITIVE_WARNING);
              return;
            }
            const quantity = text("quantity");
            const actualPrice = text("actualPrice");
            const readiness = Object.fromEntries(READINESS_KEYS.map((key) => [
              key,
              String(form.get(`readiness-${key}`) ?? "unknown") as ReadinessStatus,
            ])) as Record<ReadinessKey, ReadinessStatus>;
            update({
              label: text("label") || application.label,
              provider: text("provider") || undefined,
              round: text("round") || undefined,
              quantity: quantity ? Number(quantity) : undefined,
              accountAlias: text("accountAlias") || undefined,
              actualPriceJpy: actualPrice ? Number(actualPrice) : undefined,
              seatNote: text("seatNote") || undefined,
              companionNote: text("companionNote") || undefined,
              privateNote: text("privateNote") || undefined,
              readiness,
            });
            setError("");
          }}
        >
          <label className="text-xs text-zinc-500">申请名称<input name="label" aria-label="申请名称" defaultValue={application.label} className={FIELD} /></label>
          <label className="text-xs text-zinc-500">渠道<input name="provider" aria-label="申请渠道" defaultValue={application.provider ?? ""} placeholder="例如：FC / e+" className={FIELD} /></label>
          <label className="text-xs text-zinc-500">轮次<input name="round" aria-label="申请轮次" defaultValue={application.round ?? ""} placeholder="例如：FC 一次先行" className={FIELD} /></label>
          <label className="text-xs text-zinc-500">票数<input name="quantity" aria-label="申请票数" type="number" min="1" max="99" defaultValue={application.quantity ?? ""} className={FIELD} /></label>
          <label className="text-xs text-zinc-500">账号别名<input name="accountAlias" aria-label="账号别名" defaultValue={application.accountAlias ?? ""} placeholder="只填别名，不填账号、手机号或密码" className={FIELD} /></label>
          <label className="text-xs text-zinc-500">实际票价（JPY）<input name="actualPrice" aria-label="申请实际票价（JPY）" type="number" min="0" step="1" defaultValue={application.actualPriceJpy ?? ""} className={FIELD} /></label>
          <label className="text-xs text-zinc-500">座位备注<input name="seatNote" aria-label="申请座位备注" defaultValue={application.seatNote ?? ""} className={FIELD} /></label>
          <label className="text-xs text-zinc-500">同行者备注<input name="companionNote" aria-label="申请同行者备注" defaultValue={application.companionNote ?? ""} className={FIELD} /></label>
          <label className="text-xs text-zinc-500 sm:col-span-2">私人备注<textarea name="privateNote" aria-label="申请私人备注" defaultValue={application.privateNote ?? ""} className={`${FIELD} min-h-20`} /></label>

          <fieldset className="grid gap-2 rounded-xl bg-zinc-50 p-3 sm:col-span-2 sm:grid-cols-2 dark:bg-zinc-800/60">
            <legend className="px-1 text-xs font-bold text-zinc-500">准备状态（只保存状态，不保存证件或凭据）</legend>
            {READINESS_KEYS.map((key) => (
              <label key={key} className="flex items-center justify-between gap-2 text-xs text-zinc-500">
                {READINESS_LABEL[key]}
                <select name={`readiness-${key}`} aria-label={`准备状态：${READINESS_LABEL[key]}`} defaultValue={application.readiness[key]} className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900">
                  {(Object.entries(READINESS_STATUS_LABEL) as [ReadinessStatus, string][]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
            ))}
          </fieldset>

          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <button type="submit" className="inline-flex items-center gap-1 rounded-full bg-zinc-900 px-4 py-2 text-xs font-bold text-white dark:bg-white dark:text-zinc-900"><Check size={12} /> 保存申请详情</button>
            <button type="button" onClick={remove} className="inline-flex items-center gap-1 px-2 py-2 text-xs font-semibold text-zinc-400 hover:text-red-500"><Trash2 size={12} /> 删除此申请记录</button>
          </div>
          {error && <p role="alert" className="text-xs font-semibold text-red-500 sm:col-span-2">{error}</p>}
          {linkedOffer?.url && (
            <a href={linkedOffer.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-violet-500 sm:col-span-2">查看关联官方渠道 <ExternalLink size={11} /></a>
          )}
        </form>
      </details>
    </article>
  );
}

function PlanSettings({
  plan,
  save,
  preferenceTimeZone,
  addTask,
  updateTask,
  removeTask,
}: {
  plan: UserEventPlan;
  save: (patch: Partial<UserEventPlan>) => void;
  preferenceTimeZone: DisplayTimeZone;
  addTask: (task: { label: string; dueAt: string; timeZone: string; linkedApplicationId?: string }) => void;
  updateTask: (taskId: string, patch: { done: boolean }) => void;
  removeTask: (taskId: string) => void;
}) {
  const [eventNote, setEventNote] = useState(plan.eventNote ?? "");
  const [taskLabel, setTaskLabel] = useState("");
  const [taskDate, setTaskDate] = useState("");
  const [taskTime, setTaskTime] = useState("");
  const [linkedApplicationId, setLinkedApplicationId] = useState("");
  const [error, setError] = useState("");

  return (
    <details className="group rounded-2xl border border-zinc-200 bg-white/70 dark:border-zinc-700 dark:bg-zinc-950/30">
      <summary className="flex cursor-pointer list-none items-center justify-between px-3.5 py-3 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
        管理演出级计划与个人任务
        <ChevronDown size={14} className="transition group-open:rotate-180" />
      </summary>
      <div className="space-y-4 border-t border-zinc-200 p-3.5 dark:border-zinc-700">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-zinc-500">行程状态
            <select value={plan.tripStatus} onChange={(event) => save({ tripStatus: event.target.value as TripStatus })} className={FIELD}>
              {(Object.entries(TRIP_STATUS_LABEL) as [TripStatus, string][]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="text-xs text-zinc-500">演出备注
            <textarea aria-label="演出备注" value={eventNote} onChange={(event) => setEventNote(event.target.value)} placeholder="不属于某一轮申请的普通备注" className={`${FIELD} min-h-20`} />
          </label>
          <button type="button" onClick={() => {
            if (containsSensitivePersonalData(eventNote)) { setError(SENSITIVE_WARNING); return; }
            save({ eventNote: eventNote.trim() || undefined });
            setError("");
          }} className="rounded-full bg-zinc-900 px-4 py-2 text-xs font-bold text-white sm:col-span-2 dark:bg-white dark:text-zinc-900">保存演出计划</button>
        </div>

        <div className="border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <p className="flex items-center gap-1.5 text-xs font-bold text-zinc-600 dark:text-zinc-300"><CalendarClock size={13} /> 个人任务</p>
          <div className="mt-2 space-y-2">
            {plan.manualTasks.map((task) => (
              <div key={task.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs dark:bg-amber-500/10">
                <button type="button" aria-label={`${task.done ? "恢复任务" : "完成任务"}：${task.label}`} onClick={() => updateTask(task.id, { done: !task.done })} className="text-amber-600 dark:text-amber-300">
                  {task.done ? <Check size={15} /> : <Circle size={15} />}
                </button>
                <span className={`font-semibold ${task.done ? "text-zinc-400 line-through" : "text-amber-800 dark:text-amber-200"}`}>{task.label}</span>
                <span className="text-xs text-zinc-400">{formatManualTaskWallTime(task)} · {manualTaskTimeZoneLabel(task)}</span>
                <button type="button" aria-label={`删除任务：${task.label}`} onClick={() => removeTask(task.id)} className="ml-auto text-zinc-300 hover:text-red-500"><X size={12} /></button>
              </div>
            ))}
            {plan.manualTasks.length === 0 && <p className="text-xs text-zinc-400">尚无个人任务；官方结果与付款期限不会复制到这里。</p>}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <input aria-label="个人任务内容" value={taskLabel} onChange={(event) => setTaskLabel(event.target.value)} placeholder="例如：自行确认付款" className={FIELD} />
            <input aria-label="个人任务日期" type="date" value={taskDate} onChange={(event) => setTaskDate(event.target.value)} className={FIELD} />
            <input aria-label="个人任务时间" type="time" value={taskTime} onChange={(event) => setTaskTime(event.target.value)} className={FIELD} />
            <select aria-label="任务关联申请" value={linkedApplicationId} onChange={(event) => setLinkedApplicationId(event.target.value)} className={FIELD}>
              <option value="">不关联申请</option>
              {plan.applications.map((application) => <option key={application.id} value={application.id}>{application.label}</option>)}
            </select>
            <button type="button" disabled={!taskLabel.trim() || !taskDate || !taskTime} onClick={() => {
              if (containsSensitivePersonalData(taskLabel)) { setError(SENSITIVE_WARNING); return; }
              const timing = createDeadlineTiming(`${taskDate}T${taskTime}`, preferenceTimeZone, Intl.DateTimeFormat().resolvedOptions().timeZone);
              if (!timing) { setError("个人任务时间无效，尚未保存。"); return; }
              addTask({
                label: taskLabel.trim(),
                dueAt: timing.instantAt,
                timeZone: timing.timeZone,
                ...(linkedApplicationId ? { linkedApplicationId } : {}),
              });
              setTaskLabel(""); setTaskDate(""); setTaskTime(""); setLinkedApplicationId(""); setError("");
            }} className="inline-flex items-center justify-center gap-1 rounded-full bg-amber-500 px-4 py-2 text-xs font-bold text-white disabled:opacity-40 sm:col-span-2 lg:col-span-4"><Plus size={12} /> 添加个人任务</button>
          </div>
        </div>
        {error && <p role="alert" className="text-xs font-semibold text-red-500">{error}</p>}
        <p className="flex items-start gap-1.5 text-xs leading-relaxed text-zinc-400"><ShieldCheck size={13} className="mt-0.5 shrink-0" />只保存账号别名、普通备注和准备状态；密码、完整手机号、证件号、银行卡号及验证码会被拒绝。</p>
      </div>
    </details>
  );
}

export default function WantButton({ eventId, event, artistName, full = false }: { eventId: string; event?: EventSummary; artistName?: string; full?: boolean }) {
  const {
    getPlan,
    upsertPlan,
    removePlan,
    addApplication,
    updateApplication,
    removeApplication,
    addManualTask,
    updateManualTask,
    removeManualTask,
  } = useEventPlans();
  const { preferences } = usePreferences();
  const plan = getPlan(eventId);

  if (!full) {
    const active = Boolean(plan);
    return (
      <button
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (active) window.location.assign(`/events/${eventId}#plan-manager`);
          else upsertPlan(eventId);
        }}
        aria-label={active ? "管理计划" : "加入计划"}
        title={active ? `管理计划 · ${plan ? planStatusLabel(plan) : ""}` : "加入计划"}
        className={`flex h-8 w-8 items-center justify-center rounded-full transition ${active ? "text-pink-500" : "text-zinc-300 hover:text-pink-400 dark:text-zinc-600"}`}
      >
        <Heart size={16} fill={active ? "currentColor" : "none"} />
      </button>
    );
  }

  if (!plan) {
    return (
      <section id="plan-manager" className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-card-dark">
        <p className="text-sm font-bold">个人申请与任务</p>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">加入后可记录每轮申请、结果、付款、出票和个人截止。</p>
        <button onClick={() => upsertPlan(eventId)} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-violet-300 px-5 text-sm font-semibold text-violet-700 hover:bg-violet-50 sm:w-auto dark:border-violet-700 dark:text-violet-300 dark:hover:bg-violet-500/10">
          <Heart size={16} /> 加入计划
        </button>
      </section>
    );
  }

  const summary = planApplicationSummary(plan);
  const save = (patch: Partial<UserEventPlan>) => upsertPlan(eventId, patch);
  return (
    <section id="plan-manager" className="w-full rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-card-dark">
      <details className="group">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 p-3.5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-2.5 py-1 text-xs font-bold text-violet-700 dark:bg-violet-500/20 dark:text-violet-300"><TicketCheck size={13} /> {planStatusLabel(plan)}</span>
          <div data-testid="application-summary" className="flex flex-1 flex-wrap gap-1 text-xs font-semibold text-zinc-500 dark:text-zinc-300">
            <span className="rounded-full bg-white/80 px-2 py-1 dark:bg-zinc-900/60">准备中 {summary.preparing} 轮</span>
            <span className="rounded-full bg-white/80 px-2 py-1 dark:bg-zinc-900/60">已申请 {summary.applied} 轮</span>
            <span className="rounded-full bg-white/80 px-2 py-1 dark:bg-zinc-900/60">中签 {summary.won} 轮</span>
            <span className="rounded-full bg-white/80 px-2 py-1 dark:bg-zinc-900/60">付款 {summary.paid ? "是" : "否"} · 出票 {summary.ticketed ? "是" : "否"}</span>
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-bold text-violet-600 dark:text-violet-300">管理计划 <ChevronDown size={13} className="transition group-open:rotate-180" /></span>
        </summary>
        <div className="border-t border-zinc-200 p-3.5 dark:border-zinc-800">
          <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => addApplication(eventId, { label: "个人申请记录", status: "preparing" })} className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-violet-600 px-4 text-xs font-bold text-white hover:bg-violet-700"><Plus size={12} /> 新增个人申请记录</button>
        <span className="text-xs text-zinc-400">官方渠道申请也可从上方 TicketOffer 卡片创建。</span>
          </div>

          <div className="mt-3 space-y-2">
        {plan.applications.map((application) => (
          <ApplicationCard
            key={`${application.id}-${application.updatedAt}`}
            application={application}
            plan={plan}
            update={(patch) => updateApplication(eventId, application.id, patch)}
            remove={() => removeApplication(eventId, application.id)}
            updatePlan={save}
            event={event}
            artistName={artistName}
          />
        ))}
        {plan.applications.length === 0 && <p className="rounded-xl border border-dashed border-zinc-200 py-5 text-center text-xs text-zinc-400 dark:border-zinc-700">还没有申请记录；加入计划不会自动假定你已经申请。</p>}
          </div>

          <div className="mt-3">
        <PlanSettings
          plan={plan}
          save={save}
          preferenceTimeZone={preferences.timeZone}
          addTask={(task) => { addManualTask(eventId, task); }}
          updateTask={(taskId, patch) => updateManualTask(eventId, taskId, patch)}
          removeTask={(taskId) => removeManualTask(eventId, taskId)}
        />
          </div>
          <button type="button" onClick={() => removePlan(eventId)} className="mt-3 inline-flex items-center gap-1 px-2 py-2 text-xs font-semibold text-zinc-400 hover:text-red-500"><Trash2 size={13} /> 放弃整个计划</button>
        </div>
      </details>
    </section>
  );
}
