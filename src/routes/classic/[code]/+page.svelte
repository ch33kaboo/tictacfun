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
	let currentPlayer = $state('X');
	let board = $state(Array(9).fill(''));
	let winner = $state<string | null>(null);
	// svelte-ignore state_referenced_locally
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
	let nextStartingPlayer = $state<'host' | 'guest'>('guest');
	let playerScore = $state(0);
	let opponentScore = $state(0);

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
			if (index !== -1) {
				board[index] = player;
			}
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
		gameUrl = `${window.location.origin}/classic/${gameCode}?${urlParams.toString()}`;

		// Fetch initial game state from server
		const response = await fetch(`/classic/${gameCode}`);
		const gameState = await response.json();
		board = gameState.board;
		currentPlayer = gameState.currentPlayer;
		playerScore = isHost ? gameState.XScore : gameState.OScore;
		opponentScore = isHost ? gameState.OScore : gameState.XScore;

		// Notify server that player has connected
		fetch(`/classic/${gameCode}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				action: 'playerConnected',
				playerId: isHost ? 'host' : 'guest'
			})
		});

		await subscription.subscribe(async (status) => {
			if (status === 'SUBSCRIBED') {
				const urlParams = new URLSearchParams(window.location.search);
				isHost = urlParams.get('host') === 'true';
				await subscription.track({ user: isHost ? 'host' : 'guest' });
			}
		});
	});

	onDestroy(() => {
		// Only execute in browser environment
		if (typeof window !== 'undefined') {
			// Notify server that player has disconnected
			fetch(`/classic/${gameCode}`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					action: 'playerDisconnected',
					playerId: isHost ? 'host' : 'guest'
				})
			}).catch(() => {
				// Ignore errors during disconnect
			});
		}

		subscription.unsubscribe();
		if (timerInterval) clearInterval(timerInterval);
	});

	function startTimer() {
		if (timerInterval) cancelAnimationFrame(timerInterval);
		timerStart = performance.now();

		function updateTimer() {
			let elapsed = (performance.now() - timerStart) / 1000;
			timeLeft = Math.max(0, timerDuration - elapsed);

			if (timeLeft > 0) {
				timerInterval = requestAnimationFrame(updateTimer);
			} else if (!winner) {
				// Timer ended - make an empty move to switch turns
				subscription.send({
					type: 'broadcast',
					event: 'game_move',
					payload: { index: -1, player: currentPlayer }
				});
				currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
				startTimer();
			}
		}
		timerInterval = requestAnimationFrame(updateTimer);
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

		// Send move to server
		fetch(`/classic/${gameCode}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				action: 'move',
				index,
				player: currentPlayer
			})
		});

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
				// Update scores when there's a winner (not a draw)
				if (gameResult !== 'draw') {
					const playerWon = (isHost && gameResult === 'X') || (!isHost && gameResult === 'O');
					if (playerWon) {
						playerScore++;
					} else {
						opponentScore++;
					}
					// Send score update to server
					fetch(`/classic/${gameCode}`, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json'
						},
						body: JSON.stringify({
							action: 'updateScore',
							playerWon,
							winner: gameResult
						})
					});
				}
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
		currentPlayer = nextStartingPlayer === 'host' ? 'X' : 'O';
		nextStartingPlayer = nextStartingPlayer === 'host' ? 'guest' : 'host';
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

		// Send reset action to server
		fetch(`/classic/${gameCode}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				action: 'reset',
				currentPlayer
			})
		});
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
		<div
			class="border-base-content/50 bg-base-content/10 fixed bottom-0 left-0 rounded-tr-2xl border-t-2 border-r-2 px-4 py-2 shadow-sm"
		>
			<p class="text-base font-semibold">
				You {playerScore} - {opponentScore} Opponent
			</p>
		</div>
		<div class="flex flex-col items-center text-center">
			{#if winner && !showingLastMove}
				<h2 class="mb-4 min-h-11 text-2xl font-bold">
					{getGameResultMessage()}
				</h2>
			{/if}
			{#if !(winner && !showingLastMove)}
				<div class="flex flex-row items-center justify-center gap-4">
					{#if showingLastMove}
						<h2 class="mb-4 min-h-11 text-2xl font-bold">Game Over!</h2>
					{:else if !winner}
						<div
							class="mb-4 flex min-h-11 min-w-[200px] items-center justify-center text-2xl font-bold"
						>
							<h2>
								{#if currentPlayer === (isHost ? 'X' : 'O')}
									{@html `Your turn <span class="text-lg">(${isHost ? 'X' : 'O'})</span>`}
								{:else}
									Opponent's turn
								{/if}
							</h2>
						</div>
					{/if}
					{#if timerDuration > 0 && !showingLastMove && !winner}
						<div class="mb-4">
							<div
								class="radial-progress {timeLeft <= 3 ? 'text-error' : ''} text-sm"
								style="--value:{(timeLeft / timerDuration) * 100}; --size:3rem;"
							>
								{Math.ceil(timeLeft)}s
							</div>
						</div>
					{/if}
				</div>
			{/if}

			<div class="grid grid-cols-3 gap-1">
				{#each board as cell, index}
					<button
						class="btn btn-lg aspect-square text-2xl font-bold transition-all duration-300 ease-in-out
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
