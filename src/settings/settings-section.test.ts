// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import type { Tweak } from "../tweaks/types";
import { mountSettingsSection } from "./settings-section";
import { memoryBackend, SettingsStore } from "./store";

const tweak: Tweak = {
  id: "demo",
  name: "Demo tweak",
  description: "Does a thing",
  options: [{ type: "toggle", key: "extra", label: "Extra", default: false }],
  run: () => undefined,
};
const store = new SettingsStore(memoryBackend());

const flush = () => new Promise((resolve) => setTimeout(resolve, 50));
const ours = () =>
  document.querySelector<HTMLElement>('[data-testid="settings-tab-better-notion"]');

function fakeDialog() {
  document.body.innerHTML = `
    <div role="dialog">
      <div role="tablist">
        <div>
          <div class="heading">Account</div>
          <div role="tab" class="tab selected" data-testid="settings-tab-profile" aria-selected="true"
            id="profile"><svg class="icon"></svg><div>Profile</div></div>
          <div role="tab" class="tab" data-testid="settings-tab-prefs" aria-selected="false"
            ><svg class="icon"></svg><div>Preferences</div></div>
        </div>
      </div>
      <div><div class="sidebar"></div><div role="tabpanel">Notion panel</div></div>
    </div>`;
}

describe("mountSettingsSection", () => {
  beforeAll(async () => {
    fakeDialog();
    mountSettingsSection([tweak], store);
    await flush();
  });

  it("adds a Better Notion group with a cloned tab", () => {
    const tab = ours();
    expect(tab?.textContent).toBe("Better Notion");
    expect(tab?.className).toBe("tab");
    expect(tab?.querySelector("svg")?.getAttribute("class")).toBe("icon");
    expect(tab?.parentElement?.firstElementChild?.textContent).toBe("Better Notion");
  });

  it("shows our panel and hides Notion's when selected", () => {
    ours()?.click();
    const panel = document.querySelector(".bn-settings-panel");
    expect(panel?.textContent).toContain("Demo tweak");
    expect(document.querySelector('style[data-better-notion="open"]')).not.toBeNull();
    expect(ours()?.className).toBe("tab selected");
    expect(ours()?.textContent).toBe("Better Notion");
  });

  it("swaps Notion's selected tab for an unselected stand-in", () => {
    const profile = document.querySelector<HTMLElement>('[data-testid="settings-tab-profile"]');
    expect(profile?.hasAttribute("data-bn-hidden")).toBe(true);
    const standIn = profile?.nextElementSibling;
    expect(standIn?.className).toBe("tab");
    expect(standIn?.textContent).toBe("Profile");
  });

  it("writes switch changes to the store", () => {
    const input = document.querySelector<HTMLInputElement>('[aria-label="Demo tweak"]');
    input?.click();
    expect(store.isEnabled(tweak)).toBe(false);
    expect(document.querySelector(".bn-options")?.classList.contains("bn-disabled")).toBe(true);
  });

  it("closes when a Notion tab is clicked", () => {
    document.querySelector<HTMLElement>('[data-testid="settings-tab-prefs"]')?.click();
    expect(document.querySelector(".bn-settings-panel")).toBeNull();
    expect(ours()?.getAttribute("aria-selected")).toBe("false");
    expect(ours()?.className).toBe("tab");
    expect(document.querySelector("[data-bn-hidden]")).toBeNull();
    expect(document.querySelector('style[data-better-notion="open"]')).toBeNull();
    expect(document.querySelectorAll("[role=tab]")).toHaveLength(3);
  });

  it("re-injects when the dialog is opened again", async () => {
    fakeDialog();
    await flush();
    expect(ours()).not.toBeNull();
  });
});
