import { highlightSegments } from "@/components/warung/VoiceDraftCard";

/**
 * Kalimat pemilik dengan kata-bukti ditandai. Sorotan hanya dipasang bila
 * teks yang tampil persis teks yang dibaca parser -- letak huruf yang
 * bergeser akan menandai kata yang salah, dan itu lebih buruk daripada tanpa
 * sorotan sama sekali.
 */
export function CaptionWithEvidence({ text, evidence }: {
  text: string;
  evidence: { text: string; spans: Array<[number, number]> } | null;
}) {
  const shown = text.trim();
  const segments = evidence && evidence.text === shown && evidence.spans.length > 0
    ? highlightSegments(shown, evidence.spans)
    : [{ text: shown, highlighted: false }];
  return (
    <p className="text-sm font-medium leading-relaxed text-umkm-ink">
      &quot;
      {segments.map((segment, index) =>
        segment.highlighted
          ? <mark key={index} className="rounded bg-umkm-warning-soft px-0.5 font-bold text-umkm-ink">{segment.text}</mark>
          : <span key={index}>{segment.text}</span>,
      )}
      &quot;
    </p>
  );
}
