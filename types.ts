
export type PlayerColor = 'black' | 'white';

export interface Point {
  x: number;
  y: number;
}

export type BoardState = (PlayerColor | null)[][];

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  isEmoji?: boolean;
  color: PlayerColor | 'spectator';
}

export interface HistoryEntry {
  board: string; // JSON string
  captured: { black: number; white: number };
  lastMove: Point | null;
  player: PlayerColor;
}

export interface GameState {
  board: BoardState;
  currentPlayer: PlayerColor;
  captured: { black: number; white: number };
  history: HistoryEntry[]; 
  passCount: number;
  gameOver: boolean;
  winner: PlayerColor | 'draw' | null;
  lastMove: Point | null;
}

export type MessageType = 'MOVE' | 'PASS' | 'CHAT' | 'SYNC' | 'UNDO_REQ' | 'UNDO_ACCEPT' | 'UNDO_DECLINE' | 'RESTART';

export interface NetworkMessage {
  type: MessageType;
  payload: any;
  from?: string;
}
