chrome.runtime.onInstalled.addListener(async () => {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (e) {
    console.warn("sidePanel behavior not available", e);
  }
  chrome.contextMenus.create({
    id: "readfluent-send-selection",
    title: "Send selection to ReadFluent",
    contexts: ["selection"],
  });
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (e) {
    console.warn("Failed to open side panel", e);
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "readfluent-send-selection") return;
  await chrome.storage.local.set({
    capturedText: (info.selectionText || "").trim(),
    lastPageUrl: tab?.url || "",
    lastPageTitle: tab?.title || "",
  });
  if (tab?.id) {
    try {
      await chrome.sidePanel.open({ tabId: tab.id });
    } catch (e) {
      console.warn("Failed to open side panel", e);
    }
  }
});

chrome.runtime.onMessage.addListener(async (msg) => {
  if (!msg || msg.type !== "SELECTION_UPDATED") return;
  await chrome.storage.local.set({
    capturedText: (msg.text || "").trim(),
    lastPageUrl: msg.url || "",
    lastPageTitle: msg.title || "",
  });
});
