import type { DesktopSidekickPreferences } from "@t3tools/contracts";
import { useEffect, useState } from "react";

/** True on desktop builds that ship the sidekick window. */
export function isDesktopSidekickAvailable(): boolean {
  const bridge = window.desktopBridge;
  return (
    typeof bridge?.getSidekickPreferences === "function" &&
    typeof bridge.setSidekickPreferences === "function"
  );
}

/** Shows the sidekick if hidden and hides it if shown, atomically in the desktop process. */
export async function toggleDesktopSidekick(): Promise<DesktopSidekickPreferences | null> {
  return (await window.desktopBridge?.setSidekickPreferences?.({ enabled: "toggle" })) ?? null;
}

/** Live sidekick preferences from the desktop; null until loaded or when unavailable. */
export function useDesktopSidekickPreferences(): DesktopSidekickPreferences | null {
  const [preferences, setPreferences] = useState<DesktopSidekickPreferences | null>(null);

  useEffect(() => {
    const bridge = window.desktopBridge;
    if (!isDesktopSidekickAvailable() || !bridge?.getSidekickPreferences) return;
    let cancelled = false;
    bridge
      .getSidekickPreferences()
      .then((next) => {
        if (!cancelled) setPreferences(next);
      })
      .catch(() => undefined);
    const unsubscribe = bridge.onSidekickPreferences?.(setPreferences);
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  return preferences;
}
