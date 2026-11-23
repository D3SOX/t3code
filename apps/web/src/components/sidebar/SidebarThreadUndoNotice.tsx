import { useAtomValue } from "@effect/atom-react";
import { useMessages } from "gt-react";

import {
  threadUndoLabel,
  threadUndoNoticeSummary,
  undoLatestThreadAction,
  useThreadUndoNotice,
} from "../../hooks/showThreadUndoNotice";
import { primaryServerKeybindingsAtom } from "../../state/server";
import { Alert, AlertDescription } from "../ui/alert";
import { InlineButton } from "../ui/button";

export function SidebarThreadUndoNotice() {
  const notice = useThreadUndoNotice((state) => state.notice);
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const m = useMessages();
  if (!notice) return null;

  return (
    <Alert role="group" variant="sidebar">
      <AlertDescription>
        {threadUndoNoticeSummary(notice, m)},{" "}
        <InlineButton onClick={undoLatestThreadAction}>
          {threadUndoLabel(keybindings, m)}
        </InlineButton>
      </AlertDescription>
    </Alert>
  );
}
