import { describe, expect, it } from "vitest";
import { cssString, decorationCss } from "./decorate";

describe("decorationCss", () => {
  it("targets tokens of the block's own leaf", () => {
    const css = decorationCss({
      blockId: "abc",
      tokens: new Map([[3, { before: "**", after: "**" }]]),
      placement: "inline",
    });
    expect(css).toContain(
      '[data-block-id="abc"] [data-content-editable-leaf]:not([data-block-id="abc"] [data-block-id] *) [data-token-index="3"]::before { content: "**";',
    );
    expect(css).toContain('[data-token-index="3"]::after { content: "**";');
  });

  it("highlights an armed marker", () => {
    const css = decorationCss({
      blockId: "abc",
      tokens: new Map([[3, { before: "*", after: "*" }]]),
      placement: "inline",
      armed: { token: 3, side: "after" },
    });
    expect(css).toMatch(/::after \{[^}]*background/);
    expect(css).not.toMatch(/::before \{[^}]*background/);
  });

  it("moves block markers to the margin in gutter mode", () => {
    const css = decorationCss({
      blockId: "abc",
      tokens: new Map(),
      block: { prefix: "- " },
      placement: "gutter",
    });
    expect(css).toContain("right: 100%");
    expect(css).toContain(".notion-list-item-box-left");
  });

  it("draws fences on their own lines", () => {
    const css = decorationCss({
      blockId: "abc",
      tokens: new Map(),
      block: { fence: "```" },
      placement: "inline",
    });
    expect(css.match(/display: block/g)).toHaveLength(2);
  });

  it("escapes CSS strings", () => {
    expect(cssString('a"b\\c')).toBe('"a\\"b\\\\c"');
  });
});
