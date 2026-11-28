import { addStyle, h } from "../dom";
import type { OptionDef, Tweak } from "../tweaks/types";
import type { SettingsStore } from "./store";

const TAB_TESTID = "settings-tab-better-notion";
const PANEL_CLASS = "bn-settings-panel";
const HIDDEN_ATTR = "data-bn-hidden";

// Notion's tab and panel classes are generated, so the section clones Notion's own nodes for the
// sidebar and only styles its own panel, using Notion's colour variables to follow the theme.
const CSS = `
[${HIDDEN_ATTR}] { display: none !important; }
.${PANEL_CLASS} { flex-grow: 1; height: 100%; overflow-y: auto; color: var(--c-texPri); }
.${PANEL_CLASS} .bn-inner { max-width: 800px; margin: 0 auto; padding: 36px 16px 96px; }
.${PANEL_CLASS} .bn-title { font-size: 26px; font-weight: 600; line-height: 32px; }
.${PANEL_CLASS} .bn-subtitle { font-size: 14px; line-height: 20px; color: var(--c-texSec); margin-top: 4px; }
.${PANEL_CLASS} .bn-tweak { margin-top: 32px; }
.${PANEL_CLASS} .bn-row {
  display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 8px 0;
}
.${PANEL_CLASS} .bn-options { margin-left: 16px; padding-left: 12px; border-left: 1px solid var(--c-borPri); }
.${PANEL_CLASS} .bn-label { font-size: 14px; font-weight: 500; line-height: 20px; }
.${PANEL_CLASS} .bn-tweak > .bn-row .bn-label { font-size: 16px; }
.${PANEL_CLASS} .bn-desc { font-size: 13px; line-height: 18px; color: var(--c-texSec); }
.${PANEL_CLASS} .bn-switch { position: relative; flex-shrink: 0; width: 30px; height: 18px; }
.${PANEL_CLASS} .bn-track {
  box-sizing: border-box; width: 30px; height: 18px; padding: 2px; border-radius: 44px;
  background: color-mix(in srgb, var(--c-texTer) 40%, transparent);
  transition: background 0.2s;
}
.${PANEL_CLASS} .bn-knob {
  width: 14px; height: 14px; border-radius: 44px; background: #fff; transition: transform 0.2s;
}
.${PANEL_CLASS} .bn-switch input { position: absolute; inset: 0; margin: 0; opacity: 0; cursor: pointer; }
.${PANEL_CLASS} .bn-switch input:checked + .bn-track { background: var(--c-bluIcoAccPri, #2783de); }
.${PANEL_CLASS} .bn-switch input:checked + .bn-track .bn-knob { transform: translateX(12px); }
.${PANEL_CLASS} .bn-switch input:focus-visible + .bn-track { outline: 2px solid var(--c-bluIcoAccPri, #2783de); }
.${PANEL_CLASS} select {
  font: inherit; font-size: 14px; color: inherit; background: transparent; cursor: pointer;
  border: 1px solid var(--c-borPri); border-radius: 6px; padding: 2px 6px;
}
.${PANEL_CLASS} select option { background: var(--c-bacPri); }
.${PANEL_CLASS} .bn-disabled { opacity: 0.5; pointer-events: none; }
`;

// Added only while our tab is open. Notion resets attributes on the dialog, so this can't hang off
// a marker there.
const OPEN_CSS = `[role=dialog] [role=tabpanel]:not(.${PANEL_CLASS}) { display: none !important; }`;

const ICON = `<svg viewBox="0 0 20 20" aria-hidden="true" role="graphics-symbol"><path d="M4.5 3.875a.625.625 0 0 1 .625.625v2.08a2.126 2.126 0 0 1 0 4.09v4.83a.625.625 0 1 1-1.25 0v-4.83a2.126 2.126 0 0 1 0-4.09V4.5a.625.625 0 0 1 .625-.625m0 3.75a.875.875 0 1 0 0 1.75.875.875 0 0 0 0-1.75m5.5-3.75a.625.625 0 0 1 .625.625v6.08a2.126 2.126 0 0 1 0 4.09v.83a.625.625 0 1 1-1.25 0v-.83a2.126 2.126 0 0 1 0-4.09V4.5A.625.625 0 0 1 10 3.875m0 7.75a.875.875 0 1 0 0 1.75.875.875 0 0 0 0-1.75m5.5-7.75a.625.625 0 0 1 .625.625v.08a2.126 2.126 0 0 1 0 4.09v6.83a.625.625 0 1 1-1.25 0V8.67a2.126 2.126 0 0 1 0-4.09V4.5a.625.625 0 0 1 .625-.625m0 1.75a.875.875 0 1 0 0 1.75.875.875 0 0 0 0-1.75"/></svg>`;

let uid = 0;

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

function row(label: string, description: string | undefined, control: HTMLElement) {
  const el = h("div", "bn-row");
  const text = h("div");
  const id = `bn-label-${++uid}`;
  const labelEl = h("div", "bn-label", label);
  labelEl.id = id;
  text.append(labelEl);
  if (description) text.append(h("div", "bn-desc", description));
  el.append(text, control);
  return el;
}

function optionControl(tweak: Tweak, option: OptionDef, store: SettingsStore): HTMLElement {
  if (option.type === "toggle") {
    return toggle(store.getOption(tweak, option.key) === true, option.label, (checked) =>
      store.setOption(tweak, option.key, checked),
    );
  }
  const select = h("select");
  select.setAttribute("aria-label", option.label);
  for (const choice of option.choices) {
    const el = h("option", undefined, choice.label);
    el.value = choice.value;
    select.append(el);
  }
  select.value = String(store.getOption(tweak, option.key));
  select.addEventListener("change", () => store.setOption(tweak, option.key, select.value));
  return select;
}

/** Builds the panel content. Exported for tests. */
export function renderPanel(tweaks: readonly Tweak[], store: SettingsStore): HTMLElement {
  const inner = h("div", "bn-inner");
  inner.append(
    h("div", "bn-title", "Better Notion"),
    h("div", "bn-subtitle", "Personal tweaks from the Better Notion userscript."),
  );
  for (const tweak of tweaks) {
    const enabled = store.isEnabled(tweak);
    const section = h("div", "bn-tweak");
    section.dataset.tweak = tweak.id;
    section.append(
      row(
        tweak.name,
        tweak.description,
        toggle(enabled, tweak.name, (checked) => store.setEnabled(tweak, checked)),
      ),
    );
    if (tweak.options?.length) {
      const options = h("div", enabled ? "bn-options" : "bn-options bn-disabled");
      for (const option of tweak.options) {
        options.append(row(option.label, option.description, optionControl(tweak, option, store)));
      }
      section.append(options);
    }
    inner.append(section);
  }
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
export function mountSettingsSection(tweaks: readonly Tweak[], store: SettingsStore): void {
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
    const render = () => panel.replaceChildren(renderPanel(tweaks, store));
    render();
    const removeStyle = addStyle(OPEN_CSS, "open");
    placePanel(dialog, panel);
    open = {
      dialog,
      removeStyle,
      panel,
      hidden: selected,
      standIn,
      unsubscribe: store.subscribe(render),
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
