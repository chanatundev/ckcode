import {
  DESKTOP_SIDEKICK_SIZE_LABELS,
  DESKTOP_SIDEKICK_THREADS_LABELS,
  type DesktopSidekickPreferencesPatch,
} from "@t3tools/contracts";

import { useDesktopSidekickPreferences } from "../../lib/desktopSidekick";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

/** Desktop-local sidekick preferences; they live in the desktop settings file, not client settings. */
export function SidekickSettings() {
  const preferences = useDesktopSidekickPreferences();

  if (preferences === null) return null;

  // The desktop broadcasts the saved preferences back, which re-renders this.
  const update = (patch: DesktopSidekickPreferencesPatch) => {
    window.desktopBridge?.setSidekickPreferences?.(patch).catch(() => undefined);
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
              <SelectValue>{DESKTOP_SIDEKICK_SIZE_LABELS[preferences.size]}</SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              {Object.entries(DESKTOP_SIDEKICK_SIZE_LABELS).map(([value, label]) => (
                <SelectItem hideIndicator key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        }
      />
      <SettingsRow
        {...searchableSetting("sidekick-threads")}
        description="When the sidekick lists the threads that need you or are working."
        control={
          <Select
            value={preferences.threads}
            onValueChange={(value) => {
              if (value === "hover" || value === "always") update({ threads: value });
            }}
          >
            <SelectTrigger size="sm" className="w-full sm:w-40" aria-label="Sidekick threads">
              <SelectValue>{DESKTOP_SIDEKICK_THREADS_LABELS[preferences.threads]}</SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              {Object.entries(DESKTOP_SIDEKICK_THREADS_LABELS).map(([value, label]) => (
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
