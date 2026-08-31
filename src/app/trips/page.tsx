import TripsClient from "@/components/trip/TripsClient";
import { eventSummaries, venueSummaries } from "@/data/client-data";

export const metadata = { title: "远征" };

export default function TripsPage() {
  return <TripsClient events={eventSummaries} venues={venueSummaries} />;
}
