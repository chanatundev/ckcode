import type { DesktopSidekickPreferences, DesktopSidekickSize } from "@t3tools/contracts";
import { useEffect, useState } from "react";

import { isDesktopSidekickAvailable } from "../../lib/desktopSidekick";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

const SIZE_LABELS: Record<DesktopSidekickSize, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
};

/** Desktop-local sidekick preferences; they live in the desktop settings file, not client settings. */
export function SidekickSettings() {
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

  if (preferences === null) return null;

  const update = (patch: Partial<DesktopSidekickPreferences>) => {
    window.desktopBridge
      ?.setSidekickPreferences?.(patch)
      .then(setPreferences)
      .catch(() => undefined);
  };

  return (
    <>
      <SettingsRow
        {...searchableSetting("sidekick")}
        description="A floating character that shows when agents are working or need you. Click it to open the thread that needs attention. Also toggled with /sidekick."
        control={
          <Switch
            checked={preferences.enabled}
            onCheckedChange={(checked) => update({ enabled: Boolean(checked) })}
            aria-label="Show sidekick"
          />
        }
      />
      <SettingsRow
        {...searchableSetting("sidekick-size")}
        description="How large the sidekick appears on screen."
        control={
          <Select
            value={preferences.size}
            onValueChange={(value) => {
              if (value === "small" || value === "medium" || value === "large") {
                update({ size: value });
              }
            }}
          >
            <SelectTrigger size="sm" className="w-full sm:w-40" aria-label="Sidekick size">
              <SelectValue>{SIZE_LABELS[preferences.size]}</SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              {Object.entries(SIZE_LABELS).map(([value, label]) => (
                <SelectItem hideIndicator key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        }
      />
    </>
  );
}
