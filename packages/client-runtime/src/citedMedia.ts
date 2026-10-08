import { mediaKindFromPath } from "@t3tools/shared/filePreview";
import remarkParse from "remark-parse";
import { unified } from "unified";

import { renderCodexFileCitationsAsMarkdown } from "@t3tools/shared/codexMarkdownDirectives";
import { parseMarkdownFileLink } from "@t3tools/shared/markdownLinks";

const markdownParser = unified().use(remarkParse);

interface MarkdownNode {
  readonly type: string;
  readonly url?: string;
  readonly children?: ReadonlyArray<MarkdownNode>;
}

/** Local image and video links in an answer, excluding media already embedded in its Markdown. */
export function citedMediaPaths(markdown: string): string[] {
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
      if (target && mediaKindFromPath(target.path) !== null) paths.add(target.path);
    }
    node.children?.forEach(visit);
  }

  visit(root);
  return [...paths].filter((path) => !embeddedPaths.has(path));
}
