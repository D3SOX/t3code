import type { ScopedThreadRef } from "@t3tools/contracts";

import { useQuietThreadShell } from "~/state/entities";

/** A thread's live title, so a toast picks up the generated title once it lands. */
export function ThreadShellTitle({
  threadRef,
  fallback,
}: {
  threadRef: ScopedThreadRef;
  fallback: string;
}) {
  return useQuietThreadShell(threadRef)?.title ?? fallback;
}
