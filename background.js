/*
 * background.js: service worker (PRD section 13).
 *
 * LinkedIn is a single-page app, so moving between postings changes the URL
 * without a reload. This worker watches tab updates and asks the content
 * script to re-analyze whenever the URL changes or a page finishes loading.
 * The content script decides whether the page is a job page.
 */

function isLinkedInUrl(url) {
  try {
    return new URL(url).hostname === "www.linkedin.com";
  } catch {
    return false;
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = changeInfo.url || tab.url || "";
  if (!isLinkedInUrl(url)) return;

  const navigated = typeof changeInfo.url === "string";
  const finished = changeInfo.status === "complete";
  if (!navigated && !finished) return;

  // No receiver means the content script is not ready yet. The script also
  // analyzes on its own at startup, so the error is safe to ignore.
  chrome.tabs.sendMessage(tabId, { action: "ANALYZE_PAGE" }).catch(() => {});
});
