import { useAtomValue } from "@effect/atom-react";
import { Atom } from "effect/reactivity";

import { appAtomRegistry } from "../../rpc/atomRegistry";

type FreshSessionArm = { readonly token: symbol; readonly claimed: boolean };

const freshSessionArmsAtom = Atom.make<Readonly<Record<string, FreshSessionArm>>>({}).pipe(
  Atom.keepAlive,
);

export function armFreshSession(threadKey: string): void {
  appAtomRegistry.set(freshSessionArmsAtom, {
    ...appAtomRegistry.get(freshSessionArmsAtom),
    [threadKey]: { token: Symbol(), claimed: false },
  });
}

/** With `arm`, clears only that arm, so a send never consumes one made while it was in flight. */
export function disarmFreshSession(threadKey: string, arm?: symbol): void {
  const current = appAtomRegistry.get(freshSessionArmsAtom);
  if (current[threadKey] === undefined || (arm !== undefined && current[threadKey].token !== arm))
    return;
  const { [threadKey]: _removed, ...rest } = current;
  appAtomRegistry.set(freshSessionArmsAtom, rest);
}

export function readFreshSessionArm(threadKey: string): symbol | undefined {
  const arm = appAtomRegistry.get(freshSessionArmsAtom)[threadKey];
  return arm?.claimed === false ? arm.token : undefined;
}

export function claimFreshSessionArm(threadKey: string, token: symbol): symbol | undefined {
  const current = appAtomRegistry.get(freshSessionArmsAtom);
  const arm = current[threadKey];
  if (arm?.token !== token || arm.claimed) return undefined;
  appAtomRegistry.set(freshSessionArmsAtom, {
    ...current,
    [threadKey]: { ...arm, claimed: true },
  });
  return token;
}

export function restoreFreshSessionArm(threadKey: string, token: symbol): void {
  const current = appAtomRegistry.get(freshSessionArmsAtom);
  const arm = current[threadKey];
  if (arm?.token !== token || !arm.claimed) return;
  appAtomRegistry.set(freshSessionArmsAtom, {
    ...current,
    [threadKey]: { ...arm, claimed: false },
  });
}

export function useFreshSessionArmed(threadKey: string): boolean {
  return useAtomValue(freshSessionArmsAtom)[threadKey]?.claimed === false;
}
