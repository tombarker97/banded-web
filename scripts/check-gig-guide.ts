// Validate gig guide week files the same way the site build does.
//
//   npm run gigs:check                                  # every week in data/gig-guide
//   npm run gigs:check -- data/gig-guide/2026-10-19.json
//
// Exits 1 if any file would be skipped by the build (warnings alone exit 0).

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { GIG_GUIDE_DIR, parseWeekFile } from "../src/lib/gig-guide.ts";

const paths = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(GIG_GUIDE_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => join(GIG_GUIDE_DIR, f));

let failed = false;
for (const path of paths) {
  const { week, warnings } = parseWeekFile(path);
  for (const w of warnings) console.warn(`  warn  ${w}`);
  if (week) {
    // e.g. ", 1 cancelled, 1 rescheduled" (gigs not on sale as normal).
    const counts = new Map<string, number>();
    for (const gig of week.days.flatMap((d) => d.gigs)) {
      if (gig.status !== "onsale") counts.set(gig.status, (counts.get(gig.status) ?? 0) + 1);
    }
    const statuses = [...counts].map(([status, n]) => `, ${n} ${status}`).join("");
    console.log(`  ok    ${week.weekStart}: ${week.rangeLabel}, ${week.gigCount} gigs over ${week.days.length} days${statuses}`);
  } else {
    failed = true;
    console.error(`  FAIL  ${path} would not be published`);
  }
}
process.exit(failed ? 1 : 0);
