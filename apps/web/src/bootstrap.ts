import { showBootError } from "./lib/bootError";
import ckcodeIconUrl from "../../desktop/resources/branding/ckcode-renderer.png";

const desktopBranding = window.desktopBridge?.getAppBranding?.();
if (desktopBranding?.baseName === "CKcode") {
  document.title = desktopBranding.displayName;
  const bootLogo = document.getElementById("boot-shell-logo");
  if (bootLogo instanceof HTMLImageElement) {
    bootLogo.src = ckcodeIconUrl;
    bootLogo.alt = "CKcode";
  }
  document.getElementById("boot-shell-card")?.setAttribute("aria-label", "CKcode splash screen");
  document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.setAttribute("href", ckcodeIconUrl);
}

// Bundled dev can move UI code into shared chunks. Load it only after this
// entry runs the React refresh preamble, and catch failures before React mounts.
void import("./main").then(({ startup }) => startup).catch(showBootError);
