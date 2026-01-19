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

  const stoneRadius = cellSize * 0.49;

  // 渲染所有同色桥接路径（粘稠厚度增强）
  const renderAllBridges = () => {
    const bridges: React.ReactNode[] = [];
    const colors: PlayerColor[] = ['black', 'white'];
    
    colors.forEach(targetColor => {
      for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
          if (board[y][x] !== targetColor) continue;
          
          const directions = [
            { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, 
            { dx: 1, dy: 1 }, { dx: -1, dy: 1 }
          ];

          directions.forEach(({ dx, dy }) => {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE && board[ny][nx] === targetColor) {
              bridges.push(
                <line
                  key={`bridge-${targetColor}-${x}-${y}-${nx}-${ny}`}
                  x1={x * cellSize} y1={y * cellSize} x2={nx * cellSize} y2={ny * cellSize}
                  stroke={targetColor === 'black' ? '#111' : '#fff'}
                  strokeWidth={cellSize * 0.52}
                  strokeLinecap="round"
                />
              );
            }
          });
        }
      }
    });
    return bridges;
  };

  return (
    <div className="relative p-1 bg-[#cc9c4a] rounded-lg shadow-2xl border-2 border-[#8b6b23]/50 touch-none">
      <svg width={boardSizePx} height={boardSizePx} viewBox={`0 0 ${boardSizePx} ${boardSizePx}`} onPointerDown={handlePointerDown} className="cursor-crosshair overflow-visible">
        <defs>
          {/* 混合粘稠滤镜：作用于所有颜色，使交界处产生融合 */}
          <filter id="gooey-master" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation={cellSize * 0.22} result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 25 -10" result="goo" />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>

        {/* 1. 底层：棋盘线 */}
        <g transform={`translate(${padding}, ${padding})`}>
          {Array.from({ length: BOARD_SIZE }).map((_, i) => (
            <React.Fragment key={i}>
              <line x1={0} y1={i * cellSize} x2={(BOARD_SIZE - 1) * cellSize} y2={i * cellSize} stroke="#3d2b1c" strokeWidth={cellSize * 0.03} opacity="0.25" />
              <line x1={i * cellSize} y1={0} x2={i * cellSize} y2={(BOARD_SIZE - 1) * cellSize} stroke="#3d2b1c" strokeWidth={cellSize * 0.03} opacity="0.25" />
            </React.Fragment>
          ))}
          {[3, 9, 15].map(y => [3, 9, 15].map(x => (
            <circle key={`star-${x}-${y}`} cx={x * cellSize} cy={y * cellSize} r={cellSize * 0.08} fill="#3d2b1c" opacity="0.4" />
          )))}
        </g>

        {/* 2. 粘稠层：黑白棋子本体 + 桥接线，共用滤镜实现颜色混合 */}
        <g transform={`translate(${padding}, ${padding})`} filter="url(#gooey-master)">
          {renderAllBridges()}
          {board.map((row, y) => row.map((cell, x) => (
            cell && <Stone key={`body-${x}-${y}`} color={cell} cx={x * cellSize} cy={y * cellSize} radius={stoneRadius} part="body" />
          )))}
          {pendingMove && (
            <Stone color={currentPlayer} cx={pendingMove.x * cellSize} cy={pendingMove.y * cellSize} radius={stoneRadius} isGhost={true} part="body" />
          )}
        </g>

        {/* 3. 表情层：置于滤镜层之上，保持清晰不模糊 */}
        <g transform={`translate(${padding}, ${padding})`}>
          {board.map((row, y) => row.map((cell, x) => (
            cell && <Stone key={`face-${x}-${y}`} color={cell} cx={x * cellSize} cy={y * cellSize} radius={stoneRadius} part="face" />
          )))}
          {pendingMove && (
            <Stone color={currentPlayer} cx={pendingMove.x * cellSize} cy={pendingMove.y * cellSize} radius={stoneRadius} isGhost={true} part="face" />
          )}
        </g>

        {/* 4. 指示与特效层 */}
        <g transform={`translate(${padding}, ${padding})`}>
          {lastMove && (
            <circle cx={lastMove.x * cellSize} cy={lastMove.y * cellSize} r={stoneRadius * 1.25} fill="none" stroke="#eab308" strokeWidth="2.5" className="animate-indicator" />
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