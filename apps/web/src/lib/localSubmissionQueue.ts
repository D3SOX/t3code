/** Serializes captured composer submissions without blocking the next draft. */
export function createLocalSubmissionQueue() {
  let tail = Promise.resolve();
  let pending = 0;
  return {
    get pending() {
      return pending;
    },
    enqueue<T>(submit: () => Promise<T>): Promise<T> {
      pending += 1;
      const result = tail.then(submit).finally(() => {
        pending -= 1;
      });
      // A failed send must release the next submission too.
      tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
}
