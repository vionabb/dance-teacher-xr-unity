import { dev } from '$app/environment';
import { error, fail, redirect } from '@sveltejs/kit';
import { isDevLocalRequestAllowed, isLoopbackClientAddress } from '$lib/server/client-address';
import { askHypothesisCollectionAssistant } from '$lib/server/hypothesis-assistant';
import { resolveHypotheses } from '$lib/server/research-hypotheses';
import {
	readHypothesisCollectionState,
	recordHypothesisCollectionTurn,
	researchDatabasePath
} from '$lib/server/research-store';
import type { Actions, PageServerLoad } from './$types';

async function collectionState(file: string) {
	const state = await readHypothesisCollectionState(file);
	const catalog = resolveHypotheses(state);
	const listed = catalog.map((item) => {
		const events = state.events.filter((event) => event.slug === item.slug);
		return {
			slug: item.slug,
			title: item.title,
			question: item.question,
			hidden: !!item.hidden,
			status: events.filter((event) => event.kind === 'status').at(-1)?.value ?? 'candidate',
			findings: events.filter((event) => event.kind === 'finding').length
		};
	});
	return { listed, messages: state.messages.reverse(), revision: state.revision };
}

export const load: PageServerLoad = async ({ getClientAddress, url }) => {
	if (!dev || !isLoopbackClientAddress(getClientAddress())) error(404);
	const { listed, messages } = await collectionState(researchDatabasePath());
	return {
		hypotheses: listed.filter((item) => !item.hidden),
		removed: listed.filter((item) => item.hidden),
		messages,
		backupWarning: url.searchParams.get('backup_warning') === '1'
	};
};

export const actions: Actions = {
	default: async ({ request, getClientAddress }) => {
		if (!isDevLocalRequestAllowed(request, getClientAddress(), dev)) error(404);
		const form = await request.formData();
		const message = String(form.get('message') ?? '').trim();
		if (!message || message.length > 4000)
			return fail(400, { message: 'Enter a message of at most 4,000 characters.' });
		const file = researchDatabasePath();
		const state = await collectionState(file);
		try {
			const response = await askHypothesisCollectionAssistant({
				catalog: state.listed.map(({ slug, title, question, status, hidden }) => ({
					slug,
					title,
					question,
					status,
					hidden
				})),
				history: state.messages,
				message
			});
			const receipt = await recordHypothesisCollectionTurn(file, {
				expectedRevision: state.revision,
				userMessage: message,
				assistantReply: response.reply,
				create: response.create,
				changes: response.changes
			});
			redirect(
				303,
				`/research/hypothesis${receipt.backupError ? '?backup_warning=1' : ''}#collection-conversation`
			);
		} catch (caught) {
			if (caught && typeof caught === 'object' && 'status' in caught) throw caught;
			return fail(503, {
				message: caught instanceof Error ? caught.message : 'The local assistant is unavailable.'
			});
		}
	}
};
