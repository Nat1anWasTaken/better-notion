import { DRAWN, headingPrefix, matchPrefix, type QuoteMarker } from "./blocks";
import { markersFor } from "./markers";
import { type ParseOptions, parse } from "./parse";
import { type Format, normalize, type Span, type Syntax } from "./rich-text";

export interface SourceOptions extends Syntax {
  quote: QuoteMarker;
}

/** How to parse a block's source: drawn blocks hide their prefix, so it isn't in the source. */
export function parseOptions(type: string, options: SourceOptions): ParseOptions {
  return { ...options, type, prefix: !DRAWN.has(type) };
}

const SPECIAL = /[\\*`$[\]~=<]/g;

function inline(spans: readonly Span[], escaped: boolean): string {
  const markers = markersFor(spans);
  return spans
    .map((span, i) => {
      const equation = span.formats.get("equation");
      const content =
        equation ??
        (span.formats.has("code") || !escaped ? span.text : span.text.replace(SPECIAL, "\\$&"));
      return `${markers[i]?.before}${content}${markers[i]?.after}`;
    })
    .join("");
}

/** Formats whose markers can't sit next to a space, so edge spaces are written outside them. */
const FLANKED: readonly Format[] = ["bold", "italic", "strike", "highlight"];

/**
 * Moves spaces at the edges of bold, italic, strike and highlight runs outside them: Notion
 * allows `**bold **`, markdown needs `**bold** `.
 */
export function flank(spans: readonly Span[]): Span[] {
  const chars = spans.flatMap((span) =>
    [...span.text].map((text) => ({ ...span, text, formats: new Map(span.formats) })),
  );
  const space = (i: number) => /\s/.test(chars[i]?.text ?? "");
  for (const format of FLANKED) {
    const has = (i: number) => chars[i]?.formats.has(format) ?? false;
    for (let i = 0; i < chars.length; i++) {
      if (!has(i)) continue;
      let end = i;
      while (has(end + 1)) end++;
      for (let j = i; j <= end && space(j); j++) chars[j]?.formats.delete(format);
      for (let j = end; j >= i && space(j); j--) chars[j]?.formats.delete(format);
      i = end;
    }
  }
  return normalize(chars);
}

/** The parts of spans that markdown expresses, for comparing a round trip. */
function shape(spans: readonly Span[]): string {
  return JSON.stringify(
    normalize(
      spans.map((span) => ({
        text: span.text,
        formats: new Map([...span.formats].map(([f, v]) => [f, f === "highlight" ? "" : v])),
        extras: [],
      })),
    ).map((span) => [span.text, [...span.formats]]),
  );
}

/**
 * Writes a block as markdown. Text that would read as syntax is escaped, but only when it has
 * to be, so ordinary text with a stray `*` stays as it is.
 */
export function serialize(type: string, original: readonly Span[], options: SourceOptions): string {
  const spans = flank(original);
  const parsing = parseOptions(type, options);
  const expected = shape(spans);
  let source = "";
  for (const escaped of [false, true]) {
    const body = inline(spans, escaped);
    source = headingPrefix(type) + body;
    if (escaped && parsing.prefix && !headingPrefix(type)) {
      // Text that starts like block syntax: escape the syntax's first punctuation.
      const match = matchPrefix(body, options.quote);
      const at = match ? body.slice(0, match.length).search(/[!-/:-@[-`{-~]/) : -1;
      if (at >= 0) source = `${body.slice(0, at)}\\${body.slice(at)}`;
    }
    const parsed = parse(source, parsing);
    if (parsed.type === type && shape(parsed.spans) === expected) break;
  }
  return source;
}
