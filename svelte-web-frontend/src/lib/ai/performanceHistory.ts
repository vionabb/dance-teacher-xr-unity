import { browser } from "$app/environment";
import type { BaseMetric } from "./motionmetrics/MotionMetric";

import { writable, derived } from 'svelte/store';

export type DanceSegmentPerformanceHistory<MetricTypes extends Record<string, BaseMetric<any, any>>> = {
    [K in keyof MetricTypes]?: Array<{
        date: Date,
        partOfLargerPerformance?: boolean,
        summary: Partial<ReturnType<MetricTypes[K]["formatSummary"]>>
    }>
}

export type DancePerformanceHistory<MetricTypes extends Record<string, BaseMetric<any, any>>> = {
    [segmentId: string]: DanceSegmentPerformanceHistory<MetricTypes>
}

export type CompletePerformanceHistory<MetricTypes extends Record<string, BaseMetric<any, any>>> = {
    [motionId: number]: DancePerformanceHistory<MetricTypes>
}

const PERFORMANCE_HISTORY_STORAGE_KEY = "performanceHistory";
const PERFORMANCE_HISTORY_VERSION = 2;

type VersionedPerformanceHistory<MetricTypes extends Record<string, BaseMetric<any, any>>> = {
    version: number,
    history: CompletePerformanceHistory<MetricTypes>,
};

function loadPerformanceHistoryFromLocalstorage<MetricTypes extends Record<string, BaseMetric<any, any>>>() {
    if (!browser) {
        return {} as CompletePerformanceHistory<MetricTypes>;
    }

    const history = localStorage.getItem(PERFORMANCE_HISTORY_STORAGE_KEY);
    if (history) {
        const parsed = JSON.parse(history) as CompletePerformanceHistory<MetricTypes> | VersionedPerformanceHistory<MetricTypes>;
        const data = "version" in parsed && "history" in parsed
            ? parsed.version === PERFORMANCE_HISTORY_VERSION ? parsed.history : null
            : null;
        if (!data) {
            localStorage.removeItem(PERFORMANCE_HISTORY_STORAGE_KEY);
            return {} as CompletePerformanceHistory<MetricTypes>;
        }
        // now, un-serialize the dates
        for (const motionIdString of Object.keys(data)) {
            const motionId = parseInt(motionIdString);
            if (isNaN(motionId)) continue;

            if (!data[motionId]) continue;
            for (const segmentId of Object.keys(data[motionId])) {
                for (const metricName of Object.keys(data[motionId][segmentId])) {
                    for (const attempt of data?.[motionId]?.[segmentId]?.[metricName] ?? []) {
                        attempt.date = new Date(attempt.date);
                    }
                }
            }
        }
        return data;
    } else {
        return {} as CompletePerformanceHistory<MetricTypes>;
    }
}

let a =  writable(0);

export function createPerformanceHistoryStore<MetricTypes extends Record<string, BaseMetric<any, any>>>() {
	const { subscribe, update } = writable(loadPerformanceHistoryFromLocalstorage() as CompletePerformanceHistory<MetricTypes>);

	return {
		subscribe,
        recordPerformance<MetricKey extends keyof MetricTypes, SummaryFormat extends ReturnType<MetricTypes[MetricKey]["formatSummary"]>>(
            motionVideoId: number, 
            segment: string, 
            metricName: MetricKey, 
            performance: Partial<SummaryFormat>,
            partOfLargerPerformance: boolean,
        ) {


            update((history) => {
                history[motionVideoId] = history[motionVideoId] ?? {};
                history[motionVideoId][segment] = history[motionVideoId][segment] ?? {};
                history[motionVideoId][segment][metricName] = history[motionVideoId][segment][metricName] ?? [];
    
                history[motionVideoId][segment][metricName]?.push({
                    date: new Date(),
                    partOfLargerPerformance,
                    summary: performance,
                })

                const versioned: VersionedPerformanceHistory<MetricTypes> = {
                    version: PERFORMANCE_HISTORY_VERSION,
                    history,
                };
                localStorage.setItem(PERFORMANCE_HISTORY_STORAGE_KEY, JSON.stringify(versioned));

                // console.log(`Recorded performance for dance ${danceRelativeStem}, segment ${segment}, metric ${String(metricName)}`, performance);
                return history;
            });


        },
        getDanceSegmentPerformanceHistory<T extends keyof MetricTypes>(motionId: number, metricName: T, segment: string) {
            return derived(this, ($history) => {
                return $history?.[motionId]?.[segment]?.[metricName] ?? [];
            });
        },
        lastNAttemptsAllSegments<T extends keyof MetricTypes>(motionId: number, metricName: T, n?: number) {
            return derived(this, ($history) => {
                if (!$history?.[motionId]) return [];
                const danceHistory = $history[motionId] ?? {};
                const allSegments = Object.keys(danceHistory) as string[];
                let attempts: Array<{
                    date: Date,
                    partOfLargerPerformance?: boolean,
                    summary: Partial<ReturnType<MetricTypes[T]["formatSummary"]>>,
                    segmentId: string,
                }> = [];

                for (const segment of allSegments) {
                    const segmentAttempts = danceHistory?.[segment]?.[metricName] ?? [];
                    const attemptsNotPartOfLargerPerformance = segmentAttempts.filter((attempt) => !(attempt.partOfLargerPerformance ?? true));
                    const attemptsNotPartOfLargerPerformanceWithSegment = attemptsNotPartOfLargerPerformance.map((attempt) => ({
                        ...attempt,
                        segmentId: segment,
                    }));
                    attempts = attempts.concat(attemptsNotPartOfLargerPerformanceWithSegment);
                }

                // Sort attempts - most recent first
                attempts.sort((a, b) => b.date.getTime() - a.date.getTime());
                if (n !== undefined) {
                    return attempts.slice(0, n);
                }
                return attempts;
            });
        },
        lastNAttempts<T extends keyof MetricTypes>(motionId: number, metricName: T, n?: number) {
            return derived(this, ($history) => {
                if (!$history) return [];
                const motionHistory = $history[motionId] ?? {};
                const allSegments = Object.keys(motionHistory) as string[];
                // let attempts: DanceSegmentPerformanceHistory<MetricTypes>[T] = []
                // for (const segment of allSegments) {
                //     const segmentAttempts = danceHistory[segment]?.[metricName] ?? [];
                //     const attemptsNotPartOfLargerPerformance = segmentAttempts.filter((attempt) => !(attempt.partOfLargerPerformance ?? true));
                //     attempts = attempts.concat(attemptsNotPartOfLargerPerformance);
                // }
                const attempts = allSegments.flatMap((segment) => {
                
                    const segmentAttempts = motionHistory[segment]?.[metricName] ?? [];
                    const attemptsNotPartOfLargerPerformance = segmentAttempts.filter((attempt) => !(attempt.partOfLargerPerformance ?? true));
                    const attemptsNotPartOfLargerPerformanceWithSegment = attemptsNotPartOfLargerPerformance.map((attempt) => ({
                        ...attempt,
                        segmentId: segment,
                    }));
                    return attemptsNotPartOfLargerPerformanceWithSegment;
                });

                // Sort attempts - most recent first
                attempts.sort((a, b) => b.date.getTime() - a.date.getTime());

                if (n !== undefined) {
                    return attempts.slice(-n);    
                }
                return attempts;
            });
        },

        clearAllHistory() {
            update(() => {
                localStorage.removeItem(PERFORMANCE_HISTORY_STORAGE_KEY);
                return {} as CompletePerformanceHistory<MetricTypes>;
            });
        }
	};
}

export type PerformanceHistoryStore<MetricTypes extends Record<string, BaseMetric<any, any>>> = ReturnType<typeof createPerformanceHistoryStore<MetricTypes>>
