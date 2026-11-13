import test from "node:test";
import assert from "node:assert/strict";

import { TabHistory } from "../src/tab-history.js";

const previousTab = { id: 10, windowId: 1, groupId: 7, pinned: false };
const createdTab = { id: 11, windowId: 1, groupId: -1, pinned: false };

test("finds the previous tab when onCreated runs before onActivated", () => {
  const history = new TabHistory();
  history.recordActive(previousTab);

  assert.deepEqual(history.getPreviousForCreated(createdTab), previousTab);
});

test("preserves the previous tab when onActivated runs before onCreated", () => {
  const history = new TabHistory();
  history.recordActive(previousTab);
  history.recordActive(createdTab);

  assert.deepEqual(history.getPreviousForCreated(createdTab), previousTab);
});

test("tracks active tabs independently per window", () => {
  const history = new TabHistory();
  const otherWindowTab = { id: 20, windowId: 2, groupId: 9, pinned: false };

  history.recordActive(previousTab);
  history.recordActive(otherWindowTab);

  assert.deepEqual(history.getPreviousForCreated(createdTab), previousTab);
  assert.deepEqual(history.getActive(2), otherWindowTab);
});

test("serializes and restores session state", () => {
  const history = new TabHistory();
  history.recordActive(previousTab);

  const restoredHistory = new TabHistory();
  restoredHistory.restore(history.serialize());

  assert.deepEqual(restoredHistory.getActive(1), previousTab);
});

test("removes stale active tab and window state", () => {
  const history = new TabHistory();
  history.recordActive(previousTab);
  history.removeTab(previousTab.id, previousTab.windowId);

  assert.equal(history.getActive(1), null);

  history.recordActive({ ...previousTab, windowId: 2 });
  history.removeWindow(2);

  assert.equal(history.getActive(2), null);
});
