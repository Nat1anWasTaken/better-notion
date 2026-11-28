/** Heading block types, by level. */
export const HEADINGS = ["header", "sub_header", "sub_sub_header", "header_4"] as const;

/**
 * Blocks Notion draws a marker for (bullet, number, checkbox, toggle arrow, quote bar). Their
 * markdown prefix isn't shown, but behaves as if it were there.
 */
export const DRAWN = new Set(["bulleted_list", "numbered_list", "to_do", "toggle", "quote"]);

/** Blocks edited as markdown. */
export const EDITABLE = new Set<string>(["text", ...HEADINGS, ...DRAWN]);

/** How a quote is typed: `"` like Notion (where `>` makes a toggle), or `>` like markdown. */
export type QuoteMarker = '"' | ">";

export function headingPrefix(type: string): string {
  const level = (HEADINGS as readonly string[]).indexOf(type) + 1;
  return level ? `${"#".repeat(level)} ` : "";
}

export interface PrefixMatch {
  type: string;
  /** Length of the prefix in the source. */
  length: number;
}

/** Notion's own typing shortcuts, which are also markdown's. */
export function matchPrefix(source: string, quote: QuoteMarker): PrefixMatch | null {
  const rules: [RegExp, string][] = [
    [/^#{1,4} /, ""],
    [/^(?:[-*+] )?\[[ xX]?\] /, "to_do"],
    [/^[-*+] /, "bulleted_list"],
    [/^\d+[.)] /, "numbered_list"],
    ...(quote === '"'
      ? ([
          [/^" /, "quote"],
          [/^> /, "toggle"],
        ] as [RegExp, string][])
      : ([[/^> /, "quote"]] as [RegExp, string][])),
  ];
  for (const [pattern, type] of rules) {
    const match = pattern.exec(source);
    if (!match) continue;
    const length = match[0].length;
    return { type: type || (HEADINGS[length - 2] ?? "text"), length };
  }
  return null;
}
