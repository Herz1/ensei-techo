"use client";

import { BellRing, Plus } from "lucide-react";
import { useFollows } from "@/lib/store";

export default function FollowButton({ artistId }: { artistId: string }) {
  const { has, toggle } = useFollows();
  const active = has(artistId);

  return (
    <button
      onClick={() => toggle(artistId)}
      className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition ${
        active
          ? "bg-brand text-white shadow-lg shadow-violet-500/30"
          : "border border-zinc-300 text-zinc-700 hover:border-brand hover:text-brand-strong dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-violet-400 dark:hover:text-violet-300"
      }`}
    >
      {active ? <BellRing size={15} /> : <Plus size={15} />}
      {active ? "已关注 · 新公演提醒" : "关注"}
    </button>
  );
}
