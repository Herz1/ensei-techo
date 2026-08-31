import MeClient from "@/components/me/MeClient";
import { artistSummaries, eventSummaries, venueSummaries } from "@/data/client-data";

export const metadata = { title: "我的" };

export default function MePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-4">
      <h1 className="mb-4 text-xl font-bold">
        我的
        <span className="ml-2 text-xs font-normal text-zinc-400">
          历史、关注与本机设置
        </span>
      </h1>
      <MeClient events={eventSummaries} artists={artistSummaries} venues={venueSummaries} />
    </div>
  );
}
