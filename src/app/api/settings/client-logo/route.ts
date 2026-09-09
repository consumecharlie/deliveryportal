import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getSessionUserEmail } from "@/lib/get-session-user";
import { LOGO_CONTENT_TYPES, LOGO_MAX_BYTES, validateLogoUpload } from "@/lib/client-logo";

/**
 * POST /api/settings/client-logo
 *
 * Vercel Blob client-upload handshake for a client's portal logo (the same
 * approach as the MOGRT Library): the browser asks for a short-lived token,
 * streams the image straight to Blob at `client-logos/<clientFolderId>.<ext>`
 * (no random suffix, overwrite allowed), then stores the public URL through
 * PATCH /api/settings/portal-access. The route sits under /api/settings, so
 * the middleware already requires a signed-in session. The upload-completed
 * callback cannot reach us through that same auth wall, so the client PATCH
 * is the source of truth.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Logo storage is not configured (BLOB_READ_WRITE_TOKEN missing)" },
      { status: 503 }
    );
  }
  const body = (await request.json().catch(() => null)) as HandleUploadBody | null;
  if (!body) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const uploadedBy = await getSessionUserEmail();

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const payload = (() => {
          try {
            return JSON.parse(clientPayload ?? "{}") as { clientFolderId?: string; contentType?: string; size?: number };
          } catch {
            return {};
          }
        })();
        const check = validateLogoUpload({
          clientFolderId: String(payload.clientFolderId ?? ""),
          pathname,
          contentType: payload.contentType,
          size: payload.size,
        });
        if (!check.ok) throw new Error(check.error);
        return {
          allowedContentTypes: Object.keys(LOGO_CONTENT_TYPES),
          maximumSizeInBytes: LOGO_MAX_BYTES,
          addRandomSuffix: false,
          allowOverwrite: true,
          tokenPayload: JSON.stringify({ clientFolderId: payload.clientFolderId, uploadedBy }),
        };
      },
      onUploadCompleted: async () => {
        /* The browser stores the URL via PATCH /api/settings/portal-access. */
      },
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload failed" },
      { status: 400 }
    );
  }
}
