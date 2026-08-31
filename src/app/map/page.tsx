import { redirect } from "next/navigation";

export const metadata = { title: "日本 Live 地图" };

export default function MapPage() {
  redirect("/events?view=map");
}
