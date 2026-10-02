import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HYPOTHESIS_STATUSES, type HypothesisStatus } from './research-hypotheses';
import type { HypothesisChatMessage } from './research-store';

const schemaPath = fileURLToPath(
	new URL('./hypothesis-assistant-output.schema.json', import.meta.url)
);

export async function askHypothesisAssistant(input: {
	title: string;
	question: string;
	sourceMarkdown: string;
	currentStatus: HypothesisStatus;
	history: HypothesisChatMessage[];
	message: string;
}): Promise<{ reply: string; status: HypothesisStatus | null; finding: string | null }> {
	const folder = await mkdtemp(path.join(os.tmpdir(), 'hypothesis-chat-'));
	const outputPath = path.join(folder, 'reply.json');
	const prompt = `You are the research assistant for Viona's AI Motion Coach hypothesis page.\n
Hypothesis: ${input.title}\nQuestion: ${input.question}\nCurrent management status: ${input.currentStatus}\nCited lab-log entry:\n${input.sourceMarkdown.slice(0, 20_000)}\n
Recent conversation (oldest first):\n${input.history
		.slice(-12)
		.map((item) => `${item.role}: ${item.content}`)
		.join('\n')}\n
New researcher message: ${input.message}\n
Respond in JSON matching the provided schema. Distinguish observed findings from hypotheses and plans. Do not claim an analysis was run unless you actually inspected its evidence. Set status only when the new researcher message explicitly requests a status change. Set finding only when the new researcher message explicitly asks you to save a finding; include uncertainty in the finding. Otherwise use null. Do not edit files or run tools. If the researcher asks for a new analysis or custom tool, outline the next concrete task in your reply; this chat process is read-only.`;
	try {
		await new Promise<void>((resolve, reject) => {
			const child = spawn(
				'codex',
				[
					'exec',
					'--sandbox',
					'read-only',
					'--ephemeral',
					'--ignore-user-config',
					'--output-schema',
					schemaPath,
					'--output-last-message',
					outputPath,
					'-C',
					path.resolve(process.cwd(), '..'),
					'-'
				],
				{ stdio: ['pipe', 'ignore', 'pipe'] }
			);
			let stderr = '';
			const timer = setTimeout(() => child.kill(), 120_000);
			child.stderr.on('data', (chunk: Buffer) => {
				stderr = (stderr + chunk.toString()).slice(-4000);
			});
			const events = child as typeof child & {
				on(event: 'error', listener: (error: Error) => void): void;
				on(event: 'close', listener: (code: number | null) => void): void;
			};
			events.on('error', (error) => {
				clearTimeout(timer);
				reject(error);
			});
			events.on('close', (code) => {
				clearTimeout(timer);
				if (code === 0) resolve();
				else reject(new Error(`Local Codex chat failed (${code}): ${stderr}`));
			});
			child.stdin.end(prompt);
		});
		const result = JSON.parse(await readFile(outputPath, 'utf8')) as {
			reply: unknown;
			status: unknown;
			finding: unknown;
		};
		if (
			typeof result.reply !== 'string' ||
			!result.reply.trim() ||
			result.reply.length > 8000 ||
			(result.status !== null &&
				(typeof result.status !== 'string' ||
					!HYPOTHESIS_STATUSES.includes(result.status as HypothesisStatus))) ||
			(result.finding !== null &&
				(typeof result.finding !== 'string' || result.finding.length > 2000))
		)
			throw new Error('Local Codex returned an invalid hypothesis response');
		return {
			reply: result.reply,
			status: /\b(status|mark|move|set|change|archive|resolve)\b/i.test(input.message)
				? (result.status as HypothesisStatus | null)
				: null,
			finding: /\b(save|record|add|log)\b.{0,50}\b(finding|observation|note)\b/i.test(input.message)
				? (result.finding as string | null)
				: null
		};
	} finally {
		await rm(folder, { recursive: true, force: true });
	}
}
