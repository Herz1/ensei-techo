"use client";

import { useState } from "react";
import { Check, Settings2 } from "lucide-react";
import { prefectures } from "@/data/prefectures";
import type { DisplayCurrency, DisplayTimeZone } from "@/lib/store";
import { usePreferences } from "@/lib/store";
import SectionTitle from "./SectionTitle";

const FIELD = "mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none dark:border-zinc-700 dark:bg-zinc-900";

export default function PreferencesPanel() {
  const { preferences, updatePreferences } = usePreferences();
  const [homePrefecture, setHomePrefecture] = useState(preferences.homePrefecture ?? "");
  const [origin, setOrigin] = useState(preferences.origin ?? "");
  const [currency, setCurrency] = useState<DisplayCurrency>(preferences.currency);
  const [timeZone, setTimeZone] = useState<DisplayTimeZone>(preferences.timeZone);
  const [saved, setSaved] = useState(false);

  return (
    <section>
      <SectionTitle icon={<Settings2 size={18} />} title="偏好设置" sub="影响全站参考币种、时间换算和地区发现" />
      <form
        className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 sm:grid-cols-2 dark:border-zinc-800 dark:bg-card-dark"
        onSubmit={(event) => {
          event.preventDefault();
          updatePreferences({
            setupStatus: "completed",
            homePrefecture: homePrefecture || undefined,
            origin: origin.trim() || undefined,
            currency,
            timeZone,
          });
          setSaved(true);
        }}
      >
        <label className="text-xs font-semibold text-zinc-500">常驻都道府县
          <select value={homePrefecture} onChange={(event) => { setHomePrefecture(event.target.value); setSaved(false); }} className={FIELD}>
            <option value="">未设置</option>
            {prefectures.map((prefecture) => <option key={prefecture.id} value={prefecture.id}>{prefecture.nameZh}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-zinc-500">常用出发地
          <input value={origin} onChange={(event) => { setOrigin(event.target.value); setSaved(false); }} placeholder="例如：上海虹桥 / 东京站" className={FIELD} />
        </label>
        <label className="text-xs font-semibold text-zinc-500">参考币种
          <select value={currency} onChange={(event) => { setCurrency(event.target.value as DisplayCurrency); setSaved(false); }} className={FIELD}>
            <option value="CNY">人民币 CNY</option>
            <option value="JPY">仅显示日元 JPY</option>
            <option value="USD">美元 USD</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-zinc-500">时间换算
          <select value={timeZone} onChange={(event) => { setTimeZone(event.target.value as DisplayTimeZone); setSaved(false); }} className={FIELD}>
            <option value="browser">跟随设备时区</option>
            <option value="Asia/Tokyo">仅显示日本时间 JST</option>
            <option value="Asia/Shanghai">同时显示中国标准时间</option>
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 text-sm font-bold text-white hover:bg-violet-700"><Check size={15} /> 保存偏好</button>
          <p className={`text-xs ${saved ? "text-emerald-600 dark:text-emerald-300" : "text-zinc-400"}`} role="status">
            {saved ? "已保存并应用到全站" : "JPY 始终作为票价主值；CNY / USD 仅为非实时参考。"}
          </p>
        </div>
      </form>
    </section>
  );
}
