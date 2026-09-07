import ApplicationsBoard from "@/components/frontend/ApplicationsBoard";
import { eventSummaries } from "@/data/client-data";
export const metadata = { title: "抽选记录" };
export default function ApplicationsPage() { return <ApplicationsBoard events={eventSummaries}/>; }
