export type InspectedMetric = 'qijia2d' | 'viona2d';

const STORAGE_KEY = 'motion-metric-inspector:last-metric';

export function getLastMetric(): InspectedMetric {
	if (typeof localStorage === 'undefined') return 'qijia2d';
	const saved = localStorage.getItem(STORAGE_KEY);
	return saved === 'viona2d' ? 'viona2d' : 'qijia2d';
}

export function setLastMetric(metric: InspectedMetric) {
	if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, metric);
}
