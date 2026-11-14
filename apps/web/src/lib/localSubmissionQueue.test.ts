import { expect, it } from "vite-plus/test";
import { createLocalSubmissionQueue } from "./localSubmissionQueue";

it("keeps uploads and sends in submission order while accepting another draft", async () => {
  const queue = createLocalSubmissionQueue();
  const events: string[] = [];
  let finishUpload!: () => void;
  const upload = new Promise<void>((resolve) => {
    finishUpload = resolve;
  });
  const first = queue.enqueue(async () => {
    events.push("upload");
    await upload;
    events.push("first");
  });
  const second = queue.enqueue(async () => {
    events.push("second");
  });
  await Promise.resolve();
  expect(queue.pending).toBe(2);
  expect(events).toEqual(["upload"]);
  finishUpload();
  await Promise.all([first, second]);
  expect(events).toEqual(["upload", "first", "second"]);
  expect(queue.pending).toBe(0);
});

it("releases later submissions when an earlier upload fails", async () => {
  const queue = createLocalSubmissionQueue();
  const failure = new Error("Upload failed");
  const first = queue.enqueue(async () => {
    throw failure;
  });
  const second = queue.enqueue(async () => "sent");
  await expect(first).rejects.toBe(failure);
  await expect(second).resolves.toBe("sent");
  expect(queue.pending).toBe(0);
});
