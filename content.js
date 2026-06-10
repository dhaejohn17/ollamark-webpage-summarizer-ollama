// content.js — extracts readable text from the current page

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extractText") {
    const text = extractReadableText();
    sendResponse({ text });
  }
  return true;
});

function extractReadableText() {
  // Remove non-content elements
  const selectorsToRemove = [
    "script", "style", "noscript", "nav", "footer", "header",
    "aside", "iframe", "svg", "form", "[aria-hidden='true']",
    ".ad", ".ads", ".advertisement", "#cookie-banner"
  ];

  // Clone body to avoid modifying the live DOM
  const clone = document.body.cloneNode(true);
  selectorsToRemove.forEach(sel => {
    clone.querySelectorAll(sel).forEach(el => el.remove());
  });

  // Try to grab the main content area first
  const mainSelectors = ["main", "article", "[role='main']", ".post-content", ".article-body", "#content"];
  for (const sel of mainSelectors) {
    const el = clone.querySelector(sel);
    if (el) {
      const text = el.innerText || el.textContent || "";
      if (text.trim().length > 200) {
        return cleanText(text);
      }
    }
  }

  // Fallback: full body text
  return cleanText(clone.innerText || clone.textContent || "");
}

function cleanText(raw) {
  return raw
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 12000); // cap at ~12k chars to stay within model context
}
