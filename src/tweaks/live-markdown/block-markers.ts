import { blockType } from "./detect";

export interface BlockMarker {
  /** Shown before the block's text, like `## `. */
  prefix?: string;
  /** Shown on its own line above and below the block, like a code fence. */
  fence?: string;
}

export interface BlockMarkerOptions {
  quote: string;
}

const HEADING_LEVELS: Record<string, number> = {
  header: 1,
  sub_header: 2,
  sub_sub_header: 3,
  header_4: 4,
};

export function headingLevel(block: Element): number | undefined {
  const type = blockType(block);
  return type ? HEADING_LEVELS[type] : undefined;
}

/** The block that directly owns `el`, skipping blocks nested inside it. */
function ownedBy(el: Element, block: Element): boolean {
  return el.closest("[data-block-id]") === block;
}

function precedes(a: Node, b: Node): boolean {
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

/** Toggle headings render an open/close button before their text. */
function isToggleHeading(block: Element, leaf: Element): boolean {
  for (const button of block.querySelectorAll("[role=button][aria-label]")) {
    if (ownedBy(button, block) && precedes(button, leaf)) return true;
  }
  return false;
}

function listNumber(block: Element): string {
  const glyph = block.querySelector(".notion-list-item-box-left .pseudoBefore");
  if (!glyph) return "1.";
  // Notion draws the number in a ::before, so it isn't in the text.
  const content = getComputedStyle(glyph, "::before").content;
  const number = /^"(.+)"$/.exec(content)?.[1] ?? glyph.textContent?.trim();
  return number || "1.";
}

function isChecked(block: Element): boolean {
  const checkbox = block.querySelector<HTMLInputElement>("input[type=checkbox]");
  return checkbox !== null && ownedBy(checkbox, block) && checkbox.checked;
}

function calloutIcon(callout: Element): string {
  return callout.querySelector(".notion-record-icon")?.textContent?.trim() || "note";
}

/** The markdown syntax for a block, written the way you'd type it in Notion. */
export function blockMarker(
  block: Element,
  leaf: Element,
  options: BlockMarkerOptions,
): BlockMarker | undefined {
  const level = headingLevel(block);
  if (level) {
    const hashes = "#".repeat(level);
    // Notion's shortcut for a toggle heading is `# >`.
    return { prefix: isToggleHeading(block, leaf) ? `${hashes} > ` : `${hashes} ` };
  }
  switch (blockType(block)) {
    case "bulleted_list":
      return { prefix: "- " };
    case "numbered_list":
      return { prefix: `${listNumber(block)} ` };
    case "to_do":
      return { prefix: isChecked(block) ? "- [x] " : "- [ ] " };
    case "toggle":
      return { prefix: "> " };
    case "quote":
      return { prefix: `${options.quote} ` };
    case "code":
      return { fence: "```" };
    case "text": {
      // A callout's text is a text block inside the callout; mark its first line.
      const parent = block.parentElement?.closest("[data-block-id]");
      if (parent && blockType(parent) === "callout") {
        if (parent.querySelector("[data-content-editable-leaf]") === leaf) {
          return { prefix: `> [!${calloutIcon(parent)}] ` };
        }
      }
      return undefined;
    }
    default:
      return undefined;
  }
}
