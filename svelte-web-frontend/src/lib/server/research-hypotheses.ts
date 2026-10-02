import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const HYPOTHESIS_STATUSES = [
	'candidate',
	'investigating',
	'evidence-review',
	'resolved',
	'archived'
] as const;
export type HypothesisStatus = (typeof HYPOTHESIS_STATUSES)[number];

type Hypothesis = {
	slug: string;
	title: string;
	question: string;
	sources: { file: string; label: string }[];
	sections: {
		title: string;
		text: string;
		href?: '/research' | '/research/records' | '/research/records/rate';
	}[];
};

// This registry identifies research threads; overview prose is read from the cited lab log.
export const hypotheses: Hypothesis[] = [
	{
		slug: 'landmark-error-signals',
		title: 'Detecting landmark errors beyond visibility',
		question:
			'Can temporal, geometric, and identity-swap signals find errors missed by visibility?',
		sources: [{ file: '2026-09-30-frame-visibility-audit.md', label: 'Visibility audit' }],
		sections: [
			{
				title: 'Investigation',
				text: 'Compare visibility with temporal discontinuity, limb geometry, and left/right swap signals against held-out saved corrections. Keep unmarked landmarks distinct from verified negatives.'
			},
			{
				title: 'Inspect source records',
				text: 'Review imported pose-usability judgments and their exact provenance.',
				href: '/research/records'
			}
		]
	},
	{
		slug: 'segment-tracking-risk',
		title: 'Recurring tracking risk by segment',
		question: 'Do particular dance segments have elevated tracking error across people?',
		sources: [
			{ file: '2026-10-01-layered-pose-quality-and-segment-coverage.md', label: 'Coverage audit' }
		],
		sections: [
			{
				title: 'Sampling plan',
				text: 'Fill sparse study × dance × segment × condition cells, then compare suspected segments with balanced controls across independent participants. The current sample is signal-enriched.'
			},
			{
				title: 'Review queue',
				text: 'The local usability queue implements the first coverage step, with selection details hidden during rating.',
				href: '/research/records/rate'
			}
		]
	},
	{
		slug: 'reference-participant-trackability',
		title: 'Reference and participant trackability',
		question: 'Does a difficult reference segment signal tracking risk in participant clips?',
		sources: [
			{ file: '2026-10-01-layered-pose-quality-and-segment-coverage.md', label: 'Coverage audit' }
		],
		sections: [
			{
				title: 'Decision needed',
				text: 'Define reference acceptance and correction-burden rules before using reference ratings to predict participant trackability.'
			}
		]
	},
	{
		slug: 'metric-sensitivity-to-corrections',
		title: 'Metric sensitivity to pose corrections',
		question: 'Do motion metrics respond meaningfully where human-corrected pose errors occur?',
		sources: [
			{ file: '2026-10-02-manual-review-paired-metrics.md', label: 'Paired metric analysis' }
		],
		sections: [
			{
				title: 'Next analysis',
				text: 'Inspect score response within marked spans and test landmark-level error signals. Whole-clip correlation alone cannot establish whether corrections improve metric validity.'
			},
			{
				title: 'Metric inspectors',
				text: 'Open the existing local metric view for a performance.',
				href: '/research'
			}
		]
	},
	{
		slug: 'confidence-aware-coaching',
		title: 'Confidence-aware coaching',
		question:
			'Can the coach abstain or request another attempt when tracking evidence is insufficient?',
		sources: [
			{
				file: '2026-10-01-layered-pose-quality-and-segment-coverage.md',
				label: 'Pose-quality direction'
			}
		],
		sections: [
			{
				title: 'Design contract',
				text: 'Separate tracking confidence and coverage from movement quality. Evaluate whether abstention, retry, or camera guidance is useful after those signals are defined.'
			}
		]
	}
];

export function getHypothesis(slug: string): Hypothesis | undefined {
	return hypotheses.find((item) => item.slug === slug);
}

export async function hypothesisOverview(hypothesis: Hypothesis): Promise<{
	paragraphs: string[];
	source: string;
	markdown: string;
}> {
	const source = hypothesis.sources[0].file;
	const markdown = await readFile(path.resolve(process.cwd(), '..', 'lab-log', source), 'utf8');
	const body = markdown.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');
	const introduction = body.replace(/^# .+\n/, '').split(/^## /m)[0];
	const paragraphs = introduction
		.split(/\n\s*\n/)
		.map((paragraph) =>
			paragraph
				.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
				.replace(/[*`]/g, '')
				.replace(/\s*\n\s*/g, ' ')
				.trim()
		)
		.filter(Boolean)
		.slice(0, 2);
	return { paragraphs, source, markdown };
}
