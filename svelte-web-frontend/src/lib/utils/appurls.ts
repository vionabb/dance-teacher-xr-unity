
export function getMotionHomeUrl(args: {
    motionVideoId: number,
    motionSegmentationId: number,
    baseURL?: URL,
}): URL {
    const urlBase = args.baseURL?.toString() ??
        (typeof window !== 'undefined' ? window.location.origin : '');
    const urlString = `/motion/${args.motionVideoId}/segmentation/${args.motionSegmentationId}/`;
    return new URL(
        urlString,
        urlBase,
    );
}

export function getPracticeStepUrl(args: {
    motionVideoId: number,
    motionSegmentationId: number,
    practiceActivityId: string,
    practiceStepId: string,
    consecutiveAttemptNumber?: number,
    previousAttemptId?: number,
    baseURL?: URL,
}): URL {
    const url = getMotionHomeUrl({
        motionVideoId: args.motionVideoId,
        motionSegmentationId: args.motionSegmentationId,
        baseURL: args.baseURL,
    });
    if (url.pathname.endsWith('/') === false) {
        url.pathname += '/';
    }
    url.pathname += 'practice/';
    url.pathname += `${args.practiceActivityId}/`;
    url.pathname += `${args.practiceStepId}/`;
    
    if (args.consecutiveAttemptNumber && args.previousAttemptId) {
        url.searchParams.set('consecutiveAttempt', args.consecutiveAttemptNumber.toString());
        url.searchParams.set('previousAttemptId', args.previousAttemptId.toString());
    }
    return url;
}
