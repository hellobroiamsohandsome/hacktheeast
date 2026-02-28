function sendSelection() {
  const text = window.getSelection ? window.getSelection().toString().trim() : "";
  if (!text) return;
  chrome.runtime.sendMessage({
    type: "SELECTION_UPDATED",
    text,
    url: window.location.href,
    title: document.title || "",
  });
}

document.addEventListener("mouseup", sendSelection);
document.addEventListener("keyup", (e) => {
  if (e.key === "Shift" || e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
    sendSelection();
  }
});
