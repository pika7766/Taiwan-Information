// Priority request queue for TDX requests
const DEFAULT_MAX_CONCURRENCY = 3;
const DEFAULT_SPACING_MS = 180;

function createQueue({ maxConcurrency = DEFAULT_MAX_CONCURRENCY, spacingMs = DEFAULT_SPACING_MS } = {}) {
  const highQueue = [];
  const lowQueue = [];
  let activeCount = 0;
  let processedCount = 0;
  let rateLimit429Count = 0;
  let lastStartAt = 0;

  function pendingCount() { return highQueue.length + lowQueue.length; }
  function activeCountGetter() { return activeCount; }
  function processedCountGetter() { return processedCount; }
  function rateLimit429CountGetter() { return rateLimit429Count; }

  function scheduleNext() {
    if (activeCount >= maxConcurrency) return;
    const taskEntry = highQueue.shift() || lowQueue.shift();
    if (!taskEntry) return;
    activeCount += 1;
    const now = Date.now();
    const waitMs = Math.max(0, spacingMs - (now - lastStartAt));
    lastStartAt = now + waitMs;
    setTimeout(() => {
      execute(taskEntry);
    }, waitMs);
  }

  async function execute(entry) {
    const { fn, resolve, reject } = entry;
    try {
      const result = await fn();
      processedCount += 1;
      resolve(result);
    } catch (error) {
      // handle 429 exponential backoff and retry
      if (error && error.status === 429) {
        rateLimit429Count += 1;
        const retryAfter = error.retryAfterMs || 0;
        const attempt = (entry.attempts || 0) + 1;
        const backoff = retryAfter || Math.min(60_000, Math.pow(2, attempt) * 250);
        if (attempt <= (entry.maxAttempts || 5)) {
          entry.attempts = attempt;
          // requeue with delay
          setTimeout(() => {
            if (entry.priority === 'high') highQueue.unshift(entry); else lowQueue.unshift(entry);
            scheduleNext();
          }, backoff + Math.round(Math.random() * 200));
          activeCount -= 1;
          scheduleNext();
          return;
        }
      }
      reject(error);
    } finally {
      if (activeCount > 0) activeCount -= 1;
      scheduleNext();
    }
  }

  function enqueue(fn, options = {}) {
    return new Promise((resolve, reject) => {
      const entry = {
        fn,
        resolve,
        reject,
        priority: options.priority === 'high' ? 'high' : 'low',
        maxAttempts: Number.isFinite(options.maxAttempts) ? options.maxAttempts : 5,
        attempts: 0
      };
      if (entry.priority === 'high') highQueue.push(entry); else lowQueue.push(entry);
      scheduleNext();
    });
  }

  return {
    enqueue,
    status: () => ({ pendingCount: pendingCount(), activeCount: activeCountGetter(), processedCount: processedCountGetter(), rateLimit429Count: rateLimit429CountGetter() }),
    _internal: { highQueue, lowQueue }
  };
}

module.exports = createQueue;
