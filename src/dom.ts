/** Adds a stylesheet, even at document-start before `<head>` exists. Returns a remover. */
export function addStyle(css: string, name = ""): () => void {
  const style = document.createElement("style");
  style.dataset.betterNotion = name;
  style.textContent = css;
  (document.head ?? document.documentElement).append(style);
  return () => style.remove();
}

/** Creates an element with optional class and text. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
