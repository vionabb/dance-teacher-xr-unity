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
			expectedRevision: (await readHypothesisCollectionState(databasePath)).revision,
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
			expectedRevision: (await readHypothesisCollectionState(databasePath)).revision,
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
			expectedRevision: (await readHypothesisCollectionState(databasePath)).revision,
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

test('Unicode titles get usable URLs and duplicate creation preserves the conversation', async () => {
	const folder = await mkdtemp(path.join(os.tmpdir(), 'research-hypothesis-unicode-'));
	try {
		const databasePath = path.join(folder, 'research.sqlite3');
		const turn = {
			userMessage: 'Add a hypothesis about hand tracking.',
			assistantReply: 'Added a candidate.',
			changes: [],
			create: {
				title: '手部追踪问题',
				question: 'Does hand tracking fail during rapid movement?',
				overview: 'Draft question about hand tracking. No finding has been established.'
			}
		};
		const first = await recordHypothesisCollectionTurn(databasePath, {
			...turn,
			expectedRevision: (await readHypothesisCollectionState(databasePath)).revision
		});
		expect(first.createdSlug).toMatch(/^hypothesis-[a-f0-9]{12}$/);
		expect(
			getHypothesis(
				first.createdSlug!,
				resolveHypotheses(await readHypothesisCatalog(databasePath))
			)?.title
		).toBe('手部追踪问题');
		const duplicate = await recordHypothesisCollectionTurn(databasePath, {
			...turn,
			expectedRevision: (await readHypothesisCollectionState(databasePath)).revision
		});
		expect(duplicate).toMatchObject({
			createdSlug: null,
			rejectionReason: 'duplicate',
			backupError: null
		});
		const state = await readHypothesisCollectionState(databasePath);
		expect(state.definitions).toHaveLength(1);
		expect(state.messages).toHaveLength(4);
		expect(state.messages[0].content).toContain('URL name already exists');
		for (const title of [
			'Confidence aware coaching',
			'Évaluation du geste',
			'Évaluation-du-geste'
		]) {
			await recordHypothesisCollectionTurn(databasePath, {
				...turn,
				create: { ...turn.create, title },
				expectedRevision: (await readHypothesisCollectionState(databasePath)).revision
			});
		}
		const after = await readHypothesisCollectionState(databasePath);
		expect(after.definitions.map((item) => item.slug)).toContain('evaluation-du-geste');
		expect(after.definitions).toHaveLength(2);
	} finally {
		await rm(folder, { recursive: true, force: true });
	}
});

test('concurrent collection responses cannot reverse a newer change', async () => {
	const folder = await mkdtemp(path.join(os.tmpdir(), 'research-hypothesis-concurrent-'));
	try {
		const databasePath = path.join(folder, 'research.sqlite3');
		const { revision } = await readHypothesisCollectionState(databasePath);
		const input = {
			expectedRevision: revision,
			userMessage: 'Manage tracking risk.',
			assistantReply: 'Changed it.',
			create: null
		};
		const receipts = await Promise.all([
			recordHypothesisCollectionTurn(databasePath, {
				...input,
				changes: [{ slug: 'segment-tracking-risk', kind: 'remove', value: null }]
			}),
			recordHypothesisCollectionTurn(databasePath, {
				...input,
				changes: [
					{ slug: 'segment-tracking-risk', kind: 'rename', value: 'Segment tracking risks' }
				]
			})
		]);
		expect(receipts.map((item) => item.rejectionReason).sort()).toEqual([null, 'stale']);
		const state = await readHypothesisCollectionState(databasePath);
		expect(state.metadata).toHaveLength(1);
		expect(state.messages).toHaveLength(4);
		expect(
			state.messages.some((item) => item.content.includes('changed while I was responding'))
		).toBe(true);
		const retry = await recordHypothesisCollectionTurn(databasePath, {
			...input,
			changes: [{ slug: 'segment-tracking-risk', kind: 'restore', value: null }]
		});
		expect(retry.rejectionReason).toBe('stale');
		expect((await readHypothesisCollectionState(databasePath)).metadata).toHaveLength(1);
	} finally {
		await rm(folder, { recursive: true, force: true });
	}
});

test('detail discussion does not invalidate a collection request, but detail state changes do', async () => {
	const folder = await mkdtemp(path.join(os.tmpdir(), 'research-hypothesis-revision-'));
	try {
		const databasePath = path.join(folder, 'research.sqlite3');
		const { revision } = await readHypothesisCollectionState(databasePath);
		const detail = {
			slug: 'segment-tracking-risk',
			userMessage: 'Discuss this.',
			assistantReply: 'This is a candidate.',
			status: null,
			finding: null
		};
		await recordHypothesisTurn(databasePath, detail);
		const collection = {
			expectedRevision: revision,
			userMessage: 'Remove segment-tracking-risk.',
			assistantReply: 'Removed it.',
			create: null,
			changes: [{ slug: 'segment-tracking-risk', kind: 'remove' as const, value: null }]
		};
		expect(
			(await recordHypothesisCollectionTurn(databasePath, collection)).rejectionReason
		).toBeNull();
		const next = await readHypothesisCollectionState(databasePath);
		await recordHypothesisTurn(databasePath, { ...detail, status: 'investigating' });
		expect(
			(
				await recordHypothesisCollectionTurn(databasePath, {
					...collection,
					expectedRevision: next.revision,
					changes: [{ slug: 'segment-tracking-risk', kind: 'restore', value: null }]
				})
			).rejectionReason
		).toBe('stale');
	} finally {
		await rm(folder, { recursive: true, force: true });
	}
});
