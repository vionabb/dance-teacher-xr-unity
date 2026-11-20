import { describe, expect, it } from 'vitest';
import { linkHumanRatings } from './chi25-analysis-contract.js';

describe('rating links ignore the condition label', () => {
	const rating = (participant: string, segment: string, extra = {}) => ({
		study: 'chi25_study2',
		dance: 'bartender',
		participant_id: participant,
		source_segment: segment,
		condition: 'control',
		segment_eligible: true,
		...extra
	});
	const recording = (participant: number, clip: number, dance = 'bartender') => ({
		study: 'chi25_study2',
		dance,
		participantId: participant,
		clipNumber: clip
	});

	it('links a rating whose condition label differs from the recording', () => {
		const rec = recording(42, 2);
		const links = linkHumanRatings([rec], [rating('42', '2', { condition: 'emoji' })]);
		expect(links.get(rec)?.participant_id).toBe('42');
	});

	it('skips ineligible ratings and keys shared by two ratings or two recordings', () => {
		const twoRecordings = [recording(1, 2), recording(1, 2)];
		const single = recording(2, 2);
		const ineligible = recording(3, 2);
		const links = linkHumanRatings(
			[...twoRecordings, single, ineligible],
			[
				rating('1', '2'),
				rating('2', '2'),
				rating('2', '2', { condition: 'emoji' }),
				rating('3', '2', { segment_eligible: false })
			]
		);
		expect(links.size).toBe(0);
	});

	it('withholds the single-rater Study 2 last-christmas segment 1', () => {
		const rec = recording(42, 1, 'last-christmas');
		const links = linkHumanRatings([rec], [rating('42', '1', { dance: 'last-christmas' })]);
		expect(links.size).toBe(0);
	});
});
