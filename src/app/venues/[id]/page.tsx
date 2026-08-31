import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Box, MapPin, Train, Users } from "lucide-react";
import { venueById } from "@/data";
import { eventSummaries, summaryArtistsOf, summaryVenueOf } from "@/data/client-data";
import { prefectureById } from "@/data/prefectures";
import { todayJst } from "@/lib/time";
import EventRow from "@/components/event/EventRow";
import { TIER_LABEL } from "@/components/event/status";

export default async function VenuePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const venue = venueById.get(id);
  if (!venue) notFound();

  const pref = prefectureById.get(venue.prefecture);
  const today = todayJst();
  const upcoming = eventSummaries
    .filter((event) => event.venueId === venue.id)
    .filter((e) => e.date >= today)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const tierGradient: Record<string, string> = {
    dome: "from-rose-600 to-orange-500",
    stadium: "from-red-600 to-rose-500",
    arena: "from-violet-600 to-fuchsia-500",
    hall: "from-blue-600 to-cyan-500",
    livehouse: "from-emerald-600 to-teal-500",
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pt-4">
      <Link
        href="/map"
        prefetch={false}
        className="inline-flex items-center gap-1 text-xs font-medium text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
      >
        <ArrowLeft size={13} /> 地图
      </Link>

      <header
        className={`mt-3 rounded-3xl bg-gradient-to-br p-6 text-white sm:p-8 ${venue.tier ? tierGradient[venue.tier] : "from-zinc-700 to-zinc-500"}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-bold backdrop-blur">
              {venue.tier ? TIER_LABEL[venue.tier] : "最小已验证资料"}
            </span>
            <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{venue.nameJa}</h1>
            <p className="mt-1 text-sm text-white/80">
              {[venue.nameZh, pref?.nameZh, venue.city].filter(Boolean).join(" · ")}
            </p>
          </div>
          {venue.capacity !== null && <div className="text-right">
            <p className="flex items-center justify-end gap-1.5 text-2xl font-bold tabular-nums">
              <Users size={20} className="opacity-70" />
              {venue.capacity.toLocaleString()}
            </p>
            <p className="text-xs text-white/70">收容人数(约)</p>
          </div>}
        </div>
        {venue.model3d && (
          <Link
            href={`/venues/${venue.id}/3d`}
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-white/95 px-5 py-2.5 text-sm font-bold text-zinc-900 shadow-xl transition hover:bg-white"
          >
            <Box size={16} /> 打开 3D 座位视野
          </Link>
        )}
      </header>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <section className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-5 lg:col-span-1 dark:border-zinc-800 dark:bg-card-dark">
          <h2 className="flex items-center gap-2 text-sm font-bold text-zinc-500 dark:text-zinc-400">
            <Train size={15} /> 交通アクセス
          </h2>
          <div className="mt-3 space-y-2.5">
            {venue.stations.map((s) => (
              <div key={s.line + s.station} className="text-sm">
                <p className="font-semibold">
                  {s.station}
                  <span className="ml-2 text-xs font-normal text-zinc-400">
                    徒步 {s.walkMin} 分
                  </span>
                </p>
                <p className="text-xs text-zinc-400">{s.line}</p>
              </div>
            ))}
            {venue.stations.length === 0 && (
              <p className="text-xs text-zinc-400">无近距离轨道交通,建议巴士/出租车</p>
            )}
          </div>
          {venue.hubAccess.length > 0 && (
            <div className="mt-4 space-y-1.5 border-t border-zinc-100 pt-3 dark:border-zinc-800">
              <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400">
                从主要枢纽出发
              </p>
              {venue.hubAccess.map((h) => (
                <p key={h.from} className="text-xs text-zinc-500 dark:text-zinc-400">
                  <b>{h.from}</b>:{h.route}(约 {h.min} 分)
                </p>
              ))}
            </div>
          )}
          {venue.lockers && (
            <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
              🧳 {venue.lockers}
            </p>
          )}
          {venue.notes && (
            <p className="mt-3 text-xs leading-relaxed text-zinc-400">
              💡 {venue.notes}
            </p>
          )}
          {venue.lat !== null && venue.lng !== null && (
            <p className="mt-4 flex items-center gap-1 border-t border-zinc-100 pt-3 text-[11px] text-zinc-400 dark:border-zinc-800">
              <MapPin size={12} />
              {venue.lat.toFixed(4)}, {venue.lng.toFixed(4)}
            </p>
          )}
        </section>

        <section className="min-w-0 lg:col-span-2">
          <h2 className="mb-3 text-lg font-bold">
            这里的演出
            <span className="ml-2 text-xs font-normal text-zinc-400">
              {upcoming.length} 场即将举行
            </span>
          </h2>
          <div className="space-y-2.5">
            {upcoming.slice(0, 20).map((e) => (
              <EventRow key={e.id} event={e} artists={summaryArtistsOf(e)} venue={summaryVenueOf(e)} />
            ))}
            {upcoming.length === 0 && (
              <p className="rounded-2xl border border-dashed border-zinc-300 py-12 text-center text-sm text-zinc-400 dark:border-zinc-700">
                暂无收录的未来公演
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
