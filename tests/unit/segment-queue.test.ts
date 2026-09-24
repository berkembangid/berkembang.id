import { describe, expect, it } from "vitest";
import { createSegmentQueue } from "@/app/(umkm)/umkm/catat/_lib/segment-queue";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("antrean potongan ucapan", () => {
  it("paling banyak dua berjalan bersamaan, urutan mulai dijaga", async () => {
    const started: number[] = [];
    let running = 0;
    let peak = 0;
    const release: Array<() => void> = [];
    const queue = createSegmentQueue<number>(async (job) => {
      started.push(job);
      running += 1;
      peak = Math.max(peak, running);
      await new Promise<void>((resolve) => release.push(resolve));
      running -= 1;
    }, 2);

    [1, 2, 3, 4, 5].forEach((job) => queue.push(job));
    await tick();
    expect(started).toEqual([1, 2]);
    expect(queue.waiting).toBe(3);

    while (release.length) {
      release.shift()!();
      await tick();
      await tick();
    }
    await queue.idle();
    expect(started).toEqual([1, 2, 3, 4, 5]);
    expect(peak).toBe(2);
  });

  it("satu potongan gagal tidak menghentikan yang lain", async () => {
    const done: number[] = [];
    const queue = createSegmentQueue<number>(async (job) => {
      if (job === 2) throw new Error("gagal");
      done.push(job);
    }, 1);
    [1, 2, 3].forEach((job) => queue.push(job));
    await queue.idle();
    expect(done).toEqual([1, 3]);
  });
});
