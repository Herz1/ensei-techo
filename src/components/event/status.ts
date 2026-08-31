import type { EventStatus, EventType, Genre, VenueTier } from "@/lib/types";
import type { EventItem } from "@/lib/types";

export const STATUS_META: Record<
  EventStatus,
  { label: string; zh: string; cls: string; dot: string }
> = {
  announced: {
    label: "情報解禁",
    zh: "情报公开",
    cls: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
    dot: "bg-zinc-400",
  },
  lottery: {
    label: "抽選受付中",
    zh: "抽选中",
    cls: "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
    dot: "bg-violet-500",
  },
  on_sale: {
    label: "一般発売中",
    zh: "售票中",
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  sold_out: {
    label: "SOLD OUT",
    zh: "已售罄",
    cls: "bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-300",
    dot: "bg-red-500",
  },
  resale: {
    label: "リセール中",
    zh: "官方转售",
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  ended: {
    label: "公演終了",
    zh: "已结束",
    cls: "bg-zinc-100 text-zinc-400 dark:bg-zinc-800/60 dark:text-zinc-500",
    dot: "bg-zinc-300 dark:bg-zinc-600",
  },
};

export const TYPE_LABEL: Record<EventType, string> = {
  oneman: "ワンマン",
  taiban: "対バン",
  fes: "フェス",
  idol_seiyu: "偶像/声优",
  release_event: "リリイベ",
};

export const GENRE_LABEL: Record<Genre, string> = {
  jpop: "J-POP",
  jrock: "J-ROCK",
  idol: "偶像",
  seiyu_anison: "声优/アニソン",
  visual_kei: "V系",
  vtuber: "VTuber",
  hiphop_rnb: "HipHop/R&B",
  electronic: "电子",
  alt_indie: "另类/独立",
};

export const TIER_LABEL: Record<VenueTier, string> = {
  livehouse: "Livehouse",
  hall: "音乐厅",
  arena: "竞技馆",
  dome: "巨蛋",
  stadium: "体育场",
};

export function minPrice(e: Pick<EventItem, "tiers">): number | null {
  if (!e.tiers.length) return null;
  return Math.min(...e.tiers.map((t) => t.priceJpy));
}
