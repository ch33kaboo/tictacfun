import { type RequestEvent } from '@sveltejs/kit';

// Store game states in memory
const gameStates = new Map<string, {
    board: string[];
    currentPlayer: string;
    XScore: number;
    OScore: number;
    activeGrid: number | null;
    completedGrids: string[];
}>();

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
            completedGrids: Array(9).fill('')
        });
    }

    const gameState = gameStates.get(gameCode)!;

    // Update game state based on the action
    if (data.action === 'move') {
        gameState.board[data.index] = data.player;
        gameState.currentPlayer = data.player === 'X' ? 'O' : 'X';
        gameState.activeGrid = data.nextGrid;
        console.log('Move made:', {
            gameCode,
            index: data.index,
            player: data.player,
            nextGrid: data.nextGrid,
            newBoard: gameState.board,
            currentPlayer: gameState.currentPlayer,
            activeGrid: gameState.activeGrid
        });
    } else if (data.action === 'updateScore') {
        if (data.playerWon) {
            // Update the score based on which player won (X or O)
            if (data.winner === 'X') {
                gameState.XScore++;
                console.log('Score updated - X won:', {
                    gameCode,
                    XScore: gameState.XScore,
                    OScore: gameState.OScore
                });
            } else if (data.winner === 'O') {
                gameState.OScore++;
                console.log('Score updated - O won:', {
                    gameCode,
                    XScore: gameState.XScore,
                    OScore: gameState.OScore
                });
            }
        }
    } else if (data.action === 'updateCompletedGrids') {
        gameState.completedGrids = data.completedGrids;
        console.log('Completed grids updated:', {
            gameCode,
            completedGrids: gameState.completedGrids
        });
    } else if (data.action === 'reset') {
        // Reset the board, current player, active grid, and completed grids, but keep the scores
        gameState.board = Array(81).fill('');
        gameState.currentPlayer = data.currentPlayer || 'X';
        gameState.activeGrid = null;
        gameState.completedGrids = Array(9).fill('');
        console.log('Game reset:', {
            gameCode,
            newBoard: gameState.board,
            currentPlayer: gameState.currentPlayer,
            activeGrid: gameState.activeGrid,
            completedGrids: gameState.completedGrids,
            XScore: gameState.XScore,
            OScore: gameState.OScore
        });
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
            completedGrids: Array(9).fill('')
        });
    }

    return new Response(JSON.stringify(gameStates.get(gameCode)), {
        headers: { 'Content-Type': 'application/json' }
    });
} 