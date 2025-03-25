<script lang="ts">
	import { page } from '$app/state';
	import { onMount, onDestroy } from 'svelte';
	import { supabase } from '$lib/supabase';

	const gameCode = page.params.code;
	let isWaiting = $state(true);
	let isHost = $state(false);
	let gameStarted = $state(false);
	let currentPlayer = $state('X');
	let board = $state(Array(9).fill(''));
	let winner = $state<string | null>(null);

	const subscription = supabase
		.channel(`game:${gameCode}`)
		.on('presence', { event: 'sync' }, () => {
			const presenceState = subscription.presenceState();
			const players = Object.keys(presenceState).length;
			isWaiting = players < 2;
		})
		.on('broadcast', { event: 'game_start' }, () => {
			gameStarted = true;
		})
		.on('broadcast', { event: 'game_move' }, ({ payload }) => {
			const { index, player } = payload;
			board[index] = player;
			currentPlayer = player === 'X' ? 'O' : 'X';
			checkWinner();
		});

	onMount(async () => {
		await subscription.subscribe(async (status) => {
			if (status === 'SUBSCRIBED') {
				const presenceState = subscription.presenceState();
				isHost = Object.keys(presenceState).length === 0;
				await subscription.track({ user: isHost ? 'host' : 'guest' });
			}
		});
	});

	onDestroy(() => {
		subscription.unsubscribe();
	});

	function startGame() {
		subscription.send({
			type: 'broadcast',
			event: 'game_start',
			payload: {}
		});
		gameStarted = true;
	}

	function makeMove(index: number) {
		if (board[index] || winner || currentPlayer === (isHost ? 'O' : 'X')) return;

		board[index] = currentPlayer;
		subscription.send({
			type: 'broadcast',
			event: 'game_move',
			payload: { index, player: currentPlayer }
		});

		currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
		checkWinner();
	}

	function checkWinner() {
		const lines = [
			[0, 1, 2],
			[3, 4, 5],
			[6, 7, 8], // Rows
			[0, 3, 6],
			[1, 4, 7],
			[2, 5, 8], // Columns
			[0, 4, 8],
			[2, 4, 6] // Diagonals
		];

		for (const [a, b, c] of lines) {
			if (board[a] && board[a] === board[b] && board[a] === board[c]) {
				winner = board[a];
				return;
			}
		}

		if (board.every((cell) => cell !== '')) {
			winner = 'draw';
		}
	}

	function resetGame() {
		board = Array(9).fill('');
		currentPlayer = 'X';
		winner = null;
		gameStarted = false;
	}
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
	{:else if !gameStarted}
		<div class="text-center">
			<h2 class="mb-4 text-2xl font-bold">Friend joined!</h2>
			{#if isHost}
				<button class="btn btn-primary" onclick={startGame}>Start Game</button>
			{:else}
				<p>Waiting for host to start the game...</p>
				<div class="loading loading-dots loading-lg mt-4"></div>
			{/if}
		</div>
	{:else}
		<div class="text-center">
			{#if winner}
				<div class="mb-8">
					<h2 class="text-2xl font-bold">
						{winner === 'draw' ? "It's a draw!" : `Player ${winner} wins!`}
					</h2>
					<button class="btn btn-primary mt-4" onclick={resetGame}>Play Again</button>
				</div>
			{:else}
				<h2 class="mb-8 text-2xl font-bold">
					{currentPlayer === (isHost ? 'X' : 'O') ? 'Your turn!' : "Opponent's turn"}
				</h2>
			{/if}

			<div class="grid grid-cols-3 gap-4">
				{#each board as cell, index}
					<button
						class="btn btn-lg aspect-square text-2xl font-bold {cell
							? 'btn-disabled'
							: 'btn-outline'}"
						onclick={() => makeMove(index)}
						disabled={!!cell || !!winner || currentPlayer !== (isHost ? 'X' : 'O')}
					>
						{cell}
					</button>
				{/each}
			</div>
		</div>
	{/if}
</div>
