import { useEffect, useMemo, useState } from "react";
import {
  ProviderInstanceId,
  type ModelSelection,
  type ProviderDriverKind,
} from "@t3tools/contracts";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import type { ProviderInstanceEntry } from "../../providerInstances";
import type { AppModelOption } from "../../modelSelection";

export type ThreadWorkflowMode = "handoff" | "fork";

function defaultSelection(input: {
  mode: ThreadWorkflowMode;
  sourceProvider: ProviderDriverKind;
  activeSelection: ModelSelection;
  entries: ReadonlyArray<ProviderInstanceEntry>;
  models: ReadonlyMap<ProviderInstanceId, ReadonlyArray<AppModelOption>>;
}): ModelSelection {
  const availableEntries =
    input.mode === "handoff"
      ? input.entries.filter((entry) => entry.driverKind !== input.sourceProvider)
      : input.entries;
  const activeEntry = availableEntries.find(
    (entry) => entry.instanceId === input.activeSelection.instanceId,
  );
  const entry = activeEntry ?? availableEntries[0];
  if (!entry) return input.activeSelection;
  if (entry.instanceId === input.activeSelection.instanceId) return input.activeSelection;
  const options = input.models.get(entry.instanceId) ?? [];
  return {
    instanceId: entry.instanceId,
    model:
      options.find((model) => model.isDefault && !model.isUnavailable)?.slug ??
      options.find((model) => !model.isUnavailable)?.slug ??
      input.activeSelection.model,
  };
}

export function ThreadWorkflowPromptDialog(props: {
  mode: ThreadWorkflowMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: string;
  sourceProvider: ProviderDriverKind;
  activeSelection: ModelSelection;
  entries: ReadonlyArray<ProviderInstanceEntry>;
  models: ReadonlyMap<ProviderInstanceId, ReadonlyArray<AppModelOption>>;
  onStart: (input: { task: string; modelSelection: ModelSelection }) => Promise<boolean>;
}) {
  const [task, setTask] = useState(props.task);
  const [modelSelection, setModelSelection] = useState(() =>
    defaultSelection({
      mode: props.mode,
      sourceProvider: props.sourceProvider,
      activeSelection: props.activeSelection,
      entries: props.entries,
      models: props.models,
    }),
  );
  const [starting, setStarting] = useState(false);
  const availableEntries = useMemo(
    () =>
      props.mode === "handoff"
        ? props.entries.filter((entry) => entry.driverKind !== props.sourceProvider)
        : props.entries,
    [props.entries, props.mode, props.sourceProvider],
  );
  const modelOptions = props.models.get(modelSelection.instanceId) ?? [];
  const title = props.mode === "handoff" ? "Hand off to another provider" : "Fork this thread";

  useEffect(() => {
    if (!props.open) return;
    setTask(props.task);
    setModelSelection(
      defaultSelection({
        mode: props.mode,
        sourceProvider: props.sourceProvider,
        activeSelection: props.activeSelection,
        entries: props.entries,
        models: props.models,
      }),
    );
  }, [
    props.activeSelection,
    props.entries,
    props.models,
    props.mode,
    props.open,
    props.sourceProvider,
    props.task,
  ]);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPopup className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            A new thread will start in the same project and workspace with recent text history.
            Attachments and other composer context are not copied. Review the task, then start it.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="grid gap-4">
          <label className="grid gap-2 text-sm font-medium">
            Task for the new thread
            <textarea
              className="min-h-28 resize-y rounded-md border border-input bg-background px-3 py-2 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={task}
              onChange={(event) => setTask(event.target.value)}
              placeholder="Continue the existing work, or describe a specific next step"
            />
          </label>
          {availableEntries.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium">
                Provider account
                <Select
                  value={modelSelection.instanceId}
                  onValueChange={(value) => {
                    if (!value) return;
                    const instanceId = ProviderInstanceId.make(value);
                    const options = props.models.get(instanceId) ?? [];
                    setModelSelection({
                      instanceId,
                      model:
                        options.find((model) => model.isDefault && !model.isUnavailable)?.slug ??
                        options.find((model) => !model.isUnavailable)?.slug ??
                        modelSelection.model,
                    });
                  }}
                  items={availableEntries.map((entry) => ({
                    value: entry.instanceId,
                    label: `${entry.displayName} · ${entry.driverKind}`,
                  }))}
                >
                  <SelectTrigger aria-label="Provider account">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup alignItemWithTrigger={false}>
                    {availableEntries.map((entry) => (
                      <SelectItem key={entry.instanceId} value={entry.instanceId}>
                        {entry.displayName} · {entry.driverKind}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Model
                <Select
                  value={modelSelection.model}
                  onValueChange={(value) =>
                    value && setModelSelection((current) => ({ ...current, model: value }))
                  }
                  items={modelOptions
                    .filter((model) => !model.isUnavailable)
                    .map((model) => ({ value: model.slug, label: model.name }))}
                >
                  <SelectTrigger
                    aria-label="Model"
                    disabled={modelOptions.every((model) => model.isUnavailable)}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup alignItemWithTrigger={false}>
                    {modelOptions
                      .filter((model) => !model.isUnavailable)
                      .map((model) => (
                        <SelectItem key={model.slug} value={model.slug}>
                          {model.name}
                        </SelectItem>
                      ))}
                  </SelectPopup>
                </Select>
              </label>
            </div>
          ) : (
            <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">
              {props.mode === "handoff"
                ? "No other ready provider is configured. Add one in Settings to hand off this thread."
                : "No ready provider is configured for the new thread."}
            </p>
          )}
        </DialogPanel>
        <DialogFooter>
          <Button variant="ghost" disabled={starting} onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={starting || availableEntries.length === 0 || modelSelection.model.trim() === ""}
            onClick={async () => {
              setStarting(true);
              try {
                const started = await props.onStart({
                  task: task.trim(),
                  modelSelection,
                });
                if (started) props.onOpenChange(false);
              } finally {
                setStarting(false);
              }
            }}
          >
            {starting ? "Starting…" : props.mode === "handoff" ? "Start handoff" : "Create fork"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
