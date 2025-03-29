<script lang="ts">
	import { page } from '$app/state';
	import { onMount, onDestroy } from 'svelte';
	import { supabase } from '$lib/supabase';

	const gameCode = page.params.code;
	let timerDuration = $state(parseInt(page.url.searchParams.get('timer') || '0', 10));
	let isWaiting = $state(true);
	let isHost = $state(false);
	let gameStarted = $state(false);
	let currentPlayer = $state('X');
	let board = $state(Array(9).fill(''));
	let winner = $state<string | null>(null);
	let timeLeft = $state(timerDuration);
	let timerInterval: number | undefined;
	let gameUrl = $state('');
	let showCopiedMessage = $state(false);
	let playAgainRequested = $state(false);
	let playAgainInitiator: 'host' | 'guest' | null = $state(null);
	let bothPlayersReady = $state(false);
	let showingLastMove = $state(false);
	let lastPlayedIndex = $state<number | null>(null);
	let winningCombination = $state<number[] | null>(null);

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
				timeLeft = timerDuration;
			}
			gameStarted = true;
			if (timerDuration > 0) startTimer();
		})
		.on('broadcast', { event: 'game_move' }, ({ payload }) => {
			const { index, player } = payload;
			board[index] = player;
			currentPlayer = player === 'X' ? 'O' : 'X';

			// Set the last played index to trigger animation
			if (currentPlayer === (isHost ? 'X' : 'O')) {
				lastPlayedIndex = index;
				setTimeout(() => {
					lastPlayedIndex = null;
				}, 700);
			}

			if (timerDuration > 0) {
				clearInterval(timerInterval);
				timeLeft = timerDuration;
				startTimer();
			}
			checkWinner();
		})
		.on('broadcast', { event: 'turn_timeout' }, () => {
			if (!winner) {
				currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
				if (timerDuration > 0) {
					timeLeft = timerDuration;
					startTimer();
				}
			}
		})
		.on('broadcast', { event: 'play_again_request' }, ({ payload }) => {
			const { initiator } = payload;
			playAgainInitiator = initiator;

			if (!playAgainRequested) {
				playAgainRequested = true;
			} else {
				bothPlayersReady = true;
				resetGame();
				startGame();
			}
		})
		.on('broadcast', { event: 'start_game_request' }, ({ payload }) => {
			bothPlayersReady = true;
			resetGame();
			startGame();
		});

	onMount(async () => {
		const urlParams = new URLSearchParams(window.location.search);
		urlParams.set('host', 'false');
		gameUrl = `${window.location.origin}/game/${gameCode}?${urlParams.toString()}`;

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
		if (timerInterval) clearInterval(timerInterval);
	});

	function startTimer() {
		if (timerInterval) clearInterval(timerInterval);
		timeLeft = timerDuration;
		timerInterval = setInterval(() => {
			timeLeft--;
			if (timeLeft <= 0) {
				clearInterval(timerInterval);
				if (!winner) {
					subscription.send({
						type: 'broadcast',
						event: 'turn_timeout',
						payload: {}
					});
					currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
					timeLeft = timerDuration;
					startTimer();
				}
			}
		}, 1000);
	}

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
		if (timerDuration > 0) startTimer();
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
		if (timerDuration > 0) {
			clearInterval(timerInterval);
			timeLeft = timerDuration;
			startTimer();
		}
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

		let gameResult: string | null = null;
		winningCombination = null;

		for (const line of lines) {
			const [a, b, c] = line;
			if (board[a] && board[a] === board[b] && board[a] === board[c]) {
				gameResult = board[a];
				winningCombination = line;
				break;
			}
		}

		if (!gameResult && board.every((cell) => cell !== '')) {
			gameResult = 'draw';
		}

		if (gameResult) {
			if (timerInterval) clearInterval(timerInterval);
			showingLastMove = true;
			setTimeout(() => {
				showingLastMove = false;
				winner = gameResult;
			}, 2000); // Show last move for 2 seconds before displaying the result
		}
	}

	function getCellClass(index: number) {
		if (!winningCombination || !winner) return '';
		if (!winningCombination.includes(index)) return '';

		const playerWon = (isHost && winner === 'X') || (!isHost && winner === 'O');
		return playerWon ? 'btn-primary' : 'btn-neutral';
	}

	function isWinningCell(index: number) {
		return winningCombination?.includes(index) || false;
	}

	function getGameResultMessage() {
		if (winner === 'draw') return "It's a draw! 🤝";
		const playerWon = (isHost && winner === 'X') || (!isHost && winner === 'O');
		return playerWon ? 'You won! 🎉' : 'You lost 😢';
	}

	function requestPlayAgain() {
		playAgainRequested = true;
		playAgainInitiator = isHost ? 'host' : 'guest';
		subscription.send({
			type: 'broadcast',
			event: 'play_again_request',
			payload: { initiator: isHost ? 'host' : 'guest' }
		});
	}

	function requestStartGame() {
		winner = null;
		bothPlayersReady = true;
		resetGame();
		startGame();
		subscription.send({
			type: 'broadcast',
			event: 'start_game_request',
			payload: {}
		});
	}

	function resetGame() {
		board = Array(9).fill('');
		currentPlayer = 'X';
		winner = null;
		gameStarted = true;
		playAgainRequested = false;
		playAgainInitiator = null;
		bothPlayersReady = false;
		showingLastMove = false;
		lastPlayedIndex = null;
		winningCombination = null;
		if (timerInterval) clearInterval(timerInterval);
		if (timerDuration > 0) timeLeft = timerDuration;
	}

	function shouldShowPlayAgainMessage() {
		if (!playAgainRequested || bothPlayersReady) return false;
		return isHost ? playAgainInitiator === 'host' : playAgainInitiator === 'guest';
	}

	function shouldShowAcceptMessage() {
		if (!playAgainRequested || bothPlayersReady) return false;
		return isHost ? playAgainInitiator === 'guest' : playAgainInitiator === 'host';
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
		<div class="flex flex-col items-center text-center">
			{#if winner && !showingLastMove}
				<h2 class="mb-4 text-2xl font-bold">
					{getGameResultMessage()}
				</h2>
			{/if}
			{#if showingLastMove}
				<h2 class="mb-4 text-2xl font-bold">Game Over!</h2>
			{:else if !winner}
				<h2 class="mb-4 text-2xl font-bold">
					{currentPlayer === (isHost ? 'X' : 'O') ? 'Your turn!' : "Opponent's turn"}
				</h2>
			{/if}
			{#if timerDuration > 0 && !showingLastMove && !winner}
				<div class="mb-4">
					<div
						class="radial-progress {timeLeft <= 3 ? 'text-error' : ''}"
						style="--value:{(timeLeft / timerDuration) * 100}; --size:4rem;"
					>
						{timeLeft}s
					</div>
				</div>
			{/if}

			<div class="grid grid-cols-3 gap-1">
				{#each board as cell, index}
					<button
						class="btn btn-lg aspect-square text-2xl font-bold transition-all duration-100
							{cell && !isWinningCell(index)
							? 'btn-disabled'
							: !isWinningCell(index)
								? 'btn-outline'
								: 'cursor-auto'} 
							{lastPlayedIndex === index ? 'border-primary shadow-primary border-2' : ''} 
							{getCellClass(index)} rounded-none
							{index === 0 ? 'rounded-tl-2xl' : ''} 
							{index === 2 ? 'rounded-tr-2xl' : ''} 
							{index === 6 ? 'rounded-bl-2xl' : ''} 
							{index === 8 ? 'rounded-br-2xl' : ''}"
						onclick={() => makeMove(index)}
						disabled={!isWinningCell(index) &&
							(!!cell || !!winner || currentPlayer !== (isHost ? 'X' : 'O') || showingLastMove)}
					>
						{cell}
					</button>
				{/each}
			</div>

			{#if winner && !showingLastMove}
				{#if !playAgainRequested}
					<div class="min-h-24">
						<button class="btn btn-primary mt-4" onclick={requestPlayAgain}>Play Again</button>
					</div>
				{:else if !bothPlayersReady}
					{#if shouldShowPlayAgainMessage()}
						<div class="min-h-24">
							<p class="mt-4 text-lg">We sent an invitation to your friend to play again</p>
						</div>
					{:else if shouldShowAcceptMessage()}
						<div class="min-h-24">
							<p class="mt-4 text-lg">Your friend wants to play again</p>
							<button class="btn btn-primary mt-2" onclick={requestStartGame}>Accept</button>
						</div>
					{/if}
				{/if}
			{:else}
				<div class="h-24 w-1"></div>
			{/if}
		</div>
	{/if}
</div>
