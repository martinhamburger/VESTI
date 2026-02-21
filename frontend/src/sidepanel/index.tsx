import "~style.css";
import { VestiSidepanel } from "./VestiSidepanel";
import { initializeUiTheme } from "~lib/services/uiSettingsService";

const FONT_ASSETS = [
  {
    assetPath: "fonts/TiemposHeadline-Medium.woff2",
    family: "Tiempos Headline",
    weight: "500",
  },
  {
    assetPath: "fonts/TiemposText-Regular.woff2",
    family: "Tiempos Text",
    weight: "400",
  },
] as const;

let fontPreloadInitialized = false;
let missingFontWarningShown = false;

function preloadFontAsset(assetPath: string): void {
  const head = document.head;
  if (!head) return;

  const existing = head.querySelector<HTMLLinkElement>(
    `link[data-vesti-font="${assetPath}"]`
  );
  if (existing) return;

  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "font";
  link.type = "font/woff2";
  link.crossOrigin = "anonymous";
  link.href = chrome.runtime.getURL(assetPath);
  link.dataset.vestiFont = assetPath;
  head.appendChild(link);
}

async function loadRuntimeFont(asset: {
  assetPath: string;
  family: string;
  weight: string;
}): Promise<string | null> {
  if (!("fonts" in document) || typeof FontFace === "undefined") return null;

  try {
    const fontFace = new FontFace(
      asset.family,
      `url(${chrome.runtime.getURL(asset.assetPath)}) format("woff2")`,
      {
        style: "normal",
        weight: asset.weight,
        display: "swap",
      }
    );
    await fontFace.load();
    document.fonts.add(fontFace);
    return null;
  } catch {
    return asset.assetPath;
  }
}

async function warnIfMissingFonts(
  assets: readonly { assetPath: string; family: string; weight: string }[]
): Promise<void> {
  const checks = await Promise.all(
    assets.map((asset) => loadRuntimeFont(asset))
  );

  const missing = checks.filter((value): value is string => Boolean(value));
  if (missing.length > 0 && !missingFontWarningShown) {
    missingFontWarningShown = true;
    console.warn(
      `[Vesti] Tiempos font assets missing, falling back to serif stack: ${missing.join(
        ", "
      )}`
    );
  }
}

function initializeVestiFontAssets(): void {
  if (fontPreloadInitialized) return;
  if (typeof document === "undefined" || typeof chrome === "undefined") return;

  fontPreloadInitialized = true;
  FONT_ASSETS.forEach((asset) => preloadFontAsset(asset.assetPath));
  void warnIfMissingFonts(FONT_ASSETS);
}

initializeVestiFontAssets();
void initializeUiTheme().catch(() => {
  // Ignore theme initialization failures and keep default light tokens.
});

export default VestiSidepanel;
