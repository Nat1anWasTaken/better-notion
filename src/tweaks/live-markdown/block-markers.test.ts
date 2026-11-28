// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { blockMarker } from "./block-markers";

const options = { quote: '"' };

function setup(html: string) {
  document.body.innerHTML = html;
  const leaf = document.querySelector("[data-content-editable-leaf]") as Element;
  const block = leaf.closest("[data-block-id]") as Element;
  return blockMarker(block, leaf, options);
}

const leaf = '<div data-content-editable-leaf="true" contenteditable="true">x</div>';

describe("blockMarker", () => {
  it("marks headings by level", () => {
    expect(setup(`<div data-block-id="a" class="notion-header-block">${leaf}</div>`)).toEqual({
      prefix: "# ",
    });
    expect(setup(`<div data-block-id="a" class="notion-header_4-block">${leaf}</div>`)).toEqual({
      prefix: "#### ",
    });
  });

  it("marks toggle headings", () => {
    const html = `<div data-block-id="a" class="notion-sub_header-block"><div role="button" aria-label="Open"></div>${leaf}</div>`;
    expect(setup(html)).toEqual({ prefix: "## > " });
  });

  it("marks lists and to-dos", () => {
    expect(
      setup(`<div data-block-id="a" class="notion-bulleted_list-block">${leaf}</div>`),
    ).toEqual({ prefix: "- " });
    const checked = `<div data-block-id="a" class="notion-to_do-block"><input type="checkbox" checked>${leaf}</div>`;
    expect(setup(checked)).toEqual({ prefix: "- [x] " });
    const nestedChecked = `<div data-block-id="a" class="notion-to_do-block"><input type="checkbox">${leaf}<div data-block-id="b" class="notion-to_do-block"><input type="checkbox" checked></div></div>`;
    expect(setup(nestedChecked)).toEqual({ prefix: "- [ ] " });
  });

  it("uses the configured quote marker", () => {
    expect(setup(`<div data-block-id="a" class="notion-quote-block">${leaf}</div>`)).toEqual({
      prefix: '" ',
    });
  });

  it("fences code blocks", () => {
    expect(setup(`<div data-block-id="a" class="notion-code-block">${leaf}</div>`)).toEqual({
      fence: "```",
    });
  });

  it("marks the first line of a callout", () => {
    const html = `<div data-block-id="c" class="notion-callout-block"><div class="notion-record-icon">💡</div><div data-block-id="a" class="notion-text-block">${leaf}</div></div>`;
    expect(setup(html)).toEqual({ prefix: "> [!💡] " });
  });

  it("leaves plain text alone", () => {
    expect(setup(`<div data-block-id="a" class="notion-text-block">${leaf}</div>`)).toBeUndefined();
  });
});
