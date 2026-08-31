import RankingsTabs from "@/components/rankings/RankingsTabs";
import { artistSummaries, eventSummaries, venueSummaries } from "@/data/client-data";

export const metadata = { title: "收录统计" };

export default function RankingsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 pt-4">
      <h1 className="mb-4 text-xl font-bold">
        收录统计
        <span className="ml-2 text-xs font-normal text-zinc-400">
          已核验未来公演 · 不使用模拟热度
        </span>
      </h1>
      <RankingsTabs events={eventSummaries} artists={artistSummaries} venues={venueSummaries} />
    </div>
  );
}
