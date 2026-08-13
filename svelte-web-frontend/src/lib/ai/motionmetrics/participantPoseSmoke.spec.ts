import path from 'node:path';
import { describe, it } from 'vitest';
import { loadPoses, loadTikTokClipPoses, Study, type StudySegmentData } from './PoseDataTestFile';
import { getReferenceClip } from '../EvaluationCommonUtils';
import { buildTestTrackForStudyClip } from './testdata/studyMetricFixtures';
import { runLiveEvaluationMetricOnTestTrack } from './testdata/metricTestingUtils';
import Skeleton3DAngleDistanceDTWEvaluationMetric from './Skeleton3DAngleDistanceDTWEvaluationMetric';
import Viona2DPoseEvaluationMetric from './Viona2DPoseEvaluationMetric';

const participantPoseRoot = path.resolve(
	process.cwd(),
	'..',
	'data',
	'test-fixtures',
	'smoketest',
	'userstudydata',
	'chi2025-poses',
	'canonical'
);

describe('canonical participant pose smoke fixtures', () => {
	it('loads paired canonical modalities and runs evaluation/comparison metrics', async ({
		expect
	}) => {
		const tiktokClipPoses = await loadTikTokClipPoses();
		const tiktokWholePoses = new Map();
		const participants: StudySegmentData[] = [];
		for await (const participant of loadPoses(Study.Study1_BySegment, undefined, {
			participantPoseRoot
		})) {
			participants.push(participant as StudySegmentData);
		}

		expect(participants).toHaveLength(2);
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

			const comparison = new Skeleton3DAngleDistanceDTWEvaluationMetric().summarizeMetric({
				videoFrameTimesInSecs: track.videoFrameTimesInSecs,
				actualTimesInMs: track.actualTimesInMs,
				ref3DFrameHistory: track.ref3dPoses,
				ref2DFrameHistory: track.ref2dPoses,
				user3DFrameHistory: track.user3dPoses,
				user2DFrameHistory: track.user2dPoses
			});
			expect(Number.isFinite(comparison.dtwDistance)).toBe(true);
		}
	});
});
