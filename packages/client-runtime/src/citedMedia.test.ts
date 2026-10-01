import { describe, expect, it } from "vite-plus/test";

import { citedMediaPaths } from "./citedMedia.ts";

describe("citedMediaPaths", () => {
  it("collects cited videos as well as images", () => {
    expect(
      citedMediaPaths("[clip](/tmp/demo.mp4) [image](/tmp/frame.png) [webm](clips/demo.webm)"),
    ).toEqual(["/tmp/demo.mp4", "/tmp/frame.png", "clips/demo.webm"]);
  });
  it("collects and deduplicates linked local images", () => {
    expect(
      citedMediaPaths(
        "See [dark](/tmp/dark.png), [light](images/light.JPG), and [dark again](/tmp/dark.png).",
      ),
    ).toEqual(["/tmp/dark.png", "images/light.JPG"]);
  });

  it("recognizes Codex file citations", () => {
    expect(citedMediaPaths('See :codex-file-citation{path="/tmp/screenshot.png"}.')).toEqual([
      "/tmp/screenshot.png",
    ]);
    expect(citedMediaPaths(':codex-file-citation{path="/tmp/recording.mp4"}')).toEqual([
      "/tmp/recording.mp4",
    ]);
  });

  it("deduplicates videos and preserves paths with spaces and suffixes", () => {
    expect(
      citedMediaPaths(
        "[clip](</tmp/my clip.MP4#t=2>) [again](</tmp/my clip.MP4>) [mov](/tmp/demo.mov)",
      ),
    ).toEqual(["/tmp/my clip.MP4", "/tmp/demo.mov"]);
  });

  it("does not duplicate embeds or preview non-image, external, or code links", () => {
    expect(
      citedMediaPaths(
        [
          "![inline](/tmp/inline.png)",
          "[same image](/tmp/inline.png)",
          "![inline video](/tmp/inline.mp4)",
          "[same video](/tmp/inline.mp4)",
          "[external video](https://example.com/video.mp4)",
          "[website](https://example.com/image.png)",
          "[report](/tmp/report.pdf)",
          "`[example](/tmp/code.png)`",
          "```md\n[example](/tmp/fenced.png)\n```",
        ].join("\n\n"),
      ),
    ).toEqual([]);
  });
});
