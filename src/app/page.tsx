import DiscoverClient from "@/components/discover/DiscoverClient";
import { artistSummaries, eventSummaries, venueSummaries } from "@/data/client-data";

export default function Home() {
  return (
    <DiscoverClient
      events={eventSummaries}
      artists={artistSummaries}
      venues={venueSummaries}
    />
  );
}
