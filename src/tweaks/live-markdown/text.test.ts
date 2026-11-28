// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { rangeAt, textOffset } from "./text";

describe("text offsets", () => {
  it("round-trips offsets across nodes", () => {
    const root = document.createElement("div");
    root.innerHTML = "ab<span>cd</span>ef";
    document.body.append(root);
    const span = root.querySelector("span") as HTMLElement;
    expect(textOffset(root, span, 0)).toBe(2);
    expect(rangeAt(root, 2, 4).toString()).toBe("cd");
    // A range starting at a node boundary begins inside the later node.
    expect(rangeAt(root, 2, 4).startContainer).toBe(span.firstChild);
    expect(rangeAt(root, 6).startOffset).toBe(2);
  });
});
