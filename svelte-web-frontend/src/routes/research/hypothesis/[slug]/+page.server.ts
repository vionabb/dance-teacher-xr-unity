import { dev } from '$app/environment';
import { error, fail, redirect } from '@sveltejs/kit';
import { isDevLocalRequestAllowed, isLoopbackClientAddress } from '$lib/server/client-address';
import { askHypothesisAssistant } from '$lib/server/hypothesis-assistant';
import {
	getHypothesis,
	hypothesisOverview,
	HYPOTHESIS_STATUSES,
	type HypothesisStatus
} from '$lib/server/research-hypotheses';
import {
	readHypothesisState,
	recordHypothesisTurn,
	researchDatabasePath
} from '$lib/server/research-store';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ getClientAddress, params, url }) => {
	if (!dev || !isLoopbackClientAddress(getClientAddress())) error(404);
	const hypothesis = getHypothesis(params.slug);
	if (!hypothesis) error(404, 'Unknown hypothesis');
	const [overview, state] = await Promise.all([
		hypothesisOverview(hypothesis),
		readHypothesisState(researchDatabasePath(), hypothesis.slug)
	]);
	return {
		hypothesis,
		overview,
		status: state.events.filter((event) => event.kind === 'status').at(-1)?.value ?? 'candidate',
		findings: state.events.filter((event) => event.kind === 'finding'),
		messages: state.messages.reverse(),
		backupWarning: url.searchParams.get('backup_warning') === '1'
	};
};

export const actions: Actions = {
	default: async ({ request, getClientAddress, params }) => {
		if (!isDevLocalRequestAllowed(request, getClientAddress(), dev)) error(404);
		const hypothesis = getHypothesis(params.slug);
		if (!hypothesis) error(404, 'Unknown hypothesis');
		const form = await request.formData();
		const message = String(form.get('message') ?? '').trim();
		if (!message || message.length > 4000)
			return fail(400, { message: 'Enter a message of at most 4,000 characters.' });
		const [overview, state] = await Promise.all([
			hypothesisOverview(hypothesis),
			readHypothesisState(researchDatabasePath(), hypothesis.slug)
		]);
		const currentStatus =
			state.events.filter((event) => event.kind === 'status').at(-1)?.value ?? 'candidate';
		try {
			const response = await askHypothesisAssistant({
				title: hypothesis.title,
				question: hypothesis.question,
				sourceMarkdown: overview.markdown,
				currentStatus: HYPOTHESIS_STATUSES.includes(currentStatus as HypothesisStatus)
					? (currentStatus as HypothesisStatus)
					: 'candidate',
				history: state.messages.reverse(),
				message
			});
			const receipt = await recordHypothesisTurn(researchDatabasePath(), {
				slug: hypothesis.slug,
				userMessage: message,
				assistantReply: response.reply,
				status: response.status,
				finding: response.finding
			});
			redirect(
				303,
				`/research/hypothesis/${hypothesis.slug}${receipt.backupError ? '?backup_warning=1' : ''}#conversation`
			);
		} catch (caught) {
			if (caught && typeof caught === 'object' && 'status' in caught) throw caught;
			return fail(503, {
				message: caught instanceof Error ? caught.message : 'The local assistant is unavailable.'
			});
		}
	}
};
