<script lang="ts">
	let activeTab = $state('create');
	let gameCode = $state('');
	let timerEnabled = $state(false);
	let timerDuration = $state(10);
	let selectedGame = $state('classic');
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabase';
	let errorMessage = $state('');

	function generateGameCode() {
		const gameTypeDigit = selectedGame === 'classic' ? '0' : '1';
		const randomDigits = Math.random().toString().substring(2, 7);
		return gameTypeDigit + randomDigits;
	}

	function createGame() {
		const code = generateGameCode();
		const searchParams = new URLSearchParams();
		searchParams.set('host', 'true');
		if (timerEnabled) {
			searchParams.set('timer', timerDuration.toString());
		}
		goto(`/${selectedGame}/${code}?${searchParams.toString()}`);
	}

	async function joinGame() {
		if (gameCode.length === 6) {
			const gameType = gameCode[0] === '0' ? 'classic' : 'super';
			errorMessage = ''; // Clear any previous error message

			// Create a temporary channel to check if the room exists
			const channel = supabase.channel(`game:${gameCode}`);

			try {
				// Subscribe to the channel and wait for presence sync
				await new Promise<void>((resolve, reject) => {
					channel
						.on('presence', { event: 'sync' }, () => {
							// Get the presence state after sync
							const presenceState = channel.presenceState();
							const players = Object.keys(presenceState).length;

							if (players === 0) {
								// No players in the room, show error
								errorMessage = 'This game room does not exist or has ended.';
							} else if (players >= 2) {
								// Room is full
								errorMessage = 'This game room is full.';
							} else {
								// Room exists and has space, redirect
								goto(`/${gameType}/${gameCode}?host=false`);
							}

							// Unsubscribe after checking
							channel.unsubscribe();
							resolve();
						})
						.subscribe(async (status) => {
							if (status === 'SUBSCRIBED') {
								// Track presence to trigger sync
								await channel.track({ user: 'checking' });
							} else {
								reject(new Error('Failed to subscribe to channel'));
							}
						});
				});
			} catch (error) {
				console.log('Failed to join game. Please try again.');
			}
		}
	}
</script>

<main class="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center py-8">
	<h1 class="mb-8 text-center text-4xl font-bold">Invite your friends and play Tic-Tac-Toe now!</h1>

	<div class="bg-base-200 w-full max-w-2xl rounded-lg p-6 shadow-xl">
		<div class="tabs tabs-boxed mb-6">
			<button
				class="tab {activeTab === 'create' ? 'tab-active' : ''}"
				onclick={() => (activeTab = 'create')}
			>
				Create Game
			</button>
			<button
				class="tab {activeTab === 'join' ? 'tab-active' : ''}"
				onclick={() => (activeTab = 'join')}
			>
				Join Game
			</button>
		</div>

		{#if activeTab === 'create'}
			<div class="mb-6">
				<label class="label cursor-pointer">
					<span class="label-text">Enable turn timer</span>
					<input type="checkbox" class="toggle toggle-primary" bind:checked={timerEnabled} />
				</label>
				{#if timerEnabled}
					<div class="form-control mt-2">
						<label class="label" for="timer">
							<span class="label-text">Timer duration (seconds)</span>
						</label>
						<input
							type="number"
							id="timer"
							class="input input-bordered w-full"
							min="5"
							max="60"
							bind:value={timerDuration}
						/>
					</div>
				{/if}
			</div>
			<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
				<div class="card bg-base-100 shadow-md transition-transform hover:scale-105">
					<div class="card-body">
						<h2 class="card-title">Classic Tic-Tac-Toe</h2>
						<p>Play the traditional 3x3 game with a friend!</p>
						<div class="card-actions justify-end">
							<button
								class="btn btn-primary"
								onclick={() => {
									selectedGame = 'classic';
									createGame();
								}}>Create Game</button
							>
						</div>
					</div>
				</div>

				<div class="card bg-base-100 shadow-md transition-transform hover:scale-105">
					<div class="card-body">
						<h2 class="card-title">Super Tic-Tac-Toe</h2>
						<p>
							Play on a 3×3 grid of smaller boards. Each move determines where your opponent must
							play next!
						</p>
						<div class="card-actions justify-end">
							<button
								class="btn btn-primary"
								onclick={() => {
									selectedGame = 'super';
									createGame();
								}}>Create Game</button
							>
						</div>
					</div>
				</div>
			</div>
		{:else}
			<div class="flex flex-col items-center gap-4">
				<div class="form-control w-full max-w-md">
					<label class="label" for="gameCode">
						<span class="label-text mb-2">Enter 6-digit game code</span>
					</label>
					<input
						type="text"
						id="gameCode"
						placeholder="Enter code"
						class="input input-bordered w-full"
						maxlength="6"
						bind:value={gameCode}
						onkeydown={(e) => e.key === 'Enter' && gameCode.length === 6 && joinGame()}
					/>
					{#if errorMessage}
						<div class="text-error mt-2">{errorMessage}</div>
					{:else}
						<p class="mt-2 text-gray-500">Ask your friend for the game code to join their game.</p>
					{/if}
				</div>
				<button class="btn btn-primary" onclick={joinGame} disabled={gameCode.length !== 6}>
					Join Game
				</button>
			</div>
		{/if}
	</div>
</main>
