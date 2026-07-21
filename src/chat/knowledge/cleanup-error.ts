export function attachCleanupError(
  primaryError: unknown,
  cleanupError: unknown,
  context: string,
): unknown {
  if (!(primaryError instanceof Error)) return primaryError;

  const existingCause = primaryError.cause;
  const errors =
    existingCause instanceof AggregateError
      ? [...existingCause.errors, cleanupError]
      : existingCause === undefined
        ? [cleanupError]
        : [existingCause, cleanupError];
  const cause = new AggregateError(errors, context);
  try {
    Object.defineProperty(primaryError, "cause", {
      configurable: true,
      enumerable: false,
      value: cause,
      writable: true,
    });
  } catch {
    // Preserve the primary error even when a non-extensible foreign Error
    // cannot accept cleanup metadata.
  }
  return primaryError;
}

export async function runWithCleanup<T>(
  operation: () => Promise<T> | T,
  cleanup: () => Promise<unknown> | unknown,
  context: string,
): Promise<T> {
  let failed = false;
  let primaryError: unknown;
  let result: T | undefined;
  try {
    result = await operation();
  } catch (error: unknown) {
    failed = true;
    primaryError = error;
  }

  try {
    await cleanup();
  } catch (cleanupError: unknown) {
    if (!failed) throw cleanupError;
    throw attachCleanupError(primaryError, cleanupError, context);
  }

  if (failed) throw primaryError;
  return result as T;
}
