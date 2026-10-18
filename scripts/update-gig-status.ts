// Daily Ticketmaster status refresh for gig guide weeks that haven't ended.
// Run by .github/workflows/gig-guide-status.yml.
//
//   TICKETMASTER_API_KEY=... node scripts/update-gig-status.ts
//
// Only ever edits a gig's "status", "newDate" and "newStartTime". Never moves a
// gig between days, never removes one, never touches any other field or file.
// A gig whose tmEventId is missing from the API response is left unchanged.
// TICKETMASTER_API_URL overrides the endpoint (for testing against a stub).

import { appendFileSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GIG_GUIDE_DIR, parseWeek, type GigStatus } from "../src/lib/gig-guide.ts";

const API_URL =
  process.env.TICKETMASTER_API_URL ?? "https://app.ticketmaster.com/discovery/v2/events.json";
const API_KEY = process.env.TICKETMASTER_API_KEY;
const BATCH_SIZE = 50;

interface GigJson {
  tmEventId?: unknown;
  headliner?: unknown;
  startTime?: unknown;
  status?: unknown;
  newDate?: unknown;
  newStartTime?: unknown;
}

interface TmEvent {
  id: string;
  dates?: {
    start?: { localDate?: string; localTime?: string };
    status?: { code?: string };
  };
}

interface Ref {
  file: string;
  date: string;
  gig: GigJson;
}

interface Next {
  status: GigStatus;
  newDate?: string;
  newStartTime?: string;
}

const STATUS_CODES: Record<string, GigStatus> = {
  onsale: "onsale",
  offsale: "offsale",
  cancelled: "cancelled",
  canceled: "cancelled",
  postponed: "postponed",
  rescheduled: "rescheduled",
};

/** What the gig's status fields should be, or undefined to leave it alone. */
function nextStatus(event: TmEvent, date: string, gig: GigJson): Next | undefined {
  const status = STATUS_CODES[event.dates?.status?.code?.toLowerCase() ?? ""];
  if (!status) return undefined;
  if (status === "cancelled" || status === "postponed") return { status };

  const localDate = event.dates?.start?.localDate;
  const localTime = event.dates?.start?.localTime?.slice(0, 5);
  if (localDate && localDate !== date) {
    return { status: "rescheduled", newDate: localDate, newStartTime: localTime };
  }
  if (status === "rescheduled") {
    return {
      status,
      newStartTime: localTime && localTime !== gig.startTime ? localTime : undefined,
    };
  }
  return { status };
}

/** Write the new fields in place. Returns false if nothing actually changed. */
function apply(gig: GigJson, next: Next): boolean {
  const current = gig.status ?? "onsale";
  if (
    current === next.status &&
    gig.newDate === next.newDate &&
    gig.newStartTime === next.newStartTime
  ) {
    return false;
  }
  gig.status = next.status;
  if (next.newDate) gig.newDate = next.newDate;
  else delete gig.newDate;
  if (next.newStartTime) gig.newStartTime = next.newStartTime;
  else delete gig.newStartTime;
  return true;
}

function describe(fields: { status?: unknown; newDate?: unknown; newStartTime?: unknown }): string {
  const moved = [fields.newDate, fields.newStartTime].filter(Boolean).join(" ");
  return `${fields.status ?? "onsale"}${moved ? ` (${moved})` : ""}`;
}

async function fetchEvents(ids: string[]): Promise<TmEvent[]> {
  const url = `${API_URL}?id=${ids.map(encodeURIComponent).join(",")}&size=${BATCH_SIZE}&locale=*&apikey=${API_KEY}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Ticketmaster responded ${res.status} ${res.statusText}`);
  const body = (await res.json()) as { _embedded?: { events?: TmEvent[] } };
  return body._embedded?.events ?? [];
}

function serialise(data: unknown, original: string): string {
  let json = JSON.stringify(data, null, 2);
  // Keep the file ASCII-only if it was (Python's json.dump default).
  if (/^[\x00-\x7f]*$/.test(original)) {
    json = json.replace(/[\u0080-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
  }
  return original.endsWith("\n") ? `${json}\n` : json;
}

async function main(): Promise<number> {
  if (!API_KEY) {
    console.error("TICKETMASTER_API_KEY is not set.");
    return 1;
  }

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const files = new Map<string, { data: Record<string, unknown>; original: string }>();
  const refs = new Map<string, Ref[]>();

  for (const name of readdirSync(GIG_GUIDE_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))) {
    const path = join(GIG_GUIDE_DIR, name);
    const original = readFileSync(path, "utf8");
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(original);
    } catch (err) {
      console.warn(`${name}: not valid JSON, skipped (${(err as Error).message})`);
      continue;
    }
    if (typeof data.weekEnd !== "string" || data.weekEnd < today) continue;
    files.set(name, { data, original });

    for (const day of Array.isArray(data.days) ? data.days : []) {
      for (const gig of Array.isArray(day?.gigs) ? (day.gigs as GigJson[]) : []) {
        if (typeof gig?.tmEventId !== "string" || !gig.tmEventId) continue;
        const list = refs.get(gig.tmEventId) ?? [];
        list.push({ file: name, date: String(day.date), gig });
        refs.set(gig.tmEventId, list);
      }
    }
  }

  const ids = [...refs.keys()];
  console.log(`Checking ${ids.length} events in ${files.size} current week file(s) (today ${today}).`);

  const events = new Map<string, TmEvent>();
  let failed = false;
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    try {
      for (const event of await fetchEvents(batch)) events.set(event.id, event);
    } catch (err) {
      failed = true;
      console.error(`Batch ${i / BATCH_SIZE + 1} failed, its gigs are left unchanged: ${(err as Error).message}`);
    }
    // Discovery API allows 5 requests/second.
    if (i + BATCH_SIZE < ids.length) await new Promise((r) => setTimeout(r, 300));
  }

  const changesByFile = new Map<string, string[]>();
  for (const [id, list] of refs) {
    const event = events.get(id);
    if (!event) {
      console.warn(`${id} (${String(list[0].gig.headliner)}): not in Ticketmaster response, left unchanged`);
      continue;
    }
    for (const { file, date, gig } of list) {
      const next = nextStatus(event, date, gig);
      if (!next) {
        console.warn(`${id}: unknown status code "${event.dates?.status?.code}", left unchanged`);
        continue;
      }
      const before = describe(gig);
      if (!apply(gig, next)) continue;
      const lines = changesByFile.get(file) ?? [];
      lines.push(`${file} ${date} ${String(gig.headliner)}: ${before} -> ${describe(gig)}`);
      changesByFile.set(file, lines);
    }
  }

  const changes: string[] = [];
  for (const [file, lines] of changesByFile) {
    const { data, original } = files.get(file)!;
    const { week, warnings } = parseWeek(data, file.slice(0, 10), file);
    if (!week) {
      console.error(`${file}: would fail validation after update, not written: ${warnings.join("; ")}`);
      failed = true;
      continue;
    }
    writeFileSync(join(GIG_GUIDE_DIR, file), serialise(data, original));
    changes.push(...lines);
  }

  console.log(changes.length ? changes.join("\n") : "No status changes.");
  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = changes.length ? changes.map((c) => `- ${c}`).join("\n") : "No status changes.";
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Gig guide status (${today})\n\n${lines}\n`);
  }
  return failed ? 1 : 0;
}

process.exit(await main());
