// Toolbar icon opens the side panel; the page's own "Anji" button does too.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => {});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === "angel:open-panel" && sender.tab?.id != null) {
    chrome.sidePanel.open({ tabId: sender.tab.id }).catch(() => {});
  }
});
