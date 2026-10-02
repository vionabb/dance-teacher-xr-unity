<script lang="ts">
	import { goto, replaceState } from '$app/navigation';
	import { page } from '$app/state';
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
		const currentUrl = new URL(page.url);
		currentUrl.searchParams.set('performance', performanceId);
		currentUrl.searchParams.set('time', String(timeSeconds));
		replaceState(currentUrl, page.state);
		void goto(`/metrics/${metric}?${params.toString()}`);
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
