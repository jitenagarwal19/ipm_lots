import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pLimit } from './pLimit';

describe('pLimit', () => {
  it('runs no more than `concurrency` tasks at the same time', async () => {
    const limit = pLimit(3);
    let active = 0;
    let peak = 0;

    const tasks = Array.from({ length: 10 }, (_, i) =>
      limit(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active -= 1;
        return i;
      })
    );

    const results = await Promise.all(tasks);
    assert.deepEqual(results, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.ok(peak <= 3, `peak concurrency was ${peak}`);
  });

  it('continues processing the queue after a task rejects', async () => {
    const limit = pLimit(2);
    const order: string[] = [];

    const settled = await Promise.allSettled([
      limit(async () => {
        order.push('a-start');
        throw new Error('boom');
      }),
      limit(async () => {
        order.push('b-ok');
        return 'b';
      }),
      limit(async () => {
        order.push('c-ok');
        return 'c';
      }),
    ]);

    assert.equal(settled[0].status, 'rejected');
    assert.equal(settled[1].status, 'fulfilled');
    assert.equal(settled[2].status, 'fulfilled');
    assert.ok(order.includes('c-ok'));
  });

  it('rejects construction with invalid concurrency', () => {
    assert.throws(() => pLimit(0), /positive integer/);
    assert.throws(() => pLimit(-1), /positive integer/);
    assert.throws(() => pLimit(1.5 as unknown as number), /positive integer/);
  });
});
