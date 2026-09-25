import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import { Pressable, View } from "react-native";

import { AppText } from "../../components/AppText";
import { ProjectFavicon } from "../../components/ProjectFavicon";
import type { HomeProjectScope } from "../home/homeThreadList";

export function SettledProjectList(props: {
  readonly projects: ReadonlyArray<HomeProjectScope>;
  readonly onOpenProject: (project: EnvironmentProject) => void;
}) {
  if (props.projects.length === 0) return null;

  return (
    <View className="mt-2 border-t border-border-subtle pb-2 pt-3">
      <AppText className="px-5 pb-1 text-xs font-t3-medium text-muted-foreground">
        Settled projects
      </AppText>
      {props.projects.map((scope) => (
        <View
          key={scope.key}
          className="min-h-12 flex-row items-center gap-3 border-b border-border-subtle px-5 py-2"
        >
          <ProjectFavicon
            environmentId={scope.representative.environmentId}
            faviconPath={scope.representative.faviconPath}
            projectIcon={scope.representative.projectIcon}
            projectTitle={scope.representative.title}
            size={20}
            workspaceRoot={scope.representative.workspaceRoot}
          />
          <AppText className="min-w-0 flex-1 text-sm" numberOfLines={1}>
            {scope.title}
          </AppText>
          <Pressable
            accessibilityLabel={`Open ${scope.title} in a new chat`}
            accessibilityRole="button"
            className="min-h-9 flex-row items-center justify-center rounded-full border border-border px-3"
            onPress={() => props.onOpenProject(scope.representative)}
          >
            <AppText className="text-xs font-t3-medium">Open</AppText>
          </Pressable>
        </View>
      ))}
    </View>
  );
}
