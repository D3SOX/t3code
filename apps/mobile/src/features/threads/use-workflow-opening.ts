import { useAtomValue } from "@effect/atom-react";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  resolveWorkflowOpening,
  workflowOpeningParentThreadId,
} from "@t3tools/client-runtime/state/subagentRuntime";
import type { ScopedThreadRef } from "@t3tools/contracts";
import type { EnvironmentThread } from "@t3tools/client-runtime/state/shell";
import { Atom } from "effect/reactivity";

import { environmentThreadDetails } from "../../state/threads";

const EMPTY_THREAD_ATOM = Atom.make<EnvironmentThread | null>(null);

/** The parent's detail loads only for a workflow. */
export function useWorkflowOpening(ref: ScopedThreadRef | null) {
  const environmentId = ref?.environmentId ?? null;
  const threadId = ref?.threadId ?? null;
  const threadAtom =
    environmentId === null || threadId === null
      ? EMPTY_THREAD_ATOM
      : environmentThreadDetails.threadAtom(scopeThreadRef(environmentId, threadId));
  // Ordinary threads keep this primitive unchanged while their messages stream.
  const parentId = useAtomValue(threadAtom, (thread) =>
    thread === null
      ? null
      : workflowOpeningParentThreadId({
          thread: thread.projection.thread,
          messages: thread.projection.messages,
        }),
  );
  const projection = useAtomValue(threadAtom, (thread) =>
    parentId === null ? null : (thread?.projection ?? null),
  );
  const parentSubagents = useAtomValue(
    environmentId === null || parentId === null
      ? EMPTY_THREAD_ATOM
      : environmentThreadDetails.threadAtom(scopeThreadRef(environmentId, parentId)),
    (parent) => (parentId === null ? null : (parent?.projection.subagents ?? null)),
  );
  return projection === null
    ? null
    : resolveWorkflowOpening({
        thread: projection.thread,
        messages: projection.messages,
        parentSubagents,
      });
}
