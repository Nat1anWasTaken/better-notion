/** Inline formats Notion renders on its token spans, ordered from outermost to innermost. */
export const FORMATS = [
  "link",
  "highlight",
  "bold",
  "italic",
  "strike",
  "underline",
  "code",
  "equation",
] as const;

export type Format = (typeof FORMATS)[number];

const BLOCK_CLASS = /^notion-(.+)-block$/;

/** The Notion block type, read from its `notion-<type>-block` class (e.g. `sub_header`). */
export function blockType(block: Element): string | undefined {
  for (const name of block.classList) {
    const match = BLOCK_CLASS.exec(name);
    if (match) return match[1];
  }
  return undefined;
}

/**
 * Reads a token's formats from the inline styles and markup Notion renders. Each value tells runs
 * apart: two adjacent links with different URLs are two runs.
 */
export function tokenFormats(token: Element): Map<Format, string> {
  const style = token.getAttribute("style") ?? "";
  const formats = new Map<Format, string>();
  if (token.tagName === "A") formats.set("link", token.getAttribute("href") ?? "");
  const highlight = token.getAttribute("data-notion-highlight");
  // Removing a highlight leaves `default_background` behind.
  if (highlight?.endsWith("_background") && highlight !== "default_background") {
    formats.set("highlight", highlight);
  }
  if (/font-weight:\s*(?:[6-9]00|bold)/.test(style)) formats.set("bold", "");
  if (/font-style:\s*italic/.test(style)) formats.set("italic", "");
  if (/text-decoration[^;]*line-through/.test(style)) formats.set("strike", "");
  if (/text-decoration[^;]*underline|border-bottom:/.test(style)) formats.set("underline", "");
  if (token.parentElement?.classList.contains("notion-inline-code-container")) {
    formats.set("code", "");
  }
  // Each equation is its own run, even next to another one.
  if (token.classList.contains("notion-text-equation-token")) {
    formats.set("equation", token.getAttribute("data-token-index") ?? "");
  }
  return formats;
}
