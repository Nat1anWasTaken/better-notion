import { closeEditor, waitFor } from "./commands";
import type { RichText, Segment } from "./model/rich-text";
import { blockStore, type Internals } from "./notion/internals";

/**
 * Notion edits an equation's TeX in a popup. In the markdown editor an inline equation is plain
 * `$…$` source, but block equations, and inline ones opened from Notion's view, still use the
 * popup, which gets `$`/`$$` delimiters and loses them on Backspace like markdown would.
 */

const MARKER_STYLE =
  "color: var(--c-texTer, rgba(55, 53, 47, 0.45)); font-weight: 400; white-space: pre;";

export function cssString(text: string): string {
  return `"${text.replace(/[\\"]/g, "\\$&").replace(/\n/g, "\\a ")}"`;
}

/** The popup and what it edits: a block equation, or the token of an inline one. */
export interface EquationEditor {
  leaf: HTMLElement;
  block: HTMLElement;
  /** The token's index in the block's title, for an inline equation. */
  token?: number;
}

/**
 * Finds the equation a popup edits. A block equation marks its button as expanded; an inline
 * equation being edited gets a selection background.
 */
export function readEditor(leaf: HTMLElement): EquationEditor | null {
  if (!leaf.closest("[role=dialog]")) return null;
  const block = document
    .querySelector(".notion-equation-block [aria-haspopup=dialog][aria-expanded=true]")
    ?.closest<HTMLElement>("[data-block-id]");
  if (block) return { leaf, block };
  const token = [...document.querySelectorAll(".notion-text-equation-token")].find((t) =>
    /background/.test(t.getAttribute("style") ?? ""),
  );
  const owner = token?.closest<HTMLElement>("[data-block-id]");
  const index = Number(token?.getAttribute("data-token-index"));
  return owner && Number.isInteger(index) ? { leaf, block: owner, token: index } : null;
}

/**
 * Delimiters while the popup is open: `$$` on their own lines for a block equation, in the editor
 * and around the rendered equation. An inline equation's editor ends in a newline that would push
 * a closing `$` onto its own line, so the editor gets the opening `$` and the equation on the
 * page gets both.
 */
export function equationEditorCss(editor: EquationEditor): string {
  const input = "[role=dialog] [data-content-editable-leaf]:focus";
  if (editor.token !== undefined) {
    const token = '.notion-text-equation-token[style*="background"]';
    return [
      `${input}::before { content: "$"; ${MARKER_STYLE} }`,
      `${token}::before, ${token}::after { content: "$"; ${MARKER_STYLE} }`,
    ].join("\n");
  }
  const block = `[data-block-id=${cssString(editor.block.dataset.blockId ?? "")}] [aria-haspopup=dialog]`;
  return [
    ...["before", "after"].map(
      (pseudo) => `${input}::${pseudo} { content: "$$"; display: block; ${MARKER_STYLE} }`,
    ),
    ...["before", "after"].map(
      (pseudo) =>
        `${block}::${pseudo} { content: "$$"; display: block; text-align: center; ${MARKER_STYLE} }`,
    ),
  ].join("\n");
}

/** Replaces an inline equation with its TeX as text, keeping its other formatting. */
export function unwrapEquation(title: RichText, index: number): RichText {
  return title.map((segment, i): Segment => {
    const [text, decorations = []] = segment;
    const equation = decorations.find(([code]) => code === "e");
    if (i !== index || !equation) return [text, decorations];
    const rest = decorations.filter((decoration) => decoration !== equation);
    const tex = String(equation[1] ?? "");
    return rest.length ? [tex, rest] : [tex];
  });
}

/** Turns the equation back into its TeX source as text, like deleting its `$` in markdown. */
export async function removeEquation(internals: Internals, editor: EquationEditor): Promise<void> {
  const { block, token } = editor;
  await closeEditor(editor.leaf);
  const store = await waitFor(() => (block.isConnected ? blockStore(block) : null));
  const value = store?.getValue();
  if (!store || !value) return;
  if (token === undefined) {
    // An equation block keeps its TeX as its title, so it only changes type.
    internals.commit(store, [[["type"], "text"]]);
  } else {
    const title = value.properties?.title ?? [];
    internals.commit(store, [[["properties", "title"], unwrapEquation(title, token)]]);
  }
}
