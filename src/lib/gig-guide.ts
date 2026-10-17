import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Weekly London gig guide data.
 *
 * The GigDiary weekly skill commits one file per week to
 * data/gig-guide/<weekStart>.json. Every /gigs page is built from those files
 * at build time. A broken file or gig must never fail the build: it is skipped
 * with a warning so /gigs keeps showing the newest valid week.
 *
 * Kept free of Astro imports so scripts/check-gig-guide.ts can reuse it.
 */

export const GIG_GUIDE_DIR = resolve(process.cwd(), "data/gig-guide");

/** Every ticket link is rendered with this subId2; the page script swaps in ?ch. */
export const DEFAULT_SUB_ID = "gig_guide_web";

export interface Gig {
  id: string;
  headliner: string;
  support: string[];
  genre?: string;
  venue: string;
  postcode?: string;
  startTime?: string;
  /** ISO 8601 with the Europe/London offset, for JSON-LD. */
  startDate: string;
  ticketUrl: string;
  imageUrl?: string;
  tmEventId?: string;
}

export interface GigDay {
  date: string;
  /** "Monday" */
  weekday: string;
  /** "Mon" */
  weekdayShort: string;
  /** "19 Oct" */
  dayMonth: string;
  gigs: Gig[];
}

export interface GigWeek {
  weekStart: string;
  weekEnd: string;
  city: string;
  /** "October 19-25" or "October 26-November 1" */
  rangeLabel: string;
  columnParagraphs: string[];
  cover: { headliner?: string; imageUrl?: string };
  days: GigDay[];
  gigCount: number;
}

export interface ParseResult {
  week?: GigWeek;
  warnings: string[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FILE_RE = /^(\d{4}-\d{2}-\d{2})\.json$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseDate(value: unknown): Date | undefined {
  if (typeof value !== "string" || !DATE_RE.test(value)) return undefined;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? undefined : d;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function fmt(date: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...options }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

function str(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function httpsUrl(value: unknown): string | undefined {
  const s = str(value);
  if (!s) return undefined;
  try {
    return new URL(s).protocol === "https:" ? s : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Set subId2 on an Impact affiliate URL by editing the raw string, so the
 * already-encoded `u=` destination param is left byte-for-byte untouched.
 * The inline script in GigGuideWeek.astro mirrors this logic.
 */
export function withSubId2(url: string, value: string): string {
  const re = /([?&])subId2=[^&#]*/i;
  if (re.test(url)) return url.replace(re, `$1subId2=${value}`);
  const hashAt = url.indexOf("#");
  const base = hashAt === -1 ? url : url.slice(0, hashAt);
  const hash = hashAt === -1 ? "" : url.slice(hashAt);
  return `${base}${base.includes("?") ? "&" : "?"}subId2=${value}${hash}`;
}

/** "2026-10-19T18:30:00+01:00" — offset taken from Europe/London on that day. */
function londonIso(date: string, time?: string): string {
  const local = `${date}T${time ?? "19:00"}:00`;
  const offsetName =
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", timeZoneName: "shortOffset" })
      .formatToParts(new Date(`${local}Z`))
      .find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = offsetName.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  const offset = m ? `${m[1]}${m[2].padStart(2, "0")}:${m[3] ?? "00"}` : "+00:00";
  return time ? `${local}${offset}` : date;
}

export function rangeLabel(weekStart: string, weekEnd: string): string {
  const startMonth = fmt(weekStart, { month: "long" });
  const endMonth = fmt(weekEnd, { month: "long" });
  const startDay = fmt(weekStart, { day: "numeric" });
  const endDay = fmt(weekEnd, { day: "numeric" });
  return startMonth === endMonth
    ? `${startMonth} ${startDay}-${endDay}`
    : `${startMonth} ${startDay}-${endMonth} ${endDay}`;
}

function parseGig(raw: unknown, date: string, where: string, warnings: string[]): Gig | undefined {
  const g = (raw ?? {}) as Record<string, unknown>;
  const headliner = str(g.headliner);
  const venue = str(g.venue);
  const ticketUrl = httpsUrl(g.ticketUrl);
  if (!headliner || !venue || !ticketUrl) {
    const missing = [!headliner && "headliner", !venue && "venue", !ticketUrl && "https ticketUrl"]
      .filter(Boolean)
      .join(", ");
    warnings.push(`${where}: dropped gig "${headliner ?? "?"}" (missing ${missing})`);
    return undefined;
  }

  let startTime = str(g.startTime);
  if (startTime && !TIME_RE.test(startTime)) {
    warnings.push(`${where}: "${headliner}" startTime "${startTime}" is not HH:MM, ignored`);
    startTime = undefined;
  }

  const support = Array.isArray(g.support)
    ? g.support.map(str).filter((s): s is string => Boolean(s))
    : [];

  const tmEventId = str(g.tmEventId);
  const slug = headliner.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  return {
    id: `${date}-${tmEventId ?? slug}`,
    headliner,
    support,
    genre: str(g.genre),
    venue,
    postcode: str(g.postcode),
    startTime,
    startDate: londonIso(date, startTime),
    ticketUrl: withSubId2(ticketUrl, DEFAULT_SUB_ID),
    imageUrl: httpsUrl(g.imageUrl),
    tmEventId,
  };
}

/** Validate and normalise one week's JSON. Returns no week if it can't be shown. */
export function parseWeek(raw: unknown, fileDate: string, file = `${fileDate}.json`): ParseResult {
  const warnings: string[] = [];
  const skip = (reason: string): ParseResult => {
    warnings.push(`${file}: skipped week (${reason})`);
    return { warnings };
  };

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return skip("not a JSON object");
  const w = raw as Record<string, unknown>;

  const start = parseDate(w.weekStart);
  if (!start) return skip(`weekStart "${String(w.weekStart)}" is not YYYY-MM-DD`);
  const weekStart = w.weekStart as string;
  if (weekStart !== fileDate) return skip(`weekStart ${weekStart} does not match filename`);
  const weekEnd = addDays(weekStart, 6);
  if (w.weekEnd !== weekEnd) return skip(`weekEnd should be ${weekEnd}, got "${String(w.weekEnd)}"`);
  if (start.getUTCDay() !== 1) warnings.push(`${file}: weekStart ${weekStart} is not a Monday`);
  if (w.schemaVersion !== undefined && w.schemaVersion !== 1) {
    warnings.push(`${file}: unknown schemaVersion ${String(w.schemaVersion)}, reading as v1`);
  }
  if (!Array.isArray(w.days)) return skip("days is not an array");

  const byDate = new Map<string, Gig[]>();
  for (const rawDay of w.days as unknown[]) {
    const d = (rawDay ?? {}) as Record<string, unknown>;
    const date = typeof d.date === "string" ? d.date : "";
    if (!parseDate(date) || date < weekStart || date > weekEnd) {
      warnings.push(`${file}: dropped day "${date || "?"}" (outside ${weekStart}..${weekEnd})`);
      continue;
    }
    const gigs = (Array.isArray(d.gigs) ? d.gigs : [])
      .map((g, i) => parseGig(g, date, `${file} ${date} #${i + 1}`, warnings))
      .filter((g): g is Gig => Boolean(g));
    byDate.set(date, [...(byDate.get(date) ?? []), ...gigs]);
  }

  const days: GigDay[] = [...byDate.entries()]
    .filter(([, gigs]) => gigs.length > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, gigs]) => ({
      date,
      weekday: fmt(date, { weekday: "long" }),
      weekdayShort: fmt(date, { weekday: "short" }),
      dayMonth: fmt(date, { day: "numeric", month: "short" }),
      gigs: gigs.sort((a, b) => (a.startTime ?? "99").localeCompare(b.startTime ?? "99")),
    }));

  const gigCount = days.reduce((n, d) => n + d.gigs.length, 0);
  if (gigCount === 0) return skip("no valid gigs");

  const allGigs = days.flatMap((d) => d.gigs);
  const coverRaw = (w.cover ?? {}) as Record<string, unknown>;
  const coverHeadliner = str(coverRaw.headliner) ?? allGigs[0].headliner;
  const coverImage =
    httpsUrl(coverRaw.imageUrl) ??
    allGigs.find((g) => g.headliner === coverHeadliner && g.imageUrl)?.imageUrl ??
    allGigs.find((g) => g.imageUrl)?.imageUrl;

  const columnParagraphs = (str(w.column) ?? "")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);

  return {
    week: {
      weekStart,
      weekEnd,
      city: str(w.city) ?? "London",
      rangeLabel: rangeLabel(weekStart, weekEnd),
      columnParagraphs,
      cover: { headliner: coverHeadliner, imageUrl: coverImage },
      days,
      gigCount,
    },
    warnings,
  };
}

/** Read and parse one file from disk, never throwing. */
export function parseWeekFile(path: string): ParseResult {
  const file = path.split("/").pop() ?? path;
  const match = file.match(FILE_RE);
  if (!match) return { warnings: [`${file}: skipped (filename must be YYYY-MM-DD.json)`] };
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    return { warnings: [`${file}: skipped week (${(err as Error).message})`] };
  }
  return parseWeek(raw, match[1], file);
}

const printed = new Set<string>();

/** Every valid week, newest first. Warnings are printed once per build. */
export function loadWeeks(dir = GIG_GUIDE_DIR): GigWeek[] {
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => FILE_RE.test(f));
  } catch {
    return [];
  }

  const weeks: GigWeek[] = [];
  for (const file of files) {
    const { week, warnings } = parseWeekFile(join(dir, file));
    for (const w of warnings) {
      if (printed.has(w)) continue;
      printed.add(w);
      console.warn(`[gig-guide] ${w}`);
    }
    if (week) weeks.push(week);
  }
  return weeks.sort((a, b) => b.weekStart.localeCompare(a.weekStart));
}

export function latestWeek(dir = GIG_GUIDE_DIR): GigWeek | undefined {
  return loadWeeks(dir)[0];
}

/** <title> / og:title and meta description for a week's page. */
export function weekMeta(week: GigWeek): { title: string; description: string } {
  const headliners = [...new Set(week.days.flatMap((d) => d.gigs.map((g) => g.headliner)))];
  const named = headliners.slice(0, 3).join(", ");
  return {
    title: `${week.city} gig guide: ${week.rangeLabel}`,
    description: `${week.gigCount} hand-picked ${week.city} gigs for ${week.rangeLabel}, with ${named}${
      headliners.length > 3 ? " and more" : ""
    }. Times, venues and tickets in one place.`,
  };
}
