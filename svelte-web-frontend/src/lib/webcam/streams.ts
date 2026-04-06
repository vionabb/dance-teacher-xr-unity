import { writable, derived } from 'svelte/store';

export const webcamStream = writable(null as null | MediaStream);
export const webcamStreamId = derived(webcamStream, ($webcamStream) => {
	if (!$webcamStream) {
		return 'null';
	}
	return $webcamStream.id;
});
