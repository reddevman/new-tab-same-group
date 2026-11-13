import { toTabSnapshot } from "./grouping-policy.js";

export class TabHistory {
  #activeTabsByWindow = new Map();
  #previousTabsByActivatedTab = new Map();

  restore(records = {}) {
    for (const [windowId, tab] of Object.entries(records)) {
      const snapshot = toTabSnapshot(tab);

      if (snapshot) {
        this.#activeTabsByWindow.set(Number(windowId), snapshot);
      }
    }
  }

  recordActive(tab) {
    const snapshot = toTabSnapshot(tab);

    if (!snapshot) {
      return null;
    }

    const previousTab = this.#activeTabsByWindow.get(snapshot.windowId);

    if (previousTab && previousTab.id !== snapshot.id) {
      this.#previousTabsByActivatedTab.set(snapshot.id, previousTab);
    }

    this.#activeTabsByWindow.set(snapshot.windowId, snapshot);
    return snapshot;
  }

  getPreviousForCreated(tab) {
    if (!tab || !Number.isInteger(tab.id) || !Number.isInteger(tab.windowId)) {
      return null;
    }

    return (
      this.#previousTabsByActivatedTab.get(tab.id) ||
      this.#activeTabsByWindow.get(tab.windowId) ||
      null
    );
  }

  getActive(windowId) {
    return this.#activeTabsByWindow.get(windowId) || null;
  }

  forgetActivation(tabId) {
    this.#previousTabsByActivatedTab.delete(tabId);
  }

  removeTab(tabId, windowId, isWindowClosing = false) {
    this.forgetActivation(tabId);

    if (isWindowClosing || this.#activeTabsByWindow.get(windowId)?.id === tabId) {
      this.#activeTabsByWindow.delete(windowId);
    }
  }

  removeWindow(windowId) {
    this.#activeTabsByWindow.delete(windowId);
  }

  serialize() {
    return Object.fromEntries(
      [...this.#activeTabsByWindow.entries()].map(([windowId, tab]) => [String(windowId), tab])
    );
  }
}
