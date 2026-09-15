# Round 7 — みずほPayPayドーム福岡 official schedule source

- Source: https://www.softbankhawks.co.jp/stadium/event_schedule/<year>/
- Scope: music performances only; non-music dome events are deliberately filtered out.
- Venue: existing `mizuho-paypay-dome` entity.
- Pipeline: raw evidence -> candidates -> field review -> publish.
- Formal `events.json` is not modified by this source adapter.
- Rollback branch: `backup/2026-09-15-pre-round7`.
- Validation note: smoke test was added, but the current execution environment could not reach raw.githubusercontent.com for local dependency-backed execution; do not claim full `npm run check` passed.
