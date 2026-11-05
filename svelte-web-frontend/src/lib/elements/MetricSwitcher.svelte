<script lang="ts">
	import { goto, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { setLastMetric } from '$lib/utils/last-inspected-metric';

	interface Props {
		performanceId: string;
		timeSeconds: number;
		currentMetric: 'qijia2d' | 'viona2d';
	}

	let { performanceId, timeSeconds, currentMetric }: Props = $props();

	function switchMetric(event: Event) {
		const metric = (event.currentTarget as HTMLSelectElement).value;
		if (metric !== 'qijia2d' && metric !== 'viona2d') return;
		setLastMetric(metric);

		const params = new URLSearchParams({ performance: performanceId, time: String(timeSeconds) });
		if (page.url.searchParams.get('review') === 'discrepancy') params.set('review', 'discrepancy');
		const currentParams = new URLSearchParams(page.url.searchParams);
		currentParams.set('performance', performanceId);
		currentParams.set('time', String(timeSeconds));
		replaceState(resolve(`/metrics/${currentMetric}?${currentParams.toString()}`), page.state);
		void goto(resolve(`/metrics/${metric}?${params.toString()}`));
	}
</script>

<label class="flex items-center gap-2 text-xs">
	<span>Metric</span>
	<select
		class="daisy-select daisy-select-bordered daisy-select-sm"
		aria-label="Visualized metric"
		value={currentMetric}
		onchange={switchMetric}
	>
		<option value="qijia2d">Qijia2D</option>
		<option value="viona2d">Viona2D</option>
	</select>
</label>
