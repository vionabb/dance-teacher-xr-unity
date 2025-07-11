<script lang="ts">
	import type { Dance, DanceTree } from "$lib/data/dances-store.js";

	import { navbarProps } from "$lib/elements/NavBar.svelte";
	import type { PracticePlan } from "$lib/model/PracticePlan";
	import DanceLandingPage from "./DanceLandingPage.svelte";
	import { page } from '$app/state';
	import { getContext, setContext } from "svelte";
	import TeachingAgent from "$lib/ai/TeachingAgent/TeachingAgent";
	import { derived, readable, writable, type Readable } from "svelte/store";

    let { data } = $props();
    
    let danceId = $derived(page.params.danceId);
    let danceTreeName = $derived(page.params.danceTreeName);

    const dance = getContext<Readable<Dance>>('dance');
    // const danceTree = getContext<Readable<DanceTree>>('danceTree');
    // const teachingAgent = getContext<Readable<TeachingAgent>>('teachingAgent');
    const practicePlan = getContext<Readable<PracticePlan>>('practicePlan');

    $effect(() => {
        navbarProps.update(props => ({
            ...props,
            collapsed: false,
            pageTitle: $dance?.title,
            subtitle: `Dashboard`,
            back: {
                url: '/',
                title: 'Home',
            },
        }));
    });
</script>

<svelte:head>
    <title>{$dance.title} Learning Dashboard</title>
    <meta name="description" content="App for learning the dance: {$dance.title}" />
</svelte:head>

<DanceLandingPage 
    dance={$dance}    
    practicePlan={$practicePlan}
/>