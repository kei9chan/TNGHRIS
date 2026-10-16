// NTE details are the recipient-specific allegations, not the full legal notice.
// Keep an extract of that source text; never infer an offense or a penalty.
export function getNTEAllegationPreview(details?: string | null) {
  const fullText = (details || '').replace(/\s+/g, ' ').trim();
  const limit = 480;
  if (fullText.length <= limit) return { fullText, preview: fullText, truncated: false };
  const boundary = fullText.lastIndexOf(' ', limit);
  const end = boundary > limit * 0.7 ? boundary : limit;
  return { fullText, preview: `${fullText.slice(0, end).trimEnd()}…`, truncated: true };
}
