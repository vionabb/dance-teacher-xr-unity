/**
 * Stage 1 of the rating-relevant-time-spans hypothesis
 * (lab-log/2026-11-06-rating-relevant-time-spans.md).
 *
 * Recomputes each segment metric with and without the paired rows that fall
 * outside the researcher's marked dance start/end, then compares Spearman
 * correlation with the segment human rating. Opt-in only: set
 * REFERENCE_SPANS_SQLITE (database holding reference_dance_span_revisions) and
 * HUMAN_RATINGS_PATH. Writes participant-level rows under an ignored
 * temp/experiments/ directory; nothing here is committed.
 */
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';
import { LandmarkWeighting_MotionEnergy } from '../EvaluationCommonUtils';
import KinematicErrorEvaluationMetric from './KinematicErrorEvaluationMetric';
import type { EvaluationTrackHistory } from './MotionMetric';
import Qijia2DPoseEvaluationMetric from './Qijia2DPoseEvaluationMetric';
import Skeleton3DVectorAngleEvaluationMetric from './Skeleton3DVectorAngleEvaluationMetric';
import Viona2DPoseEvaluationMetric from './Viona2DPoseEvaluationMetric';
import { runLiveEvaluationMetricOnTestTrack, type TestTrack } from './testdata/metricTestingUtils';
import {
	generateStudyMetricFixtures,
	loadStudyMetricFixturesContext
} from './testdata/studyMetricFixtures';
import { referenceDances } from '$lib/server/participant-dataset-catalog';
import { readReferenceDanceSpans } from '$lib/server/research-store';
import {
	keptRowRange,
	meetsAcceptance,
	pairedSpearmanDifference,
	type DanceSpan
} from '$lib/research/reference-span-trim';

const spansDatabase = process.env.REFERENCE_SPANS_SQLITE;
const MIN_TRIMMED_ROWS = 15;

/** Every metric is oriented so that higher means more similar to the reference. */
function computeMetrics(track: TestTrack, history: EvaluationTrackHistory) {
	const out: Record<string, number> = {};
	const qijia = runLiveEvaluationMetricOnTestTrack(new Qijia2DPoseEvaluationMetric(), track);
	out.qijia2D = qijia.summary.overallScore === null ? NaN : qijia.summary.overallScore / 5;
	const viona = runLiveEvaluationMetricOnTestTrack(new Viona2DPoseEvaluationMetric(), track);
	out.viona2D = 1 - viona.summary.avgDissimilarity;
	const angle = runLiveEvaluationMetricOnTestTrack(
		new Skeleton3DVectorAngleEvaluationMetric(),
		track
	);
	out.skeleton3DVectorAngle = angle.summary.overallScore ?? NaN;
	const kinematic = {
		visibility: new KinematicErrorEvaluationMetric({
			calculateValues: { scaleIndicator: null },
			calculateDescriptors: { visibilityBehavior: 'scale' }
		}),
		jointWeighted: new KinematicErrorEvaluationMetric({
			calculateValues: { scaleIndicator: null },
			calculateDescriptors: {
				visibilityBehavior: 'scale',
				landmarkWeights: LandmarkWeighting_MotionEnergy
			}
		})
	};
	for (const [variant, metric] of Object.entries(kinematic)) {
		try {
			const summary = metric.summarizeMetric(history);
			for (const [dimension, values] of [
				['3D', summary.summary3D],
				['2D', summary.summary2D]
			] as const) {
				out[`negVelocity${dimension}MAE_${variant}`] = -(values.velMAE ?? NaN);
				out[`negAccel${dimension}MAE_${variant}`] = -(values.accelMAE ?? NaN);
				out[`negJerk${dimension}MAE_${variant}`] = -(values.jerkMAE ?? NaN);
			}
		} catch {
			/* too few frames for derivatives; leave the columns missing */
		}
	}
	return out;
}

function sliceTrack(track: TestTrack, start: number, end: number): TestTrack {
	return {
		...track,
		videoFrameTimesInSecs: track.videoFrameTimesInSecs.slice(start, end),
		actualTimesInMs: track.actualTimesInMs.slice(start, end),
		user2dPoses: track.user2dPoses.slice(start, end),
		user3dPoses: track.user3dPoses.slice(start, end),
		ref2dPoses: track.ref2dPoses.slice(start, end),
		ref3dPoses: track.ref3dPoses.slice(start, end)
	};
}

function sliceHistory(
	history: EvaluationTrackHistory,
	start: number,
	end: number
): EvaluationTrackHistory {
	return {
		videoFrameTimesInSecs: history.videoFrameTimesInSecs.slice(start, end),
		actualTimesInMs: history.actualTimesInMs.slice(start, end),
		ref2DFrameHistory: history.ref2DFrameHistory.slice(start, end),
		ref3DFrameHistory: history.ref3DFrameHistory.slice(start, end),
		user2DFrameHistory: history.user2DFrameHistory.slice(start, end),
		user3DFrameHistory: history.user3DFrameHistory.slice(start, end)
	};
}

describe.skipIf(!spansDatabase)('rating-relevant time spans, stage 1', () => {
	it(
		'compares full and trimmed segment metrics against human ratings',
		{ timeout: 0 },
		async () => {
			const revisions = await readReferenceDanceSpans(path.resolve(spansDatabase!));
			const latest = new Map<string, (typeof revisions)[number]>();
			for (const revision of revisions) latest.set(revision.dance, revision);
			const dances = referenceDances();
			const missing = dances.filter((dance) => !latest.has(dance.dance)).map((d) => d.dance);
			expect(missing, 'every reference dance needs a saved mark').toEqual([]);

			const ratingsPath = path.resolve(
				process.env.HUMAN_RATINGS_PATH ?? '../local-data/chi25-humanratings-source.csv'
			);
			const ratingsSha256 = createHash('sha256')
				.update(await readFile(ratingsPath))
				.digest('hex');
			const outputDir = path.resolve(
				process.env.REFERENCE_SPANS_OUTPUT ??
					`temp/experiments/rating-relevant-time-spans/${new Date().toISOString().replace(/[:.]/g, '-')}`
			);
			await mkdir(outputDir, { recursive: true });

			const context = await loadStudyMetricFixturesContext();
			const rows: Record<string, string | number>[] = [];
			const counts = { segments: 0, unaffected: 0, affected: 0, tooShortAfterTrim: 0 };
			for await (const fixture of generateStudyMetricFixtures(context, { requireRatings: true })) {
				if (fixture.identity.segmentation !== 'segmented' || !fixture.ratings) continue;
				counts.segments++;
				const dance = dances.find((item) => item.dance === fixture.identity.danceName);
				const mark = latest.get(fixture.identity.danceName);
				if (!dance || !mark) continue;
				const span: DanceSpan = { startSeconds: mark.start_seconds, endSeconds: mark.end_seconds };
				const rowCount = fixture.track.user2dPoses.length;
				const kept = keptRowRange({
					clipNumber: fixture.identity.clipNumber,
					clipSpacingSeconds: dance.clipSpacingSeconds,
					rowCount,
					span
				});
				if (kept.startRow === 0 && kept.endRow === rowCount) {
					counts.unaffected++;
					continue;
				}
				counts.affected++;
				const keptRows = kept.endRow - kept.startRow;
				const full = computeMetrics(fixture.track, fixture.trackHistory);
				const trimmed =
					keptRows >= MIN_TRIMMED_ROWS
						? computeMetrics(
								sliceTrack(fixture.track, kept.startRow, kept.endRow),
								sliceHistory(fixture.trackHistory, kept.startRow, kept.endRow)
							)
						: {};
				if (keptRows < MIN_TRIMMED_ROWS) counts.tooShortAfterTrim++;
				const row: Record<string, string | number> = {
					study: fixture.identity.study,
					dance: fixture.identity.danceName,
					userId: fixture.identity.userId,
					clipNumber: fixture.identity.clipNumber,
					condition: fixture.identity.condition,
					rowCount,
					keptStartRow: kept.startRow,
					keptEndRow: kept.endRow,
					humanRating: fixture.ratings.humanRating
				};
				for (const [name, value] of Object.entries(full)) {
					row[`full_${name}`] = value;
					row[`trimmed_${name}`] = trimmed[name] ?? NaN;
				}
				rows.push(row);
			}

			const metricNames = [
				...new Set(
					rows.flatMap((row) =>
						Object.keys(row)
							.filter((key) => key.startsWith('full_'))
							.map((key) => key.slice(5))
					)
				)
			];
			const results = metricNames.map((metric) => {
				const comparison = pairedSpearmanDifference(
					rows.map((row) => ({
						cluster: `${row.study}:${row.userId}`,
						full: Number(row[`full_${metric}`]),
						trimmed: Number(row[`trimmed_${metric}`]),
						rating: Number(row.humanRating)
					})),
					{ replicates: 2000, seed: 20261106 }
				);
				return { metric, ...comparison, meetsAcceptance: meetsAcceptance(comparison) };
			});

			let gitHead = 'unknown';
			try {
				gitHead = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
			} catch {
				/* not a git checkout */
			}
			const summary = {
				hypothesis: 'rating-relevant-time-spans',
				stage: 1,
				createdAt: new Date().toISOString(),
				gitHead,
				acceptance:
					'trimmed minus full Spearman >= 0.05 and participant-bootstrap 95% CI lower bound > 0',
				rowsPerSecond: 30,
				minTrimmedRows: MIN_TRIMMED_ROWS,
				ratingsSha256,
				spans: [...latest.values()].map((revision) => ({
					dance: revision.dance,
					revisionId: revision.revision_id,
					startSeconds: revision.start_seconds,
					endSeconds: revision.end_seconds,
					videoSha256: revision.video_sha256,
					annotator: revision.annotator,
					createdAt: revision.created_at
				})),
				counts,
				affectedByDanceAndClip: Object.fromEntries(
					[...new Set(rows.map((row) => `${row.study}/${row.dance}/clip${row.clipNumber}`))].map(
						(key) => [
							key,
							rows.filter((row) => `${row.study}/${row.dance}/clip${row.clipNumber}` === key).length
						]
					)
				),
				results
			};
			await writeFile(
				path.join(outputDir, 'summary.json'),
				JSON.stringify(summary, null, 2) + '\n'
			);
			await writeFile(path.join(outputDir, 'segments.csv'), Papa.unparse(rows) + '\n');
			console.log(`Wrote ${outputDir}`);
			console.table(
				results.map((result) => ({
					metric: result.metric,
					n: result.n,
					participants: result.clusters,
					full: result.full.toFixed(3),
					trimmed: result.trimmed.toFixed(3),
					difference: result.difference.toFixed(3),
					ci95: `${result.ci95[0].toFixed(3)} to ${result.ci95[1].toFixed(3)}`,
					accepted: result.meetsAcceptance
				}))
			);
			expect(rows.length).toBeGreaterThan(0);
		}
	);
});
