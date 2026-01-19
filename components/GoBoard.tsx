
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

  // 1. 识别相邻同色棋子，区分权重
  const connectivity = useMemo(() => {
    const stones: { black: Point[], white: Point[] } = { black: [], white: [] };
    const pairs: AdjacencyPair[] = [];
    
    board.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (!cell) return;
        stones[cell].push({ x, y });
        
        const checkList = [
          { dx: 1, dy: 0, diag: false },
          { dx: 0, dy: 1, diag: false },
          { dx: 1, dy: 1, diag: true },
          { dx: -1, dy: 1, diag: true },
        ];

        checkList.forEach(({ dx, dy, diag }) => {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
            if (board[ny][nx] === cell) {
              pairs.push({ p1: { x, y }, p2: { x: nx, y: ny }, color: cell, isDiagonal: diag });
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
          <filter id="gooey-organic" x="-50%" y="-50%" width="200%" height="200%">
            {/* 适度增加模糊半径 (从 0.06 -> 0.12)，提供足够的“墨水扩散”空间来实现圆角 */}
            <feGaussianBlur in="SourceGraphic" stdDeviation={cellSize * 0.12} result="blurred" />
            {/* 降低对比度 (从 120 -> 50) 并重新校准偏移 (-22)，使边缘在模糊的基础上重新锐化，形成圆滑的连接颈部 */}
            <feColorMatrix in="blurred" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 50 -22" result="goo" />
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

        {/* 2. 精致分层粘稠：调整线宽以配合新的滤镜参数，获得更自然的圆度 */}
        <g transform={`translate(${padding}, ${padding})`} filter="url(#gooey-organic)">
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
                // 增加一点宽度以提供足够的像素供滤镜进行圆滑化处理
                strokeWidth={pair.isDiagonal ? cellSize * 0.15 : cellSize * 0.22} 
                strokeLinecap="round"
              />
            ))}
          </g>
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
                strokeWidth={pair.isDiagonal ? cellSize * 0.15 : cellSize * 0.22} 
                strokeLinecap="round"
              />
            ))}
          </g>
        </g>

        {/* 交互反馈层 */}
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

        {/* 顶层细节渲染 */}
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
