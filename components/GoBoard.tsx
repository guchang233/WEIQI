import React, { useMemo, useState, useEffect, useRef } from 'react';
import { BoardState, PlayerColor, Point } from '../types.ts';
import { BOARD_SIZE } from '../logic/GoRules.ts';
import Stone from './Stone.tsx';

interface DyingStone extends Point {
  color: PlayerColor;
  id: string;
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

  const stoneRadius = cellSize * 0.44;
  const isLastMove = (x: number, y: number) => lastMove?.x === x && lastMove?.y === y;

  return (
    <div className="relative p-1.5 bg-[#cc9c4a] rounded-lg shadow-2xl border-2 border-[#8b6b23]/30 touch-none">
      <svg width={boardSizePx} height={boardSizePx} viewBox={`0 0 ${boardSizePx} ${boardSizePx}`} onPointerDown={handlePointerDown} className="cursor-crosshair overflow-visible">
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

        <g transform={`translate(${padding}, ${padding})`}>
          {board.map((row, y) => row.map((cell, x) => (
            cell && (
              <g key={`stone-${x}-${y}`} className={isLastMove(x, y) ? 'animate-spring-in' : ''}>
                <Stone color={cell} cx={x * cellSize} cy={y * cellSize} radius={stoneRadius} />
                {isLastMove(x, y) && <circle cx={x * cellSize} cy={y * cellSize} r={stoneRadius * 1.25} fill="none" stroke="#eab308" strokeWidth="2" className="animate-indicator" />}
              </g>
            )
          )))}

          {pendingMove && (
            <Stone color={currentPlayer} cx={pendingMove.x * cellSize} cy={pendingMove.y * cellSize} radius={stoneRadius} isGhost={true} />
          )}

          {dyingStones.map((s) => (
            <g key={s.id} className="animate-dissolve">
                 <Stone color={s.color} cx={s.x * cellSize} cy={s.y * cellSize} radius={stoneRadius} />
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
};

export default GoBoard;