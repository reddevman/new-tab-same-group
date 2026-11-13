export const TAB_GROUP_ID_NONE = -1;

const NEW_TAB_URLS = new Set([
  "about:newtab",
  "chrome://new-tab-page",
  "chrome://newtab"
]);

export function normalizeChromeUrl(url) {
  if (typeof url !== "string") {
    return "";
  }

  return url.trim().replace(/\/+$/, "");
}

export function isNewTabUrl(url) {
  return NEW_TAB_URLS.has(normalizeChromeUrl(url));
}

export function getVisibleTabUrl(tab) {
  return tab?.pendingUrl || tab?.url || "";
}

export function getTargetGroupId(createdTab, previousTab) {
  if (!createdTab || !previousTab) {
    return null;
  }

  if (!Number.isInteger(createdTab.id) || !Number.isInteger(previousTab.id)) {
    return null;
  }

  if (!createdTab.active || createdTab.pinned || createdTab.id === previousTab.id) {
    return null;
  }

  if (createdTab.windowId !== previousTab.windowId) {
    return null;
  }

  if (!Number.isInteger(previousTab.groupId) || previousTab.groupId === TAB_GROUP_ID_NONE) {
    return null;
  }

  if (!isNewTabUrl(getVisibleTabUrl(createdTab))) {
    return null;
  }

  return previousTab.groupId;
}

export function toTabSnapshot(tab) {
  if (!tab || !Number.isInteger(tab.id) || !Number.isInteger(tab.windowId)) {
    return null;
  }

  return {
    id: tab.id,
    windowId: tab.windowId,
    groupId: Number.isInteger(tab.groupId) ? tab.groupId : TAB_GROUP_ID_NONE,
    pinned: Boolean(tab.pinned)
  };
}
