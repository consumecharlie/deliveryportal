import { describe, it, expect } from "vitest";
import { markdownToHtml } from "@/lib/markdown-html";

describe("markdownToHtml (lib)", () => {
  it("renders bold, links, bullets, headings", () => {
    const html = markdownToHtml("## Title\n- **A** [x](https://e.com)\n\nplain");
    expect(html).toContain("<h2>Title</h2>");
    expect(html).toContain("<ul><li><p><strong>A</strong> <a href=\"https://e.com\">x</a></p></li></ul>");
    expect(html).toContain("<p>plain</p>");
  });
});
