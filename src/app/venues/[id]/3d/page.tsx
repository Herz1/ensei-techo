import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Users } from "lucide-react";
import { venueById } from "@/data";
import { prefectureById } from "@/data/prefectures";
import Venue3DClient from "@/components/venue3d/Venue3DClient";

export const metadata = { title: "3D 座位视野" };

export default async function Venue3dPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const venue = venueById.get(id);
  if (!venue || !venue.model3d) notFound();
  const pref = prefectureById.get(venue.prefecture);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={`/venues/${venue.id}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
        >
          <ArrowLeft size={13} /> {venue.nameJa}
        </Link>
        <p className="flex items-center gap-3 text-xs text-zinc-400">
          <span>
            {pref?.nameZh}
            {venue.city}
          </span>
          {venue.capacity !== null && (
            <span className="flex items-center gap-1">
              <Users size={12} /> 约 {venue.capacity.toLocaleString()} 人
            </span>
          )}
        </p>
      </div>
      <div className="mt-3 h-[calc(100dvh-11rem)] min-h-105">
        <Venue3DClient modelKey={venue.model3d} venueName={venue.nameJa} />
      </div>
      <p className="mt-3 pb-4 text-center text-[11px] text-zinc-400">
        低多边形几何模拟,分区划分与真实场馆存在差异,视野仅供参考 · 示例数据
      </p>
    </div>
  );
}
