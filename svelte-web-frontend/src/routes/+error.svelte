<script lang="ts">
	import { page } from "$app/state";
	import { navbarProps } from "$lib/elements/NavBar.svelte";
	
	navbarProps.update(props => ({
            ...props,
            collapsed: false,
            pageTitle: "",
            subtitle: undefined,
            back: {
                url: '/',
                title: 'Home',
            },
        }));
</script>

<div class="h-full w-full flex flex-col justify-center items-center error-holder">
	<h1>{page.status}: {page.error?.message ?? 'Something went wrong' }</h1>
	<pre>{JSON.stringify(page.error, null, 2)}</pre>
</div>

<style lang="scss">
	.error-holder {
		height: var(--content_height);
	}
</style>