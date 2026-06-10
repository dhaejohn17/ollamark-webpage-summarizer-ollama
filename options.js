// options.js

const ollamaUrlInput = document.getElementById("ollamaUrl");
const modelSelect = document.getElementById("modelSelect");
const systemPromptInput = document.getElementById("systemPrompt");
const saveBtn = document.getElementById("saveBtn");
const refreshBtn = document.getElementById("refreshBtn");
const toast = document.getElementById("toast");
const connectionStatus = document.getElementById("connectionStatus");

const DEFAULTS = {
  ollamaUrl: "http://localhost:11434",
  model: "",
  systemPrompt:
    "You are a concise summarizer. Summarize the provided webpage content in 3–5 bullet points. Be clear and factual. Do not include preamble or commentary.",
};

// ── Load saved settings ────────────────────────────────────────────────────
function loadSettings() {
  chrome.storage.local.get(["ollamaUrl", "model", "systemPrompt"], (data) => {
    ollamaUrlInput.value = data.ollamaUrl || DEFAULTS.ollamaUrl;
    systemPromptInput.value = data.systemPrompt || DEFAULTS.systemPrompt;

    // If a model was previously saved, pre-populate the select
    const savedModel = data.model || "";
    if (savedModel) {
      const opt = document.createElement("option");
      opt.value = savedModel;
      opt.textContent = savedModel;
      opt.selected = true;
      modelSelect.innerHTML = "";
      modelSelect.appendChild(opt);
    }
  });
}

loadSettings();

// ── Fetch models from Ollama ───────────────────────────────────────────────
async function fetchModels() {
  const baseUrl = ollamaUrlInput.value.trim().replace(/\/$/, "");

  refreshBtn.classList.add("spinning");
  setConnectionStatus("checking");

  try {
    const res = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const models = data.models || [];

    modelSelect.innerHTML = "";

    if (models.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No models found — pull one with: ollama pull <model>";
      modelSelect.appendChild(opt);
      setConnectionStatus("connected");
    } else {
      // Get previously saved model to re-select it
      chrome.storage.local.get(["model"], ({ model: savedModel }) => {
        models.forEach(({ name }) => {
          const opt = document.createElement("option");
          opt.value = name;
          opt.textContent = name;
          if (name === savedModel) opt.selected = true;
          modelSelect.appendChild(opt);
        });

        // If nothing matched, select first
        if (!savedModel || !models.find((m) => m.name === savedModel)) {
          modelSelect.selectedIndex = 0;
        }
      });

      setConnectionStatus("connected");
    }
  } catch (err) {
    modelSelect.innerHTML = `<option value="">Failed to connect to Ollama</option>`;
    setConnectionStatus("error", err.message);
  } finally {
    refreshBtn.classList.remove("spinning");
  }
}

refreshBtn.addEventListener("click", fetchModels);

// ── Save settings ──────────────────────────────────────────────────────────
saveBtn.addEventListener("click", () => {
  const settings = {
    ollamaUrl: ollamaUrlInput.value.trim().replace(/\/$/, "") || DEFAULTS.ollamaUrl,
    model: modelSelect.value,
    systemPrompt: systemPromptInput.value.trim() || DEFAULTS.systemPrompt,
  };

  chrome.storage.local.set(settings, () => {
    showToast("✓ Settings saved");
  });
});

// ── Helpers ────────────────────────────────────────────────────────────────
function setConnectionStatus(state, detail = "") {
  const dot = connectionStatus.querySelector(".status-dot");
  connectionStatus.className = "status-chip";

  if (state === "connected") {
    connectionStatus.classList.add();
    dot.style.background = "var(--success)";
    connectionStatus.style.background = "rgba(74,222,128,0.1)";
    connectionStatus.style.color = "var(--success)";
    connectionStatus.style.borderColor = "rgba(74,222,128,0.3)";
    connectionStatus.childNodes[2].textContent = " Connected";
  } else if (state === "error") {
    connectionStatus.classList.add("error");
    connectionStatus.childNodes[2].textContent = ` Cannot reach Ollama`;
  } else if (state === "checking") {
    connectionStatus.childNodes[2].textContent = " Checking…";
    dot.style.background = "var(--accent)";
    connectionStatus.style.background = "var(--accent-dim)";
    connectionStatus.style.color = "var(--accent)";
    connectionStatus.style.borderColor = "rgba(124,106,247,0.3)";
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2000);
}
