import { formatOrdinals } from '$lib/utils/formatting';
import type { FrontendDancePeformanceHistory } from './frontendPerformanceHistory';

/**
 * An object that defines the possible output targets for achievements.
 */
export const OutputTarget = Object.freeze({
	/** Output a user-facing achievement string */
	user: 'user',

	/** Output a system-facing achievement string */
	system: 'system'
});

/**
 * The type of an output target for achievements.
 */
export type OutputTargetType = keyof typeof OutputTarget;

/**
 * An object that defines the parameters that will be used for achievement detection.
 */
export type AchievementParams = {
	performanceHistory: FrontendDancePeformanceHistory;
	attemptedNodeId: string;
	outputTarget: OutputTargetType;
};

/**
 * A map between the number of attempts and the achievement explamation message
 * for attempts of a single node.
 */
const SINGLE_NODE_ATTEMPT_ACHIEVEMENTS = new Map([
	[5, 'Good job!'],
	[10, 'Nice work!'],
	[15, 'Great persistance!'],
	[20, 'Incredible persistence!'],
	[25, 'You are getting there!'],
	[30, 'You are making progress!'],
	[35, 'You are doing great!'],
	[40, 'You are doing amazing!'],
	[50, 'You are a pro!'],
	[60, 'You are a master!'],
	[70, 'You are a legend!'],
	[80, 'You are unstoppable!'],
	[90, "You're like a dance god!"],
	[100, 'Are you a dance deity?'],
	[150, 'You are a dance deity!'],
	[200, 'Your persistance is admirable!'],
	[300, "You're maniacal!"],
	[450, "You're crazy!"],
	[600, "You're insane!"],
	[800, 'Stop it already!'],
	[1000, 'This is too much!'],
	[1250, "You're a robot!"],
	[1500, 'Even robots would have stopped by now!']
]);

/**
 * Detects achievement if the user has achieved a certain number of attempts for a single node.
 * @param attemptCount The number of attempts.
 * @param sectionName The name of the section.
 * @param outputTarget The output target for the achievement.
 * @returns The achievement message, or null if no achievement is detected.
 */
export function detectSingleNodeAttemptsAchivement(
	attemptCount: number,
	sectionName: string,
	outputTarget: OutputTargetType
) {
	const exalamation = SINGLE_NODE_ATTEMPT_ACHIEVEMENTS.get(attemptCount);
	if (exalamation === undefined) {
		return null;
	}

	if (outputTarget === OutputTarget.user) {
		return `${exalamation} That was your ${formatOrdinals(attemptCount)} attempt for section '${sectionName}'!`;
	}
	if (outputTarget === OutputTarget.system) {
		return `User has attempted section '${sectionName}' ${attemptCount} times.`;
	}

	throw new Error('Unknown output target: ' + outputTarget);
}

const defaultAllNodeAchievementSuffixFunction = (attemptCount: number) =>
	`That was your ${formatOrdinals(attemptCount)} attempt!`;

/**
 * Map between the attempt count number and objects defining how to construct
 * the user-facing achievement message.
 */
const ALL_NODES_ATTEMPT_ACHIEVEMENTS = new Map([
	[1, { prefix: 'Great start on your first attempt!', suffixFn: () => `` }],
	[5, { prefix: 'That a way! Five attempts already!', suffixFn: () => `` }],
	[
		10,
		{
			prefix: 'Keep it up!',
			suffixFn: (attemptCount: number) => `You've reached ${attemptCount} total attempts!`
		}
	],
	[20, { prefix: 'Amazing!', suffixFn: defaultAllNodeAchievementSuffixFunction }],
	[40, { prefix: "You're a rockstar!", suffixFn: defaultAllNodeAchievementSuffixFunction }],
	[60, { prefix: 'Incredible!', suffixFn: defaultAllNodeAchievementSuffixFunction }],
	[80, { prefix: 'Remarkable!', suffixFn: defaultAllNodeAchievementSuffixFunction }],
	[100, { prefix: 'Absolutely incredible!', suffixFn: defaultAllNodeAchievementSuffixFunction }],
	[150, { prefix: 'Wowza!', suffixFn: defaultAllNodeAchievementSuffixFunction }],
	[200, { prefix: 'Unbelievable!', suffixFn: defaultAllNodeAchievementSuffixFunction }],
	[300, { prefix: 'Legendary!', suffixFn: defaultAllNodeAchievementSuffixFunction }],
	[400, { prefix: 'Mythical!', suffixFn: defaultAllNodeAchievementSuffixFunction }],
	[500, { prefix: 'Godlike!', suffixFn: defaultAllNodeAchievementSuffixFunction }],
	[600, { prefix: 'Unstoppable!', suffixFn: defaultAllNodeAchievementSuffixFunction }],
	[700, { prefix: 'Epic!', suffixFn: defaultAllNodeAchievementSuffixFunction }],
	[800, { prefix: 'Unreal!', suffixFn: defaultAllNodeAchievementSuffixFunction }],
	[900, { prefix: 'Unbelievable!?!', suffixFn: defaultAllNodeAchievementSuffixFunction }],
	[
		1000,
		{
			prefix: 'Stop hunting for all the achievements',
			suffixFn: defaultAllNodeAchievementSuffixFunction
		}
	],
	[
		1250,
		{
			prefix: 'There are no more achievements after this',
			suffixFn: defaultAllNodeAchievementSuffixFunction
		}
	],
	[1500, { prefix: 'Seriously, stop it', suffixFn: defaultAllNodeAchievementSuffixFunction }],
	[2000, { prefix: 'Well...', suffixFn: defaultAllNodeAchievementSuffixFunction }]
]);

/**
 * Detects achievement if the user has achieved a certain number of attempts in total for this dance.
 * @param attemptCount The number of attempts.
 * @param outputTarget The output target for the achievement.
 * @returns The achievement message, or null if no achievement is detected.
 */
export function getAllNodesAttemptAchievement(
	attemptCount: number,
	outputTarget: OutputTargetType
) {
	const exalamation = ALL_NODES_ATTEMPT_ACHIEVEMENTS.get(attemptCount);
	if (exalamation === undefined) {
		return null;
	}

	if (outputTarget === OutputTarget.user) {
		return `${exalamation.prefix} ${exalamation.suffixFn(attemptCount)}`;
	}
	if (outputTarget === OutputTarget.system) {
		return `User has reached ${attemptCount} attempts total across all practice sections.`;
	}

	throw new Error('Unknown output target: ' + outputTarget);
}

/**
 * Detects achievements that the user has achieved with this performance.
 * @param params Parameters on the users performance state & history.
 * @returns A list of achievement messages
 */
export default function detectAchievements(params: AchievementParams): string[] {
	const achievements = [] as string[];

	// Add an achievement if the user has attempted all nodes a special number of times.
	const allNodeAttemptCounts = getAttemptCount(params, 'allNodes');
	const allNodeAchivement = getAllNodesAttemptAchievement(
		allNodeAttemptCounts,
		params.outputTarget
	);
	if (allNodeAchivement) {
		achievements.push(allNodeAchivement);
	}

	// Add an achievement if the user has attempted a the current node a special number of times.
	const singleNodeAttemptCount = getAttemptCount(params, 'attemptedNode');
	const singleNodeAchivement = detectSingleNodeAttemptsAchivement(
		singleNodeAttemptCount,
		params.attemptedNodeId,
		params.outputTarget
	);

	// prevent there from being two very similar "you've done this x times" achievements.
	if (!allNodeAchivement && singleNodeAchivement) {
		achievements.push(singleNodeAchivement);
	}

	return achievements;
}

/**
 * Calculate the number of practice attempts the user has made. This is the number of
 * times the user has played the dance, excluding any attempts that were part of a larger
 * performance.
 * @param params Parameters on the users performance state & history.
 * @param target Whether to count attempts for the current node, or all nodes.
 * @returns The number of practice attempts the user has made.
 */
export function getAttemptCount(
	params: AchievementParams,
	target: 'attemptedNode' | 'allNodes'
): number {
	let attemptCount: number;
	if (target === 'attemptedNode') {
		const basicMetricEntries = params.performanceHistory?.[params.attemptedNodeId]?.basicInfo ?? [];
		attemptCount = basicMetricEntries.filter((x) => x.partOfLargerPerformance === false).length;
	} else if (target === 'allNodes') {
		const allSegmentEntries = params.performanceHistory ?? {};
		attemptCount = Object.values(allSegmentEntries)
			.flatMap((x) => x.basicInfo ?? [])
			.filter((x) => x.partOfLargerPerformance === false).length;
	} else {
		throw new Error('Unknown target: ' + target);
	}

	return attemptCount;
}
