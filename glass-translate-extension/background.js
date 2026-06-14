chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  await chrome.scripting.insertCSS({
    target: { tabId: tab.id },
    files: ["content/overlay.css"]
  });

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content/content.js"]
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "CAPTURE_VISIBLE_TAB") return false;

  chrome.tabs.captureVisibleTab(
    sender.tab.windowId,
    { format: "png" },
    (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({
          ok: false,
          error: chrome.runtime.lastError.message
        });
        return;
      }

      sendResponse({
        ok: true,
        dataUrl
      });
    }
  );

  return true;
});
