import TripDetailClient from "@/components/trip/TripDetailClient";
import { eventSummaries, venueSummaries } from "@/data/client-data";

export const metadata = { title: "远征详情" };

export default async function TripDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TripDetailClient tripId={id} events={eventSummaries} venues={venueSummaries} />;
}
