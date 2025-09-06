<script lang="ts">
	
	import { navbarProps } from "$lib/elements/NavBar.svelte";
	import DanceLandingPage from "./DanceLandingPage.svelte";
	
    let { data } = $props();
    
    $effect(() => {
        navbarProps.update(props => ({
            ...props,
            collapsed: false,
            pageTitle: data.motionVideo.display_name,
            subtitle: `Dashboard`,
            back: {
                url: '/',
                title: 'Home',
            },
        }));
    });
</script>

<svelte:head>
    <title>{data.motionVideo.display_name} Learning Dashboard</title>
    <meta name="description" content="App for learning the dance: {data.motionVideo.display_name}" />
</svelte:head>

<DanceLandingPage 
    motionVideo={data.motionVideo}    
    practicePlan={data.userLearningModel.plan}
/>