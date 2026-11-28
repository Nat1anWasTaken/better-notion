import { describe, expect, it } from "vitest";
import type { Format } from "./detect";
import { findRuns, markersFor, type Token } from "./inline-markers";

function tokens(...specs: [number, Partial<Record<Format, string>>][]): Token[] {
  return specs.map(([index, formats]) => ({
    index,
    formats: new Map(Object.entries(formats) as [Format, string][]),
  }));
}

function render(text: string[], list: Token[]): string {
  const markers = markersFor(list.length, findRuns(list));
  return text.map((t, i) => `${markers[i]?.before}${t}${markers[i]?.after}`).join("");
}

describe("inline markers", () => {
  it("wraps a single run", () => {
    expect(render(["bold"], tokens([1, { bold: "" }]))).toBe("**bold**");
  });

  it("nests runs across Notion's flattened spans", () => {
    const list = tokens([15, { bold: "" }], [16, { bold: "", italic: "" }], [17, { bold: "" }]);
    expect(render(["a ", "b", " c"], list)).toBe("**a *b* c**");
  });

  it("puts the longer run outside when both start together", () => {
    const list = tokens([1, { bold: "", italic: "" }], [2, { bold: "" }]);
    expect(render(["a", "b"], list)).toBe("***a*b**");
  });

  it("closes the inner format first on a shared token", () => {
    expect(render(["x"], tokens([1, { bold: "", italic: "" }]))).toBe("***x***");
  });

  it("splits runs at plain text between tokens", () => {
    const list = tokens([1, { bold: "" }], [3, { bold: "" }]);
    expect(render(["a", "b"], list)).toBe("**a****b**");
  });

  it("splits adjacent links with different targets", () => {
    const list = tokens([1, { link: "https://a.com" }], [2, { link: "https://b.com/x" }]);
    expect(render(["a", "b"], list)).toBe("[a](a.com)[b](b.com/x)");
  });

  it("keeps a link outside other formats", () => {
    const list = tokens([1, { link: "https://a.com", bold: "" }]);
    expect(render(["a"], list)).toBe("[**a**](a.com)");
  });

  it("keeps adjacent equations apart", () => {
    const list = tokens([1, { equation: "1" }], [2, { equation: "2" }]);
    expect(render(["a", "b"], list)).toBe("$a$$b$");
  });

  it("shortens long URLs", () => {
    const list = tokens([1, { link: `https://example.com/${"x".repeat(40)}` }]);
    expect(render(["a"], list)).toMatch(/^\[a\]\(example\.com\/x+…\)$/);
  });
});
