export function SwapArrayElements<T>(arr: Array<T>, i: number, j: number) {
	const temp = arr[i];
	arr[i] = arr[j];
	arr[j] = temp;
}

export function SwapMultipleArrayElements<T>(
	arr: Array<T>,
	indicesToSwap: Array<[number, number]>
) {
	for (const [i, j] of indicesToSwap) {
		SwapArrayElements(arr, i, j);
	}
}
