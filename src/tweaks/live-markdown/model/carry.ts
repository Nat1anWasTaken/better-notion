import { type Decoration, normalize, type Span } from "./rich-text";

/** A new highlight with no colour of its own, written as `==text==`. */
export const DEFAULT_HIGHLIGHT = "yellow_background";

interface Char {
  char: string;
  span: Span;
}

function chars(spans: readonly Span[]): Char[] {
  return spans.flatMap((span) => [...span.text].map((char) => ({ char, span })));
}

/** Decorations that typed text picks up from the text before it, like Notion's text colour. */
function inherited(extras: readonly Decoration[]): Decoration[] {
  return extras.filter(([code]) => code === "h");
}

/**
 * Builds the new rich text from parsed markdown, keeping what markdown can't express. The old and
 * new text are compared, and unchanged characters keep their colours, mentions, comments and
 * highlight colours; typed characters take the colour of the text before them.
 */
export function carry(previous: readonly Span[], next: readonly Span[]): Span[] {
  const before = chars(previous);
  const after = chars(next);
  let head = 0;
  while (head < before.length && head < after.length && before[head]?.char === after[head]?.char) {
    head++;
  }
  let tail = 0;
  while (
    tail < before.length - head &&
    tail < after.length - head &&
    before[before.length - 1 - tail]?.char === after[after.length - 1 - tail]?.char
  ) {
    tail++;
  }

  const out: Span[] = [];
  after.forEach(({ char, span }, i) => {
    const old =
      i < head
        ? before[i]
        : i >= after.length - tail
          ? before[i - after.length + before.length]
          : undefined;
    const last = out.at(-1);
    const extras = old ? old.span.extras : inherited(last?.extras ?? []);
    const formats = new Map(span.formats);
    if (formats.get("highlight") === "") {
      formats.set(
        "highlight",
        old?.span.formats.get("highlight") || last?.formats.get("highlight") || DEFAULT_HIGHLIGHT,
      );
    }
    out.push({ text: char, formats, extras });
  });
  return normalize(out);
}
