import type { Tweak } from "./types";

const FAVICON_PATH = "/images/favicon.ico";

function isIconLink(node: Node): node is HTMLLinkElement {
  return node instanceof HTMLLinkElement && node.relList.contains("icon");
}

/**
 * Notion swaps the favicon for the current page's icon, which makes the tab hard to spot
 * in a collapsed vertical tab bar. This pins every icon link to Notion's own logo.
 */
export const staticFavicon: Tweak = {
  id: "static-favicon",
  name: "Static favicon",
  description: "Always show the Notion logo as the tab icon",
  run: () => {
    const href = new URL(FAVICON_PATH, location.origin).href;

    const pin = (link: HTMLLinkElement) => {
      if (link.href !== href) link.href = href;
      // Notion may set a type that doesn't match the .ico.
      if (link.type && link.type !== "image/x-icon") link.type = "image/x-icon";
    };

    const pinAll = () => {
      for (const link of document.querySelectorAll("link")) {
        if (isIconLink(link)) pin(link);
      }
    };

    // At document-start the <head> may not exist yet, so watch the whole document.
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes") {
          if (isIconLink(mutation.target)) pin(mutation.target);
          continue;
        }
        for (const node of mutation.addedNodes) {
          if (isIconLink(node)) pin(node);
          else if (node instanceof Element) {
            for (const link of node.querySelectorAll("link")) {
              if (isIconLink(link)) pin(link);
            }
          }
        }
      }
    });
    observer.observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["href", "rel"],
    });

    pinAll();
    // Notion sets the page icon again on its next update.
    return () => observer.disconnect();
  },
};
