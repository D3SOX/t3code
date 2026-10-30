import { resolveUserMessagePresentation } from "@t3tools/client-runtime/user-message";
import { Link } from "@tanstack/react-router";
import * as DateTime from "effect/DateTime";
import type { TimestampFormat } from "@t3tools/contracts/settings";
import { GuestMessageName } from "./guestMessageStyle";
import {
  FoldedMessageHeader,
  useScheduledTaskTitle,
  TimelineRowTimestamp,
} from "./UserMessagePresentation";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { deriveThreadQueueWorkflowState } from "@t3tools/client-runtime/state/thread-workflows";
import { assistantCitationsToPlainText } from "@t3tools/shared/assistantCitations";
import {
  isAttachmentOnlyBootstrapPrompt,
  replaceComposerContextReferences,
} from "@t3tools/shared/composerContextReferences";
import type {
  ChatAttachment as ContractChatAttachment,
  EnvironmentId,
  MessageId,
  RunId,
  ThreadId,
} from "@t3tools/contracts";
import {
  Clock3Icon,
  CalendarClockIcon,
  MessagesSquareIcon,
  CornerUpRightIcon,
  GripVerticalIcon,
  ListOrderedIcon,
  PencilIcon,
  HammerIcon,
} from "lucide-react";
import { useId, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from "react";
import { useAssetUrls } from "../../assets/assetUrls";
import { threadEnvironment } from "../../state/threads";
import { useServerConfigs, useQuietThreadShell, useThreadProjection } from "../../state/entities";
import { useAtomCommand } from "../../state/use-atom-command";
import { isImageAttachment, type ChatMessage } from "../../types";
import { cn } from "~/lib/utils";
import { ComposerBanner } from "./ComposerBanner";
import { Button, InlineButton } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
export interface EditQueuedRunRequest {
  readonly runId: RunId;
  readonly messageId: MessageId;
  readonly text: string;
  readonly attachments: ReadonlyArray<ContractChatAttachment>;
}
interface QueuedRowThumbnail {
  readonly key: string;
  readonly name: string;
  readonly url: string | null;
}
const QUEUED_RUN_DRAG_TYPE = "application/x-t3code-queued-run";
export interface QueuedRunsControlHandle {
  steerNext: (repeat: boolean) => boolean;
  editLatest: (repeat: boolean) => boolean;
}
type ThreadQueueProjection = Parameters<typeof deriveThreadQueueWorkflowState>[0];
function queuedImageResources(projection: ThreadQueueProjection | undefined) {
  if (!projection) return [];
  return deriveThreadQueueWorkflowState(projection).queuedRuns.flatMap(({ attachments }) =>
    attachments.flatMap((attachment) =>
      attachment.type === "image"
        ? [
            {
              _tag: "attachment" as const,
              attachmentId: attachment.id,
            },
          ]
        : [],
    ),
  );
}
export function QueuedRunsControl({
  ref,
  ...props
}: {
  readonly ref?: Ref<QueuedRunsControlHandle>;
  readonly steerShortcutLabel?: string | null;
  readonly editShortcutLabel?: string | null;
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly optimisticMessages: ReadonlyArray<
    Pick<ChatMessage, "id" | "inputIntent" | "text" | "attachments">
  >;
  readonly editingRunId: RunId | null;
  readonly editBlockedReason: string | null;
  readonly timestampFormat: TimestampFormat;
  readonly onOpenThread: (threadId: ThreadId) => void;
  readonly onEditQueuedRun: (request: EditQueuedRunRequest) => void;
  readonly onRemoveQueuedRun: (request: EditQueuedRunRequest) => Promise<void>;
  readonly onCancelEdit: () => void;
}) {
  const projection = useThreadProjection(
    scopeThreadRef(props.environmentId, props.threadId),
  )?.projection;
  const supportsNextToolQueue =
    useServerConfigs().get(props.environmentId)?.environment.capabilities.nextToolQueue === true;
  const reorder = useAtomCommand(threadEnvironment.reorderQueuedRun);
  const promote = useAtomCommand(threadEnvironment.promoteQueuedRun);
  const resume = useAtomCommand(threadEnvironment.resumeThreadQueue);
  const [expanded, setExpanded] = useState(true);
  const queueListId = useId();
  const [busyRunId, setBusyRunId] = useState<RunId | null>(null);
  const [dragState, setDragState] = useState<{
    readonly runId: RunId;
    readonly insertIndex: number | null;
  } | null>(null);
  // Arm from the grip to prevent accidental text drags from reordering queued runs.
  const dragArmedRunIdRef = useRef<RunId | null>(null);
  const steerInFlightRef = useRef(false);
  // Run-only acknowledgements can resurrect pending rows after cancellation or startup.
  const acknowledgedMessageIds = new Set((projection?.messages ?? []).map((message) => message.id));
  const queuedImageAttachmentResources = queuedImageResources(projection);
  const queuedImageAttachmentUrls = useAssetUrls(
    props.environmentId,
    queuedImageAttachmentResources,
  );
  const workflow = projection ? deriveThreadQueueWorkflowState(projection) : null;
  const queued = workflow?.queuedRuns ?? [];
  const activeRun = workflow?.activeRun ?? null;
  const canReorder = workflow?.canReorder === true;
  const canSend = workflow?.canSendNow === true || workflow?.canPromoteToSteer === true;
  const queuedImageUrlById = new Map(
    queuedImageAttachmentUrls.flatMap((url, index) => {
      const resource = queuedImageAttachmentResources[index];
      return url && resource ? [[resource.attachmentId, url] as const] : [];
    }),
  );
  const optimisticQueued = props.optimisticMessages.filter(
    (message) => message.inputIntent === "queued_turn" && !acknowledgedMessageIds.has(message.id),
  );
  const items = [
    ...queued.map(({ run, text, attachments, context, message }, serverIndex) => ({
      message,
      key: run.id,
      runId: run.id,
      messageId: run.userMessageId,
      serverIndex,
      text,
      afterNextTool: run.queueAfterNextTool === true,
      // A guest's message keeps the guest's words; the owner can cancel it, not rewrite it.
      editable: context?.guest === undefined,
      guestName: context?.guest?.name,
      attachments,
      thumbnails: attachments
        .filter((attachment) => attachment.type === "image")
        .map<QueuedRowThumbnail>((attachment) => ({
          key: attachment.id,
          name: attachment.name,
          url: queuedImageUrlById.get(attachment.id) ?? null,
        })),
      pending: false,
    })),
    ...optimisticQueued.map((message) => ({
      message: undefined,
      key: message.id,
      runId: null,
      messageId: null,
      serverIndex: null,
      text: message.text,
      afterNextTool: false,
      editable: true,
      guestName: undefined,
      attachments: [] as ReadonlyArray<ContractChatAttachment>,
      thumbnails: (message.attachments ?? [])
        .filter(isImageAttachment)
        .map<QueuedRowThumbnail>((attachment) => ({
          key: attachment.id,
          name: attachment.name,
          url: attachment.previewUrl ?? null,
        })),
      pending: true,
    })),
  ];
  const move = async (runId: RunId, beforeRunId: RunId | null) => {
    setBusyRunId(runId);
    await reorder({
      environmentId: props.environmentId,
      input: {
        threadId: props.threadId,
        runId,
        beforeRunId,
      },
    });
    setBusyRunId(null);
  };
  const completeDrag = (runId: RunId, insertIndex: number | null) => {
    setDragState(null);
    dragArmedRunIdRef.current = null;
    if (insertIndex === null || busyRunId !== null) return;
    const draggedIndex = queued.findIndex(({ run }) => run.id === runId);
    if (draggedIndex === -1) return;
    if (insertIndex === draggedIndex || insertIndex === draggedIndex + 1) return;
    void move(runId, queued[insertIndex]?.run.id ?? null);
  };
  const sendQueuedMessage = async (queuedRunId: RunId, afterNextTool?: boolean) => {
    if (!canSend || steerInFlightRef.current) return;
    steerInFlightRef.current = true;
    setBusyRunId(queuedRunId);
    await (async () => {
      if (workflow?.canSendNow) {
        await resume({
          environmentId: props.environmentId,
          input: { threadId: props.threadId, runId: queuedRunId },
        });
      } else if (activeRun !== null && workflow?.canPromoteToSteer) {
        await promote({
          environmentId: props.environmentId,
          input: {
            threadId: props.threadId,
            queuedRunId,
            targetRunId: activeRun.id,
            ...(afterNextTool === undefined ? {} : { afterNextTool }),
          },
        });
      }
    })().finally(() => {
      steerInFlightRef.current = false;
      setBusyRunId(null);
    });
  };
  useImperativeHandle(ref, () => ({
    steerNext(repeat) {
      const next = queued[0];
      if (!next || !canSend) return false;
      if (!repeat && busyRunId === null) void sendQueuedMessage(next.run.id);
      return true;
    },
    // Leave the key to caret navigation while editing.
    editLatest(repeat) {
      const latest = queued.at(-1);
      if (
        !latest ||
        latest.context?.guest !== undefined ||
        props.editBlockedReason !== null ||
        props.editingRunId !== null ||
        busyRunId !== null
      ) {
        return false;
      }
      if (!repeat) {
        setExpanded(true);
        props.onEditQueuedRun({
          runId: latest.run.id,
          messageId: latest.run.userMessageId,
          text: latest.text,
          attachments: latest.attachments,
        });
      }
      return true;
    },
  }));
  if (items.length === 0) return null;
  const remove = async (runId: RunId) => {
    const entry = queued.find(({ run }) => run.id === runId);
    if (!entry) return;
    setBusyRunId(runId);
    return await (async () => {
      await props.onRemoveQueuedRun({
        runId,
        messageId: entry.messageId,
        text: entry.text,
        attachments: entry.attachments,
      });
    })().finally(() => {
      setBusyRunId(null);
    });
  };
  return (
    <ComposerBanner.Attachment>
      <ComposerBanner.Root
        role="region"
        aria-label={`${items.length} queued message${items.length === 1 ? "" : "s"}`}
        aria-live="polite"
        data-chat-composer-collapsed-controls="true"
        className="relative z-0"
      >
        <ComposerBanner.Row
          render={<button type="button" />}
          aria-label={expanded ? "Collapse queued messages" : "Expand queued messages"}
          aria-expanded={expanded}
          aria-controls={queueListId}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => setExpanded((value) => !value)}
        >
          <ComposerBanner.Icon>
            <ListOrderedIcon />
          </ComposerBanner.Icon>
          <ComposerBanner.Content className="text-muted-foreground">
            {queued.some(({ run }) => run.queueEditing) ? "Queue paused while editing" : "Queued"}
          </ComposerBanner.Content>
          <ComposerBanner.Actions>
            <ComposerBanner.Count>{items.length}</ComposerBanner.Count>
            <ComposerBanner.ToggleIcon expanded={expanded} />
          </ComposerBanner.Actions>
        </ComposerBanner.Row>
        <ComposerBanner.Scroll className={cn("max-h-32", !expanded && "hidden")}>
          <ComposerBanner.Children render={<ol />} id={queueListId}>
            {items.map((item) => {
              const previewText = isAttachmentOnlyBootstrapPrompt(item.text)
                ? ""
                : assistantCitationsToPlainText(
                    replaceComposerContextReferences(item.text, (reference) =>
                      reference.kind === "image" && item.thumbnails.length > 0
                        ? ""
                        : reference.label,
                    ),
                  ).trim();
              const rowRunId = item.runId;
              const rowServerIndex = item.serverIndex;
              const isEditing = rowRunId !== null && rowRunId === props.editingRunId;
              const rowDraggable =
                rowRunId !== null && rowServerIndex !== null && canReorder && busyRunId === null;
              return (
                <ComposerBanner.Row
                  render={<li />}
                  key={item.key}
                  aria-current={isEditing ? "true" : undefined}
                  className={cn(
                    "relative rounded-sm",
                    isEditing && "bg-accent text-accent-foreground",
                    dragState !== null && dragState.runId === item.runId && "opacity-50",
                  )}
                  draggable={rowDraggable}
                  onDragStart={(event) => {
                    if (item.runId === null || dragArmedRunIdRef.current !== item.runId) {
                      event.preventDefault();
                      return;
                    }
                    event.dataTransfer.setData(QUEUED_RUN_DRAG_TYPE, item.runId);
                    event.dataTransfer.effectAllowed = "move";
                    setDragState({
                      runId: item.runId,
                      insertIndex: null,
                    });
                  }}
                  onDragEnd={() => {
                    dragArmedRunIdRef.current = null;
                    setDragState(null);
                  }}
                  onDragOver={(event) => {
                    if (dragState === null || item.serverIndex === null) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    const rect = event.currentTarget.getBoundingClientRect();
                    const insertIndex =
                      event.clientY < rect.top + rect.height / 2
                        ? item.serverIndex
                        : item.serverIndex + 1;
                    if (dragState.insertIndex !== insertIndex) {
                      setDragState({
                        runId: dragState.runId,
                        insertIndex,
                      });
                    }
                  }}
                  onDrop={(event) => {
                    if (dragState === null) return;
                    event.preventDefault();
                    completeDrag(dragState.runId, dragState.insertIndex);
                  }}
                >
                  {item.serverIndex !== null && dragState?.insertIndex === item.serverIndex ? (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 top-0 h-0.5 rounded bg-primary/70"
                    />
                  ) : null}
                  {item.serverIndex === queued.length - 1 &&
                  dragState?.insertIndex === queued.length ? (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 rounded bg-primary/70"
                    />
                  ) : null}
                  <ComposerBanner.Icon aria-hidden={false}>
                    {canReorder && rowRunId !== null && rowServerIndex !== null ? (
                      <Button
                        size="icon-xs"
                        variant="ghost-muted"
                        aria-label="Reorder queued message (drag, or press the arrow keys)"
                        className="cursor-grab active:cursor-grabbing disabled:cursor-default"
                        disabled={busyRunId !== null}
                        onPointerDown={() => {
                          dragArmedRunIdRef.current = rowRunId;
                        }}
                        onKeyDown={(event) => {
                          if (busyRunId !== null) return;
                          if (event.key === "ArrowUp" && rowServerIndex > 0) {
                            event.preventDefault();
                            void move(rowRunId, queued[rowServerIndex - 1]?.run.id ?? null);
                          }
                          if (event.key === "ArrowDown" && rowServerIndex < queued.length - 1) {
                            event.preventDefault();
                            void move(rowRunId, queued[rowServerIndex + 2]?.run.id ?? null);
                          }
                        }}
                      >
                        <GripVerticalIcon />
                      </Button>
                    ) : null}
                  </ComposerBanner.Icon>
                  <ComposerBanner.Content className="text-foreground/80">
                    {isEditing ? <span className="sr-only">Editing queued message: </span> : null}
                    {item.pending ? (
                      <Clock3Icon
                        aria-label="Saving queued message"
                        className="size-3 shrink-0 text-muted-foreground/60"
                      />
                    ) : null}
                    {item.message &&
                    resolveUserMessagePresentation(item.message).attribution !== null ? (
                      <QueuedMessage
                        environmentId={props.environmentId}
                        message={item.message}
                        previewText={previewText}
                        thumbnails={item.thumbnails}
                        isEditing={isEditing}
                        timestampFormat={props.timestampFormat}
                        onOpenThread={props.onOpenThread}
                      >
                        {null}
                      </QueuedMessage>
                    ) : (
                      <>
                        {item.thumbnails.length > 0 ? (
                          <span className="flex shrink-0 items-center gap-0.5">
                            {item.thumbnails.map((thumbnail) => (
                              <span
                                key={thumbnail.key}
                                className="size-4 overflow-hidden rounded border border-border/70 bg-background"
                              >
                                {thumbnail.url ? (
                                  <img
                                    src={thumbnail.url}
                                    alt={thumbnail.name}
                                    className="size-full object-cover"
                                  />
                                ) : (
                                  <span
                                    aria-label={thumbnail.name}
                                    className="block size-full bg-muted/60"
                                  />
                                )}
                              </span>
                            ))}
                          </span>
                        ) : null}
                        {item.guestName === undefined ? null : (
                          <span className="shrink-0 text-guest-foreground">{item.guestName}</span>
                        )}
                        <Tooltip>
                          <TooltipTrigger render={<span className="min-w-0 flex-1 truncate" />}>
                            {previewText}
                          </TooltipTrigger>
                          <TooltipPopup side="top" className="max-w-96 break-words">
                            {previewText}
                          </TooltipPopup>
                        </Tooltip>
                      </>
                    )}
                  </ComposerBanner.Content>
                  <ComposerBanner.Actions>
                    {item.runId &&
                    activeRun &&
                    workflow?.canPromoteToSteer &&
                    supportsNextToolQueue ? (
                      <Button
                        size="xs"
                        variant="ghost"
                        disabled={busyRunId !== null}
                        aria-label={
                          item.afterNextTool
                            ? "Run after current turn"
                            : "Steer after next tool call"
                        }
                        onClick={() => void sendQueuedMessage(item.runId!, !item.afterNextTool)}
                      >
                        {item.afterNextTool ? <HammerIcon /> : <Clock3Icon />}
                        {item.afterNextTool ? "After tool" : "After turn"}
                      </Button>
                    ) : null}
                    {isEditing ? (
                      <Button
                        size="xs"
                        variant="ghost"
                        aria-label="Cancel editing queued message"
                        onClick={props.onCancelEdit}
                      >
                        Cancel
                      </Button>
                    ) : (
                      <>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                size="icon-xs"
                                variant="ghost-muted"
                                aria-label="Edit queued message"
                                disabled={
                                  item.runId === null ||
                                  !item.editable ||
                                  props.editBlockedReason !== null ||
                                  busyRunId !== null ||
                                  props.editingRunId !== null
                                }
                                onClick={() => {
                                  if (item.runId !== null && item.messageId !== null) {
                                    props.onEditQueuedRun({
                                      runId: item.runId,
                                      messageId: item.messageId,
                                      text: item.text,
                                      attachments: item.attachments,
                                    });
                                  }
                                }}
                              />
                            }
                          >
                            <PencilIcon />
                          </TooltipTrigger>
                          <TooltipPopup>
                            {`Edit in the composer${item.serverIndex === queued.length - 1 && props.editShortcutLabel ? ` (${props.editShortcutLabel})` : ""}`}
                          </TooltipPopup>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger render={<span className="flex shrink-0" />}>
                            <Button
                              size="xs"
                              variant="ghost-muted"
                              disabled={item.runId === null || busyRunId !== null || !canSend}
                              onClick={() => {
                                if (item.runId !== null) {
                                  void sendQueuedMessage(item.runId);
                                }
                              }}
                            >
                              <CornerUpRightIcon />
                              {workflow?.canSendNow ? "Send now" : "Steer"}
                            </Button>
                          </TooltipTrigger>
                          <TooltipPopup>
                            {`${workflow?.canSendNow ? "Start a turn with this message" : "Send as a steer instead"}${item.serverIndex === 0 && props.steerShortcutLabel ? ` (${props.steerShortcutLabel})` : ""}`}
                          </TooltipPopup>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <ComposerBanner.Dismiss
                                aria-label="Remove queued message"
                                disabled={
                                  item.runId === null ||
                                  busyRunId !== null ||
                                  props.editingRunId !== null
                                }
                                onClick={() => {
                                  if (item.runId !== null) void remove(item.runId);
                                }}
                              />
                            }
                          />
                          <TooltipPopup>Remove from queue</TooltipPopup>
                        </Tooltip>
                      </>
                    )}
                  </ComposerBanner.Actions>
                </ComposerBanner.Row>
              );
            })}
          </ComposerBanner.Children>
        </ComposerBanner.Scroll>
      </ComposerBanner.Root>
    </ComposerBanner.Attachment>
  );
}

type QueuedRunMessage = NonNullable<
  NonNullable<ReturnType<typeof deriveThreadQueueWorkflowState>>["queuedRuns"][number]["message"]
>;
function QueuedMessage(props: {
  readonly environmentId: EnvironmentId;
  readonly message: QueuedRunMessage | undefined;
  readonly previewText: string;
  readonly thumbnails: ReadonlyArray<QueuedRowThumbnail>;
  readonly isEditing: boolean;
  readonly timestampFormat: TimestampFormat;
  readonly onOpenThread: (threadId: ThreadId) => void;
  readonly children: ReactNode;
}) {
  const presentation = props.message ? resolveUserMessagePresentation(props.message) : null;
  const attribution = presentation?.attribution ?? null;
  const scheduledTaskId = presentation?.scheduledTaskId;
  const senderThreadId = props.message?.senderThreadId;
  const [expanded, setExpanded] = useState(false);
  const taskTitle = useScheduledTaskTitle(props.environmentId, scheduledTaskId);
  const senderShell = useQuietThreadShell(
    attribution === "agent" && senderThreadId
      ? { environmentId: props.environmentId, threadId: senderThreadId }
      : null,
  );
  const fold =
    attribution === "automation"
      ? {
          icon: CalendarClockIcon,
          label: "Automation",
          summary: taskTitle ?? props.previewText.split(/\r?\n/, 1)[0] ?? "",
        }
      : attribution === "agent"
        ? {
            icon: MessagesSquareIcon,
            label: senderShell?.title.trim() || "Agent",
            summary: props.previewText.split(/\r?\n/).find((line) => line.trim()) ?? "",
          }
        : null;
  const bodyVisible = fold === null || expanded;

  return (
    <div className="group/queued flex min-w-0 flex-1 flex-col gap-1">
      {attribution === "t3code" ? (
        <p className="me-1 text-2xs text-muted-foreground/70">Sent by T3 Code</p>
      ) : null}
      {presentation?.guestName === undefined ? null : (
        <GuestMessageName name={presentation.guestName} />
      )}
      {/* Dashed and unfilled: a turn that has not been sent yet. */}
      <div
        className={cn(
          "flex min-w-0 max-w-full flex-col rounded-2xl border border-dashed text-sm",
          props.isEditing
            ? "border-primary/60 text-foreground"
            : attribution === "guest"
              ? "border-guest/50 text-muted-foreground"
              : "border-muted-foreground/40 text-muted-foreground",
          fold === null && "px-3 py-2",
          fold !== null && expanded && "w-full",
        )}
      >
        {fold ? (
          <FoldedMessageHeader
            icon={fold.icon}
            label={fold.label}
            summary={fold.summary}
            expanded={expanded}
            onToggle={() => setExpanded((value) => !value)}
          />
        ) : null}
        {bodyVisible ? (
          <div
            className={cn(
              "flex flex-col gap-2",
              fold !== null && "max-h-96 overflow-auto px-3 pb-2",
            )}
          >
            {props.thumbnails.length > 0 ? (
              <span className="flex flex-wrap items-center gap-1">
                {props.thumbnails.map((thumbnail) => (
                  <span
                    key={thumbnail.key}
                    className="size-8 overflow-hidden rounded-md border border-border/70 bg-background"
                  >
                    {thumbnail.url ? (
                      <img
                        src={thumbnail.url}
                        alt={thumbnail.name}
                        className="size-full object-cover"
                      />
                    ) : (
                      <span aria-label={thumbnail.name} className="block size-full bg-muted/60" />
                    )}
                  </span>
                ))}
              </span>
            ) : null}
            {/* In full, like a sent turn: a queued message is read before it is sent. */}
            {props.previewText ? (
              <p className="whitespace-pre-wrap wrap-anywhere">{props.previewText}</p>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-0.5 pe-1 text-xs text-muted-foreground">
        {props.message ? (
          <span className="me-1 flex items-center gap-2 px-1 opacity-0 transition-opacity duration-200 pointer-coarse:opacity-100 focus-within:opacity-100 group-hover/queued:opacity-100">
            {attribution === "agent" && senderThreadId ? (
              <InlineButton tone="muted" onClick={() => props.onOpenThread(senderThreadId)}>
                Open thread
              </InlineButton>
            ) : null}
            {scheduledTaskId ? (
              <InlineButton
                tone="muted"
                render={
                  <Link
                    to="/settings/scheduled-tasks"
                    search={{ environmentId: props.environmentId, taskId: scheduledTaskId }}
                  />
                }
              >
                Open automation
              </InlineButton>
            ) : null}
            <TimelineRowTimestamp
              createdAt={DateTime.formatIso(props.message.createdAt)}
              timestampFormat={props.timestampFormat}
              alwaysVisible
            />
          </span>
        ) : null}
        {props.children}
      </div>
    </div>
  );
}
