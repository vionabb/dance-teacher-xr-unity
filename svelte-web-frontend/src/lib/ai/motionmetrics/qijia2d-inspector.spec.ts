import { describe, expect, it } from 'vitest';
import {
	compareQijiaFrame,
	buildContinuousTimeline,
	getQijiaPoseCrop,
	getQijiaPoseCropForFrames,
	getQijiaNormalizedPoseCropForSegments,
	mapQijiaNormalizedCropToVideo,
	parseLegacyReferencePoseCsv,
	parseRawPoseCsv,
	pairFramesByRowIndex,
	participantVideoTimeForRow,
	QIJIA_LANDMARK_INDICES,
	resolvePoseFrameAtTime,
	locateTimelineSegment,
	matchesTimelineSeekTarget,
	sourcePoseRowAtTime,
	type InspectorFrame
} from './qijia2d-inspector';
import { PoseLandmarkKeysUpperSnakeCase } from '$lib/webcam/mediapipe-utils';

function poseFrame(frame: number, reverse = false): InspectorFrame {
	const landmarks = PoseLandmarkKeysUpperSnakeCase.map((_, index) => ({
		x: reverse ? (index % 2 ? 10 : 0) : index % 2 ? 0 : 10,
		y: index * 3,
		dist_from_camera: 0,
		visibility: 1
	}));
	return { frame, landmarks };
}

describe('Qijia2D frame inspector calculations', () => {
	it('builds a continuous segment timeline and returns the correct boundary segment', () => {
		const timeline = buildContinuousTimeline([
			{ id: 'first', durationSeconds: 2, fallbackDurationSeconds: 1.5 },
			{ id: 'second', durationSeconds: null, fallbackDurationSeconds: 1 }
		]);
		expect(timeline).toEqual([
			{ id: 'first', startSeconds: 0, endSeconds: 2, durationSeconds: 2 },
			{ id: 'second', startSeconds: 2, endSeconds: 3, durationSeconds: 1 }
		]);
		expect(locateTimelineSegment(timeline, 2)).toEqual({
			segmentIndex: 1,
			localTimeSeconds: 0
		});
	});

	it('ignores stale media time updates until a segment seek reaches its requested target', () => {
		expect(matchesTimelineSeekTarget(1, 0, 1, 0.6)).toBe(false);
		expect(matchesTimelineSeekTarget(1, 0.58, 1, 0.6)).toBe(true);
		expect(matchesTimelineSeekTarget(1, 1.2, 2, 1.2)).toBe(false);
	});

	it('uses participant source-frame IDs to select the pose row at global playback time', () => {
		const frames = new Map([
			[0, { ...poseFrame(0), csvFrame: 2 }],
			[1, { ...poseFrame(1), csvFrame: 5 }],
			[2, { ...poseFrame(2), csvFrame: 10 }]
		]);
		expect(sourcePoseRowAtTime(frames, 0.2, 30)).toBe(1);
		expect(sourcePoseRowAtTime(frames, 0.03, 30)).toBeNull();
	});

	it('preserves explicit sparse frame numbers from raw pose CSV', () => {
		const header = [
			'frame',
			...PoseLandmarkKeysUpperSnakeCase.flatMap((name) => [
				`${name}_x`,
				`${name}_y`,
				`${name}_distance`,
				`${name}_vis`
			])
		].join(',');
		const values = [
			'0',
			...PoseLandmarkKeysUpperSnakeCase.flatMap(() => ['10', '20', '0', '1'])
		].join(',');
		const parsed = parseRawPoseCsv(`${header}\n${values}\n${values.replace(/^0,/, '3,')}`);
		expect([...parsed.keys()]).toEqual([0, 3]);
		expect(parsed.has(1)).toBe(false);
	});

	it('requires Qijia columns and rejects malformed or duplicate frame IDs', () => {
		const validHeader = [
			'frame',
			...PoseLandmarkKeysUpperSnakeCase.flatMap((name) => [`${name}_x`, `${name}_y`])
		].join(',');
		const row = ['2', ...PoseLandmarkKeysUpperSnakeCase.flatMap(() => ['12', '24'])].join(',');
		expect(() => parseRawPoseCsv('frame,LEFT_SHOULDER_x\n0,1')).toThrow(/Missing required Qijia/);
		expect(() => parseRawPoseCsv(`${validHeader}\n${row}\n${row}`)).toThrow(/Duplicate frame ID 2/);
		expect(() =>
			parseRawPoseCsv(`${validHeader}\noops,${row.slice(row.indexOf(',') + 1)}`)
		).toThrow(/Invalid frame ID/);
	});

	it('samples the latest CSV row at or before floor(time × FPS), with no row before the first frame', () => {
		const frames = new Map([
			[3, poseFrame(3)],
			[9, poseFrame(9)],
			[15, poseFrame(15)]
		]);
		expect(resolvePoseFrameAtTime(frames, 0.39, 30, [3, 9, 15])).toMatchObject({
			targetFrame: 11,
			frame: { frame: 9 },
			carried: true
		});
		expect(resolvePoseFrameAtTime(frames, 0.09, 30, [3, 9, 15])).toMatchObject({
			targetFrame: 2,
			frame: null,
			carried: false
		});
	});

	it('parses legacy reference CSVs and index-pairs rows without treating their timestamps as aligned time', () => {
		const header = [
			'frame',
			'timestamp',
			...PoseLandmarkKeysUpperSnakeCase.flatMap((name) => [
				`${name}_x_2d`,
				`${name}_y_2d`,
				`${name}_z_2d`,
				`${name}_visibility_2d`
			])
		].join(',');
		const sourceRow = (frame: number, time: number) =>
			[frame, time, ...PoseLandmarkKeysUpperSnakeCase.flatMap(() => ['10', '20', '0', '1'])].join(
				','
			);
		const participantFrames = new Map([
			[10, poseFrame(10)],
			[14, poseFrame(14)],
			[22, poseFrame(22)]
		]);
		const referenceFrames = parseLegacyReferencePoseCsv(
			`${header}\n${sourceRow(90, 120)}\n${sourceRow(91, 700)}`
		);
		const aligned = pairFramesByRowIndex(participantFrames, referenceFrames);

		expect(aligned.frameCount).toBe(2);
		expect([...aligned.participantFrames.keys()]).toEqual([0, 1]);
		expect([...aligned.referenceFrames.keys()]).toEqual([0, 1]);
		expect(aligned.participantFrames.get(0)).toMatchObject({ frame: 0, csvFrame: 10 });
		expect(aligned.referenceFrames.get(1)).toMatchObject({
			frame: 1,
			csvFrame: 91,
			timestampMs: 700
		});
		expect(participantVideoTimeForRow(aligned.participantFrames, 1, 30)).toBeCloseTo(14 / 30);
	});

	it('maps identical directions to zero error and score five', () => {
		const result = compareQijiaFrame(poseFrame(0), poseFrame(0));
		expect(result.sum).toBe(0);
		expect(result.mean).toBe(0);
		expect(result.score).toBe(5);
	});

	it('bounds overlays on confident Qijia landmarks rather than unrelated or low-visibility outliers', () => {
		const frame = poseFrame(0);
		frame.landmarks[0] = { ...frame.landmarks[0], x: 5000, y: 5000 };
		frame.landmarks[11] = { ...frame.landmarks[11], x: 5000, y: 5000, visibility: 0.1 };
		const crop = getQijiaPoseCrop(frame, 640, 480);
		expect(crop.w).toBeLessThan(300);
		expect(crop.h).toBeLessThan(300);
		expect(crop.x + crop.w).toBeLessThan(1000);
	});

	it('includes a nearby confident nose in the crop without allowing a distant outlier to expand it', () => {
		const frame = poseFrame(0);
		for (const index of QIJIA_LANDMARK_INDICES) {
			frame.landmarks[index] = {
				...frame.landmarks[index],
				x: 240 + (index % 2) * 120,
				y: 320 + (index % 3) * 25
			};
		}
		frame.landmarks[0] = { ...frame.landmarks[0], x: 290, y: 150, visibility: 1 };
		const faceCrop = getQijiaPoseCrop(frame, 640, 480);
		expect(faceCrop.y).toBeLessThan(150);

		frame.landmarks[0] = { ...frame.landmarks[0], x: 5000, y: 5000 };
		const outlierCrop = getQijiaPoseCrop(frame, 640, 480);
		expect(outlierCrop.y).toBeLessThan(300);
		expect(outlierCrop.y + outlierCrop.h).toBeLessThan(480);
	});

	it('fits one robust viewport to motion across frames and rejects isolated high-visibility outliers', () => {
		const first = poseFrame(0);
		const second = poseFrame(1);
		const third = poseFrame(2);
		for (const index of QIJIA_LANDMARK_INDICES) {
			second.landmarks[index] = { ...second.landmarks[index], x: second.landmarks[index].x + 180 };
			third.landmarks[index] = { ...third.landmarks[index], x: third.landmarks[index].x + 360 };
		}
		third.landmarks[11] = { ...third.landmarks[11], x: 630, y: 470 };
		const crop = getQijiaPoseCropForFrames([first, second, third], 640, 480);
		expect(crop.x).toBeLessThan(30);
		expect(crop.x + crop.w).toBeGreaterThan(380);
		expect(crop.w / crop.h).toBeCloseTo(640 / 480);
		expect(crop.x + crop.w).toBeLessThan(640);
	});

	it('uses the full video dimensions when no reliable scored pose is available', () => {
		const frame = poseFrame(0);
		for (const index of QIJIA_LANDMARK_INDICES)
			frame.landmarks[index] = { ...frame.landmarks[index], visibility: 0.1 };
		expect(getQijiaPoseCropForFrames([frame], 1280, 720)).toEqual({
			x: 0,
			y: 0,
			w: 1280,
			h: 720
		});
	});

	it('keeps one normalized viewport across mixed-resolution performance segments', () => {
		const makeFrame = (frame: number, width: number, height: number) => {
			const result = poseFrame(frame);
			for (const index of QIJIA_LANDMARK_INDICES) {
				result.landmarks[index] = {
					...result.landmarks[index],
					x: width * (0.32 + (index % 3) * 0.08),
					y: height * (0.2 + (index % 4) * 0.08)
				};
			}
			return result;
		};
		const portrait = [makeFrame(0, 480, 640), makeFrame(1, 480, 640)];
		const landscape = [makeFrame(2, 640, 480), makeFrame(3, 640, 480)];
		const clean = getQijiaNormalizedPoseCropForSegments([
			{ frames: portrait, videoWidth: 480, videoHeight: 640 },
			{ frames: landscape, videoWidth: 640, videoHeight: 480 }
		]);
		landscape[1].landmarks[11] = { ...landscape[1].landmarks[11], x: 640, y: 480 };
		const withOutlier = getQijiaNormalizedPoseCropForSegments([
			{ frames: portrait, videoWidth: 480, videoHeight: 640 },
			{ frames: landscape, videoWidth: 640, videoHeight: 480 }
		]);
		expect(withOutlier.x).toBeCloseTo(clean.x);
		expect(withOutlier.y).toBeCloseTo(clean.y);
		expect(withOutlier.w).toBeCloseTo(clean.w);
		expect(withOutlier.h).toBeCloseTo(clean.h);
		const portraitPixels = mapQijiaNormalizedCropToVideo(withOutlier, 480, 640);
		const landscapePixels = mapQijiaNormalizedCropToVideo(withOutlier, 640, 480);
		expect(portraitPixels.x / 480).toBeCloseTo(landscapePixels.x / 640);
		expect(portraitPixels.y / 640).toBeCloseTo(landscapePixels.y / 480);
		expect(portraitPixels.w / 480).toBeCloseTo(landscapePixels.w / 640);
		expect(portraitPixels.h / 640).toBeCloseTo(landscapePixels.h / 480);
	});

	it('falls back to the full normalized viewport when mixed segments have no reliable poses', () => {
		const frame = poseFrame(0);
		for (const index of QIJIA_LANDMARK_INDICES)
			frame.landmarks[index] = { ...frame.landmarks[index], visibility: 0.1 };
		expect(
			getQijiaNormalizedPoseCropForSegments([
				{ frames: [frame], videoWidth: 480, videoHeight: 640 }
			])
		).toEqual({ x: 0, y: 0, w: 1, h: 1 });
	});

	it('keeps degenerate pairs visible as invalid while applying the production zero fallback', () => {
		const participant = poseFrame(0);
		participant.landmarks[12] = { ...participant.landmarks[11] };
		const result = compareQijiaFrame(poseFrame(0), participant);
		expect(result.invalidCount).toBe(1);
		expect(result.vectors[0].error).toBeNull();
		expect(Number.isFinite(result.score)).toBe(true);
	});
});
