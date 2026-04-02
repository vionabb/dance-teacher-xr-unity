<span class="first">.</span><span class="second">.</span><span class="third">.</span>

<style lang="scss">
	span {
		display: inline-block;
		user-select: none;
	}
	.first {
		animation: ellipsis steps(4, end) 1200ms infinite;
	}
	.second {
		animation: ellipsis steps(4, end) 1200ms infinite;
		animation-delay: 400ms;
	}
	.third {
		animation: ellipsis steps(4, end) 1200ms infinite;
		animation-delay: 800ms;
	}
	@keyframes ellipsis {
		to {
			opacity: 0;
		}
	}
</style>
