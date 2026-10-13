/** Automatic departure is retired. Existing records and audit entries stay intact.
 * Keep these entry points harmless if an older integration still invokes them.
 * AUTO_CLOCK_OUT_ENABLED cannot re-enable synthetic clock-outs.
 */
export async function closeForgottenShifts() {
  return 0;
}
export function startAutoClockOutWorker() {
  const worker = globalThis as typeof globalThis & { autoClockOutTimer?: ReturnType<typeof setInterval> };
  if (worker.autoClockOutTimer) {
    clearInterval(worker.autoClockOutTimer);
    delete worker.autoClockOutTimer;
  }
}
