<script lang="ts">
	import { page } from '$app/state';

	const gameCode = page.params.code;
	let isWaiting = true;

	// TODO: Implement WebSocket connection and game logic
</script>

<div class="flex min-h-[calc(100vh-4rem)] items-center justify-center">
	{#if isWaiting}
		<div class="text-center">
			<h2 class="mb-4 text-2xl font-bold">Game Code: {gameCode}</h2>
			<p class="mb-8">Share this code with your friend to start playing!</p>
			<div class="flex flex-col items-center gap-4">
				<div class="loading loading-dots loading-lg"></div>
				<p>Waiting for your friend to join...</p>
			</div>
		</div>
	{:else}
		<div class="grid grid-cols-3 gap-4">
			<!-- Game board will be implemented here -->
		</div>
	{/if}
</div>
