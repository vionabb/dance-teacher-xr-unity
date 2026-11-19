import path from 'node:path';
import { readFile } from 'node:fs/promises';
import {
	getParticipantCatalog,
	findParticipantRecord,
	participantDataRoot,
	referencePoseRoot,
	validateCatalogFile
} from './participant-dataset-catalog';
import { getParticipantVideoDuration } from './participant-video-duration';
import { intervalScores, qijiaSegmentSamples } from '$lib/research/segment-score';
import { humanSimilarityKey, reviewIdentity } from './research-video-manifest';
import {
	readUsabilityData,
	readDiscrepancyObservations,
	researchDatabasePath
} from './research-store';

export async function discrepancyTasks() {
	const [catalog, data, observations] = await Promise.all([
		getParticipantCatalog(),
		readUsabilityData(researchDatabasePath()),
		readDiscrepancyObservations(researchDatabasePath())
	]);
	const ratings = new Map(
		data.humanRatings.map((row) => [
			[row.study, row.dance, row.user_id, row.segment_id, row.condition].join('\0'),
			row
		])
	);
	return catalog.performances.flatMap((performance) =>
		performance.segments.flatMap((segment) => {
			const record = catalog.records.get(segment.id)!;
			const identity = reviewIdentity(
				performance.study === 'study1' ? 'chi25_study1' : 'chi25_study2',
				path.basename(record.videoPath, '.mp4')
			);
			const human = identity && ratings.get(humanSimilarityKey(identity));
			if (!human || human.human_rating === null) return [];
			return [
				{
					performanceId: performance.id,
					participantLabel: performance.participantLabel,
					study: performance.study,
					dance: performance.danceName,
					condition: performance.condition,
					phase: performance.phase,
					segmentId: segment.id,
					clipNumber: segment.clipNumber,
					referenceAvailable: segment.referencePoseAvailable,
					human,
					observations: observations.filter((row) => row.segment_id === segment.id)
				}
			];
		})
	);
}
export async function discrepancyTask(segmentId: string) {
	const record = await findParticipantRecord(segmentId);
	if (!record) return null;
	const tasks = (await discrepancyTasks()).filter((row) => row.referenceAvailable);
	const index = tasks.findIndex((row) => row.segmentId === segmentId);
	const task = tasks[index];
	const destination = (offset: number) => {
		const item = tasks[index + offset];
		return item
			? {
					performanceId: item.performanceId,
					segmentId: item.segmentId,
					label: `${item.participantLabel} · ${item.dance} · segment ${item.clipNumber}`
				}
			: null;
	};
	return task
		? {
				task,
				record,
				navigation: {
					previous: destination(-1),
					next: destination(1),
					position: index + 1,
					total: tasks.length
				}
			}
		: null;
}
/** Local-backend twin of hostedSegmentScores: same pose files, pairing and duration cut-off. */
export async function localSegmentScores(ids: string[]) {
	return Promise.all(
		ids.map(async (id) => {
			const empty = { segmentId: id, inputVersion: null, score: null, valid: 0, total: 0 };
			const record = await findParticipantRecord(id);
			if (!record?.referencePosePath) return empty;
			const [video, pose, reference] = await Promise.all([
				validateCatalogFile(record.videoPath, participantDataRoot()),
				validateCatalogFile(record.posePath, participantDataRoot()),
				validateCatalogFile(record.referencePosePath, referencePoseRoot())
			]);
			if (!video || !pose || !reference) return empty;
			const duration = await getParticipantVideoDuration(id, video);
			if (duration === null) return empty;
			const [poseText, referenceText] = await Promise.all([
				readFile(pose, 'utf8'),
				readFile(reference, 'utf8')
			]);
			return {
				...empty,
				...intervalScores(qijiaSegmentSamples(poseText, referenceText, duration), 0, Infinity).whole
			};
		})
	);
}
