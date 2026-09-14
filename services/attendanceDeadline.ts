/** Bound a single attendance request. An aborted write may still have committed. */
export async function attendanceRequest<T>(
  operation: (signal: AbortSignal) => PromiseLike<T>,
  write = false,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      Promise.resolve().then(() => operation(controller.signal)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const error = Object.assign(new Error(write
            ? 'Attendance save confirmation timed out. Check your current attendance before trying again.'
            : 'Attendance could not be refreshed in time. Check your connection and retry.'),
          { code: 'attendance_timeout' });
          reject(error);
          controller.abort(error);
        }, 12_000);
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}
