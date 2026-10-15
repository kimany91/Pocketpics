/**
 * Décors de la carte, dessinés en SVG façon dessin animé : formes pleines,
 * gros contour sombre, un reflet clair, une ombre au sol. Chaque décor est
 * dessiné autour de son pied (0, 0), vers le haut.
 */
import { Circle, Ellipse, G, Line, Path, Polygon, Rect } from 'react-native-svg';

import type { DecorKind, HeroKind } from './worlds';
import { OUTLINE as OL } from './worlds';

const SW = 2.6;

function Shadow({ rx, ry = rx * 0.28 }: { rx: number; ry?: number }) {
  return <Ellipse cx={0} cy={1} rx={rx} ry={ry} fill="rgba(0,0,0,0.2)" />;
}

/**
 * Amas de cercles avec un seul contour extérieur (les contours intérieurs sont
 * recouverts) : feuillages, buissons, nuages.
 */
function Blob({ c, fill, light, dark }: { c: [number, number, number][]; fill: string; light?: string; dark?: string }) {
  return (
    <G>
      {c.map(([x, y, r], i) => (
        <Circle key={`o${i}`} cx={x} cy={y} r={r} fill={OL} stroke={OL} strokeWidth={SW * 2} />
      ))}
      {dark
        ? c.map(([x, y, r], i) => <Circle key={`d${i}`} cx={x} cy={y} r={r} fill={dark} />)
        : null}
      {c.map(([x, y, r], i) => (
        <Circle key={`f${i}`} cx={x - (dark ? r * 0.08 : 0)} cy={y - (dark ? r * 0.1 : 0)} r={dark ? r * 0.9 : r} fill={fill} />
      ))}
      {light ? c.slice(0, 3).map(([x, y, r], i) => <Circle key={`l${i}`} cx={x - r * 0.35} cy={y - r * 0.4} r={r * 0.35} fill={light} opacity={0.75} />) : null}
    </G>
  );
}

function Eyes({ x = 0, y, sleepy }: { x?: number; y: number; sleepy?: boolean }) {
  return sleepy ? (
    <G>
      <Path d={`M${x - 9} ${y} q4 3 8 0`} stroke={OL} strokeWidth={2.2} fill="none" strokeLinecap="round" />
      <Path d={`M${x + 2} ${y} q4 3 8 0`} stroke={OL} strokeWidth={2.2} fill="none" strokeLinecap="round" />
    </G>
  ) : (
    <G>
      <Ellipse cx={x - 5} cy={y} rx={3.6} ry={4.4} fill="#FFFFFF" stroke={OL} strokeWidth={1.6} />
      <Ellipse cx={x + 5} cy={y} rx={3.6} ry={4.4} fill="#FFFFFF" stroke={OL} strokeWidth={1.6} />
      <Circle cx={x - 4.2} cy={y + 1} r={1.8} fill={OL} />
      <Circle cx={x + 5.8} cy={y + 1} r={1.8} fill={OL} />
    </G>
  );
}

const Trunk = ({ h, w = 9, color = '#8A5A2E' }: { h: number; w?: number; color?: string }) => (
  <Path d={`M${-w / 2} 0 L${-w / 2 + 1.5} ${-h} L${w / 2 - 1.5} ${-h} L${w / 2} 0 Z`} fill={color} stroke={OL} strokeWidth={SW} strokeLinejoin="round" />
);

function Pine({ snow, face, sleepy = true }: { snow?: boolean; face?: boolean; sleepy?: boolean }) {
  const tiers = [
    [0, 26, 22],
    [-14, 21, 20],
    [-27, 15, 18],
  ];
  return (
    <G>
      <Shadow rx={20} />
      <Trunk h={10} w={8} color="#6E4423" />
      {tiers.map(([y, half, h], i) => (
        <G key={i}>
          <Path d={`M${-half} ${y - 6} L0 ${y - 6 - h - 8} L${half} ${y - 6} Z`} fill="#2F7A45" stroke={OL} strokeWidth={SW} strokeLinejoin="round" />
          <Path d={`M${-half * 0.55} ${y - 9} L0 ${y - 6 - h - 4} L${-half * 0.1} ${y - 9} Z`} fill="#4FA563" opacity={0.8} />
          {snow ? <Path d={`M${-half * 0.62} ${y - 6 - h * 0.55} L0 ${y - 6 - h - 8} L${half * 0.62} ${y - 6 - h * 0.55} q${-half * 0.3} 5 ${-half * 0.62} 1 q${-half * 0.3} 5 ${-half * 0.62} -1 Z`} fill="#FFFFFF" stroke={OL} strokeWidth={1.6} strokeLinejoin="round" /> : null}
        </G>
      ))}
      {face ? <Eyes y={-16} sleepy={sleepy} /> : null}
    </G>
  );
}

function Palm() {
  const leaf = (rot: number, len: number) => (
    <Path
      transform={`rotate(${rot} 4 -58)`}
      d={`M4 -58 q${len * 0.5} -14 ${len} 4 q${-len * 0.45} -4 ${-len} -4 Z`}
      fill="#43A047"
      stroke={OL}
      strokeWidth={SW}
      strokeLinejoin="round"
    />
  );
  return (
    <G>
      <Shadow rx={22} />
      <Path d="M-6 0 Q-2 -30 6 -58 L12 -57 Q6 -30 6 0 Z" fill="#B97A3F" stroke={OL} strokeWidth={SW} strokeLinejoin="round" />
      {[-46, -40, -32, -24].map((y) => (
        <Path key={y} d={`M${-3 + (y + 46) * -0.05} ${y} l9 2`} stroke="#8A5427" strokeWidth={2} />
      ))}
      {leaf(-160, 34)}
      {leaf(-200, 30)}
      {leaf(-20, 34)}
      {leaf(20, 30)}
      {leaf(-95, 26)}
      <Circle cx={0} cy={-55} r={4.5} fill="#7A4A22" stroke={OL} strokeWidth={1.8} />
      <Circle cx={8} cy={-54} r={4.5} fill="#7A4A22" stroke={OL} strokeWidth={1.8} />
    </G>
  );
}

function Stall() {
  const stripes = [0, 1, 2, 3, 4, 5];
  return (
    <G>
      <Shadow rx={32} />
      <Rect x={-28} y={-26} width={56} height={26} rx={3} fill="#C98B4A" stroke={OL} strokeWidth={SW} />
      <Line x1={-28} y1={-14} x2={28} y2={-14} stroke="#8F5A2A" strokeWidth={2} />
      {/* fruits sur l'étal */}
      {[-18, -8, 2, 12, 20].map((x, i) => (
        <Circle key={x} cx={x} cy={-29} r={5} fill={['#E53935', '#FDD835', '#7CB342', '#FB8C00', '#E53935'][i]} stroke={OL} strokeWidth={1.6} />
      ))}
      <Line x1={-26} y1={-26} x2={-26} y2={-58} stroke={OL} strokeWidth={3} />
      <Line x1={26} y1={-26} x2={26} y2={-58} stroke={OL} strokeWidth={3} />
      {stripes.map((i) => (
        <Path key={i} d={`M${-32 + i * 10.7} -60 h10.7 v10 q-5.35 6 -10.7 0 Z`} fill={i % 2 ? '#FFFFFF' : '#E53935'} stroke={OL} strokeWidth={1.8} strokeLinejoin="round" />
      ))}
      <Path d="M-34 -60 L-28 -70 H28 L34 -60 Z" fill="#E53935" stroke={OL} strokeWidth={SW} strokeLinejoin="round" />
    </G>
  );
}

function Crate() {
  return (
    <G>
      <Shadow rx={16} />
      <Rect x={-14} y={-26} width={28} height={26} rx={2} fill="#C8914F" stroke={OL} strokeWidth={SW} />
      <Path d="M-14 -26 L14 0 M14 -26 L-14 0" stroke="#8F5A2A" strokeWidth={2.4} />
      <Rect x={-14} y={-26} width={28} height={26} rx={2} fill="none" stroke={OL} strokeWidth={SW} />
      <Rect x={-11} y={-24} width={9} height={4} fill="#E7B678" opacity={0.7} />
    </G>
  );
}

function Barrel() {
  return (
    <G>
      <Shadow rx={13} />
      <Path d="M-11 0 Q-15 -14 -11 -28 H11 Q15 -14 11 0 Z" fill="#A86B37" stroke={OL} strokeWidth={SW} strokeLinejoin="round" />
      <Path d="M-13 -7 H13 M-13 -21 H13" stroke="#5E5E66" strokeWidth={3} />
      <Ellipse cx={0} cy={-28} rx={11} ry={3.5} fill="#7E4E26" stroke={OL} strokeWidth={2} />
      <Path d="M-6 -24 Q-8 -14 -6 -4" stroke="#D49A5E" strokeWidth={2.5} fill="none" strokeLinecap="round" />
    </G>
  );
}

function Rock({ color = '#9AA3AD', light = '#C9D0D7' }: { color?: string; light?: string }) {
  return (
    <G>
      <Shadow rx={16} />
      <Path d="M-16 0 L-13 -12 L-4 -19 L8 -17 L16 -6 L14 0 Z" fill={color} stroke={OL} strokeWidth={SW} strokeLinejoin="round" />
      <Path d="M-9 -12 L-3 -16 L4 -15" stroke={light} strokeWidth={3} fill="none" strokeLinecap="round" />
    </G>
  );
}

/** Arbre ou sapin avec un visage : 1 sur 2 ; les yeux ouverts s'animent à part (voir live.tsx), les endormis restent dessinés. */
export const hasFace = (seed: number) => seed % 2 === 0;
export const isSleepy = (seed: number) => seed % 10 === 0;

export function DecorSprite({ kind, x, y, scale, flip, seed, noEyes }: { kind: DecorKind; x: number; y: number; scale: number; flip: boolean; seed: number; noEyes?: boolean }) {
  const face = hasFace(seed) && !(noEyes && !isSleepy(seed));
  let body: React.ReactNode = null;
  switch (kind) {
    case 'tree':
      body = (
        <G>
          <Shadow rx={24} />
          <Trunk h={22} />
          <Blob c={[[-12, -32, 15], [12, -32, 15], [0, -46, 18], [0, -30, 14]]} fill="#4CAF50" dark="#357A38" light="#8BD982" />
          {face ? <Eyes y={-36} sleepy={isSleepy(seed)} /> : null}
        </G>
      );
      break;
    case 'bush':
      body = (
        <G>
          <Shadow rx={17} />
          <Blob c={[[-9, -9, 10], [8, -9, 10], [0, -16, 11]]} fill="#3E9C45" dark="#2D7432" light="#79C97A" />
        </G>
      );
      break;
    case 'flower':
      body = (
        <G>
          <Path d="M0 0 Q1 -7 0 -12" stroke="#2E7D32" strokeWidth={2.4} fill="none" />
          {[0, 72, 144, 216, 288].map((a) => (
            <Circle key={a} cx={Math.cos((a * Math.PI) / 180) * 4.6} cy={-14 + Math.sin((a * Math.PI) / 180) * 4.6} r={3.6} fill={seed % 3 ? '#FFFFFF' : '#FF8FB1'} stroke={OL} strokeWidth={1.3} />
          ))}
          <Circle cx={0} cy={-14} r={3} fill="#FFC928" stroke={OL} strokeWidth={1.3} />
        </G>
      );
      break;
    case 'bench':
      body = (
        <G>
          <Shadow rx={20} />
          <Line x1={-14} y1={0} x2={-14} y2={-12} stroke={OL} strokeWidth={3} />
          <Line x1={14} y1={0} x2={14} y2={-12} stroke={OL} strokeWidth={3} />
          <Rect x={-19} y={-14} width={38} height={5} rx={2} fill="#B5773F" stroke={OL} strokeWidth={2} />
          <Rect x={-19} y={-24} width={38} height={5} rx={2} fill="#B5773F" stroke={OL} strokeWidth={2} />
        </G>
      );
      break;
    case 'lamp':
      body = (
        <G>
          <Shadow rx={8} />
          <Rect x={-2} y={-40} width={4} height={40} fill="#3A3F4B" stroke={OL} strokeWidth={1.4} />
          <Circle cx={0} cy={-46} r={9} fill="#FFE27A" opacity={0.35} />
          <Path d="M-6 -40 H6 L4 -50 H-4 Z" fill="#FFE27A" stroke={OL} strokeWidth={2} strokeLinejoin="round" />
          <Path d="M-7 -50 H7 L0 -56 Z" fill="#3A3F4B" stroke={OL} strokeWidth={2} strokeLinejoin="round" />
        </G>
      );
      break;
    case 'palm':
      body = <Palm />;
      break;
    case 'parasol':
      body = (
        <G>
          <Shadow rx={22} />
          <Line x1={0} y1={0} x2={2} y2={-34} stroke={OL} strokeWidth={3} />
          {[0, 1, 2, 3].map((i) => (
            <Path key={i} d={`M${-24 + i * 12} -32 Q${-18 + i * 12} ${-48 + Math.abs(1.5 - i) * 3} ${-12 + i * 12} -32 Z`} fill={i % 2 ? '#FFFFFF' : '#29B6F6'} stroke={OL} strokeWidth={1.8} strokeLinejoin="round" />
          ))}
          <Path d="M-24 -32 Q0 -60 24 -32" fill="none" stroke={OL} strokeWidth={SW} />
        </G>
      );
      break;
    case 'sandcastle':
      body = (
        <G>
          <Shadow rx={20} />
          <Path d="M-18 0 V-14 H-12 V-24 H-6 V-14 H6 V-24 H12 V-14 H18 V0 Z" fill="#E8C27A" stroke={OL} strokeWidth={SW} strokeLinejoin="round" />
          <Rect x={-4} y={-8} width={8} height={8} rx={4} fill="#9C7442" />
          <Line x1={9} y1={-24} x2={9} y2={-34} stroke={OL} strokeWidth={1.6} />
          <Path d="M9 -34 L17 -31 L9 -28 Z" fill="#E53935" stroke={OL} strokeWidth={1.2} />
        </G>
      );
      break;
    case 'shell':
      body = (
        <G>
          <Path d="M-9 0 Q-11 -12 0 -14 Q11 -12 9 0 Z" fill="#FFB3A7" stroke={OL} strokeWidth={2} strokeLinejoin="round" />
          <Path d="M0 0 V-13 M-4 0 L-6 -12 M4 0 L6 -12" stroke="#E57E70" strokeWidth={1.4} />
        </G>
      );
      break;
    case 'starfish':
      body = <Path d="M0 -16 L3.5 -7 L13 -6 L5.5 0 L8 9 L0 4 L-8 9 L-5.5 0 L-13 -6 L-3.5 -7 Z" fill="#FF8A50" stroke={OL} strokeWidth={2} strokeLinejoin="round" transform="scale(0.85) translate(0 -6)" />;
      break;
    case 'stall':
      body = <Stall />;
      break;
    case 'crate':
      body = <Crate />;
      break;
    case 'barrel':
      body = <Barrel />;
      break;
    case 'pine':
      body = <Pine face={face} sleepy={isSleepy(seed)} />;
      break;
    case 'snowPine':
      body = <Pine snow face={face} sleepy={isSleepy(seed)} />;
      break;
    case 'mushroom':
      body = (
        <G>
          <Shadow rx={13} />
          <Path d="M-5 0 Q-6 -8 -4 -12 H4 Q6 -8 5 0 Z" fill="#FFF3DC" stroke={OL} strokeWidth={2} strokeLinejoin="round" />
          <Path d="M-15 -11 Q-15 -28 0 -28 Q15 -28 15 -11 Z" fill="#E53935" stroke={OL} strokeWidth={SW} strokeLinejoin="round" />
          <Circle cx={-7} cy={-19} r={2.6} fill="#FFFFFF" />
          <Circle cx={5} cy={-22} r={3.2} fill="#FFFFFF" />
          <Circle cx={8} cy={-14} r={2} fill="#FFFFFF" />
        </G>
      );
      break;
    case 'log':
      body = (
        <G>
          <Shadow rx={22} />
          <Rect x={-20} y={-12} width={36} height={12} rx={6} fill="#9C6534" stroke={OL} strokeWidth={SW} />
          <Ellipse cx={16} cy={-6} rx={5} ry={6} fill="#E3B47C" stroke={OL} strokeWidth={2} />
          <Ellipse cx={16} cy={-6} rx={2} ry={2.6} fill="none" stroke="#9C6534" strokeWidth={1.2} />
          <Path d="M-12 -9 H6" stroke="#C88A4E" strokeWidth={2} />
        </G>
      );
      break;
    case 'fern':
      body = (
        <G>
          {[-40, -15, 15, 40].map((a) => (
            <Path key={a} transform={`rotate(${a})`} d="M0 0 Q-4 -10 0 -20 Q4 -10 0 0 Z" fill="#5DBB63" stroke={OL} strokeWidth={1.6} strokeLinejoin="round" />
          ))}
        </G>
      );
      break;
    case 'buoy':
      body = (
        <G>
          <Ellipse cx={0} cy={0} rx={14} ry={4} fill="#5BA9E0" stroke={OL} strokeWidth={1.6} />
          <Path d="M-7 0 Q-8 -10 0 -16 Q8 -10 7 0 Z" fill="#E53935" stroke={OL} strokeWidth={2} strokeLinejoin="round" />
          <Path d="M-7.6 -6 H7.6" stroke="#FFFFFF" strokeWidth={3} />
        </G>
      );
      break;
    case 'boat':
      body = (
        <G>
          <Ellipse cx={0} cy={1} rx={30} ry={6} fill="#5BA9E0" stroke={OL} strokeWidth={1.6} />
          <Path d="M-26 -8 H26 L18 2 H-18 Z" fill="#B5652E" stroke={OL} strokeWidth={SW} strokeLinejoin="round" />
          <Line x1={0} y1={-8} x2={0} y2={-44} stroke={OL} strokeWidth={2.6} />
          <Path d="M2 -42 L22 -12 H2 Z" fill="#FFFFFF" stroke={OL} strokeWidth={2} strokeLinejoin="round" />
          <Path d="M-2 -38 L-16 -12 H-2 Z" fill="#FFE082" stroke={OL} strokeWidth={2} strokeLinejoin="round" />
        </G>
      );
      break;
    case 'bollard':
      body = (
        <G>
          <Shadow rx={9} />
          <Rect x={-6} y={-16} width={12} height={16} rx={3} fill="#3A3F4B" stroke={OL} strokeWidth={2} />
          <Rect x={-8} y={-19} width={16} height={5} rx={2.5} fill="#5A6070" stroke={OL} strokeWidth={2} />
          <Path d="M-6 -9 Q0 -4 6 -9" stroke="#D9B26F" strokeWidth={2.4} fill="none" />
        </G>
      );
      break;
    case 'rock':
      body = <Rock />;
      break;
    case 'snowman':
      body = (
        <G>
          <Shadow rx={14} />
          <Circle cx={0} cy={-11} r={11} fill="#FFFFFF" stroke={OL} strokeWidth={SW} />
          <Circle cx={0} cy={-28} r={8} fill="#FFFFFF" stroke={OL} strokeWidth={SW} />
          <Path d="M0 -28 L9 -26 L0 -25 Z" fill="#FF8A3D" stroke={OL} strokeWidth={1} />
          <Circle cx={-3} cy={-31} r={1.4} fill={OL} />
          <Circle cx={3} cy={-31} r={1.4} fill={OL} />
          <Rect x={-7} y={-42} width={14} height={8} fill="#2B2B33" stroke={OL} strokeWidth={1.6} />
          <Rect x={-10} y={-35} width={20} height={3} fill="#2B2B33" />
          <Path d="M-8 -19 Q0 -15 8 -19" stroke="#E53935" strokeWidth={3} fill="none" />
        </G>
      );
      break;
    case 'chalet':
      body = (
        <G>
          <Shadow rx={30} />
          <Rect x={-22} y={-26} width={44} height={26} fill="#A1663A" stroke={OL} strokeWidth={SW} />
          <Path d="M-30 -24 L0 -52 L30 -24 Z" fill="#7B4A2A" stroke={OL} strokeWidth={SW} strokeLinejoin="round" />
          <Path d="M-27 -26 L0 -50 L27 -26 Q20 -30 13 -27 Q6 -32 0 -28 Q-6 -32 -13 -27 Q-20 -30 -27 -26 Z" fill="#FFFFFF" stroke={OL} strokeWidth={1.6} strokeLinejoin="round" />
          <Rect x={-5} y={-14} width={10} height={14} fill="#5C3A20" stroke={OL} strokeWidth={1.8} />
          <Rect x={-17} y={-20} width={8} height={8} fill="#FFE082" stroke={OL} strokeWidth={1.8} />
          <Rect x={9} y={-20} width={8} height={8} fill="#FFE082" stroke={OL} strokeWidth={1.8} />
        </G>
      );
      break;
    case 'basalt':
      body = (
        <G>
          <Shadow rx={18} />
          <Path d="M-16 0 V-16 L-10 -20 L-4 -16 V0 Z" fill="#3B2A27" stroke={OL} strokeWidth={2} strokeLinejoin="round" />
          <Path d="M-4 0 V-26 L2 -30 L8 -26 V0 Z" fill="#4A3631" stroke={OL} strokeWidth={2} strokeLinejoin="round" />
          <Path d="M8 0 V-12 L13 -15 L18 -12 V0 Z" fill="#3B2A27" stroke={OL} strokeWidth={2} strokeLinejoin="round" />
          <Path d="M0 -24 V-4" stroke="#FF7A3D" strokeWidth={1.4} opacity={0.8} />
        </G>
      );
      break;
    case 'crystal':
      body = (
        <G>
          <Shadow rx={13} />
          <Path d="M-10 0 L-13 -14 L-7 -22 L-3 0 Z" fill="#8E7BFF" stroke={OL} strokeWidth={2} strokeLinejoin="round" />
          <Path d="M-4 0 L-2 -30 L5 -36 L8 0 Z" fill="#B39DFF" stroke={OL} strokeWidth={2} strokeLinejoin="round" />
          <Path d="M7 0 L11 -18 L15 -14 L14 0 Z" fill="#7C63F0" stroke={OL} strokeWidth={2} strokeLinejoin="round" />
          <Path d="M0 -28 L1 -6" stroke="#FFFFFF" strokeWidth={2} opacity={0.7} strokeLinecap="round" />
        </G>
      );
      break;
    case 'lavaPool':
      body = (
        <G>
          <Ellipse cx={0} cy={-4} rx={22} ry={8} fill="#2C1A15" stroke={OL} strokeWidth={2} />
          <Ellipse cx={0} cy={-4} rx={18} ry={5.6} fill="#FF6B2C" />
          <Ellipse cx={-3} cy={-5} rx={10} ry={2.8} fill="#FFC23D" />
          <Circle cx={7} cy={-6} r={1.8} fill="#FFE27A" />
        </G>
      );
      break;
    case 'deadTree':
      body = (
        <G>
          <Shadow rx={14} />
          <Path d="M-4 0 L-2 -26 L-12 -38 M-2 -26 L0 -44 M0 -36 L10 -46 M-2 -18 L8 -26" stroke={OL} strokeWidth={7} strokeLinecap="round" fill="none" />
          <Path d="M-4 0 L-2 -26 L-12 -38 M-2 -26 L0 -44 M0 -36 L10 -46 M-2 -18 L8 -26" stroke="#5B4636" strokeWidth={3.5} strokeLinecap="round" fill="none" />
        </G>
      );
      break;
    case 'puddle':
      body = (
        <G>
          <Ellipse cx={0} cy={-2} rx={18} ry={6} fill="#4F4A7A" stroke={OL} strokeWidth={1.6} />
          <Ellipse cx={-3} cy={-3} rx={8} ry={2.2} fill="none" stroke="#A9A3D6" strokeWidth={1.4} />
        </G>
      );
      break;
    case 'rod':
      body = (
        <G>
          <Shadow rx={8} />
          <Line x1={0} y1={0} x2={0} y2={-44} stroke={OL} strokeWidth={4} />
          <Line x1={0} y1={0} x2={0} y2={-44} stroke="#9AA3AD" strokeWidth={2} />
          <Path d="M-4 -44 L0 -54 L4 -44 Z" fill="#FFD54F" stroke={OL} strokeWidth={1.6} strokeLinejoin="round" />
        </G>
      );
      break;
    case 'column':
      body = (
        <G>
          <Shadow rx={14} />
          <Rect x={-12} y={-6} width={24} height={6} fill="#F2EADB" stroke={OL} strokeWidth={2} />
          <Rect x={-8} y={-44} width={16} height={38} fill="#FBF6EC" stroke={OL} strokeWidth={2} />
          <Path d="M-3 -42 V-8 M3 -42 V-8" stroke="#D8CDB6" strokeWidth={1.6} />
          <Rect x={-12} y={-50} width={24} height={6} rx={2} fill="#F7C948" stroke={OL} strokeWidth={2} />
        </G>
      );
      break;
    case 'topiary':
      body = (
        <G>
          <Shadow rx={12} />
          <Path d="M-8 0 L-10 -10 H10 L8 0 Z" fill="#B5652E" stroke={OL} strokeWidth={2} strokeLinejoin="round" />
          <Line x1={0} y1={-10} x2={0} y2={-16} stroke={OL} strokeWidth={3} />
          <Circle cx={0} cy={-26} r={12} fill="#3E9C45" stroke={OL} strokeWidth={SW} />
          <Circle cx={-4} cy={-30} r={4} fill="#79C97A" opacity={0.8} />
        </G>
      );
      break;
    case 'fountain':
      body = (
        <G>
          <Shadow rx={30} />
          <Ellipse cx={0} cy={-6} rx={28} ry={9} fill="#E9DFCB" stroke={OL} strokeWidth={SW} />
          <Ellipse cx={0} cy={-8} rx={22} ry={6} fill="#6FC3EE" />
          <Rect x={-4} y={-30} width={8} height={22} fill="#E9DFCB" stroke={OL} strokeWidth={2} />
          <Path d="M0 -32 Q-12 -40 -16 -14 M0 -32 Q12 -40 16 -14 M0 -32 V-44" stroke="#BFE8FF" strokeWidth={3} fill="none" strokeLinecap="round" />
        </G>
      );
      break;
    case 'planet':
      body = (
        <G transform="translate(0 -24)">
          <Circle cx={0} cy={0} r={14} fill={seed % 2 ? '#FF8A65' : '#4FC3F7'} stroke={OL} strokeWidth={SW} />
          <Path d="M-13 3 Q0 8 13 3" stroke="rgba(255,255,255,0.5)" strokeWidth={3} fill="none" />
          <Circle cx={-5} cy={-5} r={4} fill="#FFFFFF" opacity={0.45} />
        </G>
      );
      break;
    case 'asteroid':
      body = (
        <G transform="translate(0 -12)">
          <Path d="M-12 2 L-9 -8 L0 -12 L10 -7 L12 4 L3 10 L-8 9 Z" fill="#7E7A93" stroke={OL} strokeWidth={2} strokeLinejoin="round" />
          <Circle cx={-3} cy={-2} r={3} fill="#5E5A73" />
          <Circle cx={5} cy={4} r={2} fill="#5E5A73" />
        </G>
      );
      break;
    case 'star':
      body = <Path d="M0 -22 L3 -13 L12 -10 L3 -7 L0 2 L-3 -7 L-12 -10 L-3 -13 Z" fill="#FFF3B0" opacity={0.9} />;
      break;
    case 'grass':
      body = (
        <G>
          <Ellipse cx={0} cy={1} rx={10} ry={2.5} fill="rgba(0,0,0,0.15)" />
          {[-8, -4, 0, 4, 8].map((bx, i) => (
            <Path
              key={bx}
              d={`M${bx - 2} 0 Q${bx + (i % 2 ? 4 : -4)} ${-10 - (i % 3) * 3} ${bx + (i % 2 ? 6 : -5)} ${-20 - ((i * 7) % 9)} Q${bx + 1} ${-9} ${bx + 2} 0 Z`}
              fill={i % 2 ? '#5DBB4F' : '#4AA63D'}
              stroke={OL}
              strokeWidth={1.6}
              strokeLinejoin="round"
            />
          ))}
        </G>
      );
      break;
  }
  return <G transform={`translate(${x} ${y}) scale(${flip ? -scale : scale} ${scale})`}>{body}</G>;
}

/** Grands décors, un par monde. `side` : -1 = bord gauche, 1 = bord droit. */
/** `live` : les parties animées (canard, drapeaux, yeux de l'arbre géant) sont dessinées à part, en mouvement. */
export function HeroDecor({ kind, x, y, side, width, live = false }: { kind: HeroKind; x: number; y: number; side: -1 | 1; width: number; live?: boolean }) {
  switch (kind) {
    case 'pond':
      return (
        <G transform={`translate(${x} ${y})`}>
          <Ellipse cx={0} cy={0} rx={66} ry={32} fill="#5FAE45" />
          <Ellipse cx={0} cy={0} rx={60} ry={27} fill="#3FA9F5" stroke={OL} strokeWidth={SW} />
          <Ellipse cx={-14} cy={-8} rx={26} ry={6} fill="#8FD3FF" opacity={0.8} />
          <Path d="M18 6 a9 6 0 1 1 1 0 Z" fill="#43A047" stroke={OL} strokeWidth={1.8} />
          <Path d="M-30 8 a7 5 0 1 1 1 0 Z" fill="#43A047" stroke={OL} strokeWidth={1.8} />
          {/* canard */}
          {live ? null : <G transform="translate(20 -6)">
            <Ellipse cx={0} cy={0} rx={10} ry={6} fill="#FFE082" stroke={OL} strokeWidth={2} />
            <Circle cx={7} cy={-7} r={5} fill="#FFE082" stroke={OL} strokeWidth={2} />
            <Path d="M11 -7 L16 -6 L11 -4 Z" fill="#FF8A3D" stroke={OL} strokeWidth={1.2} />
            <Circle cx={8} cy={-8} r={1.2} fill={OL} />
          </G>}
        </G>
      );
    case 'sea': {
      const edge = side < 0 ? 0 : width;
      const inner = side < 0 ? x + 70 : x - 70;
      const d = `M${edge} ${y - 170} L${inner} ${y - 170} Q${inner + side * -26} ${y - 120} ${inner} ${y - 80} Q${inner + side * 22} ${y - 40} ${inner} ${y} Q${inner + side * -26} ${y + 40} ${inner} ${y + 80} Q${inner + side * 22} ${y + 120} ${inner} ${y + 170} L${edge} ${y + 170} Z`;
      return (
        <G>
          <Path d={d} fill="#FFF3D6" transform={`translate(${side * -8} 0)`} />
          <Path d={d} fill="#29A7E8" stroke={OL} strokeWidth={SW} />
          {[-120, -50, 20, 90, 150].map((dy, i) => (
            <Path key={dy} d={`M${edge + side * -(24 + (i % 2) * 30)} ${y + dy} q8 -6 16 0 q8 6 16 0`} stroke="#BDE8FF" strokeWidth={3} fill="none" strokeLinecap="round" transform={side > 0 ? `translate(-32 0)` : undefined} />
          ))}
        </G>
      );
    }
    case 'market':
      return (
        <G transform={`translate(${x} ${y + 40})`}>
          <Ellipse cx={0} cy={2} rx={62} ry={10} fill="rgba(0,0,0,0.2)" />
          <Rect x={-56} y={-56} width={112} height={56} fill="#F3E2C3" stroke={OL} strokeWidth={SW} />
          {[-44, -18, 8, 34].map((dx) => (
            <Rect key={dx} x={dx} y={-36} width={16} height={36} rx={8} fill="#8F5A2A" stroke={OL} strokeWidth={2} />
          ))}
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Path key={i} d={`M${-64 + i * 16} -70 h16 v12 q-8 7 -16 0 Z`} fill={i % 2 ? '#FFFFFF' : '#2E7D32'} stroke={OL} strokeWidth={1.8} strokeLinejoin="round" />
          ))}
          <Path d="M-68 -70 L-56 -86 H56 L68 -70 Z" fill="#2E7D32" stroke={OL} strokeWidth={SW} strokeLinejoin="round" />
          <Rect x={-30} y={-104} width={60} height={20} rx={4} fill="#F7C948" stroke={OL} strokeWidth={SW} />
          <Path d="M-20 -94 H20" stroke={OL} strokeWidth={3} strokeLinecap="round" />
        </G>
      );
    case 'bigTree':
      return (
        <G transform={`translate(${x} ${y + 60}) scale(2.2)`}>
          <Shadow rx={30} />
          <Trunk h={30} w={14} color="#7A4B26" />
          <Blob c={[[-18, -40, 18], [18, -40, 18], [0, -58, 22], [-8, -36, 14], [10, -34, 14]]} fill="#2E8B47" dark="#1F6633" light="#66C17A" />
          {live ? null : <Eyes y={-44} />}
          <Path d="M-6 -34 q6 5 12 0" stroke={OL} strokeWidth={2} fill="none" strokeLinecap="round" />
        </G>
      );
    case 'lighthouse': {
      const edge = side < 0 ? 0 : width;
      return (
        <G>
          <Path d={`M${edge} ${y - 150} L${x + side * -10} ${y - 150} Q${x + side * 30} ${y} ${x + side * -10} ${y + 150} L${edge} ${y + 150} Z`} fill="#2F86C9" stroke={OL} strokeWidth={SW} />
          <G transform={`translate(${x} ${y + 30})`}>
            <Ellipse cx={0} cy={2} rx={26} ry={7} fill="#7F8C99" stroke={OL} strokeWidth={2} />
            <Path d="M-14 0 L-9 -80 H9 L14 0 Z" fill="#FFFFFF" stroke={OL} strokeWidth={SW} strokeLinejoin="round" />
            <Path d="M-13 -16 L-12 -30 H12 L13 -16 Z M-11 -48 L-10 -62 H10 L11 -48 Z" fill="#E53935" />
            <Path d="M-14 0 L-9 -80 H9 L14 0 Z" fill="none" stroke={OL} strokeWidth={SW} strokeLinejoin="round" />
            <Rect x={-12} y={-96} width={24} height={16} rx={2} fill="#FFE27A" stroke={OL} strokeWidth={SW} />
            <Path d="M-14 -96 L0 -110 L14 -96 Z" fill="#E53935" stroke={OL} strokeWidth={SW} strokeLinejoin="round" />
          </G>
        </G>
      );
    }
    case 'mountains':
      return (
        <G transform={`translate(${x} ${y + 70})`}>
          <Path d="M-90 0 L-30 -130 L30 0 Z" fill="#8FA7BF" stroke={OL} strokeWidth={SW} strokeLinejoin="round" />
          <Path d="M-48 -92 L-30 -130 L-12 -92 L-22 -86 L-30 -94 L-38 -84 Z" fill="#FFFFFF" stroke={OL} strokeWidth={2} strokeLinejoin="round" />
          <Path d="M-20 0 L40 -100 L100 0 Z" fill="#A9BDD1" stroke={OL} strokeWidth={SW} strokeLinejoin="round" />
          <Path d="M26 -76 L40 -100 L54 -76 L46 -70 L40 -78 L32 -70 Z" fill="#FFFFFF" stroke={OL} strokeWidth={2} strokeLinejoin="round" />
          <Path d="M-30 -130 L-60 -60" stroke="#B9CCDD" strokeWidth={4} strokeLinecap="round" />
        </G>
      );
    case 'volcano':
      return (
        <G transform={`translate(${x} ${y + 80})`}>
          <Ellipse cx={0} cy={2} rx={90} ry={14} fill="rgba(0,0,0,0.3)" />
          <Path d="M-88 0 L-26 -120 H26 L88 0 Z" fill="#4A2E28" stroke={OL} strokeWidth={SW} strokeLinejoin="round" />
          <Path d="M-26 -120 Q0 -110 26 -120 L22 -112 Q0 -104 -22 -112 Z" fill="#FF6B2C" stroke={OL} strokeWidth={2} />
          <Path d="M-6 -114 Q-14 -80 -4 -60 Q6 -40 -10 0 H6 Q18 -40 8 -62 Q2 -82 8 -112 Z" fill="#FF7A2C" stroke={OL} strokeWidth={2} strokeLinejoin="round" />
          <Path d="M-2 -100 Q-6 -80 1 -64" stroke="#FFD54F" strokeWidth={3} fill="none" strokeLinecap="round" />
          <Path d="M-60 -30 L-40 -64" stroke="#6E4A40" strokeWidth={4} strokeLinecap="round" />
        </G>
      );
    case 'storm':
      return (
        <G transform={`translate(${x} ${y - 30})`}>
          {[-30, -10, 10, 30].map((dx) => (
            <Line key={dx} x1={dx} y1={10} x2={dx - 10} y2={46} stroke="#A9B4FF" strokeWidth={2.4} strokeLinecap="round" opacity={0.7} />
          ))}
          <Blob c={[[-34, 0, 22], [0, -14, 28], [34, 0, 22], [0, 6, 22]]} fill="#5C5880" dark="#45416A" light="#8A86B3" />
          <Path d="M2 14 L-10 40 H2 L-6 64 L16 32 H4 L12 14 Z" fill="#FFE14D" stroke={OL} strokeWidth={2} strokeLinejoin="round" />
        </G>
      );
    case 'castle':
      return (
        <G transform={`translate(${x} ${y + 70}) scale(1.05)`}>
          <Ellipse cx={0} cy={2} rx={72} ry={10} fill="rgba(0,0,0,0.2)" />
          <Rect x={-50} y={-70} width={100} height={70} fill="#F3EBDD" stroke={OL} strokeWidth={SW} />
          {[-50, 30].map((tx) => (
            <G key={tx}>
              <Rect x={tx} y={-100} width={20} height={100} fill="#E8DCC6" stroke={OL} strokeWidth={SW} />
              <Path d={`M${tx - 4} -100 L${tx + 10} -126 L${tx + 24} -100 Z`} fill="#C8283C" stroke={OL} strokeWidth={SW} strokeLinejoin="round" />
              <Line x1={tx + 10} y1={-126} x2={tx + 10} y2={-140} stroke={OL} strokeWidth={2} />
              {live ? null : <Path d={`M${tx + 10} -140 L${tx + 22} -136 L${tx + 10} -132 Z`} fill="#F7C948" stroke={OL} strokeWidth={1.4} />}
            </G>
          ))}
          {[-40, -22, -4, 14].map((bx) => (
            <Rect key={bx} x={bx} y={-80} width={12} height={10} fill="#F3EBDD" stroke={OL} strokeWidth={2} />
          ))}
          <Path d="M-14 0 V-30 Q0 -44 14 -30 V0 Z" fill="#7A4B26" stroke={OL} strokeWidth={SW} />
          <Rect x={-30} y={-58} width={10} height={14} rx={5} fill="#5BA9E0" stroke={OL} strokeWidth={2} />
          <Rect x={20} y={-58} width={10} height={14} rx={5} fill="#5BA9E0" stroke={OL} strokeWidth={2} />
        </G>
      );
    case 'ringPlanet':
      return (
        <G transform={`translate(${x} ${y})`}>
          <Ellipse cx={0} cy={0} rx={74} ry={18} fill="none" stroke={OL} strokeWidth={9} transform="rotate(-18)" />
          <Circle cx={0} cy={0} r={44} fill="#B07CFF" stroke={OL} strokeWidth={SW} />
          <Path d="M-42 -8 Q0 6 42 -8 M-38 16 Q0 28 38 16" stroke="#8C5AE8" strokeWidth={7} fill="none" />
          <Circle cx={-16} cy={-18} r={12} fill="#FFFFFF" opacity={0.3} />
          <Path d="M-70 23 A74 18 -18 0 0 70 -23" fill="none" stroke="#FFD27A" strokeWidth={5} transform="rotate(0)" />
          <Circle cx={side * -70} cy={-60} r={12} fill="#E8E4FF" stroke={OL} strokeWidth={2} />
          <Circle cx={side * -73} cy={-63} r={3} fill="#C9C2F0" />
        </G>
      );
  }
}

/** Petites touches de texture sur le sol. */
export function Texture({ kind, x, y, color }: { kind: 'tuft' | 'pebble' | 'dot' | 'sparkle'; x: number; y: number; color: string }) {
  switch (kind) {
    case 'tuft':
      return <Path d={`M${x - 4} ${y} l2 -6 l2 6 l2 -7 l2 7`} stroke={color} strokeWidth={1.8} fill="none" strokeLinejoin="round" strokeLinecap="round" />;
    case 'pebble':
      return <Ellipse cx={x} cy={y} rx={3.2} ry={2.2} fill={color} />;
    case 'dot':
      return <Circle cx={x} cy={y} r={1.8} fill={color} />;
    case 'sparkle':
      return <Polygon points={`${x},${y - 3} ${x + 1},${y - 1} ${x + 3},${y} ${x + 1},${y + 1} ${x},${y + 3} ${x - 1},${y + 1} ${x - 3},${y} ${x - 1},${y - 1}`} fill="#FFFFFF" opacity={0.7} />;
  }
}
