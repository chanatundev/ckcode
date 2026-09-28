import type { DesktopSidekickPreferences } from "@t3tools/contracts";

/** True on desktop builds that ship the sidekick window. */
export function isDesktopSidekickAvailable(): boolean {
  const bridge = window.desktopBridge;
  return (
    typeof bridge?.getSidekickPreferences === "function" &&
    typeof bridge.setSidekickPreferences === "function"
  );
}

/** Shows the sidekick if hidden and hides it if shown. */
export async function toggleDesktopSidekick(): Promise<DesktopSidekickPreferences | null> {
  const bridge = window.desktopBridge;
  if (!bridge?.getSidekickPreferences || !bridge.setSidekickPreferences) return null;
  const current = await bridge.getSidekickPreferences();
  return bridge.setSidekickPreferences({ enabled: !current.enabled });
}
