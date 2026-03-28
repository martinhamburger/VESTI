import { LOGO_BASE64 } from "./logo";

type CapsuleLogoTheme = "light" | "dark";

const SVG_DATA_URI_PREFIX = "data:image/svg+xml;base64,";
const PNG_DATA_URI_PATTERN = /href="data:image\/png;base64,([^"]+)"/;

let capsuleLogoCache: Record<CapsuleLogoTheme, string> | null = null;

const decodeBase64 = (value: string): string | null => {
  if (typeof globalThis.atob !== "function") return null;
  try {
    return globalThis.atob(value);
  } catch {
    return null;
  }
};

const encodeBase64 = (value: string): string | null => {
  if (typeof globalThis.btoa !== "function") return null;
  try {
    return globalThis.btoa(value);
  } catch {
    return null;
  }
};

const extractEmbeddedPngBase64 = (): string | null => {
  if (!LOGO_BASE64.startsWith(SVG_DATA_URI_PREFIX)) return null;
  const svg = decodeBase64(LOGO_BASE64.slice(SVG_DATA_URI_PREFIX.length));
  if (!svg) return null;
  return svg.match(PNG_DATA_URI_PATTERN)?.[1] ?? null;
};

const buildMonochromeLogoDataUri = (
  pngBase64: string,
  theme: CapsuleLogoTheme
): string | null => {
  const constant = theme === "light" ? "1" : "0";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><defs><filter id="vesti-owl-${theme}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 ${constant} 0 0 0 0 ${constant} 0 0 0 0 ${constant} 0 0 0 1 0"/></filter></defs><image filter="url(#vesti-owl-${theme})" href="data:image/png;base64,${pngBase64}" width="512" height="512"/></svg>`;
  const encoded = encodeBase64(svg);
  return encoded ? `${SVG_DATA_URI_PREFIX}${encoded}` : null;
};

const ensureCapsuleLogoCache = (): Record<CapsuleLogoTheme, string> => {
  if (capsuleLogoCache) return capsuleLogoCache;

  const pngBase64 = extractEmbeddedPngBase64();
  if (!pngBase64) {
    capsuleLogoCache = {
      light: LOGO_BASE64,
      dark: LOGO_BASE64,
    };
    return capsuleLogoCache;
  }

  capsuleLogoCache = {
    light: buildMonochromeLogoDataUri(pngBase64, "light") ?? LOGO_BASE64,
    dark: buildMonochromeLogoDataUri(pngBase64, "dark") ?? LOGO_BASE64,
  };
  return capsuleLogoCache;
};

export const resolveCapsuleLogoSrc = (themeMode: CapsuleLogoTheme): string => {
  const variants = ensureCapsuleLogoCache();
  return themeMode === "dark" ? variants.light : variants.dark;
};
