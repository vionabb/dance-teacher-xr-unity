import { dev } from '$app/environment';
import { error, fail, redirect } from '@sveltejs/kit';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { isDevLocalRequestAllowed, isLoopbackClientAddress } from '$lib/server/client-address';
import {
	referenceDances,
	referenceVideoRoot,
	validateCatalogFile
} from '$lib/server/participant-dataset-catalog';
import {
	readReferenceDanceSpans,
	recordReferenceDanceSpan,
	researchDatabasePath
} from '$lib/server/research-store';
import type { Actions, PageServerLoad } from './$types';

const TITLES: Record<string, string> = {
	bartender: 'Bartender',
	'last-christmas': 'Last Christmas',
	'mad-at-disney': 'Mad at Disney',
	'pajama-party': 'Pajama Party'
};

function sha256File(file: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const hash = createHash('sha256');
		createReadStream(file)
			.on('data', (chunk) => hash.update(chunk))
			.on('error', reject)
			.on('end', () => resolve(hash.digest('hex')));
	});
}

export const load: PageServerLoad = async ({ getClientAddress, url }) => {
	if (!dev || !isLoopbackClientAddress(getClientAddress())) error(404);
	const revisions = await readReferenceDanceSpans(researchDatabasePath());
	const dances = await Promise.all(
		referenceDances().map(async ({ dance, fileName, clipSpacingSeconds }) => {
			const own = revisions.filter((revision) => revision.dance === dance);
			return {
				dance,
				title: TITLES[dance] ?? dance,
				fileName,
				clipSpacingSeconds,
				videoAvailable: !!(await validateCatalogFile(
					`${referenceVideoRoot()}/${fileName}`,
					referenceVideoRoot()
				)),
				current: own.at(-1) ?? null,
				earlierCount: Math.max(own.length - 1, 0)
			};
		})
	);
	return {
		dances,
		annotatorConfigured: !!process.env.RESEARCH_ANNOTATOR?.trim(),
		saved: url.searchParams.get('saved'),
		backupWarning: url.searchParams.get('backup_warning') === '1'
	};
};

export const actions: Actions = {
	default: async ({ request, getClientAddress }) => {
		if (!isDevLocalRequestAllowed(request, getClientAddress(), dev)) error(404);
		const annotator = process.env.RESEARCH_ANNOTATOR?.trim();
		if (!annotator)
			return fail(503, { message: 'Set RESEARCH_ANNOTATOR before saving marks.', dance: null });
		const form = await request.formData();
		const dance = String(form.get('dance') ?? '');
		const reference = referenceDances().find((item) => item.dance === dance);
		if (!reference) return fail(400, { message: 'Unknown reference dance.', dance: null });
		const startSeconds = Number(form.get('start'));
		const endSeconds = Number(form.get('end'));
		const durationSeconds = Number(form.get('duration'));
		const note = String(form.get('note') ?? '');
		if (
			![startSeconds, endSeconds, durationSeconds].every(Number.isFinite) ||
			startSeconds < 0 ||
			endSeconds <= startSeconds ||
			endSeconds > durationSeconds + 0.05
		)
			return fail(400, {
				message: 'The dance end must come after its start, within the video.',
				dance
			});
		if (note.length > 2000)
			return fail(400, { message: 'Keep the note under 2,000 characters.', dance });
		const video = await validateCatalogFile(
			`${referenceVideoRoot()}/${reference.fileName}`,
			referenceVideoRoot()
		);
		if (!video) return fail(404, { message: 'The reference video is not staged locally.', dance });
		const receipt = await recordReferenceDanceSpan(researchDatabasePath(), {
			dance,
			videoFile: reference.fileName,
			videoSha256: await sha256File(video),
			durationSeconds,
			startSeconds,
			endSeconds,
			annotator,
			note
		});
		redirect(
			303,
			`/research/reference-spans?saved=${encodeURIComponent(dance)}${receipt.backupError ? '&backup_warning=1' : ''}#${dance}`
		);
	}
};
