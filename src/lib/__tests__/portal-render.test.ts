import { describe, it, expect } from "vitest";
import { renderPortalBody, escapeHtml } from "@/lib/portal-render";

describe("renderPortalBody", () => {
  it("still renders bold and safe links", () => {
    const html = renderPortalBody("**bold** [ok](https://e.com)");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain('<a href="https://e.com" target="_blank" rel="noopener noreferrer">ok</a>');
  });

  it("escapes a script tag in the input", () => {
    const html = renderPortalBody("Hi <script>alert(1)</script> there");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("Hi ");
  });

  it("escapes an img tag and keeps the surrounding text", () => {
    const html = renderPortalBody('Notes: <img src=x onerror="alert(1)">');
    expect(html).not.toContain("<img");
    expect(html).toContain("Notes: &lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("drops a javascript: link but keeps its text", () => {
    const html = renderPortalBody("[x](javascript:alert(1))");
    expect(html).not.toContain("<a");
    expect(html).toContain("x");
  });

  it("drops a link that tries to break out of the href attribute", () => {
    const html = renderPortalBody('[x](https://e.com" onmouseover="alert(1))');
    expect(html).not.toContain("onmouseover");
    expect(html).not.toContain("<a");
    expect(html).toContain("x");
  });

  it("never lets a mention carry markup or attributes", () => {
    const html = renderPortalBody('@[<b>hi</b>](U1" onclick="x)');
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("<b>");
    expect(html).toContain("you");
  });

  it("keeps mailto links and ampersands in query strings", () => {
    const html = renderPortalBody("[mail](mailto:a@b.com) [q](https://e.com/?a=1&b=2)");
    expect(html).toContain('href="mailto:a@b.com"');
    expect(html).toContain('href="https://e.com/?a=1&amp;b=2"');
  });

  it("returns an empty string for empty input", () => {
    expect(renderPortalBody("")).toBe("");
  });
});

describe("escapeHtml", () => {
  it("escapes the four significant characters", () => {
    expect(escapeHtml('a & b < c > "d"')).toBe("a &amp; b &lt; c &gt; &quot;d&quot;");
  });
});
