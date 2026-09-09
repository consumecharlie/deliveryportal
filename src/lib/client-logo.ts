/**
 * Client logo uploads for the portal header. Pure rules shared by the
 * upload handshake route and the settings UI. Storage is Vercel Blob (same
 * as the MOGRT Library): the browser streams the file straight to Blob with
 * a short-lived token issued by /api/settings/client-logo, then stores the
 * resulting public URL on ClientPreference.logoUrl through the PATCH route.
 */

export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/** Accepted image types -> file extension used in the blob pathname. */
export const LOGO_CONTENT_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
  "image/webp": "webp",
};

export function logoExtension(contentType: string | null | undefined): string | null {
  return LOGO_CONTENT_TYPES[(contentType ?? "").toLowerCase().split(";")[0].trim()] ?? null;
}

/** `client-logos/<clientFolderId>.<ext>`: one stable object per client, overwritten on re-upload. */
export function logoBlobPathname(clientFolderId: string, contentType: string): string | null {
  const ext = logoExtension(contentType);
  const id = clientFolderId.trim();
  if (!ext || !id || !/^[A-Za-z0-9_-]+$/.test(id)) return null;
  return `client-logos/${id}.${ext}`;
}

/**
 * Validate what the browser asks to upload before a token is issued: the
 * pathname must be the client's own logo slot for that content type.
 */
export function validateLogoUpload(input: {
  clientFolderId: string;
  pathname: string;
  contentType: string | null | undefined;
  size?: number | null;
}): { ok: true; pathname: string } | { ok: false; error: string } {
  const expected = logoBlobPathname(input.clientFolderId, input.contentType ?? "");
  if (!expected) return { ok: false, error: "Logo must be a PNG, JPG, SVG or WebP image" };
  if (input.pathname !== expected) return { ok: false, error: "Unexpected upload path" };
  if (input.size != null && input.size > LOGO_MAX_BYTES) return { ok: false, error: "Logo must be under 2 MB" };
  return { ok: true, pathname: expected };
}

/** Same object URL each time, so bust caches with the upload time. */
export function cacheBustedLogoUrl(url: string, nowMs: number): string {
  const u = new URL(url);
  u.searchParams.set("v", String(nowMs));
  return u.toString();
}
