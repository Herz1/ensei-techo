"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarPlus, Database, Download, ListTodo, Trash2, Upload } from "lucide-react";
import type { ArtistSummary, EventSummary, VenueSummary } from "@/lib/types";
import type { UserEventPlan } from "@/lib/store";
import type { TripPlan } from "@/lib/trip-store";
import {
  DEFAULT_PREFERENCES,
  FOLLOWS_KEY,
  clearPlanMigrationBackup,
  replacePreferences,
  replacePlans,
  replaceSet,
  usePreferences,
} from "@/lib/store";
import { clearTripMigrationBackup, replaceTrips } from "@/lib/trip-store";
import { replaceSocialLeads, useSocialLeads } from "@/lib/social-leads";
import { buildDeadlineIcs, buildIcs, downloadFile } from "@/lib/ics";
import { buildBackupPayload, prepareBackupImport } from "@/lib/backup";
import SectionTitle from "./SectionTitle";

const BTN =
  "inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 transition hover:border-violet-300 hover:text-brand-strong disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-card-dark dark:text-zinc-200 dark:hover:border-violet-500 dark:hover:text-violet-300";

export default function DataManage({
  plans,
  followIds,
  upcoming,
  trips,
  events,
  artists,
  venues,
}: {
  plans: UserEventPlan[];
  followIds: string[];
  upcoming: EventSummary[];
  trips: TripPlan[];
  events: EventSummary[];
  artists: ArtistSummary[];
  venues: VenueSummary[];
}) {
  const eventById = new Map(events.map((event) => [event.id, event]));
  const venueById = new Map(venues.map((venue) => [venue.id, venue]));
  const { preferences } = usePreferences();
  const { leads: socialLeads } = useSocialLeads();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [armed, setArmed] = useState(false);
  const [deadlineMode, setDeadlineMode] = useState<"task" | "event">("task");
  const fileRef = useRef<HTMLInputElement>(null);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deadlineItems = plans.flatMap((plan) => {
    const event = eventById.get(plan.eventId);
    if (!event) return [];
    return plan.manualTasks
      .filter((task) => !task.done)
      .map((task) => ({ plan, task, event }));
  });

  useEffect(
    () => () => {
      if (armTimer.current) clearTimeout(armTimer.current);
    },
    [],
  );

  function exportIcs() {
    const ics = buildIcs(
      upcoming.map((event) => ({ event, venue: venueById.get(event.venueId) })),
    );
    downloadFile("ensei-live-calendar.ics", ics, "text/calendar;charset=utf-8");
    setMsg({ ok: true, text: `已导出 ${upcoming.length} 场计划中的演出` });
  }

  function exportDeadlines() {
    const ics = buildDeadlineIcs(deadlineItems, deadlineMode);
    downloadFile(
      `ensei-personal-deadlines-${deadlineMode}.ics`,
      ics,
      "text/calendar;charset=utf-8",
    );
    setMsg({
      ok: true,
      text: `已将 ${deadlineItems.length} 条个人截止导出为${deadlineMode === "task" ? "日历任务" : "日历事件"}`,
    });
  }

  function exportJson() {
    const payload = buildBackupPayload({
      preferences,
      plans,
      follows: followIds,
      trips,
      socialLeads,
    });
    downloadFile("ensei-backup.json", JSON.stringify(payload, null, 2), "application/json");
    setMsg({ ok: true, text: "偏好、计划、远征、社媒线索、个人记录和关注艺人已完整备份" });
  }

  async function importJson(file: File) {
    try {
      const value: unknown = JSON.parse(await file.text());
      const prepared = prepareBackupImport(value, {
        eventIds: new Set(events.map((event) => event.id)),
        artistIds: new Set(artists.map((artist) => artist.id)),
      });
      if (prepared.appliedSectionCount === 0) {
        setMsg({ ok: false, text: `恢复失败：没有可安全恢复的数据；当前本机状态未改变${prepared.ignored ? ` · 忽略 ${prepared.ignored} 条` : ""}` });
        return;
      }
      if (prepared.preferences.apply && prepared.preferences.value) replacePreferences(prepared.preferences.value);
      if (prepared.plans.apply) replacePlans(prepared.plans.values);
      if (prepared.follows.apply) replaceSet(FOLLOWS_KEY, prepared.follows.values);
      if (prepared.trips.apply) replaceTrips(prepared.trips.values);
      if (prepared.socialLeads.apply) replaceSocialLeads(prepared.socialLeads.values);
      setMsg({
        ok: true,
        text: `恢复完成：偏好 ${prepared.preferences.restored} 组 · 计划 ${prepared.plans.restored} 场 · 远征 ${prepared.trips.restored} 个 · 社媒线索 ${prepared.socialLeads.restored} 条 · 关注 ${prepared.follows.restored} 位 · 忽略 ${prepared.ignored} 条${prepared.warnings.length ? ` · ${prepared.warnings.join("；")}` : ""}`,
      });
    } catch (error) {
      setMsg({ ok: false, text: error instanceof Error ? error.message : "解析失败：请选择本站导出的 JSON 备份" });
    }
  }

  function clearAll() {
    if (!armed) {
      setArmed(true);
      if (armTimer.current) clearTimeout(armTimer.current);
      armTimer.current = setTimeout(() => setArmed(false), 4000);
      return;
    }
    replacePlans([]);
    clearPlanMigrationBackup();
    replaceSet(FOLLOWS_KEY, []);
    replaceTrips([]);
    clearTripMigrationBackup();
    replaceSocialLeads([]);
    replacePreferences({
      ...DEFAULT_PREFERENCES,
      updatedAt: new Date().toISOString(),
    });
    setArmed(false);
    setMsg({ ok: true, text: "已清空本机偏好、计划、远征、社媒线索与关注；正式演出数据未受影响" });
  }

  return (
    <section>
      <SectionTitle
        icon={<Database size={18} />}
        title="数据管理"
        sub="计划、社媒线索和私人备注仅保存在本机 · 可导出后在另一设备恢复"
      />
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-card-dark">
        <div className="flex flex-wrap gap-2">
          <button onClick={exportIcs} disabled={!upcoming.length} className={BTN}>
            <CalendarPlus size={14} /> 导出演出日历
          </button>
          <div className="inline-flex rounded-full border border-zinc-200 bg-white p-0.5 dark:border-zinc-700 dark:bg-card-dark">
            <select
              value={deadlineMode}
              onChange={(event) => setDeadlineMode(event.target.value as "task" | "event")}
              aria-label="个人截止导出类型"
              className="rounded-full bg-transparent px-2 text-xs font-semibold outline-none"
            >
              <option value="task">作为日历任务</option>
              <option value="event">作为日历事件</option>
            </select>
            <button
              onClick={exportDeadlines}
              disabled={!deadlineItems.length}
              className="inline-flex items-center gap-1 rounded-full bg-violet-600 px-3 py-1.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ListTodo size={13} /> 导出个人截止
            </button>
          </div>
          <button onClick={exportJson} className={BTN}>
            <Download size={14} /> 导出备份 JSON
          </button>
          <button onClick={() => fileRef.current?.click()} className={BTN}>
            <Upload size={14} /> 导入备份
          </button>
          <button
            onClick={clearAll}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition ${
              armed
                ? "bg-red-500 text-white shadow-lg shadow-red-500/30"
                : "border border-red-200 text-red-500 hover:bg-red-50 dark:border-red-500/40 dark:hover:bg-red-500/10"
            }`}
          >
            <Trash2 size={14} /> {armed ? "再点一次确认清空" : "清空本机计划"}
          </button>
          <input
            ref={fileRef}
            type="file"
            aria-label="导入备份文件"
            accept=".json,application/json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) importJson(file);
              event.target.value = "";
            }}
          />
        </div>
        {msg && (
          <p role="status" className={`mt-3 text-xs font-medium ${msg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
            {msg.text}
          </p>
        )}
        <p className="mt-3 text-xs leading-relaxed text-zinc-400 dark:text-zinc-500">
          演出日历使用官方 JST 开演时间；个人任务按保存时记录的绝对时刻与用户时区导出。官方结果时间和付款期限只从关联渠道读取，未公布时不会自动生成。
        </p>
      </div>
    </section>
  );
}
