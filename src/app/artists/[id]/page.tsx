import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, History } from "lucide-react";
import { artistById } from "@/data";
import { eventSummaries, summaryArtistsOf, summaryVenueOf } from "@/data/client-data";
import { todayJst } from "@/lib/time";
import ArtistAvatar from "@/components/ui/ArtistAvatar";
import FollowButton from "@/components/artist/FollowButton";
import EventRow from "@/components/event/EventRow";
import { GENRE_LABEL } from "@/components/event/status";

export default async function ArtistPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const artist = artistById.get(id);
  if (!artist) notFound();

  const today = todayJst();
  const all = eventSummaries.filter((event) => event.artistIds.includes(artist.id));
  const upcoming = all
    .filter((e) => e.date >= today)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const past = all
    .filter((e) => e.date < today)
    .sort((a, b) => (a.date > b.date ? -1 : 1));

  return (
    <div className="mx-auto max-w-6xl px-4 pt-4">
      <Link
        href="/events"
        prefetch={false}
        className="inline-flex items-center gap-1 text-xs font-medium text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
      >
        <ArrowLeft size={13} /> 返回
      </Link>

      {/* 头部 */}
      <header
        className="mt-3 overflow-hidden rounded-3xl p-6 text-white sm:p-8"
        style={{
          background: `linear-gradient(130deg, ${artist.color}, ${artist.color}88 55%, #111827)`,
        }}
      >
        <div className="flex flex-wrap items-center gap-5">
          <ArtistAvatar artist={artist} size={84} className="ring-4 ring-white/25" />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold sm:text-3xl">{artist.nameJa}</h1>
            <p className="mt-0.5 text-sm text-white/80">
              {artist.nameZh && artist.nameZh !== artist.nameJa && `${artist.nameZh} · `}
              {artist.romaji ?? (artist.profileStatus === "minimal" ? "官方日文名" : "")}
              {artist.kana && <span className="ml-2 text-white/50">{artist.kana}</span>}
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {artist.genres.map((g) => (
                <span
                  key={g}
                  className="rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold backdrop-blur"
                >
                  {GENRE_LABEL[g]}
                </span>
              ))}
              {artist.profileStatus === "minimal" && (
                <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-white/70">
                  最小已验证资料
                </span>
              )}
              {artist.aliases.map((al) => (
                <span
                  key={al}
                  className="rounded-full bg-black/20 px-2.5 py-0.5 text-[11px] text-white/70"
                >
                  {al}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <FollowButton artistId={artist.id} />
            <span className="text-xs font-bold text-emerald-200">
              {upcoming.length} 场官方来源公演
            </span>
          </div>
        </div>
      </header>

      {/* 即将公演 */}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">
          即将公演
          <span className="ml-2 text-xs font-normal text-zinc-400">
            {upcoming.length} 场收录
          </span>
        </h2>
        <div className="space-y-2.5">
          {upcoming.map((e) => (
            <EventRow key={e.id} event={e} artists={summaryArtistsOf(e)} venue={summaryVenueOf(e)} />
          ))}
          {upcoming.length === 0 && (
            <p className="rounded-2xl border border-dashed border-zinc-300 py-12 text-center text-sm text-zinc-400 dark:border-zinc-700">
              暂无收录的未来公演,关注后有新公演会第一时间提醒
            </p>
          )}
        </div>
      </section>

      {/* 过往 */}
      {past.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-zinc-400">
            <History size={14} /> 过往公演
          </h2>
          <div className="space-y-2.5">
            {past.slice(0, 6).map((e) => (
              <EventRow key={e.id} event={e} artists={summaryArtistsOf(e)} venue={summaryVenueOf(e)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
