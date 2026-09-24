/**
 * Antrean latar untuk potongan ucapan mode terus-menerus.
 *
 * Setiap potongan menjadi satu capture yang dibaca di server (rute `process`
 * menunggu sampai 60 detik). Paling banyak `concurrency` potongan dikirim
 * bersamaan: cukup supaya hasil tidak tertinggal jauh dari ucapan, tanpa
 * membanjiri penyedia AI dan sinyal ponsel yang sedang dipakai berjualan.
 *
 * Modul murni: pekerjaannya disuntikkan, jadi urutan dan batasnya bisa diuji.
 */
export type SegmentQueue<T> = {
  push: (job: T) => void;
  readonly active: number;
  readonly waiting: number;
  /** Selesai ketika antrean kosong dan tidak ada yang berjalan. */
  idle: () => Promise<void>;
};

export function createSegmentQueue<T>(run: (job: T) => Promise<void>, concurrency = 2): SegmentQueue<T> {
  const waiting: T[] = [];
  let active = 0;
  let idleResolvers: Array<() => void> = [];

  const settleIdle = () => {
    if (active === 0 && waiting.length === 0) {
      const resolvers = idleResolvers;
      idleResolvers = [];
      for (const resolve of resolvers) resolve();
    }
  };

  const pump = () => {
    while (active < concurrency && waiting.length > 0) {
      const job = waiting.shift() as T;
      active += 1;
      // Kegagalan satu potongan tidak boleh menghentikan antrean; `run`
      // sendiri yang mencatat statusnya.
      void run(job)
        .catch(() => undefined)
        .finally(() => {
          active -= 1;
          pump();
          settleIdle();
        });
    }
  };

  return {
    push(job) {
      waiting.push(job);
      pump();
    },
    get active() { return active; },
    get waiting() { return waiting.length; },
    idle() {
      if (active === 0 && waiting.length === 0) return Promise.resolve();
      return new Promise<void>((resolve) => { idleResolvers.push(resolve); });
    },
  };
}
