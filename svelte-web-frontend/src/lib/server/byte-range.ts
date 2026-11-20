/** Parses a single HTTP byte range against a file size; null when unsatisfiable. */
export function parseByteRange(
	header: string | null,
	size: number
): { start: number; end: number } | null {
	if (!header) return null;
	if (!Number.isSafeInteger(size) || size <= 0) return null;
	const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
	if (!match || (!match[1] && !match[2])) return null;
	let start: number;
	let end: number;
	if (!match[1]) {
		const suffix = Number(match[2]);
		if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
		start = Math.max(size - suffix, 0);
		end = size - 1;
	} else {
		start = Number(match[1]);
		end = match[2] ? Number(match[2]) : size - 1;
		if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size)
			return null;
		end = Math.min(end, size - 1);
	}
	return { start, end };
}
