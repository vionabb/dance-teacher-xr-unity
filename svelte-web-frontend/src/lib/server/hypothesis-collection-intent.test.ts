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
