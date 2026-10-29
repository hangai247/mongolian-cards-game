/** One presentation worker, including across resets while an old animation unwinds.
 * Full snapshots allow a burst to collapse to its newest pending update.
 */
export function createPresentationQueue({ run, onIdle = () => {}, onError = console.error }) {
  let pending = null, worker = null, active = null, epoch = 0;
  async function drain() {
    try {
      while (pending) {
        const entry = pending;
        pending = null;
        const generation = epoch;
        const controller = new AbortController();
        active = controller;
        const isCurrent = () => generation === epoch;
        try {
          await run(entry.value, { signal: controller.signal, isCurrent, skipMotion: entry.skipMotion });
        } catch (error) {
          if (isCurrent()) onError(error);
        } finally {
          if (active === controller) active = null;
        }
      }
    } finally {
      worker = null;
      onIdle();
    }
  }
  return {
    enqueue(value) {
      const skipMotion = pending !== null;
      pending = { value, skipMotion };
      if (skipMotion) active?.abort();
      // Schedule the worker before run() can synchronously call back into the queue.
      if (!worker) worker = Promise.resolve().then(drain);
      return worker;
    },
    reset() { epoch++; pending = null; active?.abort(); },
    cancelMotion() { active?.abort(); },
    get busy() { return worker !== null; },
    get hasPending() { return pending !== null; },
  };
}
