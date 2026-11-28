import type { BlockMarker } from "./block-markers";
import type { Markers } from "./inline-markers";

export type Placement = "inline" | "gutter";

export interface Decoration {
  blockId: string;
  /** Markers per token, keyed by `data-token-index`. */
  tokens: ReadonlyMap<number, Markers>;
  block?: BlockMarker;
  placement: Placement;
  /** A marker selected by stepping over it with the arrow keys. */
  armed?: { token: number; side: "before" | "after" };
}

const MARKER_STYLE =
  "color: var(--c-texTer, rgba(55, 53, 47, 0.45)); font-weight: 400; font-style: normal; white-space: pre;";
const ARMED_STYLE = "background: var(--c-bluBacTer, rgba(35, 131, 226, 0.28)); border-radius: 2px;";

export function cssString(text: string): string {
  return `"${text.replace(/[\\"]/g, "\\$&").replace(/\n/g, "\\a ")}"`;
}

/**
 * Builds the stylesheet that draws the markers. Notion resets attributes on its own nodes when it
 * re-renders, so markers are drawn with pseudo-elements targeted by block id and token index.
 */
export function decorationCss(decoration: Decoration): string {
  const { blockId, placement, armed } = decoration;
  const id = cssString(blockId);
  // Leaves of this block only, not of blocks nested inside it.
  const leaf = `[data-block-id=${id}] [data-content-editable-leaf]:not([data-block-id=${id}] [data-block-id] *)`;
  const rules: string[] = [];

  for (const [index, { before, after }] of decoration.tokens) {
    const token = `${leaf} [data-token-index="${index}"]`;
    const armedStyle = (side: "before" | "after") =>
      armed?.token === index && armed.side === side ? ARMED_STYLE : "";
    if (before) {
      rules.push(
        `${token}::before { content: ${cssString(before)}; ${MARKER_STYLE} ${armedStyle("before")} }`,
      );
    }
    if (after) {
      rules.push(
        `${token}::after { content: ${cssString(after)}; ${MARKER_STYLE} ${armedStyle("after")} }`,
      );
    }
  }

  const prefix = decoration.block?.prefix;
  if (prefix && placement === "inline") {
    rules.push(`${leaf}::before { content: ${cssString(prefix)}; ${MARKER_STYLE} }`);
  } else if (prefix) {
    // Draw the syntax in the bullet/checkbox column instead of shifting the text.
    rules.push(
      `${leaf} { position: relative; }`,
      `${leaf}::before { content: ${cssString(prefix)}; ${MARKER_STYLE} position: absolute; right: 100%; padding-right: 4px; }`,
      `[data-block-id=${id}] .notion-list-item-box-left:not([data-block-id=${id}] [data-block-id] *) { visibility: hidden; }`,
    );
  }

  const fence = decoration.block?.fence;
  if (fence) {
    for (const pseudo of ["before", "after"]) {
      rules.push(
        `${leaf}::${pseudo} { content: ${cssString(fence)}; display: block; ${MARKER_STYLE} }`,
      );
    }
  }
  return rules.join("\n");
}

/**
 * Delimiters while Notion's equation editor popup is open: `$$` on their own lines for a block
 * equation, in the editor and around the rendered equation. An inline equation's editor ends in a
 * newline that would push a closing `$` onto its own line, so the editor gets the opening `$` and
 * the equation on the page gets both.
 */
export function equationEditorCss(target: { blockId?: string }): string {
  const editor = "[role=dialog] [data-content-editable-leaf]:focus";
  if (target.blockId === undefined) {
    const token = '.notion-text-equation-token[style*="background"]';
    return [
      `${editor}::before { content: "$"; ${MARKER_STYLE} }`,
      `${token}::before, ${token}::after { content: "$"; ${MARKER_STYLE} }`,
    ].join("\n");
  }
  const block = `[data-block-id=${cssString(target.blockId)}] [aria-haspopup=dialog]`;
  return [
    ...["before", "after"].map(
      (pseudo) => `${editor}::${pseudo} { content: "$$"; display: block; ${MARKER_STYLE} }`,
    ),
    ...["before", "after"].map(
      (pseudo) =>
        `${block}::${pseudo} { content: "$$"; display: block; text-align: center; ${MARKER_STYLE} }`,
    ),
  ].join("\n");
}
