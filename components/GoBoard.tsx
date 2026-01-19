
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { BoardState, PlayerColor, Point } from '../types';
import { BOARD_SIZE } from '../logic/GoRules';
import Stone from './Stone';

interface DyingStone extends Point {
  color: PlayerColor;
  id: string;
}

interface AdjacencyPair {
  p1: Point;
  p2: Point;
  color: PlayerColor;
  isDiagonal: boolean;
}

interface GoBoardProps {
  board: BoardState;
  onMove: (p: Point) => void;
  currentPlayer: PlayerColor;
  disabled?: boolean;
  cellSize: number;
  pendingMove: Point | null;
  lastMove: Point | null;
}

const GoBoard: React.FC<GoBoardProps> = ({ board, onMove, currentPlayer, disabled, cellSize, pendingMove, lastMove }) => {
  const padding = cellSize * 0.8;
  const boardSizePx = (BOARD_SIZE - 1) * cellSize + padding * 2;
  const prevBoardRef = useRef<BoardState>(board);
  const [dyingStones, setDyingStones] = useState<DyingStone[]>([]);

  useEffect(() => {
    const prevBoard = prevBoardRef.current;
    const newDying: DyingStone[] = [];
    board.forEach((row, y) => {
      row.forEach((cell, x) => {
        const prevCell = prevBoard[y][x];
        if (prevCell && !cell) {
          newDying.push({ x, y, color: prevCell, id: `${x}-${y}-${Date.now()}` });
        }
      });
    });
    if (newDying.length > 0) {
      setDyingStones(prev => [...prev, ...newDying]);
      setTimeout(() => {
        setDyingStones(current => current.filter(s => !newDying.find(n => n.id === s.id)));
      }, 600);
    }
    prevBoardRef.current = board;
  }, [board]);

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (disabled) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left - padding;
    const y = e.clientY - rect.top - padding;
    const gridX = Math.round(x / cellSize);
    const gridY = Math.round(y / cellSize);
    if (gridX >= 0 && gridX < BOARD_SIZE && gridY >= 0 && gridY < BOARD_SIZE) {
      onMove({ x: gridX, y: gridY });
    }
  };

  const connectivity = useMemo(() => {
    const stones: { black: Point[], white: Point[] } = { black: [], white: [] };
    const pairs: AdjacencyPair[] = [];
    board.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (!cell) return;
        stones[cell].push({ x, y });
        const checkList = [{ dx: 1, dy: 0, diag: false }, { dx: 0, dy: 1, diag: false }, { dx: 1, dy: 1, diag: true }, { dx: -1, dy: 1, diag: true }];
        checkList.forEach(({ dx, dy, diag }) => {
          const nx = x + dx; const ny = y + dy;
          if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
            if (board[ny][nx] === cell) pairs.push({ p1: { x, y }, p2: { x: nx, y: ny }, color: cell, isDiagonal: diag });
          }
        });
      });
    });
    return { stones, pairs };
  }, [board]);

  const stoneRadius = cellSize * 0.42;
  const isLastMove = (x: number, y: number) => lastMove?.x === x && lastMove?.y === y;

  return (
    <div className="relative flex justify-center items-center p-1 bg-[#cc9c4a] rounded-xl shadow-2xl border-2 border-[#8b6b23]/30 overflow-hidden touch-none shadow-board-inner transition-transform duration-300">
      <svg width={boardSizePx} height={boardSizePx} viewBox={`0 0 ${boardSizePx} ${boardSizePx}`} onPointerDown={handlePointerDown} className="cursor-crosshair touch-none overflow-visible">
        <defs>
          <filter id="gooey-organic" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation={cellSize * 0.12} result="blurred" />
            <feColorMatrix in="blurred" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 45 -18" result="goo" />
          </filter>
        </defs>

        <g transform={`translate(${padding}, ${padding})`}>
          {Array.from({ length: BOARD_SIZE }).map((_, i) => (
            <React.Fragment key={i}>
              <line x1={0} y1={i * cellSize} x2={(BOARD_SIZE - 1) * cellSize} y2={i * cellSize} stroke="#3d2b1c" strokeWidth={cellSize * 0.03} opacity="0.3" />
              <line x1={i * cellSize} y1={0} x2={i * cellSize} y2={(BOARD_SIZE - 1) * cellSize} stroke="#3d2b1c" strokeWidth={cellSize * 0.03} opacity="0.3" />
            </React.Fragment>
          ))}
          {[3, 9, 15].map(y => [3, 9, 15].map(x => (
            <circle key={`star-${x}-${y}`} cx={x * cellSize} cy={y * cellSize} r={cellSize * 0.08} fill="#3d2b1c" opacity="0.5" />
          )))}
        </g>

        <g transform={`translate(${padding}, ${padding})`} filter="url(#gooey-organic)">
          <g fill="#111">
            {connectivity.stones.black.map((s) => <circle key={`b-base-${s.x}-${s.y}`} cx={s.x * cellSize} cy={s.y * cellSize} r={stoneRadius} />)}
            {connectivity.pairs.filter(p => p.color === 'black').map((pair, i) => (
              <line key={`b-bridge-${i}`} x1={pair.p1.x * cellSize} y1={pair.p1.y * cellSize} x2={pair.p2.x * cellSize} y2={pair.p2.y * cellSize} stroke="#111" strokeWidth={pair.isDiagonal ? cellSize * 0.18 : cellSize * 0.28} strokeLinecap="round" />
            ))}
          </g>
          <g fill="#eee">
            {connectivity.stones.white.map((s) => <circle key={`w-base-${s.x}-${s.y}`} cx={s.x * cellSize} cy={s.y * cellSize} r={stoneRadius} />)}
            {connectivity.pairs.filter(p => p.color === 'white').map((pair, i) => (
              <line key={`w-bridge-${i}`} x1={pair.p1.x * cellSize} y1={pair.p1.y * cellSize} x2={pair.p2.x * cellSize} y2={pair.p2.y * cellSize} stroke="#eee" strokeWidth={pair.isDiagonal ? cellSize * 0.18 : cellSize * 0.28} strokeLinecap="round" />
            ))}
          </g>
        </g>

        {pendingMove && (
          <g transform={`translate(${padding}, ${padding})`}>
            <Stone color={currentPlayer} cx={pendingMove.x * cellSize} cy={pendingMove.y * cellSize} radius={stoneRadius} isGhost={true} />
          </g>
        )}

        <g transform={`translate(${padding}, ${padding})`}>
          {dyingStones.map((s) => (
            <g key={s.id} className="animate-dissolve">
                 <Stone color={s.color} cx={s.x * cellSize} cy={s.y * cellSize} radius={stoneRadius} />
            </g>
          ))}
          {connectivity.stones.black.map((s) => (
            <g key={`bf-${s.x}-${s.y}`} className={isLastMove(s.x, s.y) ? 'animate-spring-in' : ''}>
              <Stone color="black" cx={s.x * cellSize} cy={s.y * cellSize} radius={stoneRadius} />
              {isLastMove(s.x, s.y) && <circle cx={s.x * cellSize} cy={s.y * cellSize} r={stoneRadius * 1.25} fill="none" stroke="#eab308" strokeWidth="2" className="animate-indicator" />}
            </g>
          ))}
          {connectivity.stones.white.map((s) => (
            <g key={`wf-${s.x}-${s.y}`} className={isLastMove(s.x, s.y) ? 'animate-spring-in' : ''}>
              <Stone color="white" cx={s.x * cellSize} cy={s.y * cellSize} radius={stoneRadius} />
              {isLastMove(s.x, s.y) && <circle cx={s.x * cellSize} cy={s.y * cellSize} r={stoneRadius * 1.25} fill="none" stroke="#eab308" strokeWidth="2" className="animate-indicator" />}
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
};

export default GoBoard;
