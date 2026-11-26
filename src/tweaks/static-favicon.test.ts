// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { staticFavicon } from "./static-favicon";

const flush = () => new Promise((resolve) => setTimeout(resolve));
const expected = () => new URL("/images/favicon.ico", location.origin).href;

function addLink(rel: string, href: string): HTMLLinkElement {
  const link = document.createElement("link");
  link.rel = rel;
  link.href = href;
  document.head.append(link);
  return link;
}

describe("staticFavicon", () => {
  beforeAll(() => {
    staticFavicon.run();
  });

  it("pins icon links added later", async () => {
    const link = addLink("shortcut icon", "https://example.com/page-emoji.png");
    await flush();
    expect(link.href).toBe(expected());
  });

  it("reverts href changes on existing icon links", async () => {
    const link = addLink("icon", expected());
    link.href = "data:image/svg+xml,<svg></svg>";
    await flush();
    expect(link.href).toBe(expected());
  });

  it("leaves non-icon links alone", async () => {
    const link = addLink("apple-touch-icon", "https://example.com/touch.png");
    const stylesheet = addLink("stylesheet", "https://example.com/style.css");
    await flush();
    expect(link.href).toBe("https://example.com/touch.png");
    expect(stylesheet.href).toBe("https://example.com/style.css");
  });
});
