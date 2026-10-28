import { describe, expect, it } from 'vitest';
import {
	discrepancyDraftKey,
	prepareObservationMutation,
	readPendingObservation,
	researchApiPrefix
} from './discrepancy-client';

describe('hosted discrepancy transport and draft boundary', () => {
	it('keeps legacy local paths and draft keys separate from authenticated hosted data', () => {
		expect(researchApiPrefix('local')).toBe('/api/dev');
		expect(researchApiPrefix('hosted')).toBe('/api/research');
		expect(discrepancyDraftKey('local', 'segment', {})).toBe(
			'research-discrepancy-draft-v1:segment'
		);
		const scope = { ownerId: 'account-a', inputVersion: 'input-1' };
		const key = discrepancyDraftKey('hosted', 'study-segment', scope);
		expect(key).not.toBe(
			discrepancyDraftKey('hosted', 'study-segment', { ...scope, ownerId: 'account-b' })
		);
		expect(key).not.toBe(discrepancyDraftKey('hosted', 'other-study-segment', scope));
		expect(key).not.toBe(
			discrepancyDraftKey('hosted', 'study-segment', { ...scope, inputVersion: 'input-2' })
		);
		expect(discrepancyDraftKey('hosted', 'segment', {})).toBeNull();
		expect(discrepancyDraftKey('hosted', 'segment', { ownerId: 'a' })).toBeNull();
		expect(discrepancyDraftKey('hosted', 'c', { ownerId: 'a:b', inputVersion: 'd' })).not.toBe(
			discrepancyDraftKey('hosted', 'b:c', { ownerId: 'a', inputVersion: 'd' })
		);
	});
	it('retains a lost-response retry identity, including after restoring from browser storage', () => {
		const id = '8fe551f9-feb4-47c4-b2e0-1b8de94084ed';
		const request = prepareObservationMutation('{"note":"same"}', null, () => id);
		const restored = readPendingObservation(JSON.parse(JSON.stringify(request)));
		expect(prepareObservationMutation(request.payload, restored, () => 'new')).toEqual(request);
		expect(prepareObservationMutation('{"note":"changed"}', restored, () => 'new').mutationId).toBe(
			'new'
		);
		expect(
			prepareObservationMutation(request.payload, null, () => 'after-success').mutationId
		).toBe('after-success');
		expect(readPendingObservation({ mutationId: 'invalid', payload: '{}' })).toBeNull();
	});
});
