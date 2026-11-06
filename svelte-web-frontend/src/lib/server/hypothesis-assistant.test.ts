import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { afterEach, expect, test, vi } from 'vitest';
import { askHypothesisAssistant, askHypothesisCollectionAssistant } from './hypothesis-assistant';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
afterEach(() => vi.mocked(spawn).mockReset());

const input = {
	title: 'Tracking risk',
	question: 'Does tracking risk recur?',
	sourceMarkdown: '',
	currentStatus: 'candidate' as const,
	history: [],
	message: 'Discuss tracking risk.'
};

function mockCodexResponse(response: unknown) {
	const child = Object.assign(new EventEmitter(), {
		stderr: new EventEmitter(),
		stdin: Object.assign(new EventEmitter(), { end: vi.fn() }),
		kill: vi.fn()
	});
	child.stdin.end.mockImplementation(() => {
		const args = vi.mocked(spawn).mock.calls[0][1] as string[];
		void writeFile(args[args.indexOf('--output-last-message') + 1], JSON.stringify(response))
			.then(() => child.emit('close', 0))
			.catch((error) => child.emit('error', error));
	});
	vi.mocked(spawn).mockReturnValue(child as never);
}

test('the detail assistant suppresses a model finding in response to a negated request', async () => {
	mockCodexResponse({ reply: 'Saved it.', status: null, finding: 'Unrequested finding.' });
	const response = await askHypothesisAssistant({ ...input, message: "Don't save a finding yet" });
	expect(response).toMatchObject({ status: null, finding: null });
	expect(response.reply).toContain('I did not change');
});

test('the collection assistant suppresses a model action on an overlapping shorter title', async () => {
	mockCodexResponse({
		reply: 'Removed it.',
		create: null,
		changes: [{ slug: 'confidence-aware-coaching', kind: 'remove', value: null }]
	});
	const response = await askHypothesisCollectionAssistant({
		catalog: [
			{
				slug: 'confidence-aware-coaching',
				title: 'Confidence-aware coaching',
				question: '',
				status: 'candidate',
				hidden: false
			},
			{
				slug: 'coaching-plan',
				title: 'Confidence-aware coaching plan',
				question: '',
				status: 'candidate',
				hidden: false
			}
		],
		history: [],
		message: 'Remove Confidence-aware coaching plan'
	});
	expect(response.changes).toEqual([]);
	expect(response.reply).toContain('I did not change');
});

test.each(['stdin', 'spawn'])(
	'a %s failure rejects the local assistant call without an unhandled EPIPE',
	async (failure) => {
		const child = Object.assign(new EventEmitter(), {
			stderr: new EventEmitter(),
			stdin: Object.assign(new EventEmitter(), { end: vi.fn() }),
			kill: vi.fn()
		});
		child.stdin.end.mockImplementation(() => {
			queueMicrotask(() => {
				if (failure === 'spawn') child.emit('error', new Error('spawn codex ENOENT'));
				child.stdin.emit('error', new Error('write EPIPE'));
			});
		});
		vi.mocked(spawn).mockReturnValue(child as never);
		await expect(askHypothesisAssistant(input)).rejects.toThrow(
			failure === 'spawn' ? 'ENOENT' : 'EPIPE'
		);
		expect(child.stdin.listenerCount('error')).toBe(1);
	}
);
