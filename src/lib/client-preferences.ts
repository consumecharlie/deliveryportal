export interface ClientPreferenceData {
  clientFolderId: string;
  clientName: string;
  enabled: boolean;
  warningMessage: string;
  destinationLink: string | null;
  restrictions: string[];
  customBlockedDomains: string[];
  /** Optional relabel for the "Google Deliverable Link" review-link field
   *  (e.g. "Box Link"). Null/absent = keep the default label. */
  deliverableLinkLabel?: string | null;
}

/**
 * Predefined restriction toggles shown as checkboxes in the Settings UI. Each
 * maps to the set of domains it blocks. Add a new predefined restriction by
 * adding an entry here + (nothing else — the UI renders from this list). No
 * schema migration needed.
 */
export const RESTRICTION_OPTIONS: Array<{
  key: string;
  label: string;
  domains: string[];
}> = [
  {
    key: "google",
    label: "Can't access Google Docs / Drive",
    domains: ["docs.google.com", "drive.google.com"],
  },
];

const RESTRICTION_BY_KEY = new Map(RESTRICTION_OPTIONS.map((o) => [o.key, o]));

function normalizeDomain(d: string): string {
  return d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

/** All domains this client blocks (restriction keys ∪ custom domains). Empty if disabled. */
export function resolveBlockedDomains(pref: ClientPreferenceData): string[] {
  if (!pref.enabled) return [];
  const set = new Set<string>();
  for (const key of pref.restrictions ?? []) {
    for (const d of RESTRICTION_BY_KEY.get(key)?.domains ?? []) set.add(d.toLowerCase());
  }
  for (const d of pref.customBlockedDomains ?? []) {
    const n = normalizeDomain(d);
    if (n) set.add(n);
  }
  return [...set];
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** All review-link URLs on a delivery (standard fields + extra links). */
export function collectReviewLinkUrls(
  reviewLinks: Record<string, string> | undefined,
  extraLinks: Array<{ url?: string }> | undefined
): string[] {
  return [
    ...Object.values(reviewLinks ?? {}),
    ...(extraLinks ?? []).map((l) => l.url ?? ""),
  ].filter((u): u is string => Boolean(u && u.trim()));
}

/** Returns the subset of `urls` that match this client's blocked domains. */
export function findBlockedLinks(
  pref: ClientPreferenceData,
  urls: Array<string | null | undefined>
): string[] {
  const blocked = resolveBlockedDomains(pref);
  if (blocked.length === 0) return [];
  const hits: string[] = [];
  for (const url of urls) {
    if (!url) continue;
    const host = hostOf(url);
    if (!host) continue;
    if (blocked.some((d) => host === d || host.endsWith(`.${d}`))) hits.push(url);
  }
  return hits;
}
