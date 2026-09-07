"use client";
import DiscoverClient from "@/components/discover/DiscoverClient";
import type { ArtistSummary, EventSummary, VenueSummary } from "@/lib/types";
import { useFrontend } from "./frontend-store";
import PaperHome from "./PaperHome";
export default function HomeFrontends(props: { events: EventSummary[]; artists: ArtistSummary[]; venues: VenueSummary[] }) {
  return useFrontend() === "paper" ? <PaperHome {...props}/> : <DiscoverClient {...props}/>;
}
