// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { blockType, tokenFormats } from "./detect";

function el(html: string): Element {
  const wrap = document.createElement("div");
  wrap.innerHTML = html;
  return wrap.querySelector("[data-token-index]") ?? (wrap.firstElementChild as Element);
}

// Markup copied from the live app.
describe("tokenFormats", () => {
  it("reads combined styles", () => {
    const token = el(
      '<span data-token-index="16" class="notion-enable-hover" style="font-style:italic;font-weight:600">x</span>',
    );
    expect([...tokenFormats(token).keys()]).toEqual(["bold", "italic"]);
  });

  it("reads strike, code and equation tokens", () => {
    expect(
      tokenFormats(el('<span data-token-index="5" style="text-decoration:line-through">x</span>')),
    ).toEqual(new Map([["strike", ""]]));
    expect(
      tokenFormats(
        el(
          '<div class="notion-inline-code-container"><span data-token-index="7" style="font-family:monospace">x</span></div>',
        ),
      ).has("code"),
    ).toBe(true);
    expect(
      tokenFormats(
        el(
          '<span data-token-index="9" contenteditable="false" class="notion-text-equation-token">x</span>',
        ),
      ).has("equation"),
    ).toBe(true);
  });

  it("reads links and background highlights, but not text colours", () => {
    const link = el(
      '<a href="https://example.com" class="notion-link-token" data-token-index="11" style="cursor:pointer;color:inherit;text-decoration:inherit">x</a>',
    );
    expect(tokenFormats(link)).toEqual(new Map([["link", "https://example.com"]]));
    const highlight = el(
      '<span data-token-index="13" data-notion-highlight="yellow_background" style="background:var(--x)">x</span>',
    );
    expect(tokenFormats(highlight).get("highlight")).toBe("yellow_background");
    const colour = el('<span data-token-index="13" data-notion-highlight="red">x</span>');
    expect(tokenFormats(colour).has("highlight")).toBe(false);
    const cleared = el(
      '<span data-token-index="13" data-notion-highlight="default_background">x</span>',
    );
    expect(tokenFormats(cleared).has("highlight")).toBe(false);
  });
});

describe("blockType", () => {
  it("reads the type from the block class", () => {
    expect(blockType(el('<div class="notion-selectable notion-sub_sub_header-block"></div>'))).toBe(
      "sub_sub_header",
    );
    expect(blockType(el('<div class="notion-selectable"></div>'))).toBeUndefined();
  });
});
