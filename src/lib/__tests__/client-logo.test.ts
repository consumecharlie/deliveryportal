import { describe, it, expect } from "vitest";
import {
  logoExtension,
  logoBlobPathname,
  validateLogoUpload,
  cacheBustedLogoUrl,
  LOGO_MAX_BYTES,
} from "@/lib/client-logo";

describe("client logo upload rules", () => {
  it("maps accepted image types to extensions and rejects the rest", () => {
    expect(logoExtension("image/png")).toBe("png");
    expect(logoExtension("image/jpeg")).toBe("jpg");
    expect(logoExtension("image/svg+xml")).toBe("svg");
    expect(logoExtension("image/webp")).toBe("webp");
    expect(logoExtension("IMAGE/PNG; charset=binary")).toBe("png");
    expect(logoExtension("image/gif")).toBeNull();
    expect(logoExtension("application/pdf")).toBeNull();
    expect(logoExtension(null)).toBeNull();
  });

  it("builds one stable pathname per client", () => {
    expect(logoBlobPathname("90130631", "image/png")).toBe("client-logos/90130631.png");
    expect(logoBlobPathname("abc_DEF-1", "image/webp")).toBe("client-logos/abc_DEF-1.webp");
    expect(logoBlobPathname("", "image/png")).toBeNull();
    expect(logoBlobPathname("../etc", "image/png")).toBeNull();
    expect(logoBlobPathname("90130631", "image/gif")).toBeNull();
  });

  it("validates the requested upload against the client's slot, type and size", () => {
    expect(validateLogoUpload({ clientFolderId: "F1", pathname: "client-logos/F1.png", contentType: "image/png", size: 1000 })).toEqual({ ok: true, pathname: "client-logos/F1.png" });
    expect(validateLogoUpload({ clientFolderId: "F1", pathname: "client-logos/F2.png", contentType: "image/png" }).ok).toBe(false);
    expect(validateLogoUpload({ clientFolderId: "F1", pathname: "client-logos/F1.png", contentType: "image/gif" }).ok).toBe(false);
    expect(validateLogoUpload({ clientFolderId: "F1", pathname: "client-logos/F1.png", contentType: "image/png", size: LOGO_MAX_BYTES + 1 })).toEqual({ ok: false, error: "Logo must be under 2 MB" });
    expect(validateLogoUpload({ clientFolderId: "F1", pathname: "client-logos/F1.png", contentType: "image/png", size: LOGO_MAX_BYTES }).ok).toBe(true);
  });

  it("cache-busts a stable blob URL with the upload time", () => {
    expect(cacheBustedLogoUrl("https://x.public.blob.vercel-storage.com/client-logos/F1.png", 1700000000000)).toBe(
      "https://x.public.blob.vercel-storage.com/client-logos/F1.png?v=1700000000000"
    );
    expect(cacheBustedLogoUrl("https://x.test/a.png?v=1", 2)).toBe("https://x.test/a.png?v=2");
  });
});
