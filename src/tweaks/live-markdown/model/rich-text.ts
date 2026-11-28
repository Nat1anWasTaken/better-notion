/** One decoration on a run of Notion rich text, e.g. `["b"]` or `["a", "https://…"]`. */
export type Decoration = readonly [string, ...unknown[]];

/** A run of Notion rich text: its text and, if formatted, its decorations. */
export type Segment = readonly [string] | readonly [string, readonly Decoration[]];

/** Notion's rich-text array, as stored in a block's `properties.title`. */
export type RichText = readonly Segment[];

/** Inline formats markdown can express, ordered from outermost to innermost. */
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

/**
 * A run of text with the formats markdown expresses, and the decorations it can't (text colours,
 * mentions, comments), which are kept as they are. An equation is one `⁍` character whose
 * `equation` format holds the TeX; a mention is one `‣` character with its decoration in `extras`.
 */
export interface Span {
  text: string;
  formats: ReadonlyMap<Format, string>;
  extras: readonly Decoration[];
}

/** Which optional formats are written as markdown; the rest are kept as extras. */
export interface Syntax {
  highlight: boolean;
  underline: boolean;
}

export const EQUATION_CHAR = "⁍";
export const MENTION_CHAR = "‣";

const FLAGS: Record<string, Format> = {
  b: "bold",
  i: "italic",
  s: "strike",
  _: "underline",
  c: "code",
};
const CODES = Object.fromEntries(Object.entries(FLAGS).map(([code, format]) => [format, code]));

export function isHighlight(colour: unknown): colour is string {
  return (
    typeof colour === "string" && colour.endsWith("_background") && colour !== "default_background"
  );
}

function readSegment([text, decorations = []]: Segment, syntax: Syntax): Span {
  const formats = new Map<Format, string>();
  const extras: Decoration[] = [];
  for (const decoration of decorations) {
    const [code, value] = decoration;
    const flag = FLAGS[code];
    if (flag && (flag !== "underline" || syntax.underline)) formats.set(flag, "");
    else if (code === "a") formats.set("link", String(value ?? ""));
    else if (code === "e") formats.set("equation", String(value ?? ""));
    else if (code === "h" && syntax.highlight && isHighlight(value))
      formats.set("highlight", value);
    else extras.push(decoration);
  }
  return { text, formats, extras };
}

export function toSpans(text: RichText | undefined, syntax: Syntax): Span[] {
  return (text ?? []).map((segment) => readSegment(segment, syntax)).filter((span) => span.text);
}

/** Equations and mentions are single characters that never merge with their neighbours. */
export function isAtomic(span: Span): boolean {
  return span.formats.has("equation") || span.text === MENTION_CHAR;
}

function sameMarks(a: Span, b: Span): boolean {
  if (a.formats.size !== b.formats.size) return false;
  for (const [format, value] of a.formats) if (b.formats.get(format) !== value) return false;
  return JSON.stringify(a.extras) === JSON.stringify(b.extras);
}

/** Merges neighbouring spans with the same formatting and drops empty ones. */
export function normalize(spans: readonly Span[]): Span[] {
  const out: Span[] = [];
  for (const span of spans) {
    if (!span.text) continue;
    const last = out.at(-1);
    if (last && !isAtomic(last) && !isAtomic(span) && sameMarks(last, span)) {
      out[out.length - 1] = { ...last, text: last.text + span.text };
    } else {
      out.push(span);
    }
  }
  return out;
}

export function fromSpans(spans: readonly Span[]): RichText {
  return normalize(spans).map((span): Segment => {
    const decorations: Decoration[] = [];
    for (const format of FORMATS) {
      const value = span.formats.get(format);
      if (value === undefined) continue;
      const code = CODES[format];
      if (code) decorations.push([code]);
      else if (format === "link") decorations.push(["a", value]);
      else if (format === "equation") decorations.push(["e", value]);
      else if (format === "highlight") decorations.push(["h", value]);
    }
    decorations.push(...span.extras);
    return decorations.length ? [span.text, decorations] : [span.text];
  });
}

export function plainText(spans: readonly Span[]): string {
  return spans.map((span) => span.text).join("");
}

/** The spans covering plain-text offsets `start` to `end`. */
export function sliceSpans(spans: readonly Span[], start: number, end = Infinity): Span[] {
  const out: Span[] = [];
  let at = 0;
  for (const span of spans) {
    const from = Math.max(start, at);
    const to = Math.min(end, at + span.text.length);
    if (from < to) out.push({ ...span, text: span.text.slice(from - at, to - at) });
    at += span.text.length;
  }
  return out;
}
