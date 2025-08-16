// Popup logic
document.getElementById("btnDownload").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: "prompt-download" });
});

document.getElementById("openOptions").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

const autoCapture = document.getElementById("autoCapture");

chrome.runtime.sendMessage({ type: "getSettings" }, (settings) => {
  autoCapture.checked = !!settings?.autoCapture;
});

autoCapture.addEventListener("change", () => {
  chrome.runtime.sendMessage({ type: "getSettings" }, (settings) => {
    settings = settings || {};
    settings.autoCapture = !!autoCapture.checked;
    chrome.runtime.sendMessage({ type: "setSettings", settings });
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) chrome.tabs.sendMessage(tabs[0].id, { type: "refresh-settings" });
    });
  });
});
