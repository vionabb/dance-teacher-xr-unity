import { describe, expect, it } from 'vitest';
import { authorizeCollectionOperations } from './hypothesis-collection-intent';

const catalog = [
	{ slug: 'segment-tracking-risk', title: 'Recurring tracking risk by segment' },
	{ slug: 'confidence-aware-coaching', title: 'Confidence-aware coaching' }
];
const create = {
	title: 'Feedback timing',
	question: 'Does feedback timing affect practice outcomes?',
	overview: 'Draft question supplied by the researcher.'
};

describe('collection intent authorization', () => {
	it('short commands distinguish overlapping and duplicate titles', () => {
		const overlapping = [
			...catalog,
			{ slug: 'coaching-plan', title: 'Confidence-aware coaching plan' },
			{ slug: 'coaching-comma-plan', title: 'Confidence-aware coaching, a plan' }
		];
		for (const [verb, kind, value] of [
			['remove', 'remove', null],
			['restore', 'restore', null],
			['archive', 'status', 'archived'],
			['resolve', 'status', 'resolved']
		] as const) {
			for (const title of ['Confidence-aware coaching plan', 'Confidence-aware coaching, a plan']) {
				expect(
					authorizeCollectionOperations({
						message: `${verb} ${title}`,
						catalog: overlapping,
						create: null,
						changes: [{ slug: 'confidence-aware-coaching', kind, value }]
					}).suppressed
				).toBe(true);
			}
			expect(
				authorizeCollectionOperations({
					message: `${verb} Confidence-aware coaching plan`,
					catalog: overlapping,
					create: null,
					changes: [{ slug: 'coaching-plan', kind, value }]
				}).suppressed
			).toBe(false);
		}
		const duplicate = [
			...catalog,
			{ slug: 'another-coaching', title: 'Confidence-aware coaching' }
		];
		expect(
			authorizeCollectionOperations({
				message: 'Remove Confidence-aware coaching',
				catalog: duplicate,
				create: null,
				changes: [{ slug: 'confidence-aware-coaching', kind: 'remove', value: null }]
			}).suppressed
		).toBe(true);
		expect(
			authorizeCollectionOperations({
				message: 'Remove confidence-aware-coaching',
				catalog: duplicate,
				create: null,
				changes: [{ slug: 'confidence-aware-coaching', kind: 'remove', value: null }]
			}).suppressed
		).toBe(false);
	});

	it('a proposed shortened rename value cannot replace the full requested title', () => {
		expect(
			authorizeCollectionOperations({
				message: 'Rename segment-tracking-risk to Tracking risk plan.',
				catalog,
				create: null,
				changes: [{ slug: 'segment-tracking-risk', kind: 'rename', value: 'Tracking risk' }]
			}).suppressed
		).toBe(true);
	});

	it('explicit separate commands can manage multiple targets in one turn', () => {
		const changes = [
			{ slug: 'confidence-aware-coaching', kind: 'remove' as const, value: null },
			{ slug: 'segment-tracking-risk', kind: 'status' as const, value: 'investigating' }
		];
		expect(
			authorizeCollectionOperations({
				message:
					'Remove confidence-aware-coaching and mark segment-tracking-risk as investigating.',
				catalog,
				create: null,
				changes
			})
		).toEqual({ create: null, changes, suppressed: false });
	});
	it('accepts an explicit named status request', () => {
		const changes = [{ slug: catalog[0].slug, kind: 'status' as const, value: 'investigating' }];
		expect(
			authorizeCollectionOperations({
				message: 'Please mark Recurring tracking risk by segment as investigating.',
				catalog,
				create: null,
				changes
			})
		).toEqual({ create: null, changes, suppressed: false });
	});

	it('accepts explicit rename, remove, restore, and creation', () => {
		const cases = [
			{
				message: 'Rename segment-tracking-risk to Segment-specific tracking risk.',
				change: {
					slug: catalog[0].slug,
					kind: 'rename' as const,
					value: 'Segment-specific tracking risk'
				}
			},
			{
				message: 'Delete confidence-aware-coaching.',
				change: { slug: catalog[1].slug, kind: 'remove' as const, value: null }
			},
			{
				message: 'Restore confidence-aware-coaching.',
				change: { slug: catalog[1].slug, kind: 'restore' as const, value: null }
			}
		];
		for (const { message, change } of cases) {
			expect(
				authorizeCollectionOperations({ message, catalog, create: null, changes: [change] })
			).toEqual({ create: null, changes: [change], suppressed: false });
		}
		expect(
			authorizeCollectionOperations({
				message: 'Add a hypothesis about feedback timing and practice outcomes.',
				catalog,
				create,
				changes: []
			})
		).toEqual({ create, changes: [], suppressed: false });
	});

	it('suppresses hypothetical and explanatory messages', () => {
		for (const message of [
			'What does candidate status mean for segment-tracking-risk?',
			'What happens if I delete confidence-aware-coaching?',
			'How would I rename segment-tracking-risk to Segment-specific tracking risk?'
		]) {
			const changes = [{ slug: catalog[0].slug, kind: 'status' as const, value: 'candidate' }];
			expect(
				authorizeCollectionOperations({ message, catalog, create: null, changes }).suppressed
			).toBe(true);
		}
	});

	it('does not treat negation or a request for instructions as a command', () => {
		const change = { slug: catalog[1].slug, kind: 'remove' as const, value: null };
		for (const message of [
			'Please do not delete confidence-aware-coaching.',
			'I do not want to delete confidence-aware-coaching.',
			'Can you explain how to delete confidence-aware-coaching?'
		]) {
			expect(
				authorizeCollectionOperations({
					message,
					catalog,
					create: null,
					changes: [change]
				}).suppressed
			).toBe(true);
		}
	});

	it('rejects changes to another hypothesis or a different status', () => {
		for (const change of [
			{ slug: catalog[1].slug, kind: 'status' as const, value: 'investigating' },
			{ slug: catalog[0].slug, kind: 'status' as const, value: 'resolved' }
		]) {
			expect(
				authorizeCollectionOperations({
					message: 'Mark Recurring tracking risk by segment as investigating.',
					catalog,
					create: null,
					changes: [change]
				}).suppressed
			).toBe(true);
		}
	});

	it('applies no part of a mixed response if any action is unauthorized', () => {
		const changes = [
			{ slug: catalog[0].slug, kind: 'status' as const, value: 'investigating' },
			{ slug: catalog[1].slug, kind: 'remove' as const, value: null }
		];
		expect(
			authorizeCollectionOperations({
				message: 'Mark Recurring tracking risk by segment as investigating.',
				catalog,
				create,
				changes
			})
		).toEqual({ create: null, changes: [], suppressed: true });
	});
});
