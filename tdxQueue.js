// FIFO request queue for TDX requests
const DEFAULT_MAX_CONCURRENCY = 3;
const DEFAULT_SPACING_MS = 180;

function createQueue({ maxConcurrency = DEFAULT_MAX_CONCURRENCY, spacingMs = DEFAULT_SPACING_MS, isPaused = () => false } = {}) {
  const queue = [];
  let activeCount = 0;
  let processedCount = 0;
  let lastStartAt = 0;

  function pendingCount() { return queue.length; }
  function activeCountGetter() { return activeCount; }
  function processedCountGetter() { return processedCount; }

  async function execute(entry) {
    const { fn, resolve, reject, maxAttempts, shouldRetry } = entry;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const result = await fn();
        processedCount += 1;
        resolve(result);
        return;
      } catch (error) {
        if (attempt >= maxAttempts || !shouldRetry?.(error)) {
          reject(error);
          return;
        }
        await new Promise((retry) => setTimeout(retry, spacingMs));
      }
    }
  }

  function finish() {
    if (activeCount > 0) activeCount -= 1;
    scheduleNext();
  }

  function enqueue(fn, options = {}) {
    return new Promise((resolve, reject) => {
      const entry = {
        fn,
        resolve,
        reject,
        maxAttempts: Number.isFinite(options.maxAttempts) ? options.maxAttempts : 1,
        shouldRetry: options.shouldRetry
      };
      queue.push(entry);
      scheduleNext();
    });
  }

  function scheduleNext() {
    if (activeCount >= maxConcurrency) return;
    if (isPaused()) return;
    const taskEntry = queue.shift();
    if (!taskEntry) return;
    activeCount += 1;
    const now = Date.now();
    const waitMs = Math.max(0, spacingMs - (now - lastStartAt));
    lastStartAt = now + waitMs;
    setTimeout(async () => {
      try {
        await execute(taskEntry);
      } finally {
        finish();
      }
    }, waitMs);
  }

  return {
    enqueue,
    status: () => ({
      pendingCount: pendingCount(),
      activeCount: activeCountGetter(),
      processedCount: processedCountGetter()
    }),
    _internal: { queue }
  }
}

module.exports = createQueue;
