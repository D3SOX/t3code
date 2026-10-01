export function isCodexCapacityError(
  error: { message: string; codexErrorInfo?: unknown } | null | undefined,
) {
  return (
    error?.codexErrorInfo === "serverOverloaded" ||
    ((error?.codexErrorInfo === undefined ||
      error.codexErrorInfo === null ||
      error.codexErrorInfo === "other") &&
      /\bmodel\b.*\bat capacity\b/i.test(error?.message ?? ""))
  );
}
