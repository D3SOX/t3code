import type { ClientSettings } from "@t3tools/contracts/settings";
import type { ComposerDispatchMode } from "@t3tools/client-runtime/state/composer-dispatch";
import type { AssistantCitation, ResolvedKeybindingsConfig } from "@t3tools/contracts";
import {
  serializeAssistantCitation,
  withAssistantCitationComment,
} from "@t3tools/shared/assistantCitations";
import {
  splitPromptIntoComposerSegments,
  type ComposerPromptSegment,
} from "./composer-editor-mentions";

import { formatShortcutLabel, resolveShortcutCommand, type ShortcutEventLike } from "./keybindings";
import { isMacPlatform } from "./lib/utils";

export type ComposerTriggerKind = "path" | "pull-request" | "slash-command" | "skill";
export type ComposerSlashCommand = "model" | "plan" | "default";
export type ComposerSubmissionIntent = "foreground" | "background" | "alternate";

export function isQueuedComposerDispatchMode(mode: ComposerDispatchMode): boolean {
  return mode === "queue" || mode === "next-tool";
}

/** The alternate shortcut swaps the configured timing with after-turn delivery. */
export function followUpBehaviorForSubmission(
  preference: ClientSettings["followUpBehavior"],
  intent: ComposerSubmissionIntent,
): ClientSettings["followUpBehavior"] {
  if (intent !== "alternate") return preference;
  return preference === "queue" ? "next-tool" : "queue";
}

export interface ComposerTrigger {
  kind: ComposerTriggerKind;
  query: string;
  rangeStart: number;
  rangeEnd: number;
}

export function formatAssistantCitationForComposer(citation: AssistantCitation, comment = "") {
  return `${serializeAssistantCitation(withAssistantCitationComment(citation, comment))} `;
}

function composerRequiresModifier(
  sendShortcut: ClientSettings["sendShortcut"] | undefined,
  prompt: string,
) {
  return (
    sendShortcut === "mod-enter" ||
    (sendShortcut === "mod-enter-multiline" && /[\r\n]/.test(prompt))
  );
}

export function composerSubmissionIntentForKey(input: {
  event: ShortcutEventLike & { isComposing?: boolean; keyCode?: number; repeat?: boolean };
  keybindings: ResolvedKeybindingsConfig;
  platform?: string;
  isMobileViewport: boolean;
  isDraftThread: boolean;
  isRunning?: boolean;
  sendShortcut?: ClientSettings["sendShortcut"];
  startThreadsInBackground?: boolean;
  prompt?: string;
}): ComposerSubmissionIntent | null {
  const { event } = input;
  if (input.isMobileViewport || event.isComposing || event.keyCode === 229 || event.repeat)
    return null;
  const command = resolveShortcutCommand(event, input.keybindings, {
    ...(input.platform === undefined ? {} : { platform: input.platform }),
    context: {
      composerFocus: true,
      draftThreadRoute: input.isDraftThread,
      turnRunning: input.isRunning === true,
    },
  });
  if (command === "composer.sendAlternate" && input.isRunning) return "alternate";
  if (command === "composer.sendBackground" && input.isDraftThread) {
    const isAlternateEnter =
      event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey;
    return isAlternateEnter && input.startThreadsInBackground !== false
      ? "foreground"
      : "background";
  }
  if (command === "composer.sendAndNewThread" && !input.isDraftThread) return "background";
  if (command !== null || event.key !== "Enter" || event.shiftKey || event.altKey) return null;
  if (
    composerRequiresModifier(input.sendShortcut, input.prompt ?? "") &&
    !event.metaKey &&
    !event.ctrlKey
  )
    return null;
  return input.isDraftThread && input.startThreadsInBackground !== false
    ? "background"
    : "foreground";
}

const isInlineTokenSegment = (segment: ComposerPromptSegment): boolean => segment.type !== "text";

/** Resolve hints through the same shortcut rules as the editor, including custom bindings. */
export function composerSubmissionHints(
  input: Omit<Parameters<typeof composerSubmissionIntentForKey>[0], "event"> & {
    followUpBehavior: ClientSettings["followUpBehavior"];
    isEditingQueuedMessage?: boolean;
  },
): string {
  const platform = input.platform ?? navigator.platform;
  const mac = isMacPlatform(platform);
  const actionFor = (intent: ComposerSubmissionIntent) => {
    if (input.isEditingQueuedMessage) return "Update queued message";
    if (intent === "background" && !input.isDraftThread) return "Send and start a new thread";
    if (input.isRunning) {
      const timing = followUpBehaviorForSubmission(input.followUpBehavior, intent);
      return timing === "queue"
        ? "Queue after current turn"
        : timing === "next-tool"
          ? "Queue after next tool call"
          : "Steer immediately";
    }
    return intent === "background"
      ? input.isDraftThread
        ? "Start thread in background"
        : "Send and start a new thread"
      : "Send message";
  };
  const hints = new Map<string, Set<string>>();
  const add = (intent: ComposerSubmissionIntent, label: string) => {
    const action = actionFor(intent);
    const labels = hints.get(action) ?? new Set<string>();
    labels.add(label);
    hints.set(action, labels);
  };
  add(
    input.isDraftThread && input.startThreadsInBackground !== false ? "background" : "foreground",
    "Click",
  );
  if (input.isRunning) add("alternate", mac ? "⌘-click" : "Ctrl-click");
  if (!input.isMobileViewport) {
    const enter = {
      key: "enter",
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      modKey: false,
    };
    const shortcuts = [
      enter,
      { ...enter, modKey: true },
      ...input.keybindings
        .filter((binding) =>
          [
            "composer.sendAlternate",
            "composer.sendBackground",
            "composer.sendAndNewThread",
          ].includes(binding.command),
        )
        .map((binding) => binding.shortcut),
    ];
    for (const shortcut of shortcuts) {
      const event = {
        ...shortcut,
        key: shortcut.key === "enter" ? "Enter" : shortcut.key,
        metaKey: shortcut.metaKey || (shortcut.modKey && mac),
        ctrlKey: shortcut.ctrlKey || (shortcut.modKey && !mac),
      };
      const intent = composerSubmissionIntentForKey({ ...input, platform, event });
      if (intent) add(intent, formatShortcutLabel(shortcut, platform));
    }
  }
  return [...hints].map(([action, labels]) => `${[...labels].join(" or ")}: ${action}`).join("\n");
}

function clampCursor(text: string, cursor: number): number {
  if (!Number.isFinite(cursor)) return text.length;
  return Math.max(0, Math.min(text.length, Math.floor(cursor)));
}

function isWhitespace(char: string): boolean {
  return char === " " || char === "\n" || char === "\t" || char === "\r";
}

function tokenStartForCursor(text: string, cursor: number): number {
  let index = cursor - 1;
  while (index >= 0 && !isWhitespace(text[index] ?? "")) {
    index -= 1;
  }
  return index + 1;
}

export function expandCollapsedComposerCursor(
  text: string,
  cursorInput: number,
  literalText = false,
): number {
  if (literalText) return clampCursor(text, cursorInput);
  const collapsedCursor = clampCursor(text, cursorInput);
  const segments = splitPromptIntoComposerSegments(text);
  if (segments.length === 0) {
    return collapsedCursor;
  }

  let remaining = collapsedCursor;
  let expandedCursor = 0;

  for (const segment of segments) {
    if (
      segment.type === "mention" ||
      segment.type === "citation" ||
      segment.type === "context-reference"
    ) {
      const expandedLength = segment.source.length;
      if (remaining <= 1) {
        return expandedCursor + (remaining === 0 ? 0 : expandedLength);
      }
      remaining -= 1;
      expandedCursor += expandedLength;
      continue;
    }
    if (segment.type === "skill") {
      const expandedLength = segment.source.length;
      if (remaining <= 1) {
        return expandedCursor + (remaining === 0 ? 0 : expandedLength);
      }
      remaining -= 1;
      expandedCursor += expandedLength;
      continue;
    }

    const segmentLength = segment.text.length;
    if (remaining <= segmentLength) {
      return expandedCursor + remaining;
    }
    remaining -= segmentLength;
    expandedCursor += segmentLength;
  }

  return expandedCursor;
}

function collapsedSegmentLength(segment: ComposerPromptSegment): number {
  if (segment.type === "text") {
    return segment.text.length;
  }
  return 1;
}

function clampCollapsedComposerCursorForSegments(
  segments: ReadonlyArray<ComposerPromptSegment>,
  cursorInput: number,
): number {
  const collapsedLength = segments.reduce(
    (total, segment) => total + collapsedSegmentLength(segment),
    0,
  );
  if (!Number.isFinite(cursorInput)) {
    return collapsedLength;
  }
  return Math.max(0, Math.min(collapsedLength, Math.floor(cursorInput)));
}

export function clampCollapsedComposerCursor(
  text: string,
  cursorInput: number,
  literalText = false,
): number {
  if (literalText) return clampCursor(text, cursorInput);
  return clampCollapsedComposerCursorForSegments(
    splitPromptIntoComposerSegments(text),
    cursorInput,
  );
}

export function collapseExpandedComposerCursor(
  text: string,
  cursorInput: number,
  literalText = false,
): number {
  if (literalText) return clampCursor(text, cursorInput);
  const expandedCursor = clampCursor(text, cursorInput);
  const segments = splitPromptIntoComposerSegments(text);
  if (segments.length === 0) {
    return expandedCursor;
  }

  let remaining = expandedCursor;
  let collapsedCursor = 0;

  for (const segment of segments) {
    if (
      segment.type === "mention" ||
      segment.type === "citation" ||
      segment.type === "context-reference"
    ) {
      const expandedLength = segment.source.length;
      if (remaining === 0) {
        return collapsedCursor;
      }
      if (remaining <= expandedLength) {
        return collapsedCursor + 1;
      }
      remaining -= expandedLength;
      collapsedCursor += 1;
      continue;
    }
    if (segment.type === "skill") {
      const expandedLength = segment.source.length;
      if (remaining === 0) {
        return collapsedCursor;
      }
      if (remaining <= expandedLength) {
        return collapsedCursor + 1;
      }
      remaining -= expandedLength;
      collapsedCursor += 1;
      continue;
    }

    const segmentLength = segment.text.length;
    if (remaining <= segmentLength) {
      return collapsedCursor + remaining;
    }
    remaining -= segmentLength;
    collapsedCursor += segmentLength;
  }

  return collapsedCursor;
}

export function isCollapsedCursorAdjacentToInlineToken(
  text: string,
  cursorInput: number,
  direction: "left" | "right",
): boolean {
  const segments = splitPromptIntoComposerSegments(text);
  if (!segments.some(isInlineTokenSegment)) {
    return false;
  }

  const cursor = clampCollapsedComposerCursorForSegments(segments, cursorInput);
  let collapsedOffset = 0;

  for (const segment of segments) {
    if (isInlineTokenSegment(segment)) {
      if (direction === "left" && cursor === collapsedOffset + 1) {
        return true;
      }
      if (direction === "right" && cursor === collapsedOffset) {
        return true;
      }
    }
    collapsedOffset += collapsedSegmentLength(segment);
  }

  return false;
}

export function detectComposerTrigger(text: string, cursorInput: number): ComposerTrigger | null {
  const cursor = clampCursor(text, cursorInput);
  const lineStart = text.lastIndexOf("\n", Math.max(0, cursor - 1)) + 1;
  const linePrefix = text.slice(lineStart, cursor);

  if (linePrefix.startsWith("/")) {
    const commandMatch = /^\/(\S*)$/.exec(linePrefix);
    if (commandMatch) {
      const commandQuery = commandMatch[1] ?? "";
      return {
        kind: "slash-command",
        query: commandQuery,
        rangeStart: lineStart,
        rangeEnd: cursor,
      };
    }
  }

  const tokenStart = tokenStartForCursor(text, cursor);
  const token = text.slice(tokenStart, cursor);
  const pullRequestMatch = /^#([\p{L}\p{N}][\p{L}\p{N}_-]*)?$/u.exec(token);
  if (pullRequestMatch) {
    return {
      kind: "pull-request",
      query: pullRequestMatch[1] ?? "",
      rangeStart: tokenStart,
      rangeEnd: cursor,
    };
  }
  const skillPrefix = /^\p{Sc}/u.exec(token);
  if (skillPrefix) {
    return {
      kind: "skill",
      query: token.slice(skillPrefix[0].length),
      rangeStart: tokenStart,
      rangeEnd: cursor,
    };
  }
  if (!token.startsWith("@")) {
    return null;
  }

  return {
    kind: "path",
    query: token.slice(1),
    rangeStart: tokenStart,
    rangeEnd: cursor,
  };
}

/** Caret and trigger after replacing composer text and continuing at the end. */
export function composerStateAtPromptEnd(
  text: string,
  literalText = false,
): {
  cursor: number;
  trigger: ComposerTrigger | null;
} {
  const cursor = collapseExpandedComposerCursor(text, text.length, literalText);
  return {
    cursor,
    trigger: literalText
      ? null
      : detectComposerTrigger(text, expandCollapsedComposerCursor(text, cursor)),
  };
}

export function parseStandaloneComposerSlashCommand(
  text: string,
): Exclude<ComposerSlashCommand, "model"> | null {
  const match = /^\/(plan|default)\s*$/i.exec(text.trim());
  if (!match) {
    return null;
  }
  const command = match[1]?.toLowerCase();
  if (command === "plan") return "plan";
  return "default";
}

export function replaceTextRange(
  text: string,
  rangeStart: number,
  rangeEnd: number,
  replacement: string,
): { text: string; cursor: number } {
  const safeStart = Math.max(0, Math.min(text.length, rangeStart));
  const safeEnd = Math.max(safeStart, Math.min(text.length, rangeEnd));
  const nextText = `${text.slice(0, safeStart)}${replacement}${text.slice(safeEnd)}`;
  return { text: nextText, cursor: safeStart + replacement.length };
}
