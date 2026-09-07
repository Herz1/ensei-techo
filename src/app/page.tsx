import HomeFrontends from "@/components/frontend/HomeFrontends";
import { artistSummaries, eventSummaries, venueSummaries } from "@/data/client-data";

export default function Home() {
  return (
    <HomeFrontends
      events={eventSummaries}
      artists={artistSummaries}
      venues={venueSummaries}
    />
  );
}
