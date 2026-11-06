// Worker message names live apart from mediapipe-utils.ts, whose landmark definitions are part
// of the hosted CHI25 metric-release fingerprint (src/lib/server/chi25-metric-release.js).
export enum ResponseMessages {
	poseEstimation = 'poseEstimation',
	error = 'error',
	resetComplete = 'resetComplete',
	resetError = 'resetError'
}

export enum PostMessages {
	requestPoseEstimation = 'requestPoseEstimation',
	reset = 'reset',
	confirmReady = 'confirmReady'
}
