import { describe, expect, it } from "vite-plus/test";

import { citedImagePaths } from "./citedImages.ts";

describe("citedImagePaths", () => {
  it("collects and deduplicates linked local images", () => {
    expect(
      citedImagePaths(
        "See [dark](/tmp/dark.png), [light](images/light.JPG), and [dark again](/tmp/dark.png).",
      ),
    ).toEqual(["/tmp/dark.png", "images/light.JPG"]);
  });

  it("recognizes Codex file citations", () => {
    expect(citedImagePaths('See :codex-file-citation{path="/tmp/screenshot.png"}.')).toEqual([
      "/tmp/screenshot.png",
    ]);
  });

  it("does not duplicate embeds or preview non-image, external, or code links", () => {
    expect(
      citedImagePaths(
        [
          "![inline](/tmp/inline.png)",
          "[same image](/tmp/inline.png)",
          "[website](https://example.com/image.png)",
          "[report](/tmp/report.pdf)",
          "`[example](/tmp/code.png)`",
          "```md\n[example](/tmp/fenced.png)\n```",
        ].join("\n\n"),
      ),
    ).toEqual([]);
  });
});
