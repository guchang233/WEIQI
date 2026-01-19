
import React from 'react';
import { PlayerColor } from '../types';

interface StoneProps {
  color: PlayerColor;
  cx: number;
  cy: number;
  radius: number;
  isGhost?: boolean;
}

const Stone: React.FC<StoneProps> = ({ color, cx, cy, radius, isGhost }) => {
  // 比例参数
  const eyeSize = radius * 0.12;
  const eyeOffset = radius * 0.28;
  const mouthWidth = radius * 0.45;
  const mouthY = radius * 0.25;
  const blushRadius = radius * 0.15;
  
  // 高光与阴影坐标
  const mainHighlightX = cx - radius * 0.4;
  const mainHighlightY = cy - radius * 0.4;
  const subHighlightX = cx - radius * 0.15;
  const subHighlightY = cy - radius * 0.55;
  
  // 脸部颜色
  const faceColor = color === 'black' ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.8)';
  const blushColor = color === 'black' ? 'rgba(255,100,150,0.3)' : 'rgba(255,150,180,0.5)';

  return (
    <g 
      opacity={isGhost ? 0.35 : 1} 
      className={`pointer-events-none ${isGhost ? 'animate-pulse' : ''}`}
    >
      {/* 1. 棋子底色渐变模拟 (在 GoBoard 粘稠层之上，补充 3D 深度) */}
      {!isGhost && (
        <>
          {/* 边缘背光 (Rim Light) */}
          <circle 
            cx={cx + radius * 0.1} 
            cy={cy + radius * 0.1} 
            r={radius * 0.9} 
            fill="none" 
            stroke={color === 'black' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'} 
            strokeWidth={radius * 0.1}
          />
          
          {/* 顶部主高光 */}
          <circle 
            cx={mainHighlightX} 
            cy={mainHighlightY} 
            r={radius * 0.3} 
            fill="white" 
            opacity={color === 'black' ? 0.15 : 0.4} 
            filter="blur(1px)"
          />
          
          {/* 锋利次高光点 */}
          <circle 
            cx={subHighlightX} 
            cy={subHighlightY} 
            r={radius * 0.08} 
            fill="white" 
            opacity={color === 'black' ? 0.4 : 0.8} 
          />
        </>
      )}

      {/* 2. 生动的五官层 */}
      <g className={!isGhost ? "animate-float" : ""}>
        {/* 腮红 - 增加可爱感 */}
        {!isGhost && (
          <>
            <circle cx={cx - eyeOffset * 1.3} cy={cy + radius * 0.05} r={blushRadius} fill={blushColor} filter="blur(2px)" />
            <circle cx={cx + eyeOffset * 1.3} cy={cy + radius * 0.05} r={blushRadius} fill={blushColor} filter="blur(2px)" />
          </>
        )}

        {/* 眼睛 - 带有一点微光 */}
        <g>
          <circle cx={cx - eyeOffset} cy={cy - radius * 0.1} r={eyeSize} fill={faceColor} />
          {!isGhost && <circle cx={cx - eyeOffset - eyeSize * 0.3} cy={cy - radius * 0.1 - eyeSize * 0.3} r={eyeSize * 0.4} fill="white" opacity="0.6" />}
          
          <circle cx={cx + eyeOffset} cy={cy - radius * 0.1} r={eyeSize} fill={faceColor} />
          {!isGhost && <circle cx={cx + eyeOffset - eyeSize * 0.3} cy={cy - radius * 0.1 - eyeSize * 0.3} r={eyeSize * 0.4} fill="white" opacity="0.6" />}
        </g>
        
        {/* 嘴巴 */}
        <path 
          d={`M ${cx - mouthWidth/2} ${cy + mouthY} Q ${cx} ${cy + mouthY + radius * 0.3} ${cx + mouthWidth/2} ${cy + mouthY}`} 
          stroke={faceColor} 
          strokeWidth={Math.max(1.8, radius * 0.1)} 
          fill="none" 
          strokeLinecap="round" 
        />
      </g>
    </g>
  );
};

export default Stone;
