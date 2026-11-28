// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { atomLabels, findLeaf, modelOffset, rangeAtModel } from "./leaf";

function block(html: string, id = "b1"): HTMLElement {
  const el = document.createElement("div");
  el.dataset.blockId = id;
  el.innerHTML = `<div data-content-editable-leaf="true">${html}</div>`;
  document.body.append(el);
  return el;
}

describe("leaf", () => {
  it("maps plain-text offsets to DOM positions and back", () => {
    const el = block(
      'a <span data-token-index="1">bold</span> <span data-token-index="3" contenteditable="false">E=mc²</span> z',
    );
    const leaf = findLeaf("b1") as HTMLElement;
    // Plain text: "a bold ⁍ z".
    for (const model of [0, 1, 2, 6, 7, 8, 10]) {
      const range = rangeAtModel(leaf, model);
      expect(modelOffset(leaf, range.startContainer, range.startOffset)).toBe(model);
    }
    expect(atomLabels(leaf).get(7)).toBe("E=mc²");
    el.remove();
  });

  it("places the caret inside a plain text node", () => {
    const el = block("Last line");
    const range = rangeAtModel(findLeaf("b1") as HTMLElement, 9);
    expect(range.startContainer.textContent).toBe("Last line");
    expect(range.startOffset).toBe(9);
    el.remove();
  });

  it("skips copies of a block without text, like the page outline", () => {
    const outline = document.createElement("div");
    outline.dataset.blockId = "b1";
    document.body.append(outline);
    const el = block("text");
    expect(findLeaf("b1")?.textContent).toBe("text");
    outline.remove();
    el.remove();
  });
});
