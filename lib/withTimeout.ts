// Bound a promise so a HUNG dependency fails fast instead of riding the whole
// request up to the 60s Cloudflare Worker wall (P4-7). Supabase calls normally
// return in <1s; if one hangs (vs. errors, which we already handle) this rejects
// with a TimeoutError after `ms`, letting the caller's existing catch fail closed
// quickly with a clear message rather than a slow generic 500.
export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

export function withTimeout<T>(
  promise: PromiseLike<T>,
  ms: number,
  label = "operation",
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
