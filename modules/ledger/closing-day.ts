/**
 * Hari mana yang sebenarnya sedang ditutup pemiliknya.
 *
 * Warung tidak tutup tepat tengah malam. Pemilik yang membereskan laci pukul
 * satu dini hari sedang menutup dagangan KEMARIN, bukan hari yang baru dua jam
 * berjalan. Kalau aplikasi menawarkan "tutup kas hari ini" pada jam itu, ia
 * menawarkan menutup hari yang belum ada isinya — dan hari kemarin yang penuh
 * transaksi justru tidak pernah tertutup.
 *
 * Batasnya pukul 04.00 waktu Jakarta. Sebelum itu, yang ditawarkan hari
 * sebelumnya; sejak pukul 04.00, hari berjalan.
 *
 * Modul murni: tanpa jaringan, tanpa basis data, dan waktunya selalu disuntik
 * sehingga batas 03.59/04.00 bisa diuji tanpa menunggu dini hari.
 */

/** Jam ketika hari dagang dianggap benar-benar berganti. */
export const businessDayStartHour = 4;

type JakartaMoment = { date: string; hour: number };

/** Tanggal dan jam di zona Asia/Jakarta, apa pun zona server. */
export function jakartaMoment(now: Date): JakartaMoment {
  const date = now.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  const hour = Number(
    now.toLocaleString("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", hour12: false }),
  );
  return { date, hour };
}

function shiftDays(isoDate: string, days: number): string {
  const base = new Date(`${isoDate}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/**
 * Tanggal yang ditawarkan tombol dan pengingat tutup kas.
 *
 * Sebelum pukul 04.00 Jakarta: kemarin. Sejak 04.00: hari ini.
 */
export function closingTargetDate(now: Date): string {
  const moment = jakartaMoment(now);
  return moment.hour < businessDayStartHour ? shiftDays(moment.date, -1) : moment.date;
}

/** Benar bila yang ditawarkan adalah hari kemarin, bukan hari berjalan. */
export function isClosingPreviousDay(now: Date): boolean {
  return jakartaMoment(now).hour < businessDayStartHour;
}

/**
 * Kalimat ajakan, menyebut tanggalnya supaya tidak ada salah paham soal hari
 * mana yang sedang ditutup.
 */
export function closingPromptText(now: Date): string {
  const target = closingTargetDate(now);
  const label = new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    timeZone: "Asia/Jakarta",
  }).format(new Date(`${target}T12:00:00+07:00`));
  return isClosingPreviousDay(now)
    ? `Tutup kas ${label}, dagangan kemarin`
    : `Tutup kas ${label}`;
}
