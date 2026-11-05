/**
 * Parse a single HTTP Range header (RFC 9110) against a file size.
 * Returns null when there is no usable range (serve the whole file),
 * "unsatisfiable" for a 416, or inclusive start/end byte offsets.
 */
export function parseRange(header: string | null, size: number): null | "unsatisfiable" | { start: number; end: number } {
  if (!header) return null;
  const m = header.trim().match(/^bytes=(\d*)-(\d*)$/); // multi-range ("0-1,5-9") is not supported -> whole file
  if (!m || (m[1] === "" && m[2] === "")) return null;
  if (size === 0) return "unsatisfiable";
  if (m[1] === "") {
    // Suffix range: the last N bytes.
    const n = Number(m[2]);
    if (n === 0) return "unsatisfiable";
    return { start: Math.max(0, size - n), end: size - 1 };
  }
  const start = Number(m[1]);
  const end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  if (start >= size || end < start) return "unsatisfiable";
  return { start, end };
}
