
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

export interface GameState {
  board: BoardState;
  currentPlayer: PlayerColor;
  captured: { black: number; white: number };
  history: string[]; 
  passCount: number;
  gameOver: boolean;
  winner: PlayerColor | 'draw' | null;
  lastMove: Point | null;
}

export type MessageType = 'MOVE' | 'PASS' | 'CHAT' | 'SYNC';

export interface NetworkMessage {
  type: MessageType;
  payload: any;
  from: string;
}
