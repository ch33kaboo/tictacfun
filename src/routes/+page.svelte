<script lang="ts">
	let activeTab = $state('create');
	let gameCode = $state('');
	let timerEnabled = $state(false);
	let timerDuration = $state(10);
	let selectedGame = $state('classic');
	import { goto } from '$app/navigation';

	function generateGameCode() {
		return Math.random().toString().substring(2, 8);
	}

	function createGame() {
		const code = generateGameCode();
		const searchParams = new URLSearchParams();
		searchParams.set('host', 'true');
		searchParams.set('game', selectedGame);
		if (timerEnabled) {
			searchParams.set('timer', timerDuration.toString());
		}
		goto(`/game/${code}?${searchParams.toString()}`);
	}

	function joinGame() {
		if (gameCode.length === 6) {
			goto(`/game/${gameCode}?host=false`);
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
						<span class="label-text">Enter 6-digit game code</span>
					</label>
					<input
						type="text"
						id="gameCode"
						placeholder="Enter code"
						class="input input-bordered w-full"
						maxlength="6"
						bind:value={gameCode}
					/>
				</div>
				<button class="btn btn-primary" onclick={joinGame} disabled={gameCode.length !== 6}>
					Join Game
				</button>
			</div>
		{/if}
	</div>
</main>
