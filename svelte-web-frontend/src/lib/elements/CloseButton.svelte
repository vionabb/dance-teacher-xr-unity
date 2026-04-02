<script lang="ts">
	export let isVisible: boolean = true;
</script>

<button class="delete" class:isHidden={!isVisible} aria-label="close" on:click>
	<!-- <div class="svgContainer">    
        <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 1 1">
        <path d="M0,0 L1,1 M1,0 L0,1" />
        </svg>
    </div> -->
</button>
