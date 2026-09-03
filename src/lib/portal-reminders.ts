/**
 * Client feedback reminders and internal overdue nudges. Pure, no I/O.
 *
 * Selection runs on Eastern calendar dates and business days: a Friday run
 * reminds for Monday deadlines, office closures never count, and overdue
 * nudges follow a business-day cadence so nobody is pinged on a weekend.
 */
import { easternDateString } from "@/lib/portal-deadline";
import type { DeadlineState } from "@/lib/portal-deadline";
import { addBusinessDays, isBusinessDay } from "@/lib/us-holidays";
import { escapeMrkdwn } from "@/lib/portal-confirm-messages";

export type ReminderKind = "tomorrow" | "today" | "overdue";

export interface ReminderCandidate {
  deliveryId: string;
  dueMs: number;
  state: DeadlineState;
}

export interface ReminderBuckets {
  tomorrow: string[];
  today: string[];
  overdue: string[];
}

const DAY_MS = 86_400_000;

/** Business days strictly after `from` up to and including `to` (both "YYYY-MM-DD"). */
function businessDaysAfter(from: string, to: string, closures: Set<string>): number {
  let n = 0;
  // Bounded: an item more than a year late is a data problem, not a nudge.
  for (let ms = Date.parse(`${from}T00:00:00Z`) + DAY_MS, i = 0; i < 400; ms += DAY_MS, i++) {
    const day = new Date(ms).toISOString().slice(0, 10);
    if (day > to) break;
    if (isBusinessDay(day, closures)) n++;
  }
  return n;
}

/**
 * Sort deliverables awaiting feedback into today's reminder buckets.
 *
 * - tomorrow: due on the next business day after today
 * - today: due today
 * - overdue: state is overdue and today is the first business day after the
 *   due date, then every 2 business days after that (1, 3, 5, ...)
 *
 * Nothing is selected on a weekend or office closure. Callers pass only
 * items whose feedback status is "awaiting".
 */
export function classifyReminders(
  items: ReminderCandidate[],
  nowMs: number,
  closures: Set<string>
): ReminderBuckets {
  const out: ReminderBuckets = { tomorrow: [], today: [], overdue: [] };
  const today = easternDateString(nowMs);
  if (!isBusinessDay(today, closures)) return out;
  const nextBusinessDay = addBusinessDays(today, 1, closures);

  const sorted = [...items].sort((a, b) => a.dueMs - b.dueMs || a.deliveryId.localeCompare(b.deliveryId));
  for (const it of sorted) {
    const dueDay = easternDateString(it.dueMs);
    if (dueDay === nextBusinessDay) {
      out.tomorrow.push(it.deliveryId);
    } else if (dueDay === today) {
      out.today.push(it.deliveryId);
    } else if (it.state === "overdue" && dueDay < today) {
      const n = businessDaysAfter(dueDay, today, closures);
      if (n >= 1 && n % 2 === 1) out.overdue.push(it.deliveryId);
    }
  }
  return out;
}

const WEEKDAY = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long" });

/**
 * The word for the subject line: "today", "tomorrow", or "on Monday" when the
 * next business day is not the calendar tomorrow (Friday runs, closures).
 */
export function dueWordFor(kind: "tomorrow" | "today", dueMs: number, nowMs: number): string {
  if (kind === "today") return "today";
  if (easternDateString(dueMs) === easternDateString(nowMs + DAY_MS)) return "tomorrow";
  return `on ${WEEKDAY.format(new Date(dueMs))}`;
}

/**
 * The name a delivery greeted the client by, read from the first non-empty
 * line of the sent email body ("Hello, Klaudia!" -> "Klaudia"). Null when the
 * body does not open with a greeting, so the reminder falls back to "Hi there,".
 */
/** Salutation targets that are not a person's name ("Hi Team,"). */
const GENERIC_GREETING_WORDS = new Set(["there", "team", "all", "everyone", "folks"]);

export function greetingNameFromBody(body: string): string | null {
  const line = body
    .split(/\r?\n/)
    .map((l) => l.replace(/<[^>]+>/g, "").replace(/^[\s*_>#]+/, "").trim())
    .find((l) => l.length > 0);
  if (!line) return null;
  const m = /^(?:hi|hello|hey)[,\s]+([A-Za-z][\w'.-]*)/i.exec(line);
  if (!m) return null;
  const name = m[1].replace(/[.,!'-]+$/, "");
  if (!/^[A-Z]/.test(name) || GENERIC_GREETING_WORDS.has(name.toLowerCase())) return null;
  return name;
}

export interface ReminderEmailInput {
  kind: "tomorrow" | "today";
  projectName: string;
  deliverableType: string;
  dueLabel: string;
  portalUrl: string;
  /** Overrides the default word for the kind, e.g. "on Monday". */
  dueWord?: string;
  primaryFirstName?: string | null;
}

export interface ReminderEmail {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Short, friendly reminder copy. No internal terms, no em dashes. */
export function buildReminderEmail(input: ReminderEmailInput): ReminderEmail {
  const when = input.dueWord ?? (input.kind === "today" ? "today" : "tomorrow");
  const greeting = input.primaryFirstName?.trim() ? `Hi ${input.primaryFirstName.trim()},` : "Hi there,";
  const subject = `Reminder: feedback on ${input.deliverableType} is due ${when}`;
  const lead = `A quick reminder that feedback on ${input.deliverableType} for ${input.projectName} is due ${when} (${input.dueLabel}).`;
  const ask =
    "When everything is in, open your portal and press \"All feedback is in\" so we can move to the next step.";
  const closing = "If you have questions, you can reply to this email or send us a note from the portal.";
  const signoff = "Thanks,\nThe Consume Media team";

  const text = [greeting, "", lead, "", ask, "", `Open your portal: ${input.portalUrl}`, "", closing, "", signoff].join("\n");

  const e = escapeHtml;
  const html = [
    `<div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#151919;max-width:560px">`,
    `<p>${e(greeting)}</p>`,
    `<p>A quick reminder that feedback on <strong>${e(input.deliverableType)}</strong> for ${e(input.projectName)} is due ${e(when)} (${e(input.dueLabel)}).</p>`,
    `<p>${e(ask)}</p>`,
    `<p><a href="${e(input.portalUrl)}" style="display:inline-block;background:#151919;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:10px;font-weight:600">Open your portal</a></p>`,
    `<p style="font-size:13px;color:#6b7280">Or copy this link: ${e(input.portalUrl)}</p>`,
    `<p>${e(closing)}</p>`,
    `<p>Thanks,<br>The Consume Media team</p>`,
    `</div>`,
  ].join("");

  return { subject, html, text };
}

export interface OverdueNudgeInput {
  clientName: string;
  projectName: string;
  deliverableType: string;
  dueLabel: string;
  portalUrl: string;
}

/** Internal Slack nudge when a client has not confirmed feedback past the deadline. */
export function buildOverdueNudgeText(c: OverdueNudgeInput): string {
  const e = escapeMrkdwn;
  return `:hourglass: ${e(c.clientName)} has not confirmed feedback on ${e(c.deliverableType)} (${e(c.projectName)}). Due ${e(c.dueLabel)}. <${c.portalUrl}|Open client portal>`;
}
