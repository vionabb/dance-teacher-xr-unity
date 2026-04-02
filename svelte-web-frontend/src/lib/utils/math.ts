export function lerp(
	val: number,
	srcMin: number,
	srcMax: number,
	destMin: number,
	destMax: number,
	limit = false
) {
	const srcRange = srcMax - srcMin;
	const destRange = destMax - destMin;
	let mappedValue = destMin + destRange * ((val - srcMin) / srcRange);
	if (limit) {
		mappedValue = Math.min(Math.max(mappedValue, destMin), destMax);
	}
	return mappedValue;
}
