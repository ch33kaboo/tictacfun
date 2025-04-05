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
	let board = $state(Array(81).fill('')); // 9x9 grid for super tic-tac-toe
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
	let nextStartingPlayer = $state<'host' | 'guest'>('guest');
	let playerScore = $state(0);
	let opponentScore = $state(0);
	let activeGrid = $state<number | null>(null);
	let hoveredGridIndex = $state<number | null>(null);
	let completedGrids = $state(Array(9).fill('')); // Track completed grids

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
			const { index, player, nextGrid } = payload;
			board[index] = player;
			currentPlayer = player === 'X' ? 'O' : 'X';
			activeGrid = nextGrid;

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
			} else {
				// Timer ended
				if (!winner) {
					subscription.send({
						type: 'broadcast',
						event: 'turn_timeout',
						payload: {}
					});
					currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
					startTimer();
				}
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
		if (board[index] || winner || currentPlayer !== (isHost ? 'X' : 'O')) return;

		// Calculate which grid the move is in
		const currentGrid = Math.floor(index / 9);
		const targetGrid = index % 9;

		// If we're in a specific grid and trying to play in a different one, and that grid is not completed, return
		if (activeGrid !== null && currentGrid !== activeGrid && completedGrids[activeGrid] === '')
			return;

		// If the target grid is completed, allow playing anywhere
		if (completedGrids[targetGrid] !== '') {
			activeGrid = null;
		} else {
			activeGrid = targetGrid;
		}

		board[index] = currentPlayer;

		subscription.send({
			type: 'broadcast',
			event: 'game_move',
			payload: { index, player: currentPlayer, nextGrid: targetGrid }
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
		// Check each 3x3 grid for a winner
		const gridWinners = Array(9).fill('');
		for (let grid = 0; grid < 9; grid++) {
			const gridStart = grid * 9;
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

			for (const line of lines) {
				const [a, b, c] = line;
				if (
					board[gridStart + a] &&
					board[gridStart + a] === board[gridStart + b] &&
					board[gridStart + a] === board[gridStart + c]
				) {
					gridWinners[grid] = board[gridStart + a];
					completedGrids[grid] = board[gridStart + a]; // Mark this grid as completed
					break;
				}
			}
		}

		// Check if any player has won the overall game
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
			if (
				gridWinners[a] &&
				gridWinners[a] === gridWinners[b] &&
				gridWinners[a] === gridWinners[c]
			) {
				gameResult = gridWinners[a];
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
				}
			}, 2000);
		}
	}

	function getCellClass(index: number) {
		if (!winningCombination || !winner) return '';
		const gridIndex = Math.floor(index / 9);
		if (!winningCombination.includes(gridIndex)) return '';

		const playerWon = (isHost && winner === 'X') || (!isHost && winner === 'O');
		return playerWon ? 'btn-primary' : 'btn-neutral';
	}

	function isWinningCell(index: number) {
		if (!winningCombination) return false;
		const gridIndex = Math.floor(index / 9);
		return winningCombination.includes(gridIndex);
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
		board = Array(81).fill('');
		completedGrids = Array(9).fill(''); // Reset completed grids
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
		activeGrid = null;
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
								{currentPlayer === (isHost ? 'X' : 'O') ? 'Your turn!' : "Opponent's turn"}
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

			<div class="grid grid-cols-3 gap-1.5">
				{#each Array(9) as _, outerIndex}
					<div
						class="border-base-content/20 bg-base-200 divide-base-content/20 grid grid-cols-3 divide-x divide-y border-2 transition-all duration-300
						{hoveredGridIndex === outerIndex ? 'border-primary shadow-primary/40 bg-base-300 shadow-lg' : ''} 
						{currentPlayer === (isHost ? 'X' : 'O') &&
						((activeGrid === null && completedGrids[outerIndex] === '') ||
							(activeGrid !== null &&
								completedGrids[activeGrid] !== '' &&
								completedGrids[outerIndex] === '') ||
							(activeGrid === outerIndex && completedGrids[outerIndex] === ''))
							? 'border-base-content/75'
							: ''}
						{outerIndex === 0 ? 'rounded-tl-xl' : ''}
						{outerIndex === 2 ? 'rounded-tr-xl' : ''}
						{outerIndex === 6 ? 'rounded-bl-xl' : ''}
						{outerIndex === 8 ? 'rounded-br-xl' : ''}"
					>
						{#if completedGrids[outerIndex]}
							<div
								class="col-span-3 row-span-3 flex h-full w-full items-center justify-center text-5xl font-bold select-none"
							>
								{completedGrids[outerIndex]}
							</div>
						{:else}
							{#each Array(9) as _, innerIndex}
								{@const index = outerIndex * 9 + innerIndex}
								<div
									class="border-base-content/20 flex items-center justify-center border
									{index === 0 ? 'rounded-tl-lg' : ''}
									{index === 20 ? 'rounded-tr-lg' : ''}
									{index === 60 ? 'rounded-bl-lg' : ''}
									{index === 80 ? 'rounded-br-lg' : ''}
							
									"
								>
									<button
										class="btn btn-md aspect-square h-[38px] min-h-0 w-[38px] text-2xl font-bold transition-all duration-100
										{board[index] ? 'btn-disabled' : 'btn-ghost hover:bg-base-300'} 
										{lastPlayedIndex === index ? 'border-primary shadow-primary border-2' : ''}
										{getCellClass(index)}
										rounded-none
										{index === 0 ? 'rounded-tl-lg' : ''}
										{index === 20 ? 'rounded-tr-lg' : ''}
										{index === 60 ? 'rounded-bl-lg' : ''}
										{index === 80 ? 'rounded-br-lg' : ''}"
										onclick={() => makeMove(index)}
										disabled={!!board[index] ||
											!!winner ||
											currentPlayer !== (isHost ? 'X' : 'O') ||
											showingLastMove ||
											(activeGrid !== null &&
												Math.floor(index / 9) !== activeGrid &&
												completedGrids[activeGrid] === '')}
										onmouseenter={() => {
											if (
												!board[index] &&
												!completedGrids[Math.floor(index / 9)] &&
												(activeGrid === null || Math.floor(index / 9) === activeGrid)
											) {
												hoveredGridIndex = Math.floor(innerIndex / 3) * 3 + (innerIndex % 3);
											}
										}}
										onmouseleave={() => {
											hoveredGridIndex = null;
										}}
									>
										{board[index]}
									</button>
								</div>
							{/each}
						{/if}
					</div>
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
