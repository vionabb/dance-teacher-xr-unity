import { afterAll, describe, it } from 'vitest';
import fs from 'fs';
import { type HumanRating } from './PoseDataTestFile';
import { runLiveEvaluationMetricOnTestTrack, type TestTrack } from './testdata/metricTestingUtils';
import {
	ensureMetricColumnInTable,
	exportCSV,
	loadDB,
	motionMetricsCsvPath,
	upsertMetricDbRow,
	type RowData
} from './testdata/metricdb';
import {
	generateStudyMetricFixtures,
	loadStudyMetricFixturesContext
} from './testdata/studyMetricFixtures';
import Qijia2DPoseEvaluationMetric from './Qijia2DPoseEvaluationMetric';
import Jules2DPoseEvaluationMetric from './Jules2DPoseEvaluationMetric';
import Skeleton3DVectorAngleEvaluationMetric from './Skeleton3DVectorAngleEvaluationMetric';
import { LandmarkWeighting_MotionEnergy } from '../EvaluationCommonUtils';
import TemporalAlignmentEvaluationMetric from './TemporalAlignmentEvaluationMetric';
import Skeleton3DAngleDistanceDTWEvaluationMetric from './Skeleton3DAngleDistanceDTWEvaluationMetric';
import KinematicErrorEvaluationMetric from './KinematicErrorEvaluationMetric';
import type { EvaluationTrackHistory } from './MotionMetric';

type MetricRunner = (
	track: TestTrack,
	trackHistory: EvaluationTrackHistory,
	ratings?: HumanRating | undefined
) => { result: Record<string, number>; metricName: string };

describe('AllMetricsComparison', {}, async () => {
	const fixtureContext = await loadStudyMetricFixturesContext();
	const metricDb = await loadDB();

	async function updateDbWithMetric(metricName: string, metric: MetricRunner) {
		async function* processClips() {
			let i = 0;
			for await (const fixture of generateStudyMetricFixtures(fixtureContext, {
				requireRatings: true
			})) {
				i++;
				const clipPrint =
					fixture.identity.segmentation === 'whole'
						? 'whole'
						: `clip${fixture.identity.clipNumber}`;
				const { result: summary, metricName } = metric(
					fixture.track,
					fixture.trackHistory,
					fixture.ratings
				);

				console.log(
					`Processed ${metricName} for file #${i} user${fixture.identity.userId}_${fixture.identity.danceName}__${fixture.identity.condition}_${clipPrint}`
				);

				yield {
					rowData: {
						...fixture.segmentData.segmentInfo,
						frameCount: fixture.segmentData.poses.length
					},
					metricData: summary
				};
			}
		}

		// Update db with this new metric row
		let clipCount = 0;
		let hasEnsuredColumnsInTable = false;

		for await (const clipData of processClips()) {
			if (!clipData.metricData) {
				continue;
			}

			if (!hasEnsuredColumnsInTable) {
				for (const key in clipData.metricData) {
					ensureMetricColumnInTable(metricDb, key);
				}
				hasEnsuredColumnsInTable = true;
			}

			clipCount++;

			const rowData: RowData = {
				userId: clipData.rowData.userId,
				danceId: clipData.rowData.danceName,
				studyName: clipData.rowData.studyName,
				workflowId: clipData.rowData.workflowId,
				clipNumber: clipData.rowData.clipNumber,
				collectionId: clipData.rowData.study1phase ?? 'N/A',
				danceName: clipData.rowData.danceName,
				condition: clipData.rowData.condition,
				performanceSpeed: clipData.rowData.performanceSpeed,
				frameCount: clipData.rowData.frameCount
			};
			const wasUpdate = await upsertMetricDbRow(metricDb, rowData, clipData.metricData);
			const verb = wasUpdate ? 'Updated' : 'Inserted';
			console.log(
				`\t[${clipCount}]\t${verb} db with ${metricName} for ${rowData.userId}_${rowData.danceName}_${rowData.clipNumber}`
			);
		}
	}
	// Set high test timeout for each test
	const testTimeout = 20 * 60 * 1000; // 20 minutes in milliseconds
	it.skip('skeleton3DAngleDistanceDTWEvaluation', { timeout: testTimeout }, async () => {
		const metric = new Skeleton3DAngleDistanceDTWEvaluationMetric();
		const metricRunner: MetricRunner = (track: TestTrack, trackHistory: EvaluationTrackHistory) => {
			const summary = metric.summarizeMetric(trackHistory);
			return {
				result: {
					invalidFrameCount: summary.invalidFramesCount,
					invalidPercent: summary.invalidPercent,
					skeleton3DAngleDistanceDTWEvaluationDistance: summary.dtwDistance,
					skeleton3DAngleDistanceDTWEvaluationDistanceAverage:
						summary.dtwDistance / summary.dtwPath.length,
					skeleton3DAngleDistanceDTWEvaluationWarpingFactor: summary.warpingFactor
				},
				metricName: 'skeleton3DAngleDistanceDTWEvaluation'
			};
		};
		await updateDbWithMetric('skeleton3DAngleDistanceDTWEvaluation', metricRunner);
	});

	it('qijia2DPoseEvaluation', { timeout: testTimeout }, async () => {
		const metric = new Qijia2DPoseEvaluationMetric();
		const metricRunner: MetricRunner = (track: TestTrack) => {
			const summary = runLiveEvaluationMetricOnTestTrack(metric, track);
			return {
				metricName: 'qijia2DPoseEvaluation',
				result: {
					qijia2DPoseEvaluation: summary.summary.overallScore / 5 // scale from 0-5 to 0-1
				}
			};
		};
		await updateDbWithMetric('qijia2DPoseEvaluation', metricRunner);
	});

	it('jules2DPoseEvaluation', { timeout: testTimeout }, async () => {
		const metric = new Jules2DPoseEvaluationMetric();
		const metricRunner: MetricRunner = (track: TestTrack) => {
			const summary = runLiveEvaluationMetricOnTestTrack(metric, track);
			return {
				metricName: 'jules2DPoseEvaluation',
				result: {
					// We want the output to be an accuracy score, with 1 being the best and 0 being the worst.
					// Jules2D returns a dissimilarity score, so we reverse it to get an accuracy score.
					jules2DPoseEvaluation: 1 - summary.summary.avgDissimilarity
				}
			};
		};
		await updateDbWithMetric('jules2DPoseEvaluation', metricRunner);
	});

	it('skeleton3DVectorAngleEvaluation', { timeout: testTimeout }, async () => {
		const metric = new Skeleton3DVectorAngleEvaluationMetric();
		const metricRunner: MetricRunner = (track: TestTrack) => {
			const summary = runLiveEvaluationMetricOnTestTrack(metric, track);
			return {
				metricName: 'skeleton3DVectorAngleEvaluation',
				result: {
					skeleton3DVectorAngleEvaluation: summary.summary.overallScore
				}
			};
		};
		await updateDbWithMetric('skeleton3DVectorAngleEvaluation', metricRunner);
	});

	it('temporalAlignmentEvaluation', { timeout: testTimeout }, async () => {
		const metric = new TemporalAlignmentEvaluationMetric();
		const metricRunner: MetricRunner = (track: TestTrack, trackHistory: EvaluationTrackHistory) => {
			const summary = metric.summarizeMetric(trackHistory);
			return {
				metricName: 'temporalAlignmentEvaluation',
				result: {
					temporalAlignmentEvaluationSecs: summary.temporalOffsetSecs
				}
			};
		};
		await updateDbWithMetric('temporalAlignmentEvaluation', metricRunner);
	});

	it('kinematicErrorEvaluation', { timeout: testTimeout }, async () => {
		const metricNoVisibliityScale = new KinematicErrorEvaluationMetric({
			calculateValues: {
				scaleIndicator: null //no size scaling,
			},
			calculateDescriptors: {
				visibilityBehavior: 'none'
			}
		});
		const metricByVisiblity = new KinematicErrorEvaluationMetric({
			calculateValues: {
				scaleIndicator: null //no size scaling
			},
			calculateDescriptors: {
				visibilityBehavior: 'scale'
			}
		});
		const metricByVisiblityAndPerceptualWeights = new KinematicErrorEvaluationMetric({
			calculateValues: {
				scaleIndicator: null //no size scaling
			},
			calculateDescriptors: {
				visibilityBehavior: 'scale',
				landmarkWeights: LandmarkWeighting_MotionEnergy
			}
		});
		const metricRunner: MetricRunner = (track: TestTrack, trackHistory: EvaluationTrackHistory) => {
			const summary = metricByVisiblity.summarizeMetric(trackHistory);
			const summaryNoVisiblity = metricNoVisibliityScale.summarizeMetric(trackHistory);
			const summaryWithPerceptualWeights =
				metricByVisiblityAndPerceptualWeights.summarizeMetric(trackHistory);
			return {
				metricName: 'kinematicErrorEvaluation',
				result: {
					kinematicErrorEvaluationVelocity3DMAE: summary.summary3D.velMAE ?? NaN,
					kinematicErrorEvaluationAccel3DMAE: summary.summary3D.accelMAE ?? NaN,
					kinematicErrorEvaluationJerk3DMAE: summary.summary3D.jerkMAE ?? NaN,
					kinematicErrorEvaluationVelocity2DMAE: summary.summary2D.velMAE ?? NaN,
					kinematicErrorEvaluationAccel2DMAE: summary.summary2D.accelMAE ?? NaN,
					kinematicErrorEvaluationJerk2DMAE: summary.summary2D.jerkMAE ?? NaN,
					kinematicErrorEvaluationVelocity3DMAENoVisibility:
						summaryNoVisiblity.summary3D.velMAE ?? NaN,
					kinematicErrorEvaluationAccel3DMAENoVisibility:
						summaryNoVisiblity.summary3D.accelMAE ?? NaN,
					kinematicErrorEvaluationJerk3DMAENoVisibility:
						summaryNoVisiblity.summary3D.jerkMAE ?? NaN,
					kinematicErrorEvaluationVelocity2DMAENoVisibility:
						summaryNoVisiblity.summary2D.velMAE ?? NaN,
					kinematicErrorEvaluationAccel2DMAENoVisibility:
						summaryNoVisiblity.summary2D.accelMAE ?? NaN,
					kinematicErrorEvaluationJerk2DMAENoVisibility:
						summaryNoVisiblity.summary2D.jerkMAE ?? NaN,
					kinematicErrorEvaluationVelocity3DMAEJointWeighted:
						summaryWithPerceptualWeights.summary3D.velMAE ?? NaN,
					kinematicErrorEvaluationAccel3DMAEJointWeighted:
						summaryWithPerceptualWeights.summary3D.accelMAE ?? NaN,
					kinematicErrorEvaluationJerk3DMAEJointWeighted:
						summaryWithPerceptualWeights.summary3D.jerkMAE ?? NaN,
					kinematicErrorEvaluationVelocity2DMAEJointWeighted:
						summaryWithPerceptualWeights.summary2D.velMAE ?? NaN,
					kinematicErrorEvaluationAccel2DMAEJointWeighted:
						summaryWithPerceptualWeights.summary2D.accelMAE ?? NaN,
					kinematicErrorEvaluationJerk2DMAEJointWeighted:
						summaryWithPerceptualWeights.summary2D.jerkMAE ?? NaN
				}
			};
		};
		await updateDbWithMetric('kinematicErrorEvaluation', metricRunner);
	});

	it('humanRating', { timeout: testTimeout }, async () => {
		const metricRunner: MetricRunner = (
			track: TestTrack,
			trackHistory: EvaluationTrackHistory,
			ratings: HumanRating | undefined
		) => {
			return {
				metricName: 'humanRating',
				result: {
					humanRatingPercent: ratings?.humanRatingPercentile ?? NaN,
					autoRatingPercent: ratings?.autoRatingPercentile ?? NaN,
					humanRating: ratings?.humanRating ?? NaN,
					autoRating: ratings?.autoRating ?? NaN,
					rating1: ratings?.rating1 ?? NaN,
					rating2: ratings?.rating2 ?? NaN,
					rating3: ratings?.rating3 ?? NaN,
					reportedDifficulty: ratings?.reportedDifficulty ?? NaN,
					reportedHelpfulness: ratings?.reportedHelpfulness ?? NaN
				}
			};
		};
		await updateDbWithMetric('humanRating', metricRunner);
	});

	// Export the database to a CSV file
	it('exportDb', {}, async ({ expect }) => {
		// remove existing CSV file if it exists
		if (fs.existsSync(motionMetricsCsvPath)) {
			console.log('Removing existing csv file at ', motionMetricsCsvPath);
			fs.unlinkSync(motionMetricsCsvPath);
		}
		await exportCSV(metricDb);
		console.log('Exported db to CSV: ', motionMetricsCsvPath);
		expect(fs.existsSync(motionMetricsCsvPath)).toBe(true);
	});

	afterAll(() => {
		// Close the database connection to prevent resource leaks
		if (metricDb) {
			metricDb.close();
			console.log('Database connection closed');
		}
	});
});
