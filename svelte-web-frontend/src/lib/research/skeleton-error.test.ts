import { describe, expect, it } from 'vitest';
import { edgeErrorLevel, edgeErrorStyle, QIJIA_EDGE_SATURATION } from './skeleton-error';

describe('skeleton error styling', () => {
	it('maps error to a clamped 0–1 level and skips unknown errors', () => {
		expect(edgeErrorLevel(0, QIJIA_EDGE_SATURATION)).toBe(0);
		expect(edgeErrorLevel(QIJIA_EDGE_SATURATION / 2, QIJIA_EDGE_SATURATION)).toBeCloseTo(0.5);
		expect(edgeErrorLevel(2, QIJIA_EDGE_SATURATION)).toBe(1);
		expect(edgeErrorLevel(null, 1)).toBeNull();
	});
	it('gets thicker and redder with the level', () => {
		expect(edgeErrorStyle(0)).toEqual({ color: 'rgb(226, 232, 240)', width: 2 });
		expect(edgeErrorStyle(1)).toEqual({ color: 'rgb(220, 38, 38)', width: 10 });
	});
});
