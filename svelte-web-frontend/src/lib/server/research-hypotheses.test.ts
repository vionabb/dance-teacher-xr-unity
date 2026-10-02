import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { getHypothesis, hypothesisOverview } from './research-hypotheses';
import { readHypothesisState, recordHypothesisTurn } from './research-store';

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
