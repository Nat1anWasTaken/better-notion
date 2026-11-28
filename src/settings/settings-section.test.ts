// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { StatusBoard } from "../status";
import type { Tweak } from "../tweaks/types";
import { mountSettingsSection } from "./settings-section";
import { memoryBackend, SettingsStore } from "./store";

const tweak: Tweak = {
  id: "demo",
  name: "Demo tweak",
  description: "Does a thing",
  options: [
    { type: "toggle", key: "extra", label: "Extra", default: false },
    {
      type: "select",
      key: "mode",
      label: "Mode",
      default: "a",
      choices: [
        { value: "a", label: "Mode A" },
        { value: "b", label: "Mode B" },
      ],
    },
  ],
  run: () => undefined,
};
const store = new SettingsStore(memoryBackend());
const status = new StatusBoard();

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
    mountSettingsSection([tweak], store, status);
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

  it("lays out each tweak as a section with a heading", () => {
    const section = document.querySelector('.bn-section[data-tweak="demo"]');
    expect(section?.querySelector(".bn-heading")?.textContent).toBe("Demo tweak");
    expect(section?.querySelectorAll(".bn-row")).toHaveLength(3);
  });

  it("picks select options from a menu", () => {
    const button = document.querySelector<HTMLButtonElement>('button[aria-label="Mode"]');
    expect(button?.textContent).toBe("Mode A");
    button?.click();
    expect(button?.getAttribute("aria-expanded")).toBe("true");
    const items = document.querySelectorAll<HTMLElement>(".bn-menu [role=menuitemradio]");
    expect([...items].map((item) => item.getAttribute("aria-checked"))).toEqual(["true", "false"]);
    items[1]?.click();
    expect(store.getOption(tweak, "mode")).toBe("b");
    expect(document.querySelector(".bn-menu")).toBeNull();
    expect(document.querySelector('button[aria-label="Mode"]')?.textContent).toBe("Mode B");
  });

  it("closes the menu on Escape without closing the dialog", () => {
    document.querySelector<HTMLButtonElement>('button[aria-label="Mode"]')?.click();
    let escaped = false;
    document.addEventListener("keydown", () => (escaped = true), { once: true });
    document
      .querySelector(".bn-menu")
      ?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.querySelector(".bn-menu")).toBeNull();
    expect(escaped).toBe(false);
  });

  it("writes switch changes to the store", () => {
    const input = document.querySelector<HTMLInputElement>('[aria-label="Demo tweak"]');
    input?.click();
    expect(store.isEnabled(tweak)).toBe(false);
    expect(document.querySelectorAll(".bn-row.bn-disabled")).toHaveLength(2);
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

  it("shows a tweak's notice", () => {
    ours()?.click();
    status.set("demo", "Not available on this version of Notion.");
    const notice = document.querySelector('[data-tweak="demo"] [role=status]');
    expect(notice?.textContent).toBe("Not available on this version of Notion.");
    status.set("demo", null);
    expect(document.querySelector('[data-tweak="demo"] [role=status]')).toBeNull();
  });
});
