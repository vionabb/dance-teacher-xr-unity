import type { HypothesisStatus } from './research-hypotheses';

const COMMAND_START = '^(?:please\\s+|can\\s+you\\s+)?';
const COMMAND_END =
	'(?=\\s*(?:[.!?;:]|$|,?\\s+and\\s+(?:please\\s+)?(?:save|record|log|mark|set|move|change|archive|resolve)\\b))';
const STATUS_TARGET = '(?:(?:this|the)\\s+hypothesis|this|it|(?:the\\s+)?status)';
const FINDING_COMMAND =
	'(?:save|record|log)\\s+(?:(?:a|the|this|following)\\s+)?finding\\s*:\\s*\\S';

export function authorizeDetailOperations(input: {
	message: string;
	status: HypothesisStatus | null;
	finding: string | null;
}): { status: HypothesisStatus | null; finding: string | null; suppressed: boolean } {
	const message = input.message.replace(/\s+/g, ' ').trim();
	if (!input.status && !input.finding) return { status: null, finding: null, suppressed: false };
	if (
		/^(?:what|why|how|would|could|should)\b|\b(?:what if|if i|if we|hypothetically|suppose)\b/i.test(
			message
		)
	)
		return { status: null, finding: null, suppressed: true };
	const statusAllowed =
		!input.status ||
		new RegExp(
			`${COMMAND_START}(?:mark|set|move|change)\\s+${STATUS_TARGET}\\s+(?:as|to)\\s+${input.status}${COMMAND_END}`,
			'i'
		).test(message) ||
		(input.status === 'archived' &&
			new RegExp(
				`${COMMAND_START}archive\\s+(?:(?:this|the)\\s+hypothesis|this|it)${COMMAND_END}`,
				'i'
			).test(message)) ||
		(input.status === 'resolved' &&
			new RegExp(
				`${COMMAND_START}resolve\\s+(?:(?:this|the)\\s+hypothesis|this|it)${COMMAND_END}`,
				'i'
			).test(message));
	const findingAllowed =
		!input.finding ||
		new RegExp(
			`${COMMAND_START}(?:(?:mark|set|move|change)\\s+${STATUS_TARGET}\\s+(?:as|to)\\s+(?:candidate|investigating|evidence-review|resolved|archived)\\s+and\\s+(?:please\\s+)?)?${FINDING_COMMAND}`,
			'i'
		).test(message);
	if (!statusAllowed || !findingAllowed) return { status: null, finding: null, suppressed: true };
	return { status: input.status, finding: input.finding, suppressed: false };
}
