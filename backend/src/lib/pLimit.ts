/**
 * Tiny dependency-free concurrency limiter.
 *
 * Returns a function that wraps any async task and ensures no more than
 * `concurrency` tasks run at the same time. Tasks beyond the cap queue up
 * and run as earlier ones settle.
 *
 *   const limit = pLimit(10);
 *   const results = await Promise.allSettled(items.map(item => limit(() => work(item))));
 */
export function pLimit(concurrency: number) {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(`pLimit: concurrency must be a positive integer, got ${concurrency}`);
  }

  let active = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    active -= 1;
    const resume = queue.shift();
    if (resume) resume();
  };

  return function run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        active += 1;
        Promise.resolve()
          .then(fn)
          .then((value) => {
            resolve(value);
            next();
          })
          .catch((error) => {
            reject(error);
            next();
          });
      };

      if (active < concurrency) {
        start();
      } else {
        queue.push(start);
      }
    });
  };
}
