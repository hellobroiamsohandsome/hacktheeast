const apiBaseEl = document.getElementById("apiBase");
const pageUrlEl = document.getElementById("pageUrl");
const cefrEl = document.getElementById("cefrLevel");
const childModeEl = document.getElementById("childMode");
const sourceEl = document.getElementById("sourceLanguage");
const targetEl = document.getElementById("targetLanguage");
const highlightedEl = document.getElementById("highlightedText");
const translatedPreviewEl = document.getElementById("translatedPreview");
const openQuizzesEl = document.getElementById("openQuizzesAfterCreate");
const statusEl = document.getElementById("status");

function setStatus(msg, ok = true) {
  statusEl.textContent = msg;
  statusEl.className = "status " + (ok ? "ok" : "err");
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function syncFromStorage() {
  const saved = await chrome.storage.local.get(["apiBase", "capturedText", "lastPageUrl"]);
  if (saved.apiBase) apiBaseEl.value = saved.apiBase;
  if (saved.capturedText) highlightedEl.value = saved.capturedText;
  if (saved.lastPageUrl) pageUrlEl.value = saved.lastPageUrl;
}

async function refreshCurrentTabInfo() {
  const tab = await getActiveTab();
  pageUrlEl.value = tab?.url || "";
}

async function captureSelectionNow() {
  const tab = await getActiveTab();
  if (!tab?.id) return;
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => (window.getSelection ? window.getSelection().toString().trim() : ""),
  });
  highlightedEl.value = result || "";
  await chrome.storage.local.set({ capturedText: highlightedEl.value, lastPageUrl: tab.url || "" });
  setStatus(result ? "Captured highlighted text." : "No text selected.", !!result);
}

async function quickTranslate() {
  const text = (highlightedEl.value || "").trim();
  if (!text) {
    setStatus("Select or enter text first.", false);
    return;
  }
  const apiBase = (apiBaseEl.value || "http://127.0.0.1:8000").replace(/\/+$/, "");
  const source = sourceEl.value === "auto" ? "en" : sourceEl.value;
  const target = targetEl.value;
  try {
    const res = await fetch(`${apiBase}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, sourceLang: source, targetLang: target }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.detail || "Translate failed");
    translatedPreviewEl.value = data.translated || "";
    setStatus("Translation preview updated.");
  } catch (e) {
    translatedPreviewEl.value = "";
    setStatus(e.message || "Translate failed", false);
  }
}

async function createLesson() {
  const tab = await getActiveTab();
  const url = tab?.url || pageUrlEl.value || "";
  if (!url) {
    setStatus("Could not read page URL.", false);
    return;
  }
  const apiBase = (apiBaseEl.value || "http://127.0.0.1:8000").replace(/\/+$/, "");
  const payload = {
    url,
    type: url.includes("youtube.com") || url.includes("youtu.be") ? "youtube" : "article",
    cefrLevel: cefrEl.value,
    isChildMode: childModeEl.value === "true",
    sourceLanguage: sourceEl.value,
    targetLanguage: targetEl.value,
    highlightedText: (highlightedEl.value || "").trim() || null,
  };
  setStatus("Creating lesson...");
  try {
    const res = await fetch(`${apiBase}/process-content`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.detail || "Failed to create lesson");
    await chrome.storage.local.set({ lastLesson: data, apiBase });
    setStatus(`Lesson created: ${data.title || "Untitled"}`);
    if (openQuizzesEl.checked) {
      const lessonId = data.lessonId ? `&lessonId=${encodeURIComponent(data.lessonId)}` : "";
      await chrome.tabs.create({ url: `${apiBase}/?tab=quizzes${lessonId}` });
    }
  } catch (e) {
    setStatus(e.message || "Request failed", false);
  }
}

async function openDashboard() {
  const apiBase = (apiBaseEl.value || "http://127.0.0.1:8000").replace(/\/+$/, "");
  await chrome.tabs.create({ url: `${apiBase}/?tab=quizzes` });
}

apiBaseEl.addEventListener("change", async () => chrome.storage.local.set({ apiBase: apiBaseEl.value }));
document.getElementById("captureBtn").addEventListener("click", captureSelectionNow);
document.getElementById("translateBtn").addEventListener("click", quickTranslate);
document.getElementById("sendBtn").addEventListener("click", createLesson);
document.getElementById("openDashboardBtn").addEventListener("click", openDashboard);

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "SELECTION_UPDATED") {
    if (msg.text) highlightedEl.value = msg.text;
    if (msg.url) pageUrlEl.value = msg.url;
  }
});

(async function init() {
  await syncFromStorage();
  await refreshCurrentTabInfo();
})();
