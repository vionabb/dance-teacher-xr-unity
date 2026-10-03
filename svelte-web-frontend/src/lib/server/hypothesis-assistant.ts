import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HYPOTHESIS_STATUSES, type HypothesisStatus } from './research-hypotheses';
import type { HypothesisChatMessage, HypothesisCollectionChange } from './research-store';
import { authorizeCollectionOperations } from './hypothesis-collection-intent';

const detailSchemaPath = fileURLToPath(
	new URL('./hypothesis-assistant-output.schema.json', import.meta.url)
);
const collectionSchemaPath = fileURLToPath(
	new URL('./hypothesis-collection-output.schema.json', import.meta.url)
);

async function runCodexJson(prompt: string, schemaPath: string): Promise<unknown> {
	const folder = await mkdtemp(path.join(os.tmpdir(), 'hypothesis-chat-'));
	const outputPath = path.join(folder, 'reply.json');
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
		return JSON.parse(await readFile(outputPath, 'utf8')) as unknown;
	} finally {
		await rm(folder, { recursive: true, force: true });
	}
}

export async function askHypothesisAssistant(input: {
	title: string;
	question: string;
	sourceMarkdown: string;
	currentStatus: HypothesisStatus;
	history: HypothesisChatMessage[];
	message: string;
}): Promise<{ reply: string; status: HypothesisStatus | null; finding: string | null }> {
	const prompt = `You are the research assistant for Viona's AI Motion Coach hypothesis page.
Hypothesis: ${input.title}
Question: ${input.question}
Current management status: ${input.currentStatus}
Overview and source material:
${input.sourceMarkdown.slice(0, 20_000)}
Recent conversation (oldest first):
${input.history
	.slice(-12)
	.map((item) => `${item.role}: ${item.content}`)
	.join('\n')}
New researcher message: ${input.message}
Respond in JSON matching the provided schema. Distinguish observed findings from hypotheses and plans. Do not claim an analysis was run unless you actually inspected its evidence. Set status only when the new researcher message explicitly requests a status change. Set finding only when the new researcher message explicitly asks you to save a finding; include uncertainty in the finding. Otherwise use null. Do not edit files or run tools. If the researcher asks for a new analysis or custom tool, outline the next concrete task in your reply; this chat process is read-only.`;
	const result = (await runCodexJson(prompt, detailSchemaPath)) as {
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
}

export async function askHypothesisCollectionAssistant(input: {
	catalog: { slug: string; title: string; question: string; status: string; hidden: boolean }[];
	history: HypothesisChatMessage[];
	message: string;
}): Promise<{
	reply: string;
	create: { title: string; question: string; overview: string } | null;
	changes: HypothesisCollectionChange[];
}> {
	const prompt = `You manage Viona's local AI Motion Coach hypothesis collection. This is a prototype with an append-only audit trail.
Current hypotheses (including removed entries that can be restored):
${JSON.stringify(input.catalog)}
Recent collection conversation (oldest first):
${input.history
	.slice(-12)
	.map((item) => `${item.role}: ${item.content}`)
	.join('\n')}
New researcher message: ${input.message}
Respond in JSON matching the schema. You may discuss anything, but output a create object or changes only when the NEW researcher message explicitly asks for that action. For a new hypothesis, use a concise title, a testable question, and a draft overview grounded only in the researcher's words. Do not invent findings or citations. A newly created hypothesis begins as candidate. Use existing slugs exactly for changes. Status values are candidate, investigating, evidence-review, resolved, archived. A rename changes the displayed title but keeps its URL and history. Remove hides an entry from the index and preserves its history; restore shows it again. If the requested target or action is ambiguous, ask a clarifying question in reply and output no operation. Never claim to have run an analysis, edited files, or used tools.`;
	const result = (await runCodexJson(prompt, collectionSchemaPath)) as {
		reply: unknown;
		create: unknown;
		changes: unknown;
	};
	if (
		typeof result.reply !== 'string' ||
		!result.reply.trim() ||
		result.reply.length > 8000 ||
		!Array.isArray(result.changes) ||
		result.changes.length > 10 ||
		(result.create !== null &&
			(typeof result.create !== 'object' ||
				!result.create ||
				!('title' in result.create) ||
				!('question' in result.create) ||
				!('overview' in result.create)))
	)
		throw new Error('Local Codex returned an invalid collection response');
	const create = result.create as { title: unknown; question: unknown; overview: unknown } | null;
	if (
		create &&
		(typeof create.title !== 'string' ||
			typeof create.question !== 'string' ||
			typeof create.overview !== 'string')
	)
		throw new Error('Local Codex returned an invalid new hypothesis');
	const allowedKinds = ['status', 'rename', 'remove', 'restore'];
	for (const change of result.changes) {
		if (
			!change ||
			typeof change !== 'object' ||
			typeof change.slug !== 'string' ||
			!allowedKinds.includes(change.kind) ||
			(typeof change.value !== 'string' && change.value !== null)
		)
			throw new Error('Local Codex returned an invalid collection change');
	}
	const authorized = authorizeCollectionOperations({
		message: input.message,
		catalog: input.catalog,
		create: create as { title: string; question: string; overview: string } | null,
		changes: result.changes as HypothesisCollectionChange[]
	});
	return {
		reply: authorized.suppressed
			? 'I did not change the collection. Please use an explicit command with the exact hypothesis title or URL name, such as “Mark Recurring tracking risk by segment as investigating.”'
			: result.reply,
		create: authorized.create,
		changes: authorized.changes
	};
}
