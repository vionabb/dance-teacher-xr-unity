/**
 * Display-only styling for the "Focus on videos" skeleton: each scored body segment gets
 * thicker and redder as its per-vector error grows. Level 0 = matches the reference, 1 = at or
 * beyond the saturation error (roughly a 90° direction error for both metrics).
 */
export const QIJIA_EDGE_SATURATION = Math.SQRT2; // |unit difference| at 90°
export const VIONA_EDGE_SATURATION = 0.5; // angle error 90° / 180°

export function edgeErrorLevel(error: number | null | undefined, saturation: number) {
	if (error === null || error === undefined || !Number.isFinite(error) || saturation <= 0)
		return null;
	return Math.max(0, Math.min(1, error / saturation));
}

/** Slate-white at 0 to red-600 at 1; width in screen pixels. */
export function edgeErrorStyle(level: number) {
	const mix = (from: number, to: number) => Math.round(from + (to - from) * level);
	return {
		color: `rgb(${mix(226, 220)}, ${mix(232, 38)}, ${mix(240, 38)})`,
		width: 2 + 8 * level
	};
}
