import { isWorkspaceImagePreviewPath } from "@t3tools/shared/filePreview";
import remarkParse from "remark-parse";
import { unified } from "unified";

import { renderCodexFileCitationsAsMarkdown } from "./codexMarkdownDirectives.ts";
import { parseMarkdownFileLink } from "./markdownLinks.ts";

const markdownParser = unified().use(remarkParse);

interface MarkdownNode {
  readonly type: string;
  readonly url?: string;
  readonly children?: ReadonlyArray<MarkdownNode>;
}

/** Local image links in an answer, excluding images already embedded in its Markdown. */
export function citedImagePaths(markdown: string): string[] {
  const root = markdownParser.parse(renderCodexFileCitationsAsMarkdown(markdown)) as MarkdownNode;
  const paths = new Set<string>();
  const embeddedPaths = new Set<string>();

  function visit(node: MarkdownNode): void {
    if (node.type === "image") {
      if (node.url) {
        const target = parseMarkdownFileLink(node.url);
        if (target) embeddedPaths.add(target.path);
      }
      return;
    }
    if (node.type === "link" && node.url) {
      const target = parseMarkdownFileLink(node.url);
      if (target && isWorkspaceImagePreviewPath(target.path)) paths.add(target.path);
    }
    node.children?.forEach(visit);
  }

  visit(root);
  return [...paths].filter((path) => !embeddedPaths.has(path));
}
