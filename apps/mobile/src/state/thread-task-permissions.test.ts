import {
  AuthOrchestrationOperateScope,
  MessageId,
  RunId,
  RuntimeRequestId,
} from "@t3tools/contracts";
import type { DraftComposerImageAttachment } from "../lib/composerImages";
import type { PendingThreadRequests } from "@t3tools/client-runtime/state/thread-requests";
import type { QueuedRunEdit } from "./queued-run-edit";
import { AsyncResult, type Atom } from "effect/reactivity";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  grantedEnvironments: new Set<string>(),
  connectionState: "connected",
  running: false,
  draft: { text: "Keep my draft", attachments: [] as DraftComposerImageAttachment[] },
  queuedEdit: null as QueuedRunEdit | null,
  editDraft: {
    text: "Updated queued message",
    attachments: [] as DraftComposerImageAttachment[],
  },
  edit: vi.fn(),
  pendingRequests: { approvals: [], userInputs: [] } as PendingThreadRequests,
  enqueue: vi.fn(async () => undefined),
  clearDraft: vi.fn(),
  approve: vi.fn(),
  answer: vi.fn(),
  feedback: vi.fn(),
  updateSettings: vi.fn(),
  question: {
    id: "language",
    header: "Language",
    question: "Which language?",
    options: [{ label: "TypeScript", description: "Use the existing code" }],
    multiSelect: false,
  },
  thread: {
    id: "thread",
    environmentId: "secondary",
    modelSelection: { instanceId: "codex", model: "gpt-5.4" },
    runtimeMode: "full-access",
    interactionMode: "default",
    runtime: null,
    latestRun: null,
  },
}));

vi.mock("react", () => ({
  useCallback: <A>(callback: A) => callback,
  useEffect: () => {},
  useRef: <A>(current: A) => ({ current }),
  useMemo: <A>(factory: () => A) => factory(),
  useState: <A>(initial: A | (() => A)) => [
    typeof initial === "function" ? (initial as () => A)() : initial,
    vi.fn(),
  ],
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => "uuid" }));
vi.mock("../lib/attachmentUpload", () => ({
  prepareTurnAttachments: vi.fn(async () => ({ status: "ready", attachments: [] })),
}));
vi.mock("../lib/uuid", () => ({ uuidv4: () => "uuid" }));
vi.mock("./queued-run-edit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./queued-run-edit")>()),
  useQueuedRunEdit: () => state.queuedEdit,
  getQueuedRunEdit: () => state.queuedEdit,
  endQueuedRunEdit: () => {
    state.queuedEdit = null;
  },
}));
vi.mock("./preferences", async () => {
  const { Atom, AsyncResult } = await import("effect/reactivity");
  return { mobilePreferencesAtom: Atom.make(AsyncResult.success({})) };
});
vi.mock("react-native", () => ({ Alert: { alert: vi.fn() } }));
vi.mock("@effect/atom-react", async () => {
  const { appAtomRegistry } = await import("./atom-registry");
  return { useAtomValue: <A>(atom: Atom.Atom<A>) => appAtomRegistry.get(atom) };
});
vi.mock("./entities", () => ({ useServerConfigs: () => new Map() }));
vi.mock("./session", () => ({
  readEnvironmentScope: (environmentId: string, scope: string) =>
    scope === AuthOrchestrationOperateScope && state.grantedEnvironments.has(environmentId),
}));
vi.mock("./use-thread-selection", () => ({
  useThreadSelection: () => ({
    selectedThread: {
      ...state.thread,
      runtime: state.running
        ? {
            status: "running",
            activeRunId: "active-run",
            providerInstanceId: "codex",
            providerName: "codex",
            lastError: null,
            updatedAt: "2026-09-05T00:00:00.000Z",
          }
        : null,
    },
    selectedThreadCreation: null,
    selectedEnvironmentRuntime: {
      connectionState: state.connectionState,
      serverConfig: {
        providers: [{ instanceId: "codex", driver: "codex" }],
        environment: { capabilities: {} },
      },
    },
  }),
}));
vi.mock("./use-thread-detail", () => ({
  useSelectedThreadProjection: () => null,
  useSelectedThreadVisibleTurnItems: () => [],
  useSelectedThreadPendingRequests: () => state.pendingRequests,
}));
vi.mock("./use-atom-command", () => ({ useAtomCommand: <A>(command: A) => command }));
vi.mock("./threads", async () => {
  const { Atom } = await import("effect/reactivity");
  return {
    environmentThreadDetails: {
      queueWorkflowAtom: () => Atom.make({ canPromoteToSteer: state.running }),
    },
    threadEnvironment: {
      respondToApproval: state.approve,
      respondToUserInput: state.answer,
      uploadFeedback: state.feedback,
      editQueuedRun: state.edit,
    },
  };
});
vi.mock("./use-thread-outbox", async () => {
  const { Atom } = await import("effect/reactivity");
  return { dispatchingQueuedMessageIdAtom: Atom.make(null), useThreadOutboxMessages: () => ({}) };
});
vi.mock("./thread-outbox", () => ({ enqueueThreadOutboxMessage: state.enqueue }));
vi.mock("./composer-attachment-uploads", async () => {
  const { Atom } = await import("effect/reactivity");
  return {
    composerAttachmentUploadsAtom: Atom.make({}),
    composerAttachmentUploadBlockReason: () => null,
    composerAttachmentsStillUploading: () => false,
  };
});
vi.mock("./use-composer-drafts", async () => {
  const { Atom } = await import("effect/reactivity");
  return {
    composerDraftsAtom: Atom.make({}),
    composerContextImportsAtom: Atom.make({}),
    getComposerDraftSnapshot: (key: string) =>
      key === "secondary:thread" ? state.draft : state.editDraft,
    clearComposerDraftContent: state.clearDraft,
    clearComposerDraft: state.clearDraft,
    setComposerDraftText: (key: string, text: string) => {
      (key === "secondary:thread" ? state.draft : state.editDraft).text = text;
    },
    updateComposerDraftSettings: state.updateSettings,
    ensureComposerDraftsLoaded: () => {},
    scheduleUnusedComposerAttachmentCleanup: () => {},
    appendComposerDraftAttachments: vi.fn(),
    appendComposerDraftText: vi.fn(),
    mergeComposerDraftContent: vi.fn(),
    removeComposerDraftAttachment: vi.fn(),
    useComposerDraft: () => state.draft,
  };
});
vi.mock("../lib/composerImages", () => ({
  convertPastedImagesToAttachments: vi.fn(),
  pasteComposerClipboard: vi.fn(),
  pickComposerFiles: vi.fn(),
  pickComposerMedia: vi.fn(),
}));
vi.mock("../lib/commandMetadata", () => ({
  makeQueuedMessageMetadata: () => ({
    messageId: "message",
    commandId: "command",
    createdAt: "2026-09-05T00:00:00.000Z",
  }),
}));
vi.mock("../lib/copyTextWithHaptic", () => ({ copyTextWithHaptic: vi.fn() }));
vi.mock("../lib/modelOptions", () => ({ isModelSelectionUnavailable: () => false }));
vi.mock("./use-remote-environment-registry", () => ({ setPendingConnectionError: vi.fn() }));

import { useThreadComposerState } from "./use-thread-composer-state";
import { useSelectedThreadRequests } from "./use-selected-thread-requests";

beforeEach(() => {
  state.grantedEnvironments = new Set(["primary"]);
  state.connectionState = "connected";
  state.running = false;
  state.draft = { text: "Keep my draft", attachments: [] };
  state.queuedEdit = null;
  state.editDraft = { text: "Updated queued message", attachments: [] };
  state.pendingRequests = {
    approvals: [
      {
        requestId: RuntimeRequestId.make("approval"),
        requestKind: "command",
        createdAt: "2026-09-05T00:00:00.000Z",
        responseCapability: "live",
      },
    ],
    userInputs: [],
  };
  vi.clearAllMocks();
  state.approve.mockResolvedValue(AsyncResult.success(undefined));
  state.answer.mockResolvedValue(AsyncResult.success(undefined));
  state.feedback.mockResolvedValue(AsyncResult.success({ feedbackId: "feedback" }));
  state.edit.mockResolvedValue(AsyncResult.success(undefined));
});

describe("mobile queued-message edits", () => {
  it.each([false, true])(
    "ignores a saved edit's repeated submit with late text: %s",
    async (lateText) => {
      state.grantedEnvironments.add("secondary");
      state.running = true;
      state.queuedEdit = {
        runId: RunId.make("queued-run"),
        messageId: MessageId.make("queued-message"),
        originalText: "Original queued message",
        existingAttachments: [],
      };
      const editor = useThreadComposerState();
      expect(await editor.onSendMessage("steer")).toBeNull();
      expect(state.edit).toHaveBeenCalledWith({
        environmentId: "secondary",
        input: {
          threadId: "thread",
          runId: "queued-run",
          text: "Updated queued message",
          edit: { messageId: "queued-message", attachments: [] },
        },
      });
      expect(state.queuedEdit).toBeNull();

      // A native text event and keyboard submission can still be delivered from
      // the editor that just saved, before React replaces its callbacks.
      if (lateText) editor.onChangeDraftMessage("Updated queued message");
      expect(await editor.onSendMessage("steer")).toBeNull();
      expect(state.enqueue).not.toHaveBeenCalled();
      expect(state.draft.text).toBe("Keep my draft");
      expect(state.edit).toHaveBeenCalledTimes(1);

      // The next render belongs to the normal draft and can submit it normally.
      expect(await useThreadComposerState().onSendMessage("queue")).toBe("message");
      expect(state.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ text: "Keep my draft", dispatchMode: "queue" }),
      );
    },
  );
});

describe("mobile task permissions", () => {
  it("keeps a connected read-only task's draft instead of queueing it with another environment's grant", async () => {
    const composer = useThreadComposerState();
    expect(await composer.onSendMessage()).toBeNull();
    expect(state.enqueue).not.toHaveBeenCalled();
    expect(state.clearDraft).not.toHaveBeenCalled();
    composer.onChangeDraftMessage("Edited locally");
    composer.onUpdateInteractionMode("plan");
    expect(state.draft.text).toBe("Edited locally");
    expect(state.updateSettings).toHaveBeenCalledWith("secondary:thread", {
      interactionMode: "plan",
    });
  });

  it("rechecks a retained send callback before clearing or queueing the draft", async () => {
    state.grantedEnvironments.add("secondary");
    const composer = useThreadComposerState();
    state.grantedEnvironments.delete("secondary");
    expect(await composer.onSendMessage()).toBeNull();
    expect(state.clearDraft).not.toHaveBeenCalled();
    expect(state.enqueue).not.toHaveBeenCalled();
    state.grantedEnvironments.add("secondary");
    expect(await composer.onSendMessage()).toBe("message");
    expect(state.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        environmentId: "secondary",
        threadId: "thread",
        text: "Keep my draft",
      }),
    );
  });

  it("preserves offline queueing without dispatching feedback through the queue action", async () => {
    state.connectionState = "disconnected";
    expect(await useThreadComposerState().onSendMessage()).toBe("message");
    expect(state.enqueue).toHaveBeenCalledTimes(1);
    state.draft.text = "/feedback The agent stopped early.";
    expect(await useThreadComposerState().onSendMessage()).toBeNull();
    expect(state.feedback).not.toHaveBeenCalled();
    expect(state.enqueue).toHaveBeenCalledTimes(1);
    expect(state.clearDraft).toHaveBeenCalledTimes(1);
  });

  it("rechecks the target environment before an approval response", async () => {
    state.grantedEnvironments.add("secondary");
    const requests = useSelectedThreadRequests();
    state.grantedEnvironments.delete("secondary");
    await requests.onRespondToApproval(RuntimeRequestId.make("approval"), "accept");
    expect(state.approve).not.toHaveBeenCalled();
    state.grantedEnvironments.add("secondary");
    await requests.onRespondToApproval(RuntimeRequestId.make("approval"), "accept");
    expect(state.approve).toHaveBeenCalledWith({
      environmentId: "secondary",
      input: { threadId: "thread", requestId: "approval", decision: "accept" },
    });
  });

  it("keeps answer drafts editable after revocation while blocking their submission", async () => {
    state.pendingRequests = {
      approvals: [],
      userInputs: [
        {
          requestId: RuntimeRequestId.make("input"),
          createdAt: "2026-09-05T00:00:00.000Z",
          responseCapability: "live",
          dismissible: false,
          questions: [state.question],
        },
      ],
    };
    const requestId = RuntimeRequestId.make("input");
    useSelectedThreadRequests().onSelectUserInputOption(requestId, state.question, "TypeScript");
    state.grantedEnvironments.add("secondary");
    const requests = useSelectedThreadRequests();
    expect(requests.activePendingUserInputAnswers).toEqual({ language: "TypeScript" });
    state.grantedEnvironments.delete("secondary");
    await requests.onSubmitUserInput();
    expect(state.answer).not.toHaveBeenCalled();
    expect(useSelectedThreadRequests().activePendingUserInputAnswers).toEqual({
      language: "TypeScript",
    });
    state.grantedEnvironments.add("secondary");
    await requests.onSubmitUserInput();
    expect(state.answer).toHaveBeenCalledWith({
      environmentId: "secondary",
      input: { threadId: "thread", requestId: "input", answers: { language: "TypeScript" } },
    });
  });
});
