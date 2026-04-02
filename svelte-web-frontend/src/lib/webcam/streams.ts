import { readable, writable, derived } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';

export const webcamStream = writable(null as null | MediaStream);
export const webcamStreamId = derived(webcamStream, ($webcamStream) => {
	if (!$webcamStream) {
		return 'null';
	}
	return $webcamStream.id;
});
