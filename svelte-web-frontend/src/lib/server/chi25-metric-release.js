import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ANALYSIS_SOURCE_VERSION, sha256, stableJson } from './chi25-analysis-contract.js';

/** Fingerprint the math and its dependency lock at build/import time. @param {string} root */
export function readMetricRelease(root) {
	const files = [
		'src/lib/ai/motionmetrics/qijia2d-inspector.ts',
		'src/lib/ai/motionmetrics/viona2d-inspector.ts',
		'src/lib/ai/EvaluationCommonUtils.ts',
		'src/lib/webcam/mediapipe-utils.ts',
		'src/lib/utils/math.ts',
		'src/lib/utils/array.ts',
		'pnpm-lock.yaml'
	];
	/** @type {Record<string,string>} */
	const hashes = {};
	for (const file of files) hashes[file] = sha256(readFileSync(path.join(root, file)));
	return {
		id: sha256(stableJson(hashes)),
		source_version: ANALYSIS_SOURCE_VERSION,
		module_hashes: hashes,
		pairing: 'row-index-truncate-shorter',
		time_basis: 'participant-segment-video-seconds'
	};
}
