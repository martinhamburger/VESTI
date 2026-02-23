import type { PlasmoCSConfig } from "plasmo";
import { LOGO_BASE64 } from "../lib/ui/logo";

export const config: PlasmoCSConfig = {
  matches: [
    "https://chatgpt.com/*",
    "https://chat.openai.com/*",
    "https://claude.ai/*",
    "https://gemini.google.com/*",
    "https://chat.deepseek.com/*",
    "https://www.doubao.com/*",
    "https://chat.qwen.ai/*",
  ],
  run_at: "document_idle",
  all_frames: false,
};

const STYLE_ID = "vesti-floating-style";
const BUTTON_ID = "extension-floating-button";

const STYLE_TEXT = `
.floating-button {
  position: fixed;
  right: 24px;
  bottom: 100px;
  z-index: 9999;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background-color: #ffffff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.floating-button:hover {
  transform: scale(1.08);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
}

.floating-button:active {
  transform: scale(0.95);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}

.button-logo {
  width: 24px;
  height: 24px;
  object-fit: contain;
}
`;

const ensureStyle = () => {
  if (document.getElementById(STYLE_ID)) {
    return;
  }
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = STYLE_TEXT;
  document.head.appendChild(style);
};

const handleOpen = () => {
  if (!chrome?.runtime?.sendMessage) {
    return;
  }
  chrome.runtime.sendMessage({ type: "OPEN_SIDEPANEL", source: "capsule-ui" }, () => {
    void chrome.runtime.lastError;
  });
};

const mount = () => {
  if (window.top !== window.self) {
    return;
  }

  if (document.getElementById(BUTTON_ID)) {
    return;
  }

  ensureStyle();

  const button = document.createElement("div");
  button.id = BUTTON_ID;
  button.className = "floating-button";
  button.setAttribute("role", "button");
  button.setAttribute("aria-label", "Vesti");
  button.tabIndex = 0;

  const logo = document.createElement("img");
  logo.className = "button-logo";
  logo.src = LOGO_BASE64;
  logo.alt = "Extension Logo";

  button.appendChild(logo);
  button.addEventListener("click", handleOpen);
  button.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleOpen();
    }
  });

  document.body.appendChild(button);
};

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", mount, { once: true });
} else {
  mount();
}
