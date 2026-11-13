import test from "node:test";
import assert from "node:assert/strict";

import {
  getTargetGroupId,
  isNewTabUrl,
  normalizeChromeUrl,
  TAB_GROUP_ID_NONE,
  toTabSnapshot
} from "../src/grouping-policy.js";

const groupedTab = {
  id: 10,
  windowId: 1,
  groupId: 7,
  active: false,
  pinned: false,
  url: "https://example.com"
};

const newTab = {
  id: 11,
  windowId: 1,
  groupId: TAB_GROUP_ID_NONE,
  active: true,
  pinned: false,
  pendingUrl: "chrome://newtab/"
};

test("normalizes trailing slashes without changing the scheme", () => {
  assert.equal(normalizeChromeUrl("chrome://newtab///"), "chrome://newtab");
});

test("recognizes supported Chrome new-tab URLs", () => {
  assert.equal(isNewTabUrl("chrome://newtab/"), true);
  assert.equal(isNewTabUrl("chrome://new-tab-page/"), true);
  assert.equal(isNewTabUrl("about:newtab"), true);
  assert.equal(isNewTabUrl("https://example.com"), false);
});

test("returns the previous tab group for a real new tab in the same window", () => {
  assert.equal(getTargetGroupId(newTab, groupedTab), 7);
});

test("does not group a new tab when the previous tab is ungrouped", () => {
  assert.equal(
    getTargetGroupId(newTab, { ...groupedTab, groupId: TAB_GROUP_ID_NONE }),
    null
  );
});

test("does not group a tab created in another window", () => {
  assert.equal(getTargetGroupId({ ...newTab, windowId: 2 }, groupedTab), null);
});

test("does not group background, pinned, or non-new-tab pages", () => {
  assert.equal(getTargetGroupId({ ...newTab, active: false }, groupedTab), null);
  assert.equal(getTargetGroupId({ ...newTab, pinned: true }, groupedTab), null);
  assert.equal(
    getTargetGroupId({ ...newTab, pendingUrl: "https://example.com" }, groupedTab),
    null
  );
});

test("creates a minimal serializable tab snapshot", () => {
  assert.deepEqual(toTabSnapshot(groupedTab), {
    id: 10,
    windowId: 1,
    groupId: 7,
    pinned: false
  });
});

test("defaults a missing group ID to the ungrouped sentinel", () => {
  assert.equal(toTabSnapshot({ id: 10, windowId: 1 }).groupId, TAB_GROUP_ID_NONE);
});
