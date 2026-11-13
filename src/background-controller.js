import {
  getTargetGroupId,
  getVisibleTabUrl,
  isNewTabUrl,
  toTabSnapshot
} from "./grouping-policy.js";
import { TabHistory } from "./tab-history.js";

const STORAGE_KEY = "activeTabsByWindow";
const CANDIDATE_TTL_MS = 5_000;

export function createBackgroundController({
  chromeApi,
  logger = console,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout
}) {
  const tabHistory = new TabHistory();
  const candidates = new Map();
  const processingCandidates = new Set();

  let initializationPromise;
  let registered = false;

  function reportError(context, error) {
    logger.warn(`[New Tab, Same Group] ${context}`, error);
  }

  async function persistActiveTabs() {
    await chromeApi.storage.session.set({ [STORAGE_KEY]: tabHistory.serialize() });
  }

  async function initializeState() {
    const stored = await chromeApi.storage.session.get(STORAGE_KEY);
    const storedTabs = stored[STORAGE_KEY] || {};

    tabHistory.restore(storedTabs);

    const activeTabs = await chromeApi.tabs.query({ active: true });

    for (const tab of activeTabs) {
      const snapshot = toTabSnapshot(tab);

      if (!snapshot) {
        continue;
      }

      const storedTab = tabHistory.getActive(tab.windowId);
      const currentTabIsNewTab = isNewTabUrl(getVisibleTabUrl(tab));

      if (!currentTabIsNewTab || !storedTab || storedTab.id === tab.id) {
        tabHistory.recordActive(snapshot);
      }
    }

    await persistActiveTabs();
  }

  function ensureInitialized() {
    if (!initializationPromise) {
      initializationPromise = initializeState().catch((error) => {
        initializationPromise = undefined;
        throw error;
      });
    }

    return initializationPromise;
  }

  function rememberCandidate(tab, previousTab) {
    if (!Number.isInteger(tab.id) || !previousTab) {
      return;
    }

    const existingCandidate = candidates.get(tab.id);

    if (existingCandidate) {
      clearTimeoutFn(existingCandidate.timeoutId);
    }

    const timeoutId = setTimeoutFn(() => {
      candidates.delete(tab.id);
      tabHistory.forgetActivation(tab.id);
    }, CANDIDATE_TTL_MS);

    candidates.set(tab.id, { previousTab, timeoutId });
  }

  function forgetCandidate(tabId) {
    const candidate = candidates.get(tabId);

    if (candidate) {
      clearTimeoutFn(candidate.timeoutId);
      candidates.delete(tabId);
    }

    tabHistory.forgetActivation(tabId);
  }

  async function isCreatedTabInFocusedWindow(createdTab) {
    const focusedWindow = await chromeApi.windows.getLastFocused();

    return focusedWindow?.focused === true && focusedWindow.id === createdTab.windowId;
  }

  async function groupCandidate(tabId) {
    const candidate = candidates.get(tabId);

    if (!candidate || processingCandidates.has(tabId)) {
      return;
    }

    processingCandidates.add(tabId);

    try {
      const createdTab = await chromeApi.tabs.get(tabId);
      const visibleUrl = getVisibleTabUrl(createdTab);

      if (!visibleUrl) {
        return;
      }

      if (!isNewTabUrl(visibleUrl)) {
        forgetCandidate(tabId);
        return;
      }

      if (!(await isCreatedTabInFocusedWindow(createdTab))) {
        forgetCandidate(tabId);
        return;
      }

      const previousTab = await chromeApi.tabs.get(candidate.previousTab.id);
      const targetGroupId = getTargetGroupId(createdTab, previousTab);

      if (targetGroupId === null) {
        forgetCandidate(tabId);
        return;
      }

      await chromeApi.tabs.group({ tabIds: tabId, groupId: targetGroupId });

      const groupedTab = await chromeApi.tabs.get(tabId);
      const snapshot = toTabSnapshot(groupedTab);

      if (snapshot) {
        tabHistory.recordActive(snapshot);
        await persistActiveTabs();
      }

      forgetCandidate(tabId);
    } finally {
      processingCandidates.delete(tabId);
    }
  }

  async function handleCreated(tab) {
    await ensureInitialized();

    if (!tab.active || tab.pinned || !Number.isInteger(tab.id)) {
      return;
    }

    const previousTab = tabHistory.getPreviousForCreated(tab);

    rememberCandidate(tab, previousTab);
    await groupCandidate(tab.id);
  }

  async function handleActivated({ tabId }) {
    await ensureInitialized();

    const activeTab = await chromeApi.tabs.get(tabId);
    const snapshot = toTabSnapshot(activeTab);

    if (snapshot) {
      tabHistory.recordActive(snapshot);
      await persistActiveTabs();
    }
  }

  async function handleUpdated(tabId, changeInfo, tab) {
    await ensureInitialized();

    if (candidates.has(tabId) && (changeInfo.url || getVisibleTabUrl(tab))) {
      await groupCandidate(tabId);
    }

    if (tab.active && Number.isInteger(changeInfo.groupId)) {
      const snapshot = toTabSnapshot(tab);

      if (snapshot) {
        tabHistory.recordActive(snapshot);
        await persistActiveTabs();
      }
    }
  }

  async function handleRemoved(tabId, { windowId, isWindowClosing }) {
    await ensureInitialized();
    forgetCandidate(tabId);

    const trackedActiveTab = tabHistory.getActive(windowId);
    tabHistory.removeTab(tabId, windowId, isWindowClosing);

    if (isWindowClosing || trackedActiveTab?.id === tabId) {
      await persistActiveTabs();
    }
  }

  async function handleWindowRemoved(windowId) {
    await ensureInitialized();
    tabHistory.removeWindow(windowId);
    await persistActiveTabs();
  }

  function register() {
    if (registered) {
      return;
    }

    registered = true;

    chromeApi.tabs.onCreated.addListener((tab) => {
      void handleCreated(tab).catch((error) =>
        reportError("Could not process created tab.", error)
      );
    });

    chromeApi.tabs.onActivated.addListener((activeInfo) => {
      void handleActivated(activeInfo).catch((error) =>
        reportError("Could not track active tab.", error)
      );
    });

    chromeApi.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      void handleUpdated(tabId, changeInfo, tab).catch((error) =>
        reportError("Could not process updated tab.", error)
      );
    });

    chromeApi.tabs.onRemoved.addListener((tabId, removeInfo) => {
      void handleRemoved(tabId, removeInfo).catch((error) =>
        reportError("Could not remove stale tab state.", error)
      );
    });

    chromeApi.windows.onRemoved.addListener((windowId) => {
      void handleWindowRemoved(windowId).catch((error) =>
        reportError("Could not remove stale window state.", error)
      );
    });

    chromeApi.runtime.onStartup.addListener(() => {
      void ensureInitialized().catch((error) =>
        reportError("Could not initialize extension state on startup.", error)
      );
    });

    void ensureInitialized().catch((error) =>
      reportError("Could not initialize extension state.", error)
    );
  }

  return Object.freeze({
    ensureInitialized,
    handleActivated,
    handleCreated,
    handleRemoved,
    handleUpdated,
    handleWindowRemoved,
    register
  });
}
