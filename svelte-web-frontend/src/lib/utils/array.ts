export function SwapArrayElements(arr: Array<any>, i: number, j: number) {
	let temp = arr[i];
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
