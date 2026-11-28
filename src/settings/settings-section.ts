import { addStyle, h } from "../dom";
import type { StatusBoard } from "../status";
import type { OptionDef, Tweak } from "../tweaks/types";
import type { SettingsStore } from "./store";

const TAB_TESTID = "settings-tab-better-notion";
const PANEL_CLASS = "bn-settings-panel";
const HIDDEN_ATTR = "data-bn-hidden";

// Notion's tab and panel classes are generated, so the section clones Notion's own nodes for the
// sidebar and restyles its own panel to match Notion's Preferences panel, using Notion's colour
// variables so it follows the theme.
const CSS = `
[${HIDDEN_ATTR}] { display: none !important; }
.${PANEL_CLASS} {
  box-sizing: border-box; flex-grow: 1; height: 100%; overflow-y: auto; padding: 36px 60px 44px;
  color: var(--c-texPri); background: var(--c-bacPri);
}
.${PANEL_CLASS} .bn-inner {
  display: flex; flex-direction: column; gap: 44px; max-width: 800px; margin: 0 auto;
}
.${PANEL_CLASS} .bn-header { display: flex; flex-direction: column; gap: 8px; }
.${PANEL_CLASS} .bn-title { font-size: 26px; font-weight: 600; line-height: 32px; }
.${PANEL_CLASS} .bn-subtitle { font-size: 16px; line-height: 24px; }
.${PANEL_CLASS} .bn-section + .bn-section { margin-top: 48px; }
.${PANEL_CLASS} .bn-heading {
  font-size: 16px; font-weight: 500; line-height: 24px;
  padding-bottom: 12px; margin-bottom: 16px; border-bottom: 1px solid var(--ca-borSecTra);
}
.${PANEL_CLASS} .bn-rows { display: flex; flex-direction: column; gap: 24px; }
.${PANEL_CLASS} .bn-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.${PANEL_CLASS} .bn-text { flex: 3 1 0; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.${PANEL_CLASS} .bn-label { font-size: 14px; font-weight: 500; line-height: 20px; }
.${PANEL_CLASS} .bn-desc { font-size: 13px; line-height: 18px; color: var(--c-texSec); }
.${PANEL_CLASS} .bn-control { flex: 1 0 0; min-width: max-content; display: flex; justify-content: flex-end; }
.${PANEL_CLASS} .bn-disabled { opacity: 0.4; pointer-events: none; }
.${PANEL_CLASS} .bn-switch { position: relative; width: 30px; height: 18px; border-radius: 44px; }
.${PANEL_CLASS} .bn-track {
  box-sizing: border-box; width: 30px; height: 18px; padding: 2px; border-radius: 44px;
  background: var(--ca-swiTogDesTraBgVar); transition: background 0.2s, box-shadow 0.2s;
}
.${PANEL_CLASS} .bn-knob {
  width: 14px; height: 14px; border-radius: 44px; background: #fff;
  transition: transform 0.2s ease-out, background 0.2s ease-out;
}
.${PANEL_CLASS} .bn-switch input { position: absolute; inset: 0; margin: 0; opacity: 0; cursor: pointer; }
.${PANEL_CLASS} .bn-switch input:checked + .bn-track { background: var(--c-bluIcoAccPri); }
.${PANEL_CLASS} .bn-switch input:checked + .bn-track .bn-knob { transform: translateX(12px); }
.${PANEL_CLASS} .bn-switch input:focus-visible + .bn-track { box-shadow: 0 0 0 2px var(--c-bluIcoAccPri); }
.${PANEL_CLASS} .bn-select {
  display: flex; align-items: center; gap: 6px; height: 28px; padding: 0 8px;
  font: inherit; font-size: 14px; font-weight: 500; line-height: 1.2; color: inherit;
  background: transparent; border: 1px solid var(--ca-borPriTra); border-radius: 6px;
  cursor: pointer; white-space: nowrap; user-select: none; transition: background 20ms ease-in;
}
.${PANEL_CLASS} .bn-notice {
  margin: 4px 0 8px; padding: 8px 12px; border-radius: 6px; font-size: 13px; line-height: 18px;
  color: var(--c-texPri); background: color-mix(in srgb, var(--c-texTer) 15%, transparent);
}
.${PANEL_CLASS} .bn-select:hover, .${PANEL_CLASS} .bn-select[aria-expanded=true] {
  background: var(--ca-butHovBac);
}
.${PANEL_CLASS} .bn-select svg { width: 8.6px; height: 14px; fill: var(--c-icoSec); flex-shrink: 0; }
.${PANEL_CLASS} .bn-menu {
  position: fixed; z-index: 1; box-sizing: border-box; min-width: 220px; max-width: 320px;
  display: flex; flex-direction: column; gap: 1px; padding: 4px;
  background: var(--c-popBac); border-radius: 10px;
  box-shadow: 0 0 0 1px var(--c-borPri), 0 14px 28px -6px rgba(0, 0, 0, 0.2),
    0 2px 4px -1px rgba(0, 0, 0, 0.12);
}
.${PANEL_CLASS} .bn-item {
  display: flex; align-items: center; gap: 8px; height: 28px; padding: 0 8px;
  font: inherit; font-size: 14px; line-height: 1.2; color: inherit; text-align: start;
  background: transparent; border: 0; border-radius: 6px; cursor: pointer; white-space: nowrap;
}
.${PANEL_CLASS} .bn-item:hover, .${PANEL_CLASS} .bn-item:focus-visible {
  background: var(--ca-butHovBac); outline: none;
}
.${PANEL_CLASS} .bn-item span { flex-grow: 1; overflow: hidden; text-overflow: ellipsis; }
.${PANEL_CLASS} .bn-item svg { width: 16px; height: 16px; fill: currentColor; flex-shrink: 0; }
.${PANEL_CLASS} .bn-item:not([aria-checked=true]) svg { visibility: hidden; }
`;

// Added only while our tab is open. Notion resets attributes on the dialog, so this can't hang off
// a marker there.
const OPEN_CSS = `[role=dialog] [role=tabpanel]:not(.${PANEL_CLASS}) { display: none !important; }`;

const ICON = `<svg viewBox="0 0 20 20" aria-hidden="true" role="graphics-symbol"><path d="M4.5 3.875a.625.625 0 0 1 .625.625v2.08a2.126 2.126 0 0 1 0 4.09v4.83a.625.625 0 1 1-1.25 0v-4.83a2.126 2.126 0 0 1 0-4.09V4.5a.625.625 0 0 1 .625-.625m0 3.75a.875.875 0 1 0 0 1.75.875.875 0 0 0 0-1.75m5.5-3.75a.625.625 0 0 1 .625.625v6.08a2.126 2.126 0 0 1 0 4.09v.83a.625.625 0 1 1-1.25 0v-.83a2.126 2.126 0 0 1 0-4.09V4.5A.625.625 0 0 1 10 3.875m0 7.75a.875.875 0 1 0 0 1.75.875.875 0 0 0 0-1.75m5.5-7.75a.625.625 0 0 1 .625.625v.08a2.126 2.126 0 0 1 0 4.09v6.83a.625.625 0 1 1-1.25 0V8.67a2.126 2.126 0 0 1 0-4.09V4.5a.625.625 0 0 1 .625-.625m0 1.75a.875.875 0 1 0 0 1.75.875.875 0 0 0 0-1.75"/></svg>`;

// Notion's dropdown chevron and menu checkmark.
const CHEVRON = `<svg viewBox="3.06 0 9.88 16" aria-hidden="true"><path d="m12.76 6.52-4.32 4.32a.62.62 0 0 1-.44.18.62.62 0 0 1-.44-.18L3.24 6.52a.63.63 0 0 1 0-.88c.24-.24.64-.24.88 0L8 9.52l3.88-3.88c.24-.24.64-.24.88 0s.24.64 0 .88"/></svg>`;
const CHECK = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M11.834 3.309a.625.625 0 0 1 1.072.642l-5.244 8.74a.625.625 0 0 1-1.01.085L3.155 8.699a.626.626 0 0 1 .95-.813l2.93 3.419z"/></svg>`;

function toggle(checked: boolean, label: string, onChange: (checked: boolean) => void) {
  const wrap = h("div", "bn-switch");
  const input = h("input");
  input.type = "checkbox";
  input.setAttribute("role", "switch");
  input.setAttribute("aria-label", label);
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  const track = h("div", "bn-track");
  track.append(h("div", "bn-knob"));
  wrap.append(input, track);
  return wrap;
}

/**
 * A dropdown like the ones in Notion's settings: a button showing the current choice that opens
 * a menu with a checkmark on it. The menu stays inside our panel so Notion doesn't treat clicks on
 * it as clicks outside the dialog.
 */
function dropdown(
  label: string,
  choices: readonly { value: string; label: string }[],
  value: string,
  onChange: (value: string) => void,
) {
  const button = h("button", "bn-select");
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-haspopup", "menu");
  button.setAttribute("aria-expanded", "false");
  const current = h("span", undefined, choices.find((c) => c.value === value)?.label ?? value);
  button.append(current);
  button.insertAdjacentHTML("beforeend", CHEVRON);

  let menu: HTMLElement | null = null;
  const close = (refocus = false) => {
    if (!menu) return;
    menu.remove();
    menu = null;
    button.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", onOutside, true);
    if (refocus) button.focus();
  };
  const onOutside = (event: Event) => {
    const target = event.target as Node;
    if (!menu?.contains(target) && !button.contains(target)) close();
  };

  const open = () => {
    const panel = button.closest(`.${PANEL_CLASS}`);
    if (!panel) return;
    menu = h("div", "bn-menu");
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", label);
    for (const choice of choices) {
      const item = h("button", "bn-item");
      item.type = "button";
      item.setAttribute("role", "menuitemradio");
      item.setAttribute("aria-checked", String(choice.value === value));
      item.append(h("span", undefined, choice.label));
      item.insertAdjacentHTML("beforeend", CHECK);
      item.addEventListener("click", () => {
        close(true);
        if (choice.value !== value) onChange(choice.value);
      });
      menu.append(item);
    }
    menu.addEventListener("keydown", (event) => {
      const items = [...(menu?.querySelectorAll<HTMLElement>(".bn-item") ?? [])];
      const index = items.indexOf(document.activeElement as HTMLElement);
      if (event.key === "Escape" || event.key === "Tab") close(true);
      else if (event.key === "ArrowDown") items[(index + 1) % items.length]?.focus();
      else if (event.key === "ArrowUp") items.at(index - 1)?.focus();
      else return;
      // Escape would otherwise close Notion's whole dialog.
      event.preventDefault();
      event.stopPropagation();
    });
    panel.append(menu);

    // Right-aligned under the button, or above it when there's no room below. Notion's dialog may
    // be transformed, which moves the box fixed elements are placed in, so correct by the offset.
    const anchor = button.getBoundingClientRect();
    const size = menu.getBoundingClientRect();
    const below = anchor.bottom + 4 + size.height <= window.innerHeight - 8;
    const left = Math.max(8, anchor.right - size.width);
    const top = below ? anchor.bottom + 4 : Math.max(8, anchor.top - 4 - size.height);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    const placed = menu.getBoundingClientRect();
    menu.style.left = `${2 * left - placed.left}px`;
    menu.style.top = `${2 * top - placed.top}px`;

    button.setAttribute("aria-expanded", "true");
    document.addEventListener("pointerdown", onOutside, true);
    (
      menu.querySelector<HTMLElement>("[aria-checked=true]") ?? menu.querySelector("button")
    )?.focus();
  };

  button.addEventListener("click", () => (menu ? close() : open()));
  button.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" || menu) return;
    event.preventDefault();
    open();
  });
  return button;
}

function row(label: string, description: string | undefined, control: HTMLElement) {
  const el = h("div", "bn-row");
  const text = h("div", "bn-text");
  text.append(h("div", "bn-label", label));
  if (description) text.append(h("div", "bn-desc", description));
  const controlWrap = h("div", "bn-control");
  controlWrap.append(control);
  el.append(text, controlWrap);
  return el;
}

function optionControl(tweak: Tweak, option: OptionDef, store: SettingsStore): HTMLElement {
  if (option.type === "toggle") {
    return toggle(store.getOption(tweak, option.key) === true, option.label, (checked) =>
      store.setOption(tweak, option.key, checked),
    );
  }
  return dropdown(
    option.label,
    option.choices,
    String(store.getOption(tweak, option.key)),
    (value) => store.setOption(tweak, option.key, value),
  );
}

/** Builds the panel content, laid out like Notion's own settings pages. Exported for tests. */
export function renderPanel(
  tweaks: readonly Tweak[],
  store: SettingsStore,
  status: StatusBoard,
): HTMLElement {
  const inner = h("div", "bn-inner");
  const header = h("header", "bn-header");
  header.append(
    h("div", "bn-title", "Better Notion"),
    h("div", "bn-subtitle", "Personal tweaks from the Better Notion userscript"),
  );
  const sections = h("div");
  for (const tweak of tweaks) {
    const enabled = store.isEnabled(tweak);
    const section = h("section", "bn-section");
    section.dataset.tweak = tweak.id;
    const rows = h("div", "bn-rows");
    rows.append(
      row(
        "Enabled",
        tweak.description,
        toggle(enabled, tweak.name, (checked) => store.setEnabled(tweak, checked)),
      ),
    );
    const notice = status.get(tweak.id);
    if (notice) {
      const el = h("div", "bn-notice", notice);
      el.setAttribute("role", "status");
      rows.append(el);
    }
    for (const option of tweak.options ?? []) {
      const optionRow = row(option.label, option.description, optionControl(tweak, option, store));
      if (!enabled) {
        optionRow.classList.add("bn-disabled");
        optionRow.setAttribute("aria-disabled", "true");
      }
      rows.append(optionRow);
    }
    section.append(h("div", "bn-heading", tweak.name), rows);
    sections.append(section);
  }
  inner.append(header, sections);
  return inner;
}

function textLeaves(el: Element): Element[] {
  return [...el.querySelectorAll("*")].filter(
    (leaf) => leaf.children.length === 0 && leaf.textContent?.trim(),
  );
}

/**
 * Clones a Notion tab as a template for another one, keeping Notion's classes for the look but
 * swapping its icon and label. Clones don't carry Notion's event handlers.
 */
function cloneTab(template: HTMLElement, label: string, icon: SVGElement | null): HTMLElement {
  const tab = template.cloneNode(true) as HTMLElement;
  tab.removeAttribute("id");
  tab.removeAttribute("aria-controls");
  const svg = tab.querySelector("svg");
  if (svg && icon) {
    const replacement = icon.cloneNode(true) as SVGElement;
    replacement.setAttribute("class", svg.getAttribute("class") ?? "");
    svg.replaceWith(replacement);
  }
  const labelEl = textLeaves(tab).sort(
    (a, b) => (b.textContent?.length ?? 0) - (a.textContent?.length ?? 0),
  )[0];
  if (labelEl) labelEl.textContent = label;
  return tab;
}

function ourIcon(): SVGElement {
  const holder = document.createElement("div");
  holder.innerHTML = ICON;
  return holder.firstElementChild as SVGElement;
}

/**
 * Adds a "Better Notion" section to Notion's Settings dialog, listing every tweak with a switch
 * and its options.
 */
export function mountSettingsSection(
  tweaks: readonly Tweak[],
  store: SettingsStore,
  status: StatusBoard,
): void {
  addStyle(CSS);

  interface Open {
    dialog: Element;
    removeStyle: () => void;
    panel: HTMLElement;
    hidden: HTMLElement | null;
    standIn: HTMLElement | null;
    unsubscribe: () => void;
  }
  let open: Open | null = null;
  let tab: HTMLElement | null = null;
  let unselectedTemplate: HTMLElement | null = null;

  const setTab = (next: HTMLElement) => {
    next.dataset.testid = TAB_TESTID;
    next.addEventListener("click", () => {
      if (!open) show();
    });
    tab?.replaceWith(next);
    tab = next;
  };

  const close = () => {
    if (!open) return;
    open.unsubscribe();
    open.panel.remove();
    open.standIn?.remove();
    open.hidden?.removeAttribute(HIDDEN_ATTR);
    open.removeStyle();
    open = null;
    if (unselectedTemplate) setTab(cloneTab(unselectedTemplate, "Better Notion", ourIcon()));
  };

  const placePanel = (dialog: Element, panel: HTMLElement) => {
    const notionPanel = dialog.querySelector(`[role=tabpanel]:not(.${PANEL_CLASS})`);
    if (notionPanel && panel.previousElementSibling !== notionPanel) notionPanel.after(panel);
  };

  const show = () => {
    if (!tab || !unselectedTemplate) return;
    const dialog = tab.closest("[role=dialog]") ?? tab.ownerDocument.body;
    const selected = dialog.querySelector<HTMLElement>(
      `[role=tab][aria-selected=true]:not([data-testid=${TAB_TESTID}])`,
    );

    // Swap Notion's selected tab for an unselected-looking stand-in that forwards clicks to it.
    let standIn: HTMLElement | null = null;
    if (selected) {
      setTab(cloneTab(selected, "Better Notion", ourIcon()));
      standIn = cloneTab(
        unselectedTemplate,
        selected.textContent?.trim() ?? "",
        selected.querySelector("svg"),
      );
      standIn.setAttribute("aria-selected", "false");
      standIn.addEventListener("click", () => {
        close();
        selected.click();
      });
      selected.setAttribute(HIDDEN_ATTR, "");
      selected.after(standIn);
    }
    tab.setAttribute("aria-selected", "true");

    const panel = h("div", PANEL_CLASS);
    panel.setAttribute("role", "tabpanel");
    const render = () => panel.replaceChildren(renderPanel(tweaks, store, status));
    render();
    const removeStyle = addStyle(OPEN_CSS, "open");
    placePanel(dialog, panel);
    open = {
      dialog,
      removeStyle,
      panel,
      hidden: selected,
      standIn,
      unsubscribe: (() => {
        const offStore = store.subscribe(render);
        const offStatus = status.subscribe(render);
        return () => {
          offStore();
          offStatus();
        };
      })(),
    };
  };

  const inject = () => {
    if (open && !open.dialog.isConnected) close();
    if (open && !open.panel.isConnected) placePanel(open.dialog, open.panel);

    const sample = document.querySelector<HTMLElement>(
      `[role=tablist] [role=tab][data-testid^="settings-tab-"]:not([data-testid=${TAB_TESTID}])`,
    );
    const tablist = sample?.closest("[role=tablist]");
    const group = sample?.parentElement;
    if (!sample || !tablist || !group || tablist.querySelector(`[data-testid=${TAB_TESTID}]`)) {
      return;
    }

    unselectedTemplate = (
      tablist.querySelector<HTMLElement>("[role=tab][aria-selected=false]:has(svg)") ?? sample
    ).cloneNode(true) as HTMLElement;
    tab = null;
    open = null;

    const newGroup = group.cloneNode(false) as HTMLElement;
    const heading = group.firstElementChild;
    if (heading && heading.getAttribute("role") !== "tab") {
      const headingClone = heading.cloneNode(true) as HTMLElement;
      headingClone.textContent = "Better Notion";
      newGroup.append(headingClone);
    }
    const placeholder = h("div");
    newGroup.append(placeholder);
    tab = placeholder;
    setTab(cloneTab(unselectedTemplate, "Better Notion", ourIcon()));
    tablist.append(newGroup);

    tablist.addEventListener("click", (event) => {
      // Match by test id: opening swaps our tab's node while this click is still bubbling.
      const clicked = (event.target as Element).closest("[role=tab]");
      if (!clicked || clicked.hasAttribute(HIDDEN_ATTR)) return;
      if (clicked.getAttribute("data-testid") !== TAB_TESTID) close();
    });
  };

  // Notion mutates the DOM on every keystroke, so check at most once per frame.
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      inject();
    });
  }).observe(document, { childList: true, subtree: true });
  inject();
}
