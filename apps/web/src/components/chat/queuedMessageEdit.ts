import type { ChatAttachment, OrchestrationMessageContext, ThreadId } from "@t3tools/contracts";
import {
  asKnownContextRecord,
  terminalContextDraftFromRecord,
  reviewCommentFromRecord,
  previewAnnotationFromRecord,
} from "../../lib/composerContextRecords";
import { resolveQueuedEditExit } from "@t3tools/client-runtime/queued-run-edit";
import {
  composerDraftHasUserContent,
  useComposerDraftStore,
  type ComposerFileAttachment,
  type ComposerImageAttachment,
  type ComposerThreadTarget,
} from "../../composerDraftStore";

/** Return a removed queue entry without overwriting the user's current draft. */
export function restoreQueuedMessage(input: {
  readonly target: ComposerThreadTarget;
  readonly threadId: ThreadId;
  readonly text: string;
  readonly context?: OrchestrationMessageContext | undefined;
  readonly images: ComposerImageAttachment[];
  readonly files: ComposerFileAttachment[];
}): string {
  const store = useComposerDraftStore.getState();
  const current = store.getComposerDraft(input.target)?.prompt ?? "";
  const restored = input.text;
  const existing = store.getComposerDraft(input.target);
  const records = (input.context?.records ?? []).flatMap((record) => {
    const known = asKnownContextRecord(record);
    return known ? [known] : [];
  });
  store.setTerminalContexts(input.target, [
    ...(existing?.terminalContexts ?? []),
    ...records
      .filter((record) => record.kind === "terminal")
      .map((record) => terminalContextDraftFromRecord(record, input.threadId)),
  ]);
  store.setReviewComments(input.target, [
    ...(existing?.reviewComments ?? []),
    ...records.filter((record) => record.kind === "review-comment").map(reviewCommentFromRecord),
  ]);
  store.setPreviewAnnotations(input.target, [
    ...(existing?.previewAnnotations ?? []),
    ...records
      .filter((record) => record.kind === "preview-annotation")
      .map(previewAnnotationFromRecord),
  ]);
  store.setThreadContexts(input.target, [
    ...(existing?.threadContexts ?? []),
    ...records.filter((record) => record.kind === "thread"),
  ]);
  store.setEnvironmentContexts(input.target, [
    ...(existing?.environmentContexts ?? []),
    ...records.filter((record) => record.kind === "environment"),
  ]);
  const prompt = [current, restored].filter((text) => text.length > 0).join("\n\n");
  store.setPrompt(input.target, prompt);
  store.addImages(input.target, input.images, { allowDuplicates: true });
  store.addFiles(input.target, input.files, { allowDuplicates: true });
  return store.getComposerDraft(input.target)?.prompt ?? prompt;
}

/** Keep an unsaved edit when its queued run starts or is removed remotely. */
export function recoverQueuedMessageEdit(input: {
  readonly editTarget: ComposerThreadTarget;
  readonly threadTarget: ComposerThreadTarget;
  readonly originalText: string;
}): "kept" | "discarded" | "clean" {
  const store = useComposerDraftStore.getState();
  const draft = store.getComposerDraft(input.editTarget);
  const recovery = resolveQueuedEditExit({
    editChanged:
      draft !== null &&
      (draft.prompt !== input.originalText || draft.images.length > 0 || draft.files.length > 0),
    threadDraftEmpty: !composerDraftHasUserContent(store.getComposerDraft(input.threadTarget)),
  });
  if (recovery === "kept") {
    store.moveComposerPromptAndImages(input.editTarget, input.threadTarget);
  } else {
    store.clearComposerContent(input.editTarget);
  }
  return recovery;
}

/** Generic files need upload references; images also support the inline transport. */
export async function prepareQueuedEditAttachments(input: {
  readonly existingAttachments: ReadonlyArray<ChatAttachment>;
  readonly images: ReadonlyArray<ComposerImageAttachment>;
  readonly files: ReadonlyArray<ComposerFileAttachment>;
  readonly uploadFiles: (
    files: ReadonlyArray<ComposerFileAttachment>,
  ) => Promise<ReadonlyArray<ChatAttachment>>;
  readonly readImage: (file: File) => Promise<string>;
}) {
  const files = input.files.length === 0 ? [] : await input.uploadFiles(input.files);
  if (files.length !== input.files.length)
    throw new Error("Retry or remove failed uploads before saving.");
  const images = await Promise.all(
    input.images.map(async (image) => ({
      type: "image" as const,
      id: image.id,
      name: image.name,
      mimeType: image.mimeType,
      sizeBytes: image.sizeBytes,
      dataUrl: await input.readImage(image.file),
      ...(image.source ? { source: image.source } : {}),
    })),
  );
  return [...input.existingAttachments, ...images, ...files];
}
