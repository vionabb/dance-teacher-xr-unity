import { writable } from 'svelte/store';
import { PracticeInterfaceModeOptions, type PracticeStepModeKey } from './PracticeStep';
import { browser } from '$app/environment';

const DEFAULT_SETTINGS = {
	debugMode: false,
	debugMode__viewBeatsOnDanceTreepage: false,
	debugMode__addPlaceholderAchievement: false,
	pauseInPracticePage: false,
	practiceActivities__enablePerformanceRecording: true,
	debugPauseDurationSecs: 1.0,
	evaluation_GoodBadTrialThreshold: 4.0,
	livefeedback_qijia2d_YellowThreshold: 3.0,
	livefeedback_qijia2d_GreenThreshold: 4.2,
	useAIFeedback: true,
	useTextToSpeech: true,
	summaryFeedback_skeleton3d_mediumPerformanceThreshold: 0.8,
	summaryFeedback_skeleton3d_goodPerformanceThreshold: 0.9,
	evaluation_summarizeSubsections: 'allnodes' as const,
	metric__3dskeletonsimilarity__badJointStdDeviationThreshold: 1.5,
	poseEstimation__interFrameIdleTimeMs: -1,
	danceVideoVolume: 0.5,

	practiceActivities__playbackSpeed: 0.5,
	practiceActivities__interfaceMode: 'bothVideos' as PracticeStepModeKey,
	practiceActivities__terminalFeedbackEnabled: true,
	practiceActivities__showUserSkeleton: true
};

export const pauseDurationMin = 0.1;
export const pauseDurationMax = 120;
export const stepMin = 0.1;
export const stepMax = 5;

function createSettingsStore<T>(key: string, defaultValue: T, stringParser: (input: string) => T) {
	let initialValue = defaultValue;
	if (browser) {
		const storedValue = localStorage[key];
		if (storedValue !== undefined) {
			initialValue = stringParser(storedValue);
		}
	}

	const settingsStore = writable(initialValue);
	if (browser) {
		settingsStore.subscribe((value) => (localStorage[key] = String(value)));
	}
	return settingsStore;
}

function createBoolSettingsStore(key: string, defaultValue: boolean) {
	return createSettingsStore(key, defaultValue, (input: string) => input === 'true');
}
function createNumberSettingsStore(key: string, defaultValue: number) {
	return createSettingsStore(key, defaultValue, Number.parseFloat);
}
function createOptionsSettingsStore<T extends Record<string, string>>(
	key: string,
	defaultValue: keyof T,
	options: Readonly<T>
) {
	return createSettingsStore(key, defaultValue, (input: string) => {
		const optionsKeys = Object.keys(options);
		if (!optionsKeys.includes(input)) {
			console.warn(`Ignoring invalid stored value for ${key}: ${input}`);
			return defaultValue;
		}
		return input as keyof T;
	});
}

export const debugMode = createBoolSettingsStore('debugMode', DEFAULT_SETTINGS.debugMode);
export const debugMode__viewBeatsOnDanceTreepage = createBoolSettingsStore(
	'debugMode__viewBeatsOnDanceTreepage',
	DEFAULT_SETTINGS.debugMode__viewBeatsOnDanceTreepage
);
export const debugMode__addPlaceholderAchievement = createBoolSettingsStore(
	'debugMode__addPlaceholderAchievement',
	DEFAULT_SETTINGS.debugMode__addPlaceholderAchievement
);
export const pauseInPracticePage = createBoolSettingsStore(
	'pauseInPracticePage',
	DEFAULT_SETTINGS.pauseInPracticePage
);
export const debugPauseDurationSecs = createNumberSettingsStore(
	'debugPauseDurationSecs',
	DEFAULT_SETTINGS.debugPauseDurationSecs
);
export const evaluation_GoodBadTrialThreshold = createNumberSettingsStore(
	'evaluation_GoodBadTrialThreshold',
	DEFAULT_SETTINGS.evaluation_GoodBadTrialThreshold
);
export const feedback_YellowThreshold = createNumberSettingsStore(
	'feedback_YellowThreshold',
	DEFAULT_SETTINGS.livefeedback_qijia2d_YellowThreshold
);
export const feedback_GreenThreshold = createNumberSettingsStore(
	'feedback_GreenThreshold',
	DEFAULT_SETTINGS.livefeedback_qijia2d_GreenThreshold
);
export const useAIFeedback = createBoolSettingsStore(
	'useAIFeedback',
	DEFAULT_SETTINGS.useAIFeedback
);
export const useTextToSpeech = createBoolSettingsStore(
	'useTextToSpeech',
	DEFAULT_SETTINGS.useTextToSpeech
);
export const evaluation_summarizeSubsectionsOptions = {
	// storedValue: displayName
	disable: "Don't evaluate subsections",
	leafnodes: 'Evaluate leaf nodes only',
	allnodes: 'Evaluate all subsections'
};
export const evaluation_summarizeSubsections = createOptionsSettingsStore(
	'evaluation_analyzeSubsections',
	DEFAULT_SETTINGS.evaluation_summarizeSubsections,
	evaluation_summarizeSubsectionsOptions
);
export const metric__3dskeletonsimilarity__badJointStdDeviationThreshold =
	createNumberSettingsStore(
		'metric__3dskeletonsimilarity__badJointStdDeviationThreshold',
		DEFAULT_SETTINGS.metric__3dskeletonsimilarity__badJointStdDeviationThreshold
	);
export const poseEstimation__interFrameIdleTimeMs = createNumberSettingsStore(
	'poseEstimation__interFrameIdleTimeMs',
	DEFAULT_SETTINGS.poseEstimation__interFrameIdleTimeMs
);
export const summaryFeedback_skeleton3d_mediumPerformanceThreshold = createNumberSettingsStore(
	'summaryFeedback_skeleton3d_mediumPerformanceThreshold',
	DEFAULT_SETTINGS.summaryFeedback_skeleton3d_mediumPerformanceThreshold
);
export const summaryFeedback_skeleton3d_goodPerformanceThreshold = createNumberSettingsStore(
	'summaryFeedback_skeleton3d_goodPerformanceThreshold',
	DEFAULT_SETTINGS.summaryFeedback_skeleton3d_goodPerformanceThreshold
);
export const danceVideoVolume = createNumberSettingsStore(
	'danceVideoVolume',
	DEFAULT_SETTINGS.danceVideoVolume
);

export const practiceActivities__playbackSpeed = createNumberSettingsStore(
	'practiceActivities__playbackSpeed',
	DEFAULT_SETTINGS.practiceActivities__playbackSpeed
);
export const practiceActivities__interfaceMode = createOptionsSettingsStore(
	'practiceActivities__interfaceMode',
	DEFAULT_SETTINGS.practiceActivities__interfaceMode,
	PracticeInterfaceModeOptions
);
export const practiceActivities__enablePerformanceRecording = createBoolSettingsStore(
	'practiceActivities__enablePerformanceRecording',
	DEFAULT_SETTINGS.practiceActivities__enablePerformanceRecording
);

export const practiceActivities__terminalFeedbackEnabled = createBoolSettingsStore(
	'practiceActivities__terminalFeedbackEnabled',
	DEFAULT_SETTINGS.practiceActivities__terminalFeedbackEnabled
);
export const practiceActivities__showUserSkeleton = createBoolSettingsStore(
	'practiceActivities__showUserSkeleton',
	DEFAULT_SETTINGS.practiceActivities__showUserSkeleton
);

// Reset all variables to their default values
export function resetSettingsToDefault() {
	debugMode.set(DEFAULT_SETTINGS.debugMode);
	debugMode__viewBeatsOnDanceTreepage.set(DEFAULT_SETTINGS.debugMode__viewBeatsOnDanceTreepage);
	debugMode__addPlaceholderAchievement.set(DEFAULT_SETTINGS.debugMode__addPlaceholderAchievement);
	pauseInPracticePage.set(DEFAULT_SETTINGS.pauseInPracticePage);
	debugPauseDurationSecs.set(DEFAULT_SETTINGS.debugPauseDurationSecs);
	evaluation_GoodBadTrialThreshold.set(DEFAULT_SETTINGS.evaluation_GoodBadTrialThreshold);
	feedback_YellowThreshold.set(DEFAULT_SETTINGS.livefeedback_qijia2d_YellowThreshold);
	feedback_GreenThreshold.set(DEFAULT_SETTINGS.livefeedback_qijia2d_GreenThreshold);
	useAIFeedback.set(DEFAULT_SETTINGS.useAIFeedback);
	useTextToSpeech.set(DEFAULT_SETTINGS.useTextToSpeech);
	summaryFeedback_skeleton3d_mediumPerformanceThreshold.set(
		DEFAULT_SETTINGS.summaryFeedback_skeleton3d_mediumPerformanceThreshold
	);
	summaryFeedback_skeleton3d_goodPerformanceThreshold.set(
		DEFAULT_SETTINGS.summaryFeedback_skeleton3d_goodPerformanceThreshold
	);
	evaluation_summarizeSubsections.set(DEFAULT_SETTINGS.evaluation_summarizeSubsections);
	metric__3dskeletonsimilarity__badJointStdDeviationThreshold.set(
		DEFAULT_SETTINGS.metric__3dskeletonsimilarity__badJointStdDeviationThreshold
	);
	poseEstimation__interFrameIdleTimeMs.set(DEFAULT_SETTINGS.poseEstimation__interFrameIdleTimeMs);
	danceVideoVolume.set(DEFAULT_SETTINGS.danceVideoVolume);

	practiceActivities__playbackSpeed.set(DEFAULT_SETTINGS.practiceActivities__playbackSpeed);
	practiceActivities__interfaceMode.set(DEFAULT_SETTINGS.practiceActivities__interfaceMode);
	practiceActivities__enablePerformanceRecording.set(
		DEFAULT_SETTINGS.practiceActivities__enablePerformanceRecording
	);
	practiceActivities__terminalFeedbackEnabled.set(
		DEFAULT_SETTINGS.practiceActivities__terminalFeedbackEnabled
	);
	practiceActivities__showUserSkeleton.set(DEFAULT_SETTINGS.practiceActivities__showUserSkeleton);
}
