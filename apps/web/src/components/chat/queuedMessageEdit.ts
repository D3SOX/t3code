import type { ChatAttachment, OrchestrationMessageContext } from "@t3tools/contracts";
import { serializeLegacyContextMessage } from "@t3tools/shared/composerContextLegacySend";
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
  readonly text: string;
  readonly context?: OrchestrationMessageContext | undefined;
  readonly images: ComposerImageAttachment[];
  readonly files: ComposerFileAttachment[];
}): string {
  const store = useComposerDraftStore.getState();
  const current = store.getComposerDraft(input.target)?.prompt ?? "";
  const restored = input.context
    ? serializeLegacyContextMessage({ text: input.text, records: input.context.records })
    : input.text;
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
  const dirty =
    draft !== null &&
    (draft.prompt !== input.originalText || draft.images.length > 0 || draft.files.length > 0);
  if (dirty && !composerDraftHasUserContent(store.getComposerDraft(input.threadTarget))) {
    store.moveComposerPromptAndImages(input.editTarget, input.threadTarget);
    return "kept";
  }
  store.clearComposerContent(input.editTarget);
  return dirty ? "discarded" : "clean";
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
