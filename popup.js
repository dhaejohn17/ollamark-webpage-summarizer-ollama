// popup.js

const summarizeBtn = document.getElementById("summarizeBtn");
const outputBox = document.getElementById("outputBox");
const statusEl = document.getElementById("status");
const statusText = document.getElementById("statusText");
const spinner = document.getElementById("spinner");
const copyBtn = document.getElementById("copyBtn");
const modelBadge = document.getElementById("modelBadge");
const settingsBtn = document.getElementById("settingsBtn");

const DEFAULTS = {
  ollamaUrl: "http://localhost:11434",
  model: "",
  systemPrompt: "You are a concise summarizer. Summarize the provided webpage content in 3–5 bullet points. Be clear and factual. Do not include preamble or commentary.",
};

// ── Load settings on open ──────────────────────────────────────────────────
async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["ollamaUrl", "model", "systemPrompt"], (data) => {
      resolve({
        ollamaUrl: data.ollamaUrl || DEFAULTS.ollamaUrl,
        model: data.model || DEFAULTS.model,
        systemPrompt: data.systemPrompt || DEFAULTS.systemPrompt,
      });
    });
  });
}

async function init() {
  const settings = await loadSettings();
  modelBadge.textContent = settings.model || "No model set";
  if (!settings.model) {
    modelBadge.style.color = "#f87171";
  }
}

init();

// ── Settings button ────────────────────────────────────────────────────────
settingsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

// ── Summarize ──────────────────────────────────────────────────────────────
summarizeBtn.addEventListener("click", async () => {
  const settings = await loadSettings();

  if (!settings.model) {
    showError("No model selected. Open Settings to choose one.");
    return;
  }

  setLoading(true, "Extracting page content…");
  outputBox.classList.remove("visible");
  copyBtn.classList.remove("visible");
  outputBox.textContent = "";

  // 1. Get active tab
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // 2. Extract text via content script
  let pageText;
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: "extractText" });
    pageText = response?.text;
    if (!pageText || pageText.length < 50) {
      throw new Error("Could not extract enough content from this page.");
    }
  } catch (err) {
    // Content script may not be injected on special pages (chrome://, etc.)
    showError("Cannot read this page. Try a regular website.");
    setLoading(false);
    return;
  }

  setLoading(true, "Sending to Ollama…");

  // 3. Call Ollama streaming API
  const prompt = `${settings.systemPrompt}\n\n---\n\n${pageText}`;

  try {
    const res = await fetch(`${settings.ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: settings.model,
        prompt: prompt,
        stream: true,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Ollama error ${res.status}: ${errText}`);
    }

    setLoading(false);
    outputBox.classList.add("visible");

    // 4. Stream response
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter(Boolean);

      for (const line of lines) {
        try {
          const json = JSON.parse(line);
          if (json.response) {
            fullText += json.response;
            outputBox.innerHTML = renderMarkdown(fullText);
            outputBox.scrollTop = outputBox.scrollHeight;
          }
        } catch {
          // skip malformed lines
        }
      }
    }

    copyBtn.classList.add("visible");

  } catch (err) {
    showError(
      err.message.includes("Failed to fetch")
        ? `Cannot reach Ollama at ${settings.ollamaUrl}. Is it running?`
        : err.message
    );
  }
});

// ── Copy ───────────────────────────────────────────────────────────────────
copyBtn.addEventListener("click", () => {
  navigator.clipboard.writeText(outputBox.innerText).then(() => {
    copyBtn.textContent = "Copied!";
    setTimeout(() => (copyBtn.textContent = "Copy"), 1500);
  });
});

// ── Markdown renderer ──────────────────────────────────────────────────────
function renderMarkdown(text) {
  // Escape HTML first to prevent XSS
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return escaped
    // Bold **text** or __text__
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    // Italic *text* or _text_
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/_(.+?)_/g, "<em>$1</em>")
    // Inline code `code`
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // Headers ### ## #
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    // Unordered lists - * •
    .replace(/^[\*\-•] (.+)$/gm, "<li>$1</li>")
    // Numbered lists
    .replace(/^\d+\. (.+)$/gm, "<li>$1</li>")
    // Wrap consecutive <li> in <ul>
    .replace(/(<li>[\s\S]*?<\/li>)(\n<li>|$)/g, (m) => m)
    .replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>")
    // Horizontal rule
    .replace(/^---$/gm, "<hr>")
    // Paragraphs: double newlines
    .replace(/\n{2,}/g, "</p><p>")
    // Single newlines
    .replace(/\n/g, "<br>")
    // Wrap everything in a paragraph
    .replace(/^(.+)/, "<p>$1")
    .replace(/(.+)$/, "$1</p>")
    // Clean up empty paragraphs
    .replace(/<p><\/p>/g, "")
    .replace(/<p>(<(?:h[123]|ul|hr)>)/g, "$1")
    .replace(/(<\/(?:h[123]|ul|hr)>)<\/p>/g, "$1");
}

// ── Helpers ────────────────────────────────────────────────────────────────
function setLoading(active, message = "") {
  summarizeBtn.disabled = active;
  if (active) {
    statusEl.classList.add("visible");
    statusEl.classList.remove("error");
    spinner.style.display = "block";
    statusText.textContent = message;
  } else {
    statusEl.classList.remove("visible");
  }
}

function showError(message) {
  statusEl.classList.add("visible", "error");
  spinner.style.display = "none";
  statusText.textContent = message;
  summarizeBtn.disabled = false;
}
