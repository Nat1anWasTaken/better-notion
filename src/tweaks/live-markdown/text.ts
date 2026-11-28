/** Character offset of a DOM position within `root`'s text. */
export function textOffset(root: Node, node: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}

/**
 * The DOM position at a character offset within `root`'s text. At a boundary between two text
 * nodes, `forward` picks the start of the later one.
 */
function positionAt(root: Node, offset: number, forward: boolean): [Node, number] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let last: Text | null = null;
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    if (remaining < node.length || (!forward && remaining === node.length)) {
      return [node, remaining];
    }
    remaining -= node.length;
    last = node;
  }
  return last ? [last, last.length] : [root, root.childNodes.length];
}

/** A range covering character offsets `start` to `end` of `root`'s text. */
export function rangeAt(root: Node, start: number, end = start): Range {
  const range = document.createRange();
  range.setStart(...positionAt(root, start, true));
  range.setEnd(...positionAt(root, end, end === start));
  return range;
}
