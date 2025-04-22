import { type RequestEvent } from '@sveltejs/kit';

// Store game states in memory
const gameStates = new Map<
	string,
	{
		board: string[];
		currentPlayer: string;
		XScore: number;
		OScore: number;
		activeGrid: number | null;
		completedGrids: string[];
		lastActivity: number;
		connectedPlayers: Set<string>;
	}
>();

// Cleanup interval (5 minutes)
const CLEANUP_INTERVAL = 5 * 60 * 1000;

// Start cleanup interval
setInterval(() => {
	const now = Date.now();
	for (const [gameCode, gameState] of gameStates.entries()) {
		// If no players are connected and it's been more than 5 minutes since last activity
		if (gameState.connectedPlayers.size === 0 && now - gameState.lastActivity > CLEANUP_INTERVAL) {
			gameStates.delete(gameCode);
		}
	}
}, CLEANUP_INTERVAL);

export async function POST({ params, request }: RequestEvent) {
	const gameCode = params.code;
	if (!gameCode) {
		return new Response('Game code is required', { status: 400 });
	}

	const data = await request.json();

	// Initialize game state if it doesn't exist
	if (!gameStates.has(gameCode)) {
		gameStates.set(gameCode, {
			board: Array(81).fill(''),
			currentPlayer: 'X',
			XScore: 0,
			OScore: 0,
			activeGrid: null,
			completedGrids: Array(9).fill(''),
			lastActivity: Date.now(),
			connectedPlayers: new Set()
		});
	}

	const gameState = gameStates.get(gameCode)!;
	gameState.lastActivity = Date.now();

	// Update game state based on the action
	if (data.action === 'move') {
		gameState.board[data.index] = data.player;
		gameState.currentPlayer = data.player === 'X' ? 'O' : 'X';
		gameState.activeGrid = data.nextGrid;
		// console.log('Move made:', {
		//     gameCode,
		//     index: data.index,
		//     player: data.player,
		//     nextGrid: data.nextGrid,
		//     newBoard: gameState.board,
		//     currentPlayer: gameState.currentPlayer,
		//     activeGrid: gameState.activeGrid
		// });
	} else if (data.action === 'updateScore') {
		if (data.playerWon) {
			// Update the score based on which player won (X or O)
			if (data.winner === 'X') {
				gameState.XScore++;
				// console.log('Score updated - X won:', {
				// 	gameCode,
				// 	XScore: gameState.XScore,
				// 	OScore: gameState.OScore
				// });
			} else if (data.winner === 'O') {
				gameState.OScore++;
				// console.log('Score updated - O won:', {
				// 	gameCode,
				// 	XScore: gameState.XScore,
				// 	OScore: gameState.OScore
				// });
			}
		}
	} else if (data.action === 'updateCompletedGrids') {
		gameState.completedGrids = data.completedGrids;
		// console.log('Completed grids updated:', {
		// 	gameCode,
		// 	completedGrids: gameState.completedGrids
		// });
	} else if (data.action === 'reset') {
		// Reset the board, current player, active grid, and completed grids, but keep the scores
		gameState.board = Array(81).fill('');
		gameState.currentPlayer = data.currentPlayer || 'X';
		gameState.activeGrid = null;
		gameState.completedGrids = Array(9).fill('');
		// console.log('Game reset:', {
		// 	gameCode,
		// 	newBoard: gameState.board,
		// 	currentPlayer: gameState.currentPlayer,
		// 	activeGrid: gameState.activeGrid,
		// 	completedGrids: gameState.completedGrids,
		// 	XScore: gameState.XScore,
		// 	OScore: gameState.OScore
		// });
	} else if (data.action === 'playerConnected') {
		gameState.connectedPlayers.add(data.playerId);
		// console.log('Player connected:', {
		// 	gameCode,
		// 	playerId: data.playerId,
		// 	connectedPlayers: Array.from(gameState.connectedPlayers)
		// });
	} else if (data.action === 'playerDisconnected') {
		gameState.connectedPlayers.delete(data.playerId);
		// console.log('Player disconnected:', {
		// 	gameCode,
		// 	playerId: data.playerId,
		// 	connectedPlayers: Array.from(gameState.connectedPlayers)
		// });
	}

	return new Response(JSON.stringify(gameState), {
		headers: { 'Content-Type': 'application/json' }
	});
}

export async function GET({ params }: RequestEvent) {
	const gameCode = params.code;
	if (!gameCode) {
		return new Response('Game code is required', { status: 400 });
	}

	// Return current game state or initialize if it doesn't exist
	if (!gameStates.has(gameCode)) {
		gameStates.set(gameCode, {
			board: Array(81).fill(''),
			currentPlayer: 'X',
			XScore: 0,
			OScore: 0,
			activeGrid: null,
			completedGrids: Array(9).fill(''),
			lastActivity: Date.now(),
			connectedPlayers: new Set()
		});
	}

	return new Response(JSON.stringify(gameStates.get(gameCode)), {
		headers: { 'Content-Type': 'application/json' }
	});
}
