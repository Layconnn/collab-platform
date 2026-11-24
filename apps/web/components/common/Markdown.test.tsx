import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { Markdown } from "./Markdown";
import { MarkdownField } from "./MarkdownField";

const html = (text: string) => render(<Markdown text={text} />).container.innerHTML;

describe("Markdown safety", () => {
  afterEach(() => cleanup());

  it("never renders raw HTML, scripts or event handlers", () => {
    const out = html('<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n<b onclick="x()">bold</b> <iframe src="https://evil.test"></iframe>');
    expect(out).not.toMatch(/<script|<img|<iframe|onerror|onclick|<b[ >]/i);
  });

  it("drops javascript: and data: links but keeps http, https and mailto", () => {
    render(<Markdown text={"[a](javascript:alert(1)) [b](data:text/html,x) [c](https://example.test) [d](mailto:team@example.test)"} />);
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["https://example.test", "mailto:team@example.test"]);
    expect(links[0]!.getAttribute("rel")).toBe("noopener noreferrer nofollow ugc");
    expect(links[0]!.getAttribute("target")).toBe("_blank");
    expect(html("[a](javascript:alert(1))")).not.toMatch(/javascript:/);
  });

  it("does not load images from Markdown", () => {
    expect(html("![tracker](https://example.test/pixel.png)")).not.toMatch(/<img/);
  });
});

describe("Markdown content", () => {
  afterEach(() => cleanup());

  it("renders lists, tables, task lists, quotes and strikethrough", () => {
    const { container } = render(<Markdown text={"- one\n- two\n\n| Option | Cost |\n| --- | --- |\n| Queues | $0 |\n\n- [x] done\n- [ ] open\n\n> quoted\n\n~~gone~~"} />);
    expect(container.querySelectorAll("ul li").length).toBe(4);
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByRole("cell", { name: "Queues" })).toBeTruthy();
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.map((box) => [box.checked, box.disabled])).toEqual([[true, true], [false, true]]);
    expect(container.querySelector("blockquote")?.textContent).toContain("quoted");
    expect(container.querySelector("del")?.textContent).toBe("gone");
  });

  it("keeps single line breaks from plain-text content", () => {
    const { container } = render(<Markdown text={"first line\nsecond line"} />);
    expect(container.querySelector("br")).toBeTruthy();
  });

  it("highlights mentions in text but not inside code", () => {
    const { container } = render(<Markdown text={"Thanks @maya_ok, see `@not_a_mention`."} />);
    const mentions = [...container.querySelectorAll(".mention")].map((node) => node.textContent);
    expect(mentions).toEqual(["@maya_ok"]);
    expect(container.querySelector("code")?.textContent).toBe("@not_a_mention");
  });

  it("keeps content headings below the page's own", () => {
    const { container } = render(<Markdown text={"# Big\n\n## Smaller"} />);
    expect(container.querySelector("h1, h2")).toBeNull();
    expect([...container.querySelectorAll("h3, h4")].map((node) => node.tagName)).toEqual(["H3", "H4"]);
  });

  it("shows code blocks as text first and highlights them once loaded", async () => {
    const { container } = render(<Markdown text={"```ts\nconst answer: number = 42;\n```"} />);
    expect(container.querySelector("pre")?.textContent).toBe("const answer: number = 42;");
    await waitFor(() => expect(container.querySelector("pre code.hljs")).toBeTruthy());
    expect(container.querySelector("pre")?.textContent).toBe("const answer: number = 42;");
  });
});

describe("MarkdownField", () => {
  afterEach(() => cleanup());

  it("previews what is in the textarea without losing the draft", () => {
    render(<MarkdownField><textarea aria-label="Reply" defaultValue="**Agreed** with @lee_ok" /></MarkdownField>);
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    const preview = screen.getByRole("region", { name: "Markdown preview" });
    expect(preview.querySelector("strong")?.textContent).toBe("Agreed");
    expect((screen.getByLabelText("Reply", { selector: "textarea" }) as HTMLTextAreaElement).value).toBe("**Agreed** with @lee_ok");
    fireEvent.click(screen.getByRole("button", { name: "Write" }));
    expect(screen.queryByRole("region", { name: "Markdown preview" })).toBeNull();
  });

  it("says when there is nothing to preview", () => {
    render(<MarkdownField><textarea aria-label="Body" defaultValue="  " /></MarkdownField>);
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByText("Nothing to preview yet.")).toBeTruthy();
  });
});
