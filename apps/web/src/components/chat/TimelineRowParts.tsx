import { resolveViewedImageAsset } from "@t3tools/client-runtime/work-log/presentation";
import { use, useState } from "react";
import { ChatMarkdownAssetImage } from "./ChatMarkdownMedia";
import { TimelineRowCtx, type TimelineRow } from "./timelineRowContext";
import { ToolActivityIconView } from "./TimelineToolActivityIcon";
import { ChevronRightIcon } from "lucide-react";
import { Spinner } from "../ui/spinner";
import { formatWorkspaceRelativePath } from "../../filePathDisplay";
import { type ReactNode } from "react";
import { TimelineRowTimestamp } from "./UserMessagePresentation";
import { cn } from "~/lib/utils";

export const MESSAGE_HEADING_LEVEL = 3;

export function MessageAuthorHeading({ children }: { children: string }) {
  return <h3 className="sr-only select-none">{children}</h3>;
}

export { TimelineRowTimestamp } from "./UserMessagePresentation";

export function ActivityShimmerOverlay({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden
      className="live-activity-focus pointer-events-none absolute inset-y-0 select-none"
    >
      <span className="live-activity-focus-counter block">
        <span className="live-activity-focus-aligned block text-foreground">{children}</span>
      </span>
    </span>
  );
}

export function ViewedImageTimelineRow({
  row,
}: {
  row: Extract<TimelineRow, { kind: "viewed-image" }>;
}) {
  const { threadRef, workspaceRoot, onImageExpand, timestampFormat } = use(TimelineRowCtx);
  const [expanded, setExpanded] = useState(false);
  const image = threadRef
    ? resolveViewedImageAsset(row.imagePath, { threadId: threadRef.threadId, workspaceRoot })
    : null;
  const displayPath = formatWorkspaceRelativePath(row.imagePath, workspaceRoot);
  return (
    <div className="group/timeline-row rounded-md px-0.5 py-0.5">
      <button
        type="button"
        disabled={!image}
        aria-expanded={image ? expanded : undefined}
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full min-w-0 cursor-pointer select-none items-center gap-1.5 rounded-md text-start transition-colors hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70 disabled:cursor-default disabled:hover:bg-transparent"
      >
        <span className="flex size-6 shrink-0 items-center justify-center text-icon-muted">
          {row.active ? (
            <Spinner size="xs" />
          ) : (
            <ToolActivityIconView
              icon={undefined}
              fallbackName="eye"
              muted={false}
              className="size-4 stroke-2"
            />
          )}
        </span>
        <span className="shrink-0 text-sm text-secondary-label">
          {row.active ? "Viewing image" : "Viewed image"}
        </span>
        <span className="min-w-0 flex-1 break-words text-sm text-secondary-label">
          {displayPath}
        </span>
        <TimelineRowTimestamp createdAt={row.createdAt} timestampFormat={timestampFormat} />
        {image ? (
          <ChevronRightIcon
            aria-hidden
            className={cn(
              "size-3.5 shrink-0 text-icon-muted transition-transform",
              expanded && "rotate-90",
            )}
          />
        ) : null}
      </button>
      {expanded && image && threadRef ? (
        <div className="mt-1 ms-7">
          <ChatMarkdownAssetImage
            environmentId={threadRef.environmentId}
            resource={image.resource}
            alt={image.alt}
            srcFragment={image.srcFragment}
            workspaceRoot={workspaceRoot}
            maxHeightRem={16}
            onImageExpand={onImageExpand}
          />
        </div>
      ) : null}
    </div>
  );
}
