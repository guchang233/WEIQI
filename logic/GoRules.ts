
import { BoardState, PlayerColor, Point } from '../types';

export const BOARD_SIZE = 19;

export class GoRules {
  static getAdjacent(p: Point): Point[] {
    const adj = [];
    if (p.x > 0) adj.push({ x: p.x - 1, y: p.y });
    if (p.x < BOARD_SIZE - 1) adj.push({ x: p.x + 1, y: p.y });
    if (p.y > 0) adj.push({ x: p.x, y: p.y - 1 });
    if (p.y < BOARD_SIZE - 1) adj.push({ x: p.x, y: p.y + 1 });
    return adj;
  }

  static getGroup(board: BoardState, p: Point): { stones: Point[]; liberties: Set<string> } {
    const color = board[p.y][p.x];
    if (!color) return { stones: [], liberties: new Set() };

    const stones: Point[] = [];
    const liberties = new Set<string>();
    const visited = new Set<string>();
    const stack: Point[] = [p];

    while (stack.length > 0) {
      const current = stack.pop()!;
      const key = `${current.x},${current.y}`;
      if (visited.has(key)) continue;
      visited.add(key);
      stones.push(current);

      for (const adj of this.getAdjacent(current)) {
        const adjColor = board[adj.y][adj.x];
        if (adjColor === null) {
          liberties.add(`${adj.x},${adj.y}`);
        } else if (adjColor === color) {
          stack.push(adj);
        }
      }
    }

    return { stones, liberties };
  }

  static checkCaptures(board: BoardState, lastMove: Point, player: PlayerColor): { newBoard: BoardState; capturedCount: number } {
    const opponent = player === 'black' ? 'white' : 'black';
    let newBoard = board.map(row => [...row]);
    let totalCaptured = 0;

    // Check opponent groups first
    for (const adj of this.getAdjacent(lastMove)) {
      if (newBoard[adj.y][adj.x] === opponent) {
        const group = this.getGroup(newBoard, adj);
        if (group.liberties.size === 0) {
          totalCaptured += group.stones.length;
          group.stones.forEach(s => {
            newBoard[s.y][s.x] = null;
          });
        }
      }
    }

    return { newBoard, capturedCount: totalCaptured };
  }

  static isValidMove(board: BoardState, p: Point, player: PlayerColor, history: string[]): { valid: boolean; error?: string; newBoard?: BoardState; captured?: number } {
    if (board[p.y][p.x] !== null) return { valid: false, error: 'Point is occupied' };

    // 1. Try placing the stone
    const tempBoard = board.map(row => [...row]);
    tempBoard[p.y][p.x] = player;

    // 2. Check for opponent captures
    const { newBoard, capturedCount } = this.checkCaptures(tempBoard, p, player);

    // 3. Check for self-capture (suicide)
    const ownGroup = this.getGroup(newBoard, p);
    if (ownGroup.liberties.size === 0) {
      return { valid: false, error: 'Suicide move is illegal' };
    }

    // 4. Check Ko rule
    const boardHash = JSON.stringify(newBoard);
    if (history.length > 0 && history[history.length - 1] === boardHash) {
      return { valid: false, error: 'Ko rule: move repeats previous board state' };
    }

    return { valid: true, newBoard, captured: capturedCount };
  }
}
