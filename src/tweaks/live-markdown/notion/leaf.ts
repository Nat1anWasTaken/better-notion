import { rangeAt, textOffset } from "../text";

/**
 * Notion renders a block's title in a leaf whose children are the title's segments, in order:
 * text nodes for plain text, elements for formatted text, and non-editable elements for equations
 * and mentions, which are one character in the title.
 */

export const LEAF = "[data-content-editable-leaf]";

/** The block's own text leaf, not one of a block nested inside it. */
export function leafOf(block: Element): HTMLElement | null {
  for (const leaf of block.querySelectorAll<HTMLElement>(LEAF)) {
    if (leaf.closest("[data-block-id]") === block) return leaf;
  }
  return null;
}

function isAtomic(node: Node): boolean {
  return node instanceof Element && node.getAttribute("contenteditable") === "false";
}

function size(node: Node): number {
  return isAtomic(node) ? 1 : (node.textContent?.length ?? 0);
}

/**
 * A block's text leaf, by block id. The same id can render more than once, for example in the
 * page outline, so this takes the copy that has text.
 */
export function findLeaf(blockId: string): HTMLElement | null {
  for (const block of document.querySelectorAll(`[data-block-id="${CSS.escape(blockId)}"]`)) {
    const leaf = leafOf(block);
    if (leaf) return leaf;
  }
  return null;
}

/** Text leaves the user can edit, in page order. */
export function editableLeaves(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(LEAF)].filter(
    (leaf) =>
      leaf.isContentEditable && !leaf.closest("[role=dialog]") && leaf.getClientRects().length > 0,
  );
}

/** The editable leaf before or after `leaf` on the page. */
export function neighbourLeaf(leaf: HTMLElement, step: -1 | 1): HTMLElement | null {
  const leaves = editableLeaves();
  const index = leaves.indexOf(leaf);
  return index < 0 ? null : (leaves[index + step] ?? null);
}

/** The offset in the block's plain text of a DOM position inside its leaf. */
export function modelOffset(leaf: Element, node: Node, offset: number): number {
  const children = [...leaf.childNodes];
  if (node === leaf) return children.slice(0, offset).reduce((sum, child) => sum + size(child), 0);
  let model = 0;
  for (const child of children) {
    if (child === node || child.contains(node)) {
      return model + (isAtomic(child) ? 0 : textOffset(child, node, offset));
    }
    model += size(child);
  }
  return model;
}

/** A collapsed range at an offset in the block's plain text. */
export function rangeAtModel(leaf: Element, model: number): Range {
  let remaining = model;
  const children = [...leaf.childNodes];
  for (const [index, child] of children.entries()) {
    const length = size(child);
    if (isAtomic(child) ? remaining === 0 : remaining <= length) {
      const range = document.createRange();
      if (isAtomic(child) || length === 0) range.setStart(leaf, index);
      else if (child instanceof Text) range.setStart(child, remaining);
      else return rangeAt(child, remaining);
      return range;
    }
    remaining -= length;
  }
  const range = document.createRange();
  range.setStart(leaf, children.length);
  return range;
}

/** The text a mention or other non-editable token shows, by its offset in the plain text. */
export function atomLabels(leaf: Element): Map<number, string> {
  const labels = new Map<number, string>();
  let model = 0;
  for (const child of leaf.childNodes) {
    if (isAtomic(child)) labels.set(model, child.textContent ?? "");
    model += size(child);
  }
  return labels;
}
