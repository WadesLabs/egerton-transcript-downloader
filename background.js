// Egerton PDF Saver - background
// Built by Wades (Anome2002), Wades Innovations

const DEFAULT_SETTINGS = {
  autoCapture: false,
  filenamePattern: "{doctype}-{name}-{yyyy}{mm}{dd}-{time}.pdf"
};

chrome.runtime.onInstalled.addListener(async () => {
  const { settings } = await chrome.storage.sync.get("settings");
  if (!settings) {
    await chrome.storage.sync.set({ settings: DEFAULT_SETTINGS });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "download-data-url") {
    chrome.downloads.download({
      url: msg.dataUrl,
      filename: msg.filename || "egerton-document.pdf",
      saveAs: true
    });
  } else if (msg?.type === "download-url") {
    chrome.downloads.download({
      url: msg.url,
      filename: msg.filename || "egerton-document.pdf",
      saveAs: true
    });
  } else if (msg?.type === "injectMainWorld") {
    if (sender.tab?.id) {
      chrome.scripting.executeScript({
        target: { tabId: sender.tab.id },
        files: ["inject.js"],
        world: "MAIN"
      });
    }
  } else if (msg?.type === "getSettings") {
    chrome.storage.sync.get("settings").then(({ settings }) => {
      sendResponse(settings || DEFAULT_SETTINGS);
    });
    return true;
  } else if (msg?.type === "setSettings") {
    chrome.storage.sync.set({ settings: msg.settings || DEFAULT_SETTINGS });
  }
});
