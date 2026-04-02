import {
	getClipHumanRatings,
	loadHumanRatings,
	loadPoses,
	loadTikTokClipPoses,
	loadTiktokWholePoses,
	Study,
	type HumanRating,
	type PoseFrame,
	type SegmentInfo,
	type StudySegmentData
} from '../PoseDataTestFile';
import { getReferenceClip, takeAsnc } from '../../EvaluationCommonUtils';
import type { TestTrack } from './metricTestingUtils';
import type { EvaluationTrackHistory } from '../MotionMetric';

export type StudyMetricFixtureIdentity = {
	study: Study;
	studyName: SegmentInfo['studyName'];
	segmentation: SegmentInfo['segmentation'];
	userId: number;
	danceName: SegmentInfo['danceName'];
	workflowId: string;
	clipNumber: number;
	condition: string;
	study1phase?: string;
};

export type StudyMetricFixture = {
	identity: StudyMetricFixtureIdentity;
	clipId: string;
	artifactStem: string;
	segmentData: StudySegmentData;
	referencePoses: PoseFrame[];
	track: TestTrack;
	trackHistory: EvaluationTrackHistory;
	ratings?: HumanRating;
};

export type StudyMetricFixturesContext = Awaited<ReturnType<typeof loadStudyMetricFixturesContext>>;

function buildIdentity(segmentInfo: SegmentInfo, study: Study): StudyMetricFixtureIdentity {
	return {
		study,
		studyName: segmentInfo.studyName,
		segmentation: segmentInfo.segmentation,
		userId: segmentInfo.userId,
		danceName: segmentInfo.danceName,
		workflowId: segmentInfo.workflowId,
		clipNumber: segmentInfo.clipNumber,
		condition: segmentInfo.condition,
		study1phase: segmentInfo.study1phase
	};
}

function sanitizeArtifactSegment(value: string | number) {
	return String(value).replace(/[^a-zA-Z0-9_-]+/g, '-');
}

export function getFixtureClipId(identity: StudyMetricFixtureIdentity) {
	return [
		identity.study,
		identity.danceName,
		`user${identity.userId}`,
		identity.segmentation === 'whole' ? 'whole' : `clip${identity.clipNumber}`,
		identity.workflowId
	]
		.map(sanitizeArtifactSegment)
		.join('__');
}

export function buildTrackHistoryForStudyClip(
	segmentData: StudySegmentData,
	referencePoses: PoseFrame[]
): EvaluationTrackHistory {
	const fps = 30;
	const shortestClipLength = Math.min(segmentData.poses.length, referencePoses.length);

	return {
		videoFrameTimesInSecs: referencePoses.map((_, i) => i / fps).slice(0, shortestClipLength),
		actualTimesInMs: referencePoses
			.map((_, i) => i / (segmentData.segmentInfo.performanceSpeed * fps))
			.slice(0, shortestClipLength),
		ref3DFrameHistory: referencePoses.map((pose) => pose.worldPose).slice(0, shortestClipLength),
		ref2DFrameHistory: referencePoses.map((pose) => pose.pixelPose).slice(0, shortestClipLength),
		user3DFrameHistory: segmentData.poses
			.map((pose) => pose.worldPose)
			.slice(0, shortestClipLength),
		user2DFrameHistory: segmentData.poses.map((pose) => pose.pixelPose).slice(0, shortestClipLength)
	};
}

export function buildTestTrackForStudyClip(
	segmentData: StudySegmentData,
	referencePoses: PoseFrame[]
): TestTrack {
	const fps = 30;
	const shortestClipLength = Math.min(segmentData.poses.length, referencePoses.length);

	return {
		id: `${segmentData.segmentInfo.userId}_${segmentData.segmentInfo.clipNumber}`,
		danceRelativeStem: segmentData.segmentInfo.danceName,
		segmentDescription: segmentData.segmentInfo.clipNumber.toString(),
		creationDate: '',
		trackDescription: segmentData.segmentInfo.danceName,
		videoFrameTimesInSecs: referencePoses.map((_, i) => i / fps).slice(0, shortestClipLength),
		actualTimesInMs: referencePoses
			.map((_, i) => i / (fps * segmentData.segmentInfo.performanceSpeed))
			.slice(0, shortestClipLength),
		ref2dPoses: referencePoses.map((pose) => pose.pixelPose).slice(0, shortestClipLength),
		ref3dPoses: referencePoses.map((pose) => pose.worldPose).slice(0, shortestClipLength),
		user2dPoses: segmentData.poses.map((pose) => pose.pixelPose).slice(0, shortestClipLength),
		user3dPoses: segmentData.poses.map((pose) => pose.worldPose).slice(0, shortestClipLength)
	};
}

export async function loadStudyMetricFixturesContext() {
	const [tiktokClipPoses, tiktokWholePoses, allRatings] = await Promise.all([
		loadTikTokClipPoses(),
		loadTiktokWholePoses(),
		loadHumanRatings()
	]);

	return {
		tiktokClipPoses,
		tiktokWholePoses,
		allRatings
	};
}

async function loadStudyPoseGenerators() {
	const study1SegmentsPoseFiles = (await loadPoses(Study.Study1_BySegment, (clipInfo) => {
		const studyInfo = clipInfo as SegmentInfo;
		return studyInfo.study1phase === 'performance';
	})) as AsyncGenerator<StudySegmentData>;

	const study1WholePoseFiles = (await loadPoses(Study.Study1_Whole, (clipInfo) => {
		const studyInfo = clipInfo as SegmentInfo;
		return studyInfo.study1phase === 'performance';
	})) as AsyncGenerator<StudySegmentData>;

	const study2SegmentPoseFiles = (await loadPoses(
		Study.Study2_BySegment
	)) as AsyncGenerator<StudySegmentData>;
	const study2WholePoseFiles = (await loadPoses(
		Study.Study2_Whole
	)) as AsyncGenerator<StudySegmentData>;

	return [
		study1WholePoseFiles,
		study2WholePoseFiles,
		study1SegmentsPoseFiles,
		study2SegmentPoseFiles
	] as const;
}

export async function* generateStudyMetricFixtures(
	context: StudyMetricFixturesContext,
	opts?: {
		requireRatings?: boolean;
		limit?: number;
	}
): AsyncGenerator<StudyMetricFixture> {
	const allPoseFiles = takeAsnc(await loadStudyPoseGenerators(), opts?.limit ?? Infinity);

	for await (const poseData of allPoseFiles) {
		const segmentData = poseData as StudySegmentData;
		const ratings = getClipHumanRatings({
			info: segmentData.segmentInfo,
			allRatings: context.allRatings,
			study: segmentData.study
		});

		if (opts?.requireRatings && !ratings) {
			continue;
		}

		const referencePoses = getReferenceClip({
			segmentInfo: segmentData.segmentInfo,
			tiktokClipPoses: context.tiktokClipPoses,
			tiktokWholePoses: context.tiktokWholePoses
		});
		if (!referencePoses) {
			continue;
		}

		const identity = buildIdentity(segmentData.segmentInfo, segmentData.study);
		const clipId = getFixtureClipId(identity);

		yield {
			identity,
			clipId,
			artifactStem: clipId,
			segmentData,
			referencePoses,
			track: buildTestTrackForStudyClip(segmentData, referencePoses),
			trackHistory: buildTrackHistoryForStudyClip(segmentData, referencePoses),
			ratings
		};
	}
}

export type StudyMetricFixtureSelector = Pick<
	StudyMetricFixtureIdentity,
	'study' | 'userId' | 'danceName' | 'workflowId' | 'clipNumber'
>;

export function doesFixtureMatchSelection(
	fixture: StudyMetricFixture,
	selection: StudyMetricFixtureSelector
) {
	return (
		fixture.identity.study === selection.study &&
		fixture.identity.userId === selection.userId &&
		fixture.identity.danceName === selection.danceName &&
		fixture.identity.workflowId === selection.workflowId &&
		fixture.identity.clipNumber === selection.clipNumber
	);
}

export async function findStudyMetricFixture(
	context: StudyMetricFixturesContext,
	selection: StudyMetricFixtureSelector
) {
	for await (const fixture of generateStudyMetricFixtures(context, { requireRatings: true })) {
		if (doesFixtureMatchSelection(fixture, selection)) {
			return fixture;
		}
	}
	return undefined;
}
