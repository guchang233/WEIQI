
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
  const padding = cellSize * 1.2;
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

  // 1. 识别所有相邻的同色棋子（包括斜向）
  const connectivity = useMemo(() => {
    const stones: {black: Point[], white: Point[]} = { black: [], white: [] };
    const pairs: AdjacencyPair[] = [];
    
    board.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (!cell) return;
        stones[cell].push({ x, y });
        
        // 检查右、下、右下、左下邻居
        const neighbors = [
          { dx: 1, dy: 0 },  // 右
          { dx: 0, dy: 1 },  // 下
          { dx: 1, dy: 1 },  // 右下
          { dx: -1, dy: 1 }, // 左下
        ];

        neighbors.forEach(({ dx, dy }) => {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
            if (board[ny][nx] === cell) {
              pairs.push({ p1: { x, y }, p2: { x: nx, y: ny }, color: cell });
            }
          }
        });
      });
    });
    return { stones, pairs };
  }, [board]);

  const stoneRadius = cellSize * 0.38;
  const isLastMove = (x: number, y: number) => lastMove?.x === x && lastMove?.y === y;

  return (
    <div className="relative flex justify-center items-center p-1 bg-[#d4a755] rounded-3xl shadow-board border-4 border-[#8b6b23]/50 transition-all duration-500 overflow-hidden touch-none ring-1 ring-black/20 shadow-board-inner">
      <svg 
        width={boardSizePx} 
        height={boardSizePx} 
        viewBox={`0 0 ${boardSizePx} ${boardSizePx}`}
        onPointerDown={handlePointerDown}
        className="cursor-crosshair touch-none overflow-visible"
      >
        <defs>
          <filter id="gooey-precise" x="-50%" y="-50%" width="200%" height="200%">
            {/* 使用非常小的模糊值，仅用于平滑连接处，不再用于强制扩张 */}
            <feGaussianBlur in="SourceGraphic" stdDeviation={cellSize * 0.12} result="blurred" />
            <feColorMatrix in="blurred" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 60 -25" result="goo" />
          </filter>
        </defs>

        {/* 背景网格 */}
        <g transform={`translate(${padding}, ${padding})`}>
          {Array.from({ length: BOARD_SIZE }).map((_, i) => (
            <React.Fragment key={i}>
              <line x1={0} y1={i * cellSize} x2={(BOARD_SIZE - 1) * cellSize} y2={i * cellSize} stroke="#3d2b1c" strokeWidth={cellSize * 0.03} opacity="0.45" />
              <line x1={i * cellSize} y1={0} x2={i * cellSize} y2={(BOARD_SIZE - 1) * cellSize} stroke="#3d2b1c" strokeWidth={cellSize * 0.03} opacity="0.45" />
            </React.Fragment>
          ))}
        </g>

        {/* 2. 精准粘稠层：仅在有连接的地方绘制“桥接物” */}
        <g transform={`translate(${padding}, ${padding})`} filter="url(#gooey-precise)">
          {/* 黑棋粘连层 */}
          <g fill="#141414">
            {connectivity.stones.black.map((s) => (
              <circle key={`b-base-${s.x}-${s.y}`} cx={s.x * cellSize} cy={s.y * cellSize} r={stoneRadius} />
            ))}
            {connectivity.pairs.filter(p => p.color === 'black').map((pair, i) => (
              <line 
                key={`b-bridge-${i}`} 
                x1={pair.p1.x * cellSize} y1={pair.p1.y * cellSize} 
                x2={pair.p2.x * cellSize} y2={pair.p2.y * cellSize} 
                stroke="#141414" 
                strokeWidth={cellSize * 0.35} 
                strokeLinecap="round"
              />
            ))}
          </g>
          {/* 白棋粘连层 */}
          <g fill="#ffffff">
            {connectivity.stones.white.map((s) => (
              <circle key={`w-base-${s.x}-${s.y}`} cx={s.x * cellSize} cy={s.y * cellSize} r={stoneRadius} />
            ))}
            {connectivity.pairs.filter(p => p.color === 'white').map((pair, i) => (
              <line 
                key={`w-bridge-${i}`} 
                x1={pair.p1.x * cellSize} y1={pair.p1.y * cellSize} 
                x2={pair.p2.x * cellSize} y2={pair.p2.y * cellSize} 
                stroke="#ffffff" 
                strokeWidth={cellSize * 0.35} 
                strokeLinecap="round"
              />
            ))}
          </g>
        </g>

        {/* 幽灵指示器 */}
        {pendingMove && (
          <g transform={`translate(${padding}, ${padding})`}>
            <circle cx={pendingMove.x * cellSize} cy={pendingMove.y * cellSize} r={stoneRadius * 1.1} fill="none" stroke={currentPlayer === 'black' ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.4)'} strokeDasharray="2,2" />
            <Stone color={currentPlayer} cx={pendingMove.x * cellSize} cy={pendingMove.y * cellSize} radius={stoneRadius} isGhost={true} />
          </g>
        )}

        {/* 吃子特效 */}
        <g transform={`translate(${padding}, ${padding})`}>
          {dyingStones.map((s) => (
            <g key={s.id}>
              <circle cx={s.x * cellSize} cy={s.y * cellSize} r={stoneRadius} fill="none" stroke="#eab308" className="animate-ring-expand" />
              <g className="animate-dissolve">
                 <circle cx={s.x * cellSize} cy={s.y * cellSize} r={stoneRadius} fill={s.color === 'black' ? '#1a1a1a' : '#ffffff'} />
                 <Stone color={s.color} cx={s.x * cellSize} cy={s.y * cellSize} radius={stoneRadius} />
              </g>
            </g>
          ))}
        </g>

        {/* 顶层精致棋子 */}
        <g transform={`translate(${padding}, ${padding})`}>
          {connectivity.stones.black.map((s) => (
            <g key={`bf-${s.x}-${s.y}`} className={isLastMove(s.x, s.y) ? 'animate-spring-in' : ''}>
              <Stone color="black" cx={s.x * cellSize} cy={s.y * cellSize} radius={stoneRadius} />
              {isLastMove(s.x, s.y) && (
                <circle cx={s.x * cellSize} cy={s.y * cellSize} r={stoneRadius * 1.3} fill="none" stroke="#eab308" strokeWidth="2" className="animate-indicator" />
              )}
            </g>
          ))}
          {connectivity.stones.white.map((s) => (
            <g key={`wf-${s.x}-${s.y}`} className={isLastMove(s.x, s.y) ? 'animate-spring-in' : ''}>
              <Stone color="white" cx={s.x * cellSize} cy={s.y * cellSize} radius={stoneRadius} />
              {isLastMove(s.x, s.y) && (
                <circle cx={s.x * cellSize} cy={s.y * cellSize} r={stoneRadius * 1.3} fill="none" stroke="#eab308" strokeWidth="2" className="animate-indicator" />
              )}
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
};

export default GoBoard;
