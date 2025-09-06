<script lang="ts">
	import type { PracticePlanActivity } from '$lib/model/PracticePlan';
    import { navbarProps } from "$lib/elements/NavBar.svelte";

    export let data;
    let practiceActivity: PracticePlanActivity;
    $: practiceActivity = data.practiceActivity;
    $: {
        navbarProps.update(props => ({
            ...props,
            collapsed: false,
            pageTitle: data.practiceActivity.title,
            subtitle:  'Practice Steps',
            back: {
                url: '/dance/' + encodeURIComponent(data.dance.clipRelativeStem) + '/' + encodeURIComponent(data.danceTree.tree_name) + '/',
                title: `${data.dance.title} Home`,
            },
        }));
    }
</script>

<div class="prose p-4">
    <h1>Available Practice Steps</h1>
    {#if practiceActivity.steps.length > 0}
        <ul>
            {#each practiceActivity.steps as step}
                <li>
                    <a href="{encodeURIComponent(step.id)}">
                        {step.title}
                    </a>
                </li>
            {/each}
        </ul>
    {:else}
        <p>No practice steps available.</p>
    {/if}
</div>