<script lang="ts">
	import { page } from '$app/state';
	import { onMount, onDestroy } from 'svelte';
	import { supabase } from '$lib/supabase';

	const gameCode = page.params.code;
	let timerDuration = $state(parseInt(page.url.searchParams.get('timer') || '0', 10));
	let timerStart = $state(parseInt(page.url.searchParams.get('timer') || '0', 10));
	let isWaiting = $state(true);
	let isHost = $state(false);
	let gameStarted = $state(false);
	let gameUrl = $state('');
	let showCopiedMessage = $state(false);

	onMount(() => {
		const urlParams = new URLSearchParams(window.location.search);
		isHost = urlParams.get('host') === 'true';
	});

	const subscription = supabase
		.channel(`game:${gameCode}`)
		.on('presence', { event: 'sync' }, () => {
			const presenceState = subscription.presenceState();
			const players = Object.keys(presenceState).length;
			isWaiting = players < 2;
		})
		.on('broadcast', { event: 'game_start' }, ({ payload }) => {
			if (payload.timerDuration !== undefined) {
				timerDuration = payload.timerDuration;
				timerStart = timerDuration;
			}
			gameStarted = true;
		});

	onMount(async () => {
		const urlParams = new URLSearchParams(window.location.search);
		urlParams.set('host', 'false');
		gameUrl = `${window.location.origin}/super/${gameCode}?${urlParams.toString()}`;

		await subscription.subscribe(async (status) => {
			if (status === 'SUBSCRIBED') {
				const urlParams = new URLSearchParams(window.location.search);
				isHost = urlParams.get('host') === 'true';
				await subscription.track({ user: isHost ? 'host' : 'guest' });
			}
		});
	});

	onDestroy(() => {
		subscription.unsubscribe();
	});

	async function copyGameUrl() {
		try {
			const url = new URL(gameUrl);
			url.searchParams.delete('timer');
			await navigator.clipboard.writeText(url.toString());
		} catch {
			await navigator.clipboard.writeText(gameUrl);
		}

		showCopiedMessage = true;
		setTimeout(() => {
			showCopiedMessage = false;
		}, 2000);
	}

	function startGame() {
		subscription.send({
			type: 'broadcast',
			event: 'game_start',
			payload: {
				timerDuration
			}
		});
		gameStarted = true;
	}
</script>

<div class="flex min-h-[calc(100vh-4rem)] items-center justify-center">
	{#if isWaiting && isHost}
		<div class="text-center">
			<h2 class="mb-4 text-2xl font-bold">Game Code: {gameCode}</h2>
			<div class="mb-8">
				<p class="mb-2">Share this link with your friend to start playing!</p>
				<div class="join">
					<input
						type="text"
						value={gameUrl
							? (() => {
									try {
										const url = new URL(gameUrl);
										url.searchParams.delete('timer');
										return url.toString();
									} catch {
										return gameUrl; // Fallback in case of an invalid URL
									}
								})()
							: ''}
						readonly
						class="input input-bordered join-item w-full sm:w-96"
					/>
					<button class="btn btn-primary join-item" onclick={copyGameUrl}>
						{showCopiedMessage ? 'Copied!' : 'Copy'}
					</button>
				</div>
			</div>
			<div class="flex flex-col items-center gap-4">
				<div class="loading loading-dots loading-lg"></div>
				<p>Waiting for your friend to join...</p>
			</div>
		</div>
	{:else if !gameStarted}
		<div class="text-center">
			{#if isHost}
				<h2 class="mb-4 text-2xl font-bold">Friend joined!</h2>
				<button class="btn btn-primary" onclick={startGame}>Start Game</button>
				{#if timerDuration > 0}
					<p class="mt-2 text-sm">Timer set to {timerDuration} seconds per turn</p>
				{/if}
			{:else}
				<h2 class="mb-4 text-2xl font-bold">Ready to Play!</h2>
				<p>Waiting for host to start the game...</p>
				<div class="loading loading-dots loading-lg mt-4"></div>
			{/if}
		</div>
	{:else}
		<div class="text-center">
			<h2 class="text-2xl font-bold">Here is the super tic-tac-toe game</h2>
		</div>
	{/if}
</div>
