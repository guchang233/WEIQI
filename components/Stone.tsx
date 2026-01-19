import React from 'react';
import { PlayerColor } from '../types.ts';

interface StoneProps {
  color: PlayerColor;
  cx: number;
  cy: number;
  radius: number;
  isGhost?: boolean;
}

const Stone: React.FC<StoneProps> = ({ color, cx, cy, radius, isGhost }) => {
  const eyeSize = radius * 0.12;
  const eyeOffset = radius * 0.28;
  const mouthWidth = radius * 0.45;
  const mouthY = radius * 0.25;
  
  const faceColor = color === 'black' ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.8)';

  return (
    <g opacity={isGhost ? 0.35 : 1} className="pointer-events-none">
      <circle cx={cx} cy={cy} r={radius} fill={color === 'black' ? '#111' : '#fff'} />
      <g>
        <circle cx={cx - eyeOffset} cy={cy - radius * 0.1} r={eyeSize} fill={faceColor} />
        <circle cx={cx + eyeOffset} cy={cy - radius * 0.1} r={eyeSize} fill={faceColor} />
        <path 
          d={`M ${cx - mouthWidth/2} ${cy + mouthY} Q ${cx} ${cy + mouthY + radius * 0.3} ${cx + mouthWidth/2} ${cy + mouthY}`} 
          stroke={faceColor} 
          strokeWidth={Math.max(1.5, radius * 0.1)} 
          fill="none" 
          strokeLinecap="round" 
        />
      </g>
    </g>
  );
};

export default Stone;