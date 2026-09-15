from pathlib import Path
import re


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"missing replacement target in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


# Ariake: keep URL classification local to the anchor row/paragraph.
replace_once(
    "scripts/parsers/ariake-arena.mjs",
    '''    const contexts = [anchor, ...$(anchor).parents().toArray()];
    const matched = contexts.find((node) => {
      const value = cleanText($(node).text());
      return value.includes(marker) && value.length <= 320;
    });
    if (matched) return url;''',
    '''    const localNodes = [
      $(anchor).closest("p,li,dd,dt,tr,td").first(),
      $(anchor).parent(),
    ];
    const matched = localNodes.some((node) => {
      if (!node?.length) return false;
      const value = cleanText(node.text());
      return value.includes(marker) && value.length <= 240;
    });
    if (matched) return url;''',
)
replace_once("scripts/adapters/ariake-arena-source.mjs", 'parserVersion: "1"', 'parserVersion: "2"')

# Smoke fixtures should match production's normalized artist-name set.
replace_once(
    "scripts/tokyo-garden-theater-smoke.mjs",
    'import assert from "node:assert/strict";\n',
    'import assert from "node:assert/strict";\nimport { normalizeName } from "./event-ingest-lib.mjs";\n',
)
replace_once(
    "scripts/tokyo-garden-theater-smoke.mjs",
    'knownArtistNames: new Set(["sung si kyung"]),',
    'knownArtistNames: new Set(["sung si kyung"].map(normalizeName)),',
)
replace_once(
    "scripts/world-memorial-hall-smoke.mjs",
    'import assert from "node:assert/strict";\n',
    'import assert from "node:assert/strict";\nimport { normalizeName } from "./event-ingest-lib.mjs";\n',
)
p = Path("scripts/world-memorial-hall-smoke.mjs")
text = p.read_text()
text, count = re.subn(
    r'const known = new Set\((\[.*?\])\);',
    r'const known = new Set(\1.map(normalizeName));',
    text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit("failed to normalize World Hall known artists")
p.write_text(text)

# Kuroko: trim trailing Japanese 'ほか/他' from an artist label.
replace_once(
    "scripts/parsers/kuroko-kun-hall.mjs",
    'const value = cleanText(match[1]);',
    'const value = cleanText(match[1]).replace(/\\s*(?:ほか|他)\\s*$/u, "");',
)
replace_once("scripts/adapters/kuroko-kun-hall-source.mjs", 'parserVersion: "1"', 'parserVersion: "2"')

# Big Hat: preserve <br> boundaries inside 日程/日時 cells.
p = Path("scripts/parsers/big-hat-nagano.mjs")
text = p.read_text()
marker = 'function scheduleText(bodyText) {'
if marker not in text:
    raise SystemExit("Big Hat scheduleText marker missing")
text = text.replace(
    marker,
    '''function scheduleText($, bodyText) {
  for (const node of $("th,dt").toArray()) {
    const label = cleanText($(node).text()).normalize("NFKC");
    if (label !== "日時" && label !== "日程") continue;
    const value = node.tagName?.toLowerCase() === "th"
      ? $(node).next("td").first()
      : $(node).next("dd").first();
    const clone = value.clone();
    clone.find("br").replaceWith("\\n");
    const direct = clone.text().normalize("NFKC").trim();
    if (direct) return direct;
  }
''',
    1,
)
old = 'function performancesFrom(bodyText, months) {\n  const text = scheduleText(bodyText);'
new = 'function performancesFrom($, bodyText, months) {\n  const text = scheduleText($, bodyText);'
if old not in text:
    raise SystemExit("Big Hat performancesFrom marker missing")
text = text.replace(old, new, 1)
old = 'const performances = performancesFrom(bodyText, months);'
if old not in text:
    raise SystemExit("Big Hat detail call marker missing")
text = text.replace(old, 'const performances = performancesFrom($, bodyText, months);', 1)
p.write_text(text)
replace_once("scripts/adapters/big-hat-nagano-source.mjs", 'parserVersion: "1"', 'parserVersion: "2"')

# GENERATIONS: normalize live Nagano display to stable venue map key.
p = Path("scripts/parsers/generations-parallel-quest-v2.mjs")
text = p.read_text()
needle = '    .replace(/^北海道立総合体育センター\\s+北海きたえーる$/u, "北海きたえーる")\n    .trim();'
replacement = '    .replace(/^北海道立総合体育センター\\s+北海きたえーる$/u, "北海きたえーる")\n    .replace(/^長野\\s*ビッグハット$/u, "ビッグハット")\n    .trim();'
if needle not in text:
    raise SystemExit("GENERATIONS venue normalization marker missing")
p.write_text(text.replace(needle, replacement, 1))
