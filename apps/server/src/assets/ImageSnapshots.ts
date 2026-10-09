import type { ThreadId } from "@t3tools/contracts";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Hex from "effect/encoding/Hex";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Stream from "effect/Stream";

import { createDeterministicAttachmentId } from "../attachmentStore.ts";
import * as ServerConfig from "../config.ts";
import { statMediaFile, streamMediaFile, type OpenMediaFile } from "./MediaFile.ts";

const SNAPSHOT_FILE_NAME = /^[a-f0-9]{64}\.[a-z0-9]+$/;

export function imageSnapshotsDirectory(attachmentsDir: string, threadId: string, path: Path.Path) {
  const id = createDeterministicAttachmentId(threadId, "image-snapshots");
  return id === null ? null : path.join(attachmentsDir, "image-snapshots", id);
}

const sourceDirectory = Effect.fn("ImageSnapshots.sourceDirectory")(function* (
  threadId: ThreadId,
  sourcePath: string,
) {
  const config = yield* ServerConfig.ServerConfig;
  const path = yield* Path.Path;
  const directory = imageSnapshotsDirectory(config.attachmentsDir, threadId, path);
  if (directory === null) return null;
  const crypto = yield* Crypto.Crypto;
  const key = Hex.encode(yield* crypto.digest("SHA-256", new TextEncoder().encode(sourcePath)));
  return path.join(directory, key);
});

/** Keep exact preview bytes outside test-output directories that later turns may clean. */
export const captureImageSnapshot = Effect.fn("ImageSnapshots.capture")(function* (input: {
  readonly threadId: ThreadId;
  readonly sourcePath: string;
  readonly extension: string;
  readonly file: OpenMediaFile;
}) {
  // Keep the descriptor until its metadata has been checked after copying.
  const stream = streamMediaFile(input.file, 0n, input.file.info.size, { closeOnDone: false });
  if (stream === null) return null;
  const directory = yield* sourceDirectory(input.threadId, input.sourcePath);
  if (directory === null) return null;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const crypto = yield* Crypto.Crypto;
  const info = input.file.info;
  const revision = Hex.encode(
    yield* crypto.digest(
      "SHA-256",
      new TextEncoder().encode(
        [info.dev, info.ino, info.size, info.mtimeNs, info.ctimeNs].join(":"),
      ),
    ),
  );
  const name = `${revision}${input.extension.toLowerCase()}`;
  const snapshotPath = path.join(directory, name);
  yield* fs.makeDirectory(directory, { recursive: true });
  if (!(yield* fs.exists(snapshotPath))) {
    const temporary = yield* fs.makeTempFileScoped({ directory });
    yield* Stream.run(stream, fs.sink(temporary));
    const after = yield* statMediaFile(input.sourcePath, input.file);
    if (
      after.size !== info.size ||
      after.mtimeNs !== info.mtimeNs ||
      after.ctimeNs !== info.ctimeNs
    ) {
      return null;
    }
    // Publish the complete file once; simultaneous previews must not replace
    // an existing snapshot's inode and invalidate an earlier signed URL.
    yield* fs.link(temporary, snapshotPath).pipe(
      Effect.catchIf(
        (error) => error.reason._tag === "AlreadyExists",
        () => Effect.void,
      ),
    );
  }
  const pointer = yield* fs.makeTempFileScoped({ directory });
  yield* fs.writeFileString(pointer, name);
  yield* fs.rename(pointer, path.join(directory, "latest"));
  return yield* fs.realPath(snapshotPath);
});

/** A missing source can still renew its URL after a restart or token expiry. */
export const resolveImageSnapshot = Effect.fn("ImageSnapshots.resolve")(function* (input: {
  readonly threadId: ThreadId;
  readonly sourcePath: string;
}) {
  const directory = yield* sourceDirectory(input.threadId, input.sourcePath);
  if (directory === null) return null;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const name = yield* fs.readFileString(path.join(directory, "latest")).pipe(
    Effect.catchIf(
      (error) => error.reason._tag === "NotFound",
      () => Effect.succeed(null),
    ),
  );
  return name !== null && SNAPSHOT_FILE_NAME.test(name) ? path.join(directory, name) : null;
});
