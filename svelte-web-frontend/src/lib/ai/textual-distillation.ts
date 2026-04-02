import type { MotionSegmentation, MotionSegmentationNode } from '$lib/data/dances-store';
import type { DanceSegmentation, PracticePlan } from '$lib/model/PracticePlan';
import type PracticeStep from '$lib/model/PracticeStep';
import { GetArithmeticMean } from './EvaluationCommonUtils';
import type { FrontendPerformanceSummary } from './FrontendDanceEvaluator';
import type { FrontendDancePeformanceHistory } from './frontendPerformanceHistory';
import type { Angle3DMetricSummaryOutput } from './motionmetrics/Skeleton3DVectorAngleEvaluationMetric';

function GetInaccurateJoints(
	skeleton3DSimilarity: Angle3DMetricSummaryOutput,
	badJointSDThreshold: number,
	overallScore?: number,
	overallScoreSD?: number
) {
	const comparisonMean = overallScore ?? skeleton3DSimilarity.overallScore;
	const comparisonSD = overallScoreSD ?? skeleton3DSimilarity.overallScoreSD;

	const jointScoreEntries = Object.entries(skeleton3DSimilarity.individualScores);

	// get all the joints that are 1 standard deviation below the mean.
	const badJoints = jointScoreEntries.filter(
		([_joint, score]) => score < comparisonMean - badJointSDThreshold * comparisonSD
	);

	return badJoints;
}

export function distillSegmentation(segmentation: DanceSegmentation) {
	const { startTime, segmentBreaks, endTime, segmentLabels } = segmentation;

	const segmentStartTimes = [startTime, ...segmentBreaks];
	const segmentEndTimes = [...segmentBreaks, endTime];

	const segments = segmentStartTimes.map((segmentStartTime, index) => {
		const segmentEndTime = segmentEndTimes[index];
		const segmentLabel = segmentLabels[index];
		return {
			startTime: segmentStartTime,
			endTime: segmentEndTime,
			label: segmentLabel
		};
	});

	let distillation =
		'To help with learning, the system has broken down the dance into segments that can be learned individually or in groups - as stepping stones to learning the entire dance. The following segments have been identified:\n';

	segments
		.map(
			(x, i) =>
				`* Segment '${x.label}', from (${x.startTime.toFixed(2)}s to ${x.endTime.toFixed(2)}s)`
		)
		.join('\n');
	return distillation;
}

const planDescription = `In our dance learning system, we utilize three distinct practice steps to help users progressively learn and master different sections of the dance. Each practice step serves a specific purpose and contributes to the overall dance learning experience. Below, we provide an overview of these practice steps:

1. Marking:
    * Description: Marking is the initial phase of our dance learning process. During this step, the user observes the dance sequence while simultaneously making small gestures or movements as placeholders for the actual dance moves. These gestures are intended to help users memorize the choreography and become familiar with the sequence.
    * Purpose: Marking allows users to internalize the dance steps, rhythms, and patterns before attempting to execute them at full speed. It aids in building a foundation for muscle memory and understanding the dance structure.

2. Drilling:
    * Description: Drilling involves the user attempting to perform the dance sequence while watching a reference dance video. This phase allows users to practice the dance moves in a controlled environment. The system can gradually increase the speed of the reference video as the user's proficiency improves.
    * Purpose: Drilling helps users refine their technique, timing, and coordination. It also provides an opportunity for evaluation, where the user's performance is assessed, and feedback is provided to help them make necessary adjustments.

3. Full-Out:
    * Description: In the Full-Out phase, users are expected to perform the dance sequence at full speed without watching the reference video. This simulates a performance-like condition where users must rely on their memorization and execution skills.
    * Purpose: The Full-Out phase assesses the user's ability to perform the dance confidently and accurately without external guidance. Feedback can still be provided to help users fine-tune their performance, but the focus is on independence and mastery.`;

export function distillPracticePlan(plan: PracticePlan): string {
	let distillation = planDescription + '\n\n';
	if (plan.demoSegmentation) {
		distillation +=
			distillSegmentation({
				startTime: plan.startTime,
				segmentBreaks: plan.demoSegmentation.segmentBreaks,
				endTime: plan.endTime,
				segmentLabels: plan.demoSegmentation.segmentLabels
			}) + '\n\n';
	}
	let extraWord = '';
	if (plan.demoSegmentation) extraWord = 'also ';
	distillation += `The system has ${extraWord} generated a practice plan to guide the user through the process of learning this dance. The plan is ${plan.stages.length} stages long. Each stage consists of a series of activities, which are performed in sequence. Each activity focus on a specific time window, ranging in length from a short segment to potentially the entire dance. Each activity consists of multiple practice steps, each of which can ask the user to perform one task, such as marking, drilling, or performing the entire dance full-out. The following is a description of the plan:\n\n`;

	distillation += `* The plan teaches the time window of the dance starting at ${plan.startTime.toFixed(2)}s until ${plan.endTime.toFixed(2)}s. `;

	function distillPracticeStep(step: PracticeStep): string {
		return `${step.title}, from ${step.startTime.toFixed(2)}s to ${step.endTime.toFixed(2)}s.`;
	}
	plan.stages.forEach((stage, stageIndex) => {
		distillation += `* Stage ${stageIndex + 1} consists of ${stage.activities.length} learning activities. `;
		stage.activities.forEach((activity, activityIndex) => {
			distillation += `Activity "${activity.title}") has ${activity.steps.length} steps (${activity.steps.map((s) => distillPracticeStep(s)).join('; ')}). `;
		});
	});

	return distillation;
}

/**
 * Distills the performance summary to a condensed representation containing only the features
 * most pertinant to the AI coach (and to the user).
 * @param summary Summary of the performance
 * @returns A condensed representation of the summary, highlighting only the most important things
 */
export function distillFrontendPerformanceSummaryToTextualRepresentation(
	summary: FrontendPerformanceSummary,
	mediumScoreThreshold: number,
	goodScoreThreshold: number,
	badJointSDThreshold: number
): string {
	const { wholePerformance, subsections, segmentDescription } = summary;

	const overallPerformanceScore = wholePerformance.skeleton3DVectorAngleEvaluation.overallScore;
	const overallPerformanceSD = wholePerformance.skeleton3DVectorAngleEvaluation.overallScoreSD;
	const overallPerformanceScoreString = overallPerformanceScore.toFixed(2);
	let distillation = `The user just performed "${segmentDescription}", at timestamp: ${new Date().toISOString()}. Overall, the user had a ${overallPerformanceScoreString} match with the reference dance.`;
	const performanceCharacterization =
		overallPerformanceScore < mediumScoreThreshold
			? 'poor'
			: overallPerformanceScore < goodScoreThreshold
				? 'fair'
				: 'good';

	distillation += ` This is considered a ${performanceCharacterization} performance.`;

	const badJoints = GetInaccurateJoints(
		wholePerformance.skeleton3DVectorAngleEvaluation,
		badJointSDThreshold
	);

	if (badJoints.length > 0) {
		distillation += ` The joint angles that were the most troublesome for the user were: `;
		const badJointStrings = badJoints.map(
			([joint, score]) => `${joint} (match: ${score.toFixed(2)})`
		);
		distillation += badJointStrings.join(', ');
		distillation += `.`;
	} else {
		distillation += ` No joints angles were particularly bad.`;
	}

	const subsectionNames = Object.keys(subsections);

	if (subsectionNames.length > 1) {
		// Describe subsections if there were some.
		distillation += ` The user's performance was broken down into ${subsectionNames.length} subsections:\n`;
		const subsectionEntries = Object.entries(subsections);
		const subsectionDistillationStrings = subsectionEntries.map(([subsectionName, subsection]) => {
			const angleSimilarity = subsection.skeleton3DVectorAngleEvaluation;

			// Compare the badness of the joints relative to the distrubition of the entire performance.
			const badJoints = GetInaccurateJoints(
				wholePerformance.skeleton3DVectorAngleEvaluation,
				badJointSDThreshold,
				overallPerformanceScore,
				overallPerformanceSD
			);

			const badJointNameList = badJoints.map(([jointName, _]) => jointName).join(',');
			const badJointsString =
				badJoints.length > 0
					? ` Troublesome joints angles: ${badJointNameList}`
					: 'No particularly troublesome joints';
			return `* Section "${subsectionName}" : full-body accuracy: ${angleSimilarity.overallScore.toFixed(2)}. ${badJointsString}`;
		});

		distillation += subsectionDistillationStrings.join('\n');
	}

	return distillation;
}

/**
 * Distills the motion segmentation structure to a condensed representation containing only the features
 * most pertinent to the AI coach (and to the user).
 * @param motionSegmentation The motion segmentation structure
 * @returns A condensed representation of the motion segmentation structure, highlighting only the most important things
 */
export function distillMotionSegmentationStructureToTextualRepresentation(
	motionSegmentation: MotionSegmentation
) {
	return distillMotionSegmentationSubTree(motionSegmentation.root);
}

function distillMotionSegmentationSubTree(motionNode: MotionSegmentationNode, depth = 0) {
	const nodeDuration = motionNode.end_time - motionNode.start_time;
	const nodeNoun = depth === 0 ? 'The motion' : `The ${'sub'.repeat(depth - 1)}section`;
	const indentation = '  '.repeat(depth);
	let subsectionList = '';
	if (motionNode.children.length > 0) {
		subsectionList += ': ';
		subsectionList +=
			motionNode.children
				.slice(0, -1)
				.map((child) => `"${child.id}"`)
				.join(', ') +
			', and ' +
			`"${motionNode.children[motionNode.children.length - 1].id}"`;
	}
	let description = `${indentation}${nodeNoun} "${motionNode.id}" is ${nodeDuration.toFixed(2)}s long, has a complexity of ${motionNode.complexity.toFixed(2)}, and has ${motionNode.children.length} subsections${subsectionList}\n`;
	motionNode.children.forEach((child) => {
		description += distillMotionSegmentationSubTree(child as MotionSegmentationNode, depth + 1);
	});
	return description;
}

export function distillPerformanceHistoryToTextualRepresentation(
	dancePerformanceHistory: FrontendDancePeformanceHistory
) {
	let description = '';
	for (const segmentId of Object.keys(dancePerformanceHistory)) {
		const segmentHistory = dancePerformanceHistory[segmentId];
		const skeleton3DVectorAngleEvaluation = segmentHistory.skeleton3DVectorAngleEvaluation ?? [];

		const nonnullOverallScoreAttempts = skeleton3DVectorAngleEvaluation
			.filter((n) => n.summary.overall !== undefined)
			.map((x) => ({
				date: x.date,
				score: x.summary.overall as number,
				partOfLargerPerformance: x.partOfLargerPerformance ?? true
			}));
		const attemptCount = nonnullOverallScoreAttempts.length;
		const secondMostRecentAttempt = nonnullOverallScoreAttempts[attemptCount - 2];
		const secondMostRecentAttemptDate = secondMostRecentAttempt?.date?.toISOString() ?? 'never';
		const secondMostReceentAttemptString = secondMostRecentAttempt
			? ` The next most recent attempt, performed ${secondMostRecentAttemptDate}, got a score of ${secondMostRecentAttempt?.score?.toFixed(2)}`
			: '';
		const attemptsAsPartOfLargerPerformance = nonnullOverallScoreAttempts.filter(
			(x) => x.partOfLargerPerformance
		).length;
		const attemptsNotAsPartOfLargerPerformance = attemptCount - attemptsAsPartOfLargerPerformance;
		const meanScore = GetArithmeticMean(nonnullOverallScoreAttempts.map((x) => x.score));
		const bestScore = Math.max(...nonnullOverallScoreAttempts.map((x) => x.score));
		const worstScore = Math.min(...nonnullOverallScoreAttempts.map((x) => x.score));
		description += `The user has attempted segment "${segmentId}" ${attemptsNotAsPartOfLargerPerformance} times individually, and ${attemptsAsPartOfLargerPerformance} time as a subsection of a larger performance, and has achived an average score of ${meanScore.toFixed(2)} (worst: ${worstScore.toFixed(2)}, best: ${bestScore.toFixed(2)}) on this segment.${secondMostReceentAttemptString}\n`;
	}
	return description;
}
