import EventDayClient from "@/components/trip/EventDayClient";
import { eventSummaries, venueSummaries } from "@/data/client-data";

export const metadata = { title: "演出日模式" };

export default async function EventDayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventDayClient tripId={id} events={eventSummaries} venues={venueSummaries} />;
}
