"use client";

import { useMemo, useState } from "react";
import { Check, MapPin, Settings2, SkipForward, UserPlus } from "lucide-react";
import { prefectures } from "@/data/prefectures";
import type { ArtistSummary } from "@/lib/types";
import {
  type DisplayCurrency,
  type DisplayTimeZone,
  useFollows,
  usePreferences,
} from "@/lib/store";
import ArtistAvatar from "@/components/ui/ArtistAvatar";

const FIELD =
  "mt-1 h-10 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm outline-none focus:border-violet-500 dark:border-violet-800 dark:bg-zinc-900";

export default function FirstRunSetup({
  artists,
  onDone,
}: {
  artists: ArtistSummary[];
  onDone?: () => void;
}) {
  const { preferences, updatePreferences } = usePreferences();
  const { items: followedIds, toggle } = useFollows();
  const [query, setQuery] = useState("");
  const [homePrefecture, setHomePrefecture] = useState(
    preferences.homePrefecture ?? "",
  );
  const [origin, setOrigin] = useState(preferences.origin ?? "");
  const [currency, setCurrency] = useState<DisplayCurrency>(preferences.currency);
  const [timeZone, setTimeZone] = useState<DisplayTimeZone>(preferences.timeZone);

  const artistChoices = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return artists
      .filter((artist) => {
        if (!needle) return artist.popularity !== undefined;
        return [artist.nameJa, artist.nameZh, artist.romaji, ...artist.aliases]
          .filter(Boolean)
          .some((name) => String(name).toLowerCase().includes(needle));
      })
      .sort((left, right) => (right.popularity ?? 0) - (left.popularity ?? 0))
      .slice(0, 12);
  }, [artists, query]);

  const finish = (status: "completed" | "skipped") => {
    updatePreferences({
      setupStatus: status,
      homePrefecture: homePrefecture || undefined,
      origin: origin.trim() || undefined,
      currency,
      timeZone,
    });
    onDone?.();
  };

  return (
    <section className="rounded-3xl border border-violet-200 bg-violet-50/70 p-4 sm:p-6 dark:border-violet-900 dark:bg-violet-500/10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-base font-bold">
            <Settings2 size={17} className="text-brand-strong dark:text-violet-300" />
            让发现页更贴近你的远征
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            可跳过，设置仅保存在本机，之后仍可回来修改。
          </p>
        </div>
        <button
          type="button"
          onClick={() => finish("skipped")}
          className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-zinc-400 hover:bg-white hover:text-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
        >
          <SkipForward size={13} /> 暂时跳过
        </button>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div>
          <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            <span className="inline-flex items-center gap-1">
              <UserPlus size={13} /> 选择关注艺人
            </span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索艺人名称"
              className={FIELD}
            />
          </label>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {artistChoices.map((artist) => {
              const active = followedIds.includes(artist.id);
              return (
                <button
                  key={artist.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggle(artist.id)}
                  className={`flex min-w-0 items-center gap-2 rounded-xl border p-2 text-left text-xs font-semibold transition ${
                    active
                      ? "border-violet-400 bg-violet-100 text-violet-800 dark:border-violet-500 dark:bg-violet-500/20 dark:text-violet-200"
                      : "border-zinc-200 bg-white text-zinc-600 hover:border-violet-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                  }`}
                >
                  <ArtistAvatar artist={artist} size={26} />
                  <span className="min-w-0 flex-1 truncate">{artist.nameJa}</span>
                  {active && <Check size={12} className="shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid content-start gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            <span className="inline-flex items-center gap-1">
              <MapPin size={13} /> 常驻都道府县
            </span>
            <select
              value={homePrefecture}
              onChange={(event) => setHomePrefecture(event.target.value)}
              className={FIELD}
            >
              <option value="">未设置</option>
              {prefectures.map((prefecture) => (
                <option key={prefecture.id} value={prefecture.id}>
                  {prefecture.nameZh}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            常用出发地
            <input
              value={origin}
              onChange={(event) => setOrigin(event.target.value)}
              placeholder="例如：上海虹桥 / 东京站"
              className={FIELD}
            />
          </label>
          <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            显示币种
            <select
              value={currency}
              onChange={(event) => setCurrency(event.target.value as DisplayCurrency)}
              className={FIELD}
            >
              <option value="CNY">人民币 CNY</option>
              <option value="JPY">日元 JPY</option>
              <option value="USD">美元 USD</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            显示时区
            <select
              value={timeZone}
              onChange={(event) => setTimeZone(event.target.value as DisplayTimeZone)}
              className={FIELD}
            >
              <option value="browser">跟随设备</option>
              <option value="Asia/Tokyo">日本时间 JST</option>
              <option value="Asia/Shanghai">中国标准时间</option>
            </select>
          </label>
        </div>
      </div>

      <button
        type="button"
        onClick={() => finish("completed")}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-bold text-white hover:bg-brand-strong sm:w-auto"
      >
        <Check size={15} /> 保存并开始发现
      </button>
    </section>
  );
}
