function normalize(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("ja")
    .replace(/[\s・･\-_/()（）「」『』]+/gu, "");
}

function overlapScore(left, right) {
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) / Math.max(a.length, b.length);
  const leftChars = new Set([...a]);
  const common = [...new Set([...b])].filter((char) => leftChars.has(char)).length;
  return common / Math.max(leftChars.size, new Set([...b]).size, 1);
}

function scoreObservation(observation, event) {
  let score = 0;
  if (observation.date && observation.date === event.date) score += 0.35;
  if (observation.venueName && overlapScore(observation.venueName, event.venueName ?? event.venueId) >= 0.75) score += 0.3;
  if (observation.startTime && observation.startTime === event.startTime) score += 0.15;
  if (observation.artistNames?.length && observation.artistNames.some((name) =>
    (event.artistNames ?? []).some((candidate) => overlapScore(name, candidate) >= 0.75))) score += 0.15;
  if (observation.title && overlapScore(observation.title, event.title ?? event.titleJa) >= 0.6) score += 0.05;
  return score;
}

/**
 * 来源链提示只用于缩小候选，不能绕过日期、场馆和（有歧义时的）开演时间核对。
 * probable 只用于复核，调用方不得发布。
 */
export function matchTicketObservation(observation, events, hintedEventId = null) {
  const hintedEvent = hintedEventId ? events.find((event) => event.id === hintedEventId) : null;
  if (hintedEvent) {
    const hintedScore = scoreObservation(observation, hintedEvent);
    const sameDateVenue = hintedEvent.date && hintedEvent.venueName
      ? events.filter((event) =>
          event.date === hintedEvent.date &&
          overlapScore(event.venueName ?? event.venueId, hintedEvent.venueName) >= 0.75)
      : [];
    const ambiguousStartTime = sameDateVenue.length > 1 && hintedEvent.startTime;
    if (hintedScore >= 0.65 && (!ambiguousStartTime || observation.startTime === hintedEvent.startTime)) {
      return { eventId: hintedEvent.id, level: "confirmed", reason: "source_chain_match", score: hintedScore };
    }
  }

  const sameDateVenue = observation.date && observation.venueName
    ? events.filter((event) =>
        event.date === observation.date &&
        overlapScore(observation.venueName, event.venueName ?? event.venueId) >= 0.75)
    : [];
  if (sameDateVenue.length === 1) {
    return { eventId: sameDateVenue[0].id, level: "confirmed", reason: "date_venue", score: scoreObservation(observation, sameDateVenue[0]) };
  }
  if (sameDateVenue.length > 1 && observation.startTime) {
    const exactTime = sameDateVenue.filter((event) => event.startTime === observation.startTime);
    if (exactTime.length === 1) {
      return { eventId: exactTime[0].id, level: "confirmed", reason: "date_venue_time", score: scoreObservation(observation, exactTime[0]) };
    }
  }

  const ranked = events
    .map((event) => ({ event, score: scoreObservation(observation, event) }))
    .sort((left, right) => right.score - left.score);
  const best = ranked[0];
  if (best && best.score >= 0.45) {
    return { eventId: best.event.id, level: "probable", reason: sameDateVenue.length > 1 ? "ambiguous_same_day_venue" : "light_score", score: best.score };
  }
  return { eventId: null, level: "unmatched", reason: "insufficient_evidence", score: best?.score ?? 0 };
}
