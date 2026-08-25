import path from 'node:path';
import { describe, it } from 'vitest';
import { loadPoses, loadTikTokClipPoses, Study, type StudySegmentData } from './PoseDataTestFile';
import { getReferenceClip } from '../EvaluationCommonUtils';
import { buildTestTrackForStudyClip } from './testdata/studyMetricFixtures';
import { runLiveEvaluationMetricOnTestTrack } from './testdata/metricTestingUtils';
import Viona2DPoseEvaluationMetric from './Viona2DPoseEvaluationMetric';

const participantPoseRoot = path.resolve(
	process.cwd(),
	'..',
	'data',
	'test-fixtures',
	'smoketest',
	'userstudydata'
);

describe('canonical participant pose smoke fixtures', () => {
	it(
		'loads paired canonical modalities and runs evaluation metrics',
		{ timeout: 20000 },
		async ({ expect }) => {
			const tiktokClipPoses = await loadTikTokClipPoses();
			const tiktokWholePoses = new Map();
			const participants: StudySegmentData[] = [];
			for await (const participant of loadPoses(Study.Study1_BySegment, undefined, {
				participantPoseRoot
			})) {
				participants.push(participant as StudySegmentData);
			}

			expect(participants).toHaveLength(3);
			for (const participant of participants) {
				const referencePoses = getReferenceClip({
					segmentInfo: participant.segmentInfo,
					tiktokClipPoses,
					tiktokWholePoses
				});
				expect(referencePoses).toBeTruthy();
				if (!referencePoses) continue;

				const track = buildTestTrackForStudyClip(participant, referencePoses);
				expect(track.user2dPoses.length).toBeGreaterThan(1);
				expect(track.user2dPoses.length).toBe(track.user3dPoses.length);

				const evaluation = runLiveEvaluationMetricOnTestTrack(
					new Viona2DPoseEvaluationMetric(),
					track
				);
				expect(Number.isFinite(evaluation.summary.avgDissimilarity)).toBe(true);
			}
		}
	);
});
