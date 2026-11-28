import type { Parsed, Piece } from "../model/parse";
import { type Format, MENTION_CHAR } from "../model/rich-text";

export const MARK_CLASS = "bn-md-mark";
export const HIDDEN_CLASS = "bn-md-hidden";

const FORMAT_CLASSES: Record<Format, string> = {
  link: "bn-md-link",
  highlight: "bn-md-highlight",
  bold: "bn-md-bold",
  italic: "bn-md-italic",
  strike: "bn-md-strike",
  underline: "bn-md-underline",
  code: "bn-md-code",
  equation: "bn-md-equation",
};

/**
 * Styles for the editor. Colours come from Notion's variables so they follow its theme. Markers
 * keep the size of their text but not its formatting.
 */
export const EDITOR_CSS = `
.${MARK_CLASS} { color: var(--c-texTer, rgba(55, 53, 47, 0.45)); font-weight: 400; font-style: normal; text-decoration: none; background: none; }
.${HIDDEN_CLASS} { display: none; }
.bn-md-bold { font-weight: 600; }
.bn-md-italic { font-style: italic; }
.bn-md-strike { text-decoration: line-through; }
.bn-md-underline { text-decoration: underline; }
.bn-md-strike.bn-md-underline { text-decoration: line-through underline; }
.bn-md-link:not(.${MARK_CLASS}) { text-decoration: underline; text-decoration-color: var(--c-texTer, rgba(55, 53, 47, 0.4)); }
.bn-md-highlight:not(.${MARK_CLASS}) { background: rgba(255, 212, 0, 0.3); }
.bn-md-code:not(.${MARK_CLASS}), .bn-md-equation:not(.${MARK_CLASS}) {
  font-family: "SFMono-Regular", Menlo, Consolas, monospace; font-size: 85%;
  background: rgba(135, 131, 120, 0.15); border-radius: 4px; padding: 0.2em 0.1em;
}
.bn-md-code:not(.${MARK_CLASS}) { color: #eb5757; }
.bn-md-atom { color: var(--c-texSec, rgba(55, 53, 47, 0.65)); }
.bn-md-atom::after { content: attr(data-label); }
.bn-md-atom > span { font-size: 0; }
`;

function classes(piece: Piece): string {
  const names = [...piece.formats.keys()].map((format) => FORMAT_CLASSES[format]);
  if (piece.kind === "marker") names.push(MARK_CLASS);
  return names.join(" ");
}

/**
 * A mention is one `‣` in the source. It shows the mention's label, with the character itself
 * kept as (invisible) text so offsets still count it.
 */
function atom(label: string): HTMLElement {
  const el = document.createElement("span");
  el.className = "bn-md-atom";
  el.contentEditable = "false";
  el.dataset.label = label;
  const char = document.createElement("span");
  char.textContent = MENTION_CHAR;
  el.append(char);
  return el;
}

export interface RenderInput {
  source: string;
  parsed: Parsed;
  /** The label of the mention at a plain-text offset. */
  label: (model: number) => string;
}

/** Renders source as highlighted markdown into the editor element. */
export function renderSource(root: HTMLElement, { source, parsed, label }: RenderInput): void {
  const fragment = document.createDocumentFragment();
  let at = 0;
  const plain = (end: number) => {
    if (end > at) fragment.append(source.slice(at, end));
  };
  for (const piece of parsed.pieces) {
    plain(piece.start);
    const el = document.createElement("span");
    el.className = classes(piece);
    if (piece.run >= 0) el.dataset.run = String(piece.run);
    const text = source.slice(piece.start, piece.end);
    if (piece.kind === "text" && text.includes(MENTION_CHAR)) {
      let model = piece.model;
      for (const part of text.split(/(‣)/)) {
        if (part === MENTION_CHAR) el.append(atom(label(model)));
        else if (part) el.append(part);
        model += part.length;
      }
    } else {
      el.textContent = text;
    }
    fragment.append(el);
    at = piece.end;
  }
  plain(source.length);
  root.replaceChildren(fragment);
}

/** Shows the markers of runs touching the caret, or all of them. */
export function revealMarkers(root: HTMLElement, runs: Parsed["runs"], caret: number | null): void {
  for (const el of root.querySelectorAll<HTMLElement>(`.${MARK_CLASS}[data-run]`)) {
    const run = runs[Number(el.dataset.run)];
    const shown = caret === null || (run !== undefined && run[0] <= caret && caret <= run[1]);
    el.classList.toggle(HIDDEN_CLASS, !shown);
  }
}
