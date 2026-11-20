/**
 * Readable labels for CHI25 recording stems such as
 * `user4751____performance____userstudy1--last-christmas--control____workflowid-…____clip1`
 * (Study 1) or `user3609________userstudy2-madatdisney-emoji____workflowid-…____clip1`
 * (Study 2). Display only: identity matching stays on the raw stem.
 */
const DANCES: Record<string, string> = {
	bartender: 'Bartender',
	'last-christmas': 'Last Christmas',
	lastchristmas: 'Last Christmas',
	'mad-at-disney': 'Mad at Disney',
	madatdisney: 'Mad at Disney',
	pajamaparty: 'Pajama Party',
	'pajama-party': 'Pajama Party'
};

export type StemLabel = { participant: string; dance: string; condition: string; clip: string };

export function parseRecordingStem(stem: string): StemLabel | null {
	const parts = stem.split('____').filter(Boolean);
	const participant = parts.find((part) => /^user/.test(part) && !part.startsWith('userstudy'));
	const study = parts.find((part) => part.startsWith('userstudy'));
	const clip = parts.at(-1)?.match(/^clip(\d+)$/)?.[1];
	if (!participant || !study || !clip) return null;
	const words = study.replace(/^userstudy\d-+/, '');
	const danceKey = Object.keys(DANCES)
		.sort((a, b) => b.length - a.length)
		.find((key) => words.startsWith(key));
	if (!danceKey) return null;
	return {
		participant: participant === 'useruseridmissing' ? 'Unknown participant' : participant,
		dance: DANCES[danceKey],
		condition: words.slice(danceKey.length).replace(/^-+/, '') || 'unknown',
		clip
	};
}

export function recordingTitle(stem: string): string {
	const label = parseRecordingStem(stem);
	return label
		? `${label.participant} · ${label.dance} · ${label.condition} · clip ${label.clip}`
		: stem;
}
