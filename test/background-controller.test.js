import test from "node:test";
import assert from "node:assert/strict";

import { createBackgroundController } from "../src/background-controller.js";

function createEvent() {
  const listeners = [];

  return {
    listeners,
    addListener(listener) {
      listeners.push(listener);
    }
  };
}

function createChromeMock({ initialTabs, focusedWindowId = 1, groupBarrier } = {}) {
  const tabMap = new Map((initialTabs || []).map((tab) => [tab.id, { ...tab }]));
  const storageState = {};
  const groupCalls = [];
  const events = {
    onActivated: createEvent(),
    onCreated: createEvent(),
    onRemoved: createEvent(),
    onStartup: createEvent(),
    onUpdated: createEvent(),
    onWindowRemoved: createEvent()
  };

  let focusedWindow = { id: focusedWindowId, focused: true };

  const chromeApi = {
    runtime: {
      onStartup: events.onStartup
    },
    storage: {
      session: {
        async get(key) {
          return Object.hasOwn(storageState, key)
            ? { [key]: structuredClone(storageState[key]) }
            : {};
        },
        async set(values) {
          Object.assign(storageState, structuredClone(values));
        }
      }
    },
    tabs: {
      onActivated: events.onActivated,
      onCreated: events.onCreated,
      onRemoved: events.onRemoved,
      onUpdated: events.onUpdated,
      async get(tabId) {
        const tab = tabMap.get(tabId);

        if (!tab) {
          throw new Error(`Missing tab ${tabId}`);
        }

        return { ...tab };
      },
      async group({ tabIds, groupId }) {
        groupCalls.push({ tabIds, groupId });

        if (groupBarrier) {
          await groupBarrier;
        }

        tabMap.get(tabIds).groupId = groupId;
        return groupId;
      },
      async query({ active }) {
        return [...tabMap.values()].filter((tab) => !active || tab.active).map((tab) => ({ ...tab }));
      }
    },
    windows: {
      onRemoved: events.onWindowRemoved,
      async getLastFocused() {
        return { ...focusedWindow };
      }
    }
  };

  return {
    chromeApi,
    events,
    groupCalls,
    storageState,
    tabMap,
    setFocusedWindow(window) {
      focusedWindow = { ...window };
    }
  };
}

const previousTab = {
  id: 10,
  windowId: 1,
  groupId: 7,
  active: true,
  pinned: false,
  url: "https://example.com"
};

const newTab = {
  id: 11,
  windowId: 1,
  groupId: -1,
  active: true,
  pinned: false,
  pendingUrl: "chrome://newtab/"
};

function createController(mock) {
  return createBackgroundController({
    chromeApi: mock.chromeApi,
    logger: { warn() {} }
  });
}

async function initializeWithPreviousTab(mock, controller) {
  await controller.ensureInitialized();
  mock.tabMap.get(previousTab.id).active = false;
  mock.tabMap.set(newTab.id, { ...newTab });
}

test("registers every listener once and initializes startup state", async () => {
  const mock = createChromeMock({ initialTabs: [previousTab] });
  const controller = createController(mock);

  controller.register();
  controller.register();
  await controller.ensureInitialized();

  assert.equal(mock.events.onCreated.listeners.length, 1);
  assert.equal(mock.events.onActivated.listeners.length, 1);
  assert.equal(mock.events.onUpdated.listeners.length, 1);
  assert.equal(mock.events.onRemoved.listeners.length, 1);
  assert.equal(mock.events.onWindowRemoved.listeners.length, 1);
  assert.equal(mock.events.onStartup.listeners.length, 1);
  assert.deepEqual(mock.storageState.activeTabsByWindow, {
    "1": { id: 10, windowId: 1, groupId: 7, pinned: false }
  });
});

test("groups a native new tab into the previous group without storing its URL", async () => {
  const mock = createChromeMock({ initialTabs: [previousTab] });
  const controller = createController(mock);

  await initializeWithPreviousTab(mock, controller);
  await controller.handleCreated({ ...newTab });

  assert.deepEqual(mock.groupCalls, [{ tabIds: 11, groupId: 7 }]);
  assert.deepEqual(mock.storageState.activeTabsByWindow, {
    "1": { id: 11, windowId: 1, groupId: 7, pinned: false }
  });
});

test("does not group a new tab created outside the focused window", async () => {
  const mock = createChromeMock({ initialTabs: [previousTab] });
  const controller = createController(mock);

  await initializeWithPreviousTab(mock, controller);
  mock.setFocusedWindow({ id: 2, focused: true });
  await controller.handleCreated({ ...newTab });

  assert.equal(mock.groupCalls.length, 0);
});

test("deduplicates concurrent candidate processing", async () => {
  let releaseGroup;
  const groupBarrier = new Promise((resolve) => {
    releaseGroup = resolve;
  });
  const mock = createChromeMock({ initialTabs: [previousTab], groupBarrier });
  const controller = createController(mock);

  await initializeWithPreviousTab(mock, controller);

  const createdPromise = controller.handleCreated({ ...newTab });

  while (mock.groupCalls.length === 0) {
    await new Promise((resolve) => setImmediate(resolve));
  }

  await controller.handleUpdated(newTab.id, { url: newTab.pendingUrl }, { ...newTab });

  assert.equal(mock.groupCalls.length, 1);

  releaseGroup();
  await createdPromise;
});
