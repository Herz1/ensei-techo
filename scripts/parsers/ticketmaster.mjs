import { makeSourceRecord } from "../event-ingest-lib.mjs";

export function parseTicketmasterEvents(payload, source) {
  const events = payload?._embedded?.events;
  if (!Array.isArray(events)) return [];

  return events.flatMap((event) => {
    const date = event?.dates?.start?.localDate;
    const title = event?.name;
    const venue = event?._embedded?.venues?.[0];
    if (!date || !title || !venue?.name) return [];
    const pricesJpy = (event.priceRanges ?? [])
      .filter((range) => range.currency === "JPY")
      .flatMap((range) => [range.min, range.max])
      .filter((price) => Number.isFinite(price))
      .map(Math.round);

    return [makeSourceRecord(source, {
      sourceEventId: event.id,
      sourceUrl: event.url || source.url,
      title,
      artistNames: (event?._embedded?.attractions ?? []).map((item) => item.name),
      venueName: venue.name,
      date,
      startTime: event?.dates?.start?.localTime,
      ticketUrl: event.url,
      pricesJpy,
      fieldAvailability: {
        ticketTypes: "source_does_not_disclose",
        additionalFees: "source_does_not_disclose",
        ticketPhases: "source_does_not_disclose",
        eligibility: "source_does_not_disclose",
      },
      statusHint: event?.dates?.status?.code || "unknown",
    })];
  });
}
