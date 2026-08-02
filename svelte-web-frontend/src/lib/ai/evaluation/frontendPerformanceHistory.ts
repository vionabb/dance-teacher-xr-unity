import type { FrontendMetrics } from './FrontendDanceEvaluator';
import {
	createPerformanceHistoryStore,
	type CompletePerformanceHistory,
	type DancePerformanceHistory,
	type DanceSegmentPerformanceHistory
} from './performanceHistory';

const frontendPerformanceHistory = createPerformanceHistoryStore<typeof FrontendMetrics>();
export default frontendPerformanceHistory;

/** The complete performance history, for all dances. Indexed by danceRelativeStem */
export type FrontendPerformanceHistory = CompletePerformanceHistory<typeof FrontendMetrics>;

/** The performance history for a dance. Indexed by segmentId */
export type FrontendDancePeformanceHistory = DancePerformanceHistory<typeof FrontendMetrics>;

/** The performance history for a single segment within a dance. Indexed by metric name */
export type FrontendSegmentPerformanceHistory = DanceSegmentPerformanceHistory<
	typeof FrontendMetrics
>;
