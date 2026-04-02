import type PracticeStep from './PracticeStep';

export type PracticePlanActivityType = 'segment' | 'checkpoint' | 'drill' | 'finale';

export type PracticePlanActivityBase = {
	id: string;
	steps: PracticeStep[];
	title: string;
};

export interface SegmentActivity extends PracticePlanActivityBase {
	type: 'segment';
	segmentTitle: string;
	segmentIndex: number;
	// segmentTitle: string;
}
export interface CheckpointActivity extends PracticePlanActivityBase {
	type: 'checkpoint';
}
export interface DrillActivity extends PracticePlanActivityBase {
	type: 'drill';
}
export interface FinaleActivity extends PracticePlanActivityBase {
	type: 'finale';
}

export type PracticePlanActivity =
	| SegmentActivity
	| CheckpointActivity
	| DrillActivity
	| FinaleActivity;

export type PracticePlanStage = {
	// type: '';
	activities: PracticePlanActivity[];
};

export type DanceSegmentation = {
	startTime: number;
	segmentBreaks: number[];
	endTime: number;
	segmentLabels: string[];
};

export type PracticePlan = {
	id: string;
	startTime: number;
	endTime: number;
	stages: PracticePlanStage[];
	demoSegmentation?: {
		segmentBreaks: number[];
		segmentLabels: string[];
	};
};
