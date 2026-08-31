import "server-only";
import type {
  ArtistSummary,
  EventStatus,
  EventSummary,
  EventSummaryIndex,
  SalePhase,
  VenueSummary,
} from "@/lib/types";
import {
  deriveLegacyTicketOffers,
  normalizeTicketOfferSaleStatus,
} from "@/lib/ticket-offer";
import { deriveEventDisplayStatus } from "@/lib/ticket-trust-core.mjs";
import { todayJst } from "@/lib/time";
import summaryJson from "./generated/event-summary-index.json";

const raw = summaryJson as unknown as EventSummaryIndex;

function phaseStatus(phase: SalePhase, today: string): SalePhase["status"] {
  if (phase.end < today) return "closed";
  if (phase.start <= today) return "open";
  return "upcoming";
}

const today = todayJst();

export const eventSummaries: EventSummary[] = raw.events.map((event) => {
  const phases = event.phases.map((phase) => ({
    ...phase,
    status: phaseStatus(phase, today),
  }));
  const eventStatus = event.eventStatus ?? (event.date < today ? "completed" : "scheduled");
  const normalized = { ...event, eventStatus, phases };
  const offers = event.ticketOffers.length
    ? event.ticketOffers
    : deriveLegacyTicketOffers(normalized);
  const ticketOffers = offers.map((offer) => normalizeTicketOfferSaleStatus(offer));
  return {
    ...normalized,
    phases,
    ticketOffers,
    status: deriveEventDisplayStatus(normalized, ticketOffers, today) as EventStatus,
  };
});

export const artistSummaries = raw.artists as ArtistSummary[];
export const venueSummaries = raw.venues as VenueSummary[];
export const eventSummaryById = new Map(eventSummaries.map((event) => [event.id, event]));
export const artistSummaryById = new Map(artistSummaries.map((artist) => [artist.id, artist]));
export const venueSummaryById = new Map(venueSummaries.map((venue) => [venue.id, venue]));

export function summaryArtistsOf(event: Pick<EventSummary, "artistIds">): ArtistSummary[] {
  return event.artistIds
    .map((id) => artistSummaryById.get(id))
    .filter((artist): artist is ArtistSummary => Boolean(artist));
}

export function summaryVenueOf(event: Pick<EventSummary, "venueId">): VenueSummary | undefined {
  return venueSummaryById.get(event.venueId);
}

export function eventSummarySlice(ids: Iterable<string>): EventSummary[] {
  return [...ids]
    .map((id) => eventSummaryById.get(id))
    .filter((event): event is EventSummary => Boolean(event));
}

export function eventPlanReferences() {
  return eventSummaries.map(({ id, artistIds, titleJa, date }) => ({
    id,
    artistIds,
    titleJa,
    date,
  }));
}
