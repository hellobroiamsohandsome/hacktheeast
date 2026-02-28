const apiBaseEl = document.getElementById("apiBase");
const cefrEl = document.getElementById("cefrLevel");
const childModeEl = document.getElementById("childMode");
const sourceEl = document.getElementById("sourceLanguage");
const targetEl = document.getElementById("targetLanguage");
const highlightedEl = document.getElementById("highlightedText");
const statusEl = document.getElementById("status");

function setStatus(msg, ok = true) {
  statusEl.textContent = msg;
  statusEl.className = "status " + (ok ? "ok" : "err");
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function captureSelection() {
  const tab = await getActiveTab();
  if (!tab?.id) return;
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => (window.getSelection ? window.getSelection().toString().trim() : ""),
  });
  highlightedEl.value = result || "";
  setStatus(result ? "Captured highlighted text." : "No text selected on page.", !!result);
}

async function createLesson() {
  const tab = await getActiveTab();
  const url = tab?.url || "";
  if (!url) {
    setStatus("Could not read current tab URL.", false);
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
  } catch (e) {
    setStatus(e.message || "Request failed", false);
  }
}

async function openDashboard() {
  const apiBase = (apiBaseEl.value || "http://127.0.0.1:8000").replace(/\/+$/, "");
  await chrome.tabs.create({ url: apiBase + "/" });
}

async function init() {
  const saved = await chrome.storage.local.get(["apiBase"]);
  if (saved.apiBase) apiBaseEl.value = saved.apiBase;
}

apiBaseEl.addEventListener("change", async () => {
  await chrome.storage.local.set({ apiBase: apiBaseEl.value });
});
document.getElementById("captureBtn").addEventListener("click", captureSelection);
document.getElementById("sendBtn").addEventListener("click", createLesson);
document.getElementById("openDashboardBtn").addEventListener("click", openDashboard);
init();
