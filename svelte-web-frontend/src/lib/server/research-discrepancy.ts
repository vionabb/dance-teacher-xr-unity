import path from 'node:path';
import { getParticipantCatalog, findParticipantRecord } from './participant-dataset-catalog';
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
