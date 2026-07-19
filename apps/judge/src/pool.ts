/**
 * Pre-warmed sandbox pool (PLAN §4.1: sub-second Run feedback). Boxes are
 * initialized ahead of demand; acquire() hands out a ready box instantly and
 * release() re-initializes it in the background, so the isolate --init/
 * --cleanup cost never sits on a submission's critical path.
 */
import { cleanupBox, initBox, type Box } from "./isolate.js";

export class BoxPool {
  private free: Box[] = [];
  private waiters: ((box: Box) => void)[] = [];
  private closed = false;

  constructor(private readonly boxIds: number[]) {}

  /** Init every box up front (boot-time pre-warm). */
  async warm(): Promise<void> {
    for (const id of this.boxIds) {
      await cleanupBox(id); // clear leftovers from a previous crashed run
      this.free.push(await initBox(id));
    }
  }

  async acquire(): Promise<Box> {
    const box = this.free.pop();
    if (box) return box;
    return new Promise<Box>((resolve) => this.waiters.push(resolve));
  }

  /** Recycle asynchronously: the caller never waits for cleanup + re-init. */
  release(box: Box): void {
    void (async () => {
      try {
        await cleanupBox(box.id);
        if (this.closed) return;
        const fresh = await initBox(box.id);
        const waiter = this.waiters.shift();
        if (waiter) waiter(fresh);
        else this.free.push(fresh);
      } catch (err) {
        console.error(`[pool] failed to recycle box ${box.id}:`, err);
      }
    })();
  }

  freeCount(): number {
    return this.free.length;
  }

  async close(): Promise<void> {
    this.closed = true;
    await Promise.all(this.boxIds.map((id) => cleanupBox(id)));
  }
}
