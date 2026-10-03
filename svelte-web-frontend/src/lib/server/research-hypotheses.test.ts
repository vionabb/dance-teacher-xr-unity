import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { getHypothesis, hypothesisOverview, resolveHypotheses } from './research-hypotheses';
import {
	HYPOTHESIS_COLLECTION_SLUG,
	readHypothesisCatalog,
	readHypothesisCollectionState,
	readHypothesisState,
	recordHypothesisCollectionTurn,
	recordHypothesisTurn
} from './research-store';

test('hypothesis overview reads the lab log and local status and findings retain an event trail', async () => {
	const hypothesis = getHypothesis('landmark-error-signals');
	expect(hypothesis).toBeDefined();
	const overview = await hypothesisOverview(hypothesis!);
	expect(overview.paragraphs.join(' ')).toContain('limb occlusion');
	expect(overview.markdown).toContain('corrections occurred at visibility 0.95');
	const folder = await mkdtemp(path.join(os.tmpdir(), 'research-hypothesis-'));
	try {
		const databasePath = path.join(folder, 'research.sqlite3');
		const receipt = await recordHypothesisTurn(databasePath, {
			slug: hypothesis!.slug,
			userMessage: 'Mark this investigating and save a finding.',
			assistantReply: 'I marked it investigating and saved the observation with its limit.',
			status: 'investigating',
			finding:
				'Visibility alone misses some corrected landmarks in the selected sample; unmarked pairs are not verified negatives.'
		});
		expect(receipt.backupError).toBeNull();
		expect((await readFile(receipt.snapshotPath!)).length).toBeGreaterThan(0);
		const state = await readHypothesisState(databasePath, hypothesis!.slug);
		expect(state.events.map((event) => [event.kind, event.value])).toEqual([
			['status', 'investigating'],
			[
				'finding',
				'Visibility alone misses some corrected landmarks in the selected sample; unmarked pairs are not verified negatives.'
			]
		]);
		expect(state.messages.map((message) => message.role)).toEqual(['assistant', 'user']);
	} finally {
		await rm(folder, { recursive: true, force: true });
	}
});

test('collection chat can create, rename, move status, remove, and restore without losing history', async () => {
	const folder = await mkdtemp(path.join(os.tmpdir(), 'research-hypothesis-catalog-'));
	try {
		const databasePath = path.join(folder, 'research.sqlite3');
		const created = await recordHypothesisCollectionTurn(databasePath, {
			userMessage: 'Add a hypothesis about feedback timing.',
			assistantReply: 'Added it as a candidate.',
			create: {
				title: 'Feedback timing',
				question: 'Does feedback timing affect practice decisions?',
				overview: 'Draft question from the collection conversation. No result has been established.'
			},
			changes: []
		});
		expect(created).toMatchObject({ createdSlug: 'feedback-timing', backupError: null });
		expect((await readFile(created.snapshotPath!)).length).toBeGreaterThan(0);
		await recordHypothesisCollectionTurn(databasePath, {
			userMessage: 'Rename it, mark it investigating, and remove it from the index.',
			assistantReply: 'Renamed, marked investigating, and removed it from the index.',
			create: null,
			changes: [
				{ slug: 'feedback-timing', kind: 'rename', value: 'Timing of coaching feedback' },
				{ slug: 'feedback-timing', kind: 'status', value: 'investigating' },
				{ slug: 'feedback-timing', kind: 'remove', value: null }
			]
		});
		const hidden = getHypothesis(
			'feedback-timing',
			resolveHypotheses(await readHypothesisCatalog(databasePath))
		);
		expect(hidden).toMatchObject({
			title: 'Timing of coaching feedback',
			hidden: true
		});
		expect((await hypothesisOverview(hidden!)).paragraphs[0]).toContain('No result');
		expect(
			(await readHypothesisState(databasePath, 'feedback-timing')).events.map(
				(event) => event.value
			)
		).toEqual(['candidate', 'investigating']);
		await recordHypothesisCollectionTurn(databasePath, {
			userMessage: 'Restore it.',
			assistantReply: 'Restored it.',
			create: null,
			changes: [{ slug: 'feedback-timing', kind: 'restore', value: null }]
		});
		expect(
			getHypothesis('feedback-timing', resolveHypotheses(await readHypothesisCatalog(databasePath)))
		).toMatchObject({ hidden: false, title: 'Timing of coaching feedback' });
		expect(
			(await readHypothesisState(databasePath, HYPOTHESIS_COLLECTION_SLUG)).messages
		).toHaveLength(6);
		expect((await readHypothesisCollectionState(databasePath)).messages).toHaveLength(6);
	} finally {
		await rm(folder, { recursive: true, force: true });
	}
});
