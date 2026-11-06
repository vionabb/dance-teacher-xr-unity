import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ANALYSIS_SOURCE_VERSION, sha256, stableJson } from './chi25-analysis-contract.js';

/** Source files whose contents determine the hosted Qijia2D/Viona2D metric output. */
export const METRIC_MODULES = [
	'src/lib/ai/motionmetrics/qijia2d-inspector.ts',
	'src/lib/ai/motionmetrics/viona2d-inspector.ts',
	'src/lib/ai/EvaluationCommonUtils.ts',
	'src/lib/webcam/mediapipe-utils.ts',
	'src/lib/utils/math.ts',
	'src/lib/utils/array.ts'
];
/** Third-party runtime packages imported by METRIC_MODULES. */
export const METRIC_DEPENDENCIES = ['papaparse'];

/**
 * Resolved version of a direct dependency from pnpm-lock.yaml's root importer.
 * @param {string} lock @param {string} name
 */
export function lockedVersion(lock, name) {
	const importer = lock.match(/^importers:\n+ {2}\.:\n([\s\S]*?)(?=^\S)/m)?.[1];
	const escaped = name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
	const version = importer?.match(
		new RegExp(`^ {6}'?${escaped}'?:\\n {8}specifier: .*\\n {8}version: (\\S+)`, 'm')
	)?.[1];
	if (!version) throw new Error(`pnpm-lock.yaml has no root dependency ${name}`);
	return version;
}

/**
 * Fingerprint the metric math and the locked versions of its runtime dependencies at
 * build/import time. Only the dependencies the metric modules import are pinned, so unrelated
 * lockfile changes (e.g. an LLM SDK bump) do not invalidate the hosted registry.
 * @param {string} root
 */
export function readMetricRelease(root) {
	/** @type {Record<string,string>} */
	const hashes = {};
	for (const file of METRIC_MODULES) hashes[file] = sha256(readFileSync(path.join(root, file)));
	const lock = readFileSync(path.join(root, 'pnpm-lock.yaml'), 'utf8');
	for (const name of METRIC_DEPENDENCIES)
		hashes[`pnpm-lock.yaml#${name}`] = sha256(`${name}@${lockedVersion(lock, name)}`);
	return {
		id: sha256(stableJson(hashes)),
		source_version: ANALYSIS_SOURCE_VERSION,
		module_hashes: hashes,
		pairing: 'row-index-truncate-shorter',
		time_basis: 'participant-segment-video-seconds'
	};
}
