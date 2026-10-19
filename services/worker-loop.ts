export type LoopOptions = {
  /** Pause between passes after a success. Sources enforce their own freshness, so a short pause is cheap. */
  intervalMs: number;
  /** Failure backoff: doubles from intervalMs up to this cap and resets after a success. */
  maxBackoffMs: number;
  sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  signal: AbortSignal;
  onPass?: (result: { ok: boolean; failures: number; nextInMs: number }) => void;
};
export type PassResult = { ok: boolean };

/** Runs passes until aborted. A thrown pass counts as a failure and never ends the loop. */
export async function runLoop(pass: () => Promise<PassResult>, options: LoopOptions) {
  let failures = 0;
  while (!options.signal.aborted) {
    let ok = false;
    try { ok = (await pass()).ok; } catch { ok = false; }
    failures = ok ? 0 : failures + 1;
    const nextInMs = ok ? options.intervalMs : Math.min(options.maxBackoffMs, options.intervalMs * 2 ** failures);
    options.onPass?.({ ok, failures, nextInMs });
    if (options.signal.aborted) break;
    await options.sleep(nextInMs, options.signal);
  }
}
export const abortableSleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve) => {
  if (signal.aborted) return resolve();
  const timer = setTimeout(done, ms);
  function done() { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); }
  signal.addEventListener("abort", done, { once: true });
});
