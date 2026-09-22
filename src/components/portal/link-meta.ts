import type { LinkKind, PortalDeliverable, PortalLink, PortalVersion } from "@/lib/portal-page-model";
import { versionTag } from "./format";

/**
 * Read the page model's newer fields (link kind and hint, version numbers,
 * review mode) with fallbacks inferred from what is always present, so the
 * UI renders the same whether or not the data layer has filled them yet.
 */

const HINT: Record<LinkKind, string> = {
  "google-doc": "Google Doc",
  "google-sheet": "Google Sheet",
  "google-slides": "Google Slides",
  "google-drive": "Google Drive",
  frame: "Frame.io",
  loom: "Loom",
  vimeo: "Vimeo",
  youtube: "YouTube",
  box: "Box",
  dropbox: "Dropbox",
  audio: "Audio file",
  video: "Video file",
  pdf: "PDF",
  web: "Link",
};

export function inferLinkKind(url: string): LinkKind {
  let host = "";
  let path = "";
  try {
    const u = new URL(url);
    host = u.hostname.toLowerCase();
    path = u.pathname.toLowerCase();
  } catch {
    return "web";
  }
  if (host.endsWith("docs.google.com")) {
    if (path.startsWith("/spreadsheets")) return "google-sheet";
    if (path.startsWith("/presentation")) return "google-slides";
    return "google-doc";
  }
  if (host.endsWith("drive.google.com")) return "google-drive";
  if (host.endsWith("frame.io")) return "frame";
  if (host.endsWith("loom.com")) return "loom";
  if (host.endsWith("vimeo.com")) return "vimeo";
  if (host.endsWith("youtube.com") || host === "youtu.be") return "youtube";
  if (host.endsWith("box.com")) return "box";
  if (host.endsWith("dropbox.com")) return "dropbox";
  if (/\.(mp3|wav|m4a|aac|aiff?)$/.test(path)) return "audio";
  if (/\.(mp4|mov|m4v|webm)$/.test(path)) return "video";
  if (/\.pdf$/.test(path)) return "pdf";
  return "web";
}

export function linkKind(link: PortalLink): LinkKind {
  return link.kind ?? inferLinkKind(link.url);
}

export function linkHint(link: PortalLink): string {
  return link.hint ?? HINT[linkKind(link)];
}

/** Every version of a deliverable, newest first. */
export function allVersions(d: PortalDeliverable): PortalVersion[] {
  return [d.latest, ...d.history];
}

/** 1-based version number, oldest = 1; derived from position when the model has none. */
export function versionNumber(d: PortalDeliverable, v: PortalVersion): number {
  if (typeof v.versionNumber === "number") return v.versionNumber;
  const versions = allVersions(d);
  const idx = versions.findIndex((x) => x.deliveryId === v.deliveryId);
  return versions.length - (idx < 0 ? 0 : idx);
}

export type ReviewMode = "feedback" | "approval";

/** "approval" for finals, else "feedback"; from the model when present, else the names. */
export function reviewMode(review: { mode?: ReviewMode }, ...names: (string | null | undefined)[]): ReviewMode {
  if (review.mode) return review.mode;
  return names.some((n) => n && /\bfinal\b/i.test(n)) ? "approval" : "feedback";
}

/**
 * The link the review controls point at: the same choice the review card
 * makes, so a row and its card send the client to the same place.
 */
export function pickPrimaryLink(links: PortalLink[]): PortalLink | null {
  return (
    links.find((l) => linkKind(l) === "frame") ??
    links.find((l) => linkKind(l) === "loom") ??
    links[0] ??
    null
  );
}

/**
 * The version's own tag once the model carries it ("V1", "MASTER", "FINAL"),
 * falling back to the label-derived tag until it lands.
 */
export function versionTagOf(d: PortalDeliverable, v: PortalVersion): string {
  const tagged = (v as { tag?: string }).tag;
  return tagged ?? versionTag(v.label, versionNumber(d, v));
}

/** Links in the order we mean them to be worked through. */
export function orderedLinks(links: PortalLink[]): PortalLink[] {
  return links
    .map((link, i) => ({ link, at: (link as { order?: number }).order ?? i, i }))
    .sort((a, b) => a.at - b.at || a.i - b.i)
    .map(({ link }) => link);
}

/** What to do with this link, when we said so. */
export function linkInstruction(link: PortalLink): string | null {
  return (link as { instruction?: string | null }).instruction ?? null;
}
