/**
 * Décors de la carte, dessinés en SVG façon dessin animé : formes pleines,
 * gros contour sombre, un reflet clair, une ombre au sol. Chaque décor est
 * dessiné autour de son pied (0, 0), vers le haut.
 */
import { Circle, Ellipse, G, Line, Path, Polygon, Rect } from 'react-native-svg';

import type { DecorKind, HeroKind, TextureKind, WorldLook } from './worlds';
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

/**
 * `noEyes` : version animée (voir live.tsx) — les yeux ouverts et les parties
 * qui bougent (grenouille, queue de la vache, drapeau, lanterne…) sont
 * dessinés à part.
 */
export function DecorSprite({ kind, x, y, scale, flip, seed, noEyes }: { kind: DecorKind; x: number; y: number; scale: number; flip: boolean; seed: number; noEyes?: boolean }) {
  const face = hasFace(seed) && !(noEyes && !isSleepy(seed));
  const live = !!noEyes;
  let body: React.ReactNode = newDecor(kind, seed, face, live);
  if (!body) switch (kind) {
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
    case 'lake':
    case 'fair':
    case 'farm':
    case 'manor':
    case 'cove':
    case 'pyramids':
    case 'mine':
    case 'skyIslands':
    case 'skyline':
    case 'moonBase':
      return <NewHero kind={kind} x={x} y={y} side={side} width={width} live={live} />;
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
export function Texture({ kind, x, y, color }: { kind: TextureKind; x: number; y: number; color: string }) {
  switch (kind) {
    case 'confetti': {
      const k = Math.floor(x * 7 + y * 13);
      return <Rect x={x - 2.4} y={y - 1.2} width={4.8} height={2.4} rx={0.8} fill={CONFETTI[k % CONFETTI.length]} opacity={0.75} transform={`rotate(${(k * 37) % 180} ${x} ${y})`} />;
    }
    case 'dune':
      return <Path d={`M${x - 6} ${y} q6 -4.5 12 0`} stroke={color} strokeWidth={1.8} fill="none" strokeLinecap="round" />;
    case 'puff':
      return (
        <G opacity={0.7}>
          <Circle cx={x - 2.5} cy={y} r={2.6} fill={color} />
          <Circle cx={x + 1.5} cy={y - 1.2} r={3.2} fill={color} />
          <Circle cx={x + 4.5} cy={y + 0.4} r={2.2} fill={color} />
        </G>
      );
    case 'crater':
      return (
        <G>
          <Ellipse cx={x} cy={y} rx={4.6} ry={2.6} fill={color} />
          <Path d={`M${x - 3.8} ${y + 0.6} q3.8 2.8 7.6 0`} stroke="#DCDFE8" strokeWidth={1.2} fill="none" strokeLinecap="round" />
        </G>
      );
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

/* ---------------------------------- Route --------------------------------- */

const CONFETTI = ['#FF5D8F', '#FFD54F', '#5FC4F0', '#7CD67A', '#B78CFF', '#FF8A3D'];

/**
 * La route d'un monde : ombre, contour, bordure, chaussée, puis pointillés —
 * ou planches (ponton, pont suspendu), rails (mines), bandes néon.
 * `rails` : les deux rails déjà décalés de part et d'autre du milieu.
 */
export function Road({ d, look, w, rails }: { d: string; look: WorldLook; w: number; rails?: string[] | null }) {
  const style = look.roadStyle;
  return (
    <G>
      {style === 'neon' ? <Path d={d} stroke={look.roadEdge} strokeWidth={w + 36} fill="none" strokeLinecap="round" opacity={0.13} /> : null}
      <Path d={d} stroke="rgba(0,0,0,0.22)" strokeWidth={w + 14} fill="none" strokeLinecap="round" transform="translate(0 5)" />
      <Path d={d} stroke={OL} strokeWidth={w + 10} fill="none" strokeLinecap="round" />
      <Path d={d} stroke={look.roadEdge} strokeWidth={w + 5} fill="none" strokeLinecap="round" />
      <Path d={d} stroke={look.road} strokeWidth={w - 3} fill="none" strokeLinecap="round" />
      {style === 'planks' ? (
        <G>
          <Path d={d} stroke={look.roadLine} strokeWidth={w - 3} fill="none" strokeDasharray="2.2 10" opacity={0.6} />
          <Path d={d} stroke="#FFFFFF" strokeWidth={w - 18} fill="none" strokeDasharray="1 30" opacity={0.18} />
        </G>
      ) : style === 'rails' ? (
        <G>
          <Path d={d} stroke="#5E4026" strokeWidth={w - 9} fill="none" strokeDasharray="5 9" opacity={0.9} />
          {(rails ?? []).map((r, i) => (
            <G key={i}>
              <Path d={r} stroke={OL} strokeWidth={5.6} fill="none" strokeLinejoin="round" />
              <Path d={r} stroke="#C9D1DA" strokeWidth={2.4} fill="none" strokeLinejoin="round" />
            </G>
          ))}
        </G>
      ) : style === 'neon' ? (
        <G>
          <Path d={d} stroke={look.roadEdge} strokeWidth={w - 9} fill="none" strokeLinecap="round" />
          <Path d={d} stroke={look.road} strokeWidth={w - 13} fill="none" strokeLinecap="round" />
          <Path d={d} stroke={look.roadLine} strokeWidth={9} fill="none" strokeDasharray="8 14" strokeLinecap="round" opacity={0.18} />
          <Path d={d} stroke={look.roadLine} strokeWidth={3.4} fill="none" strokeDasharray="8 14" strokeLinecap="round" />
        </G>
      ) : (
        <Path d={d} stroke={look.roadLine} strokeWidth={3} fill="none" strokeDasharray="3 15" strokeLinecap="round" opacity={0.75} />
      )}
    </G>
  );
}

/* ------------------------------ Nouveaux décors ------------------------------ */

/** Feuille de nénuphar (avec son encoche), centrée en (cx, cy). */
const lilyPad = (cx: number, cy: number, rx: number, ry: number) =>
  `M${cx} ${cy} L${cx - rx * 0.3} ${cy + ry * 0.95} A${rx} ${ry} 0 1 1 ${cx + rx * 0.3} ${cy + ry * 0.95} Z`;

export function Frog() {
  return (
    <G>
      <Ellipse cx={-5.5} cy={-0.8} rx={2.8} ry={1.5} fill="#3F9B3A" stroke={OL} strokeWidth={1.1} />
      <Ellipse cx={5.5} cy={-0.8} rx={2.8} ry={1.5} fill="#3F9B3A" stroke={OL} strokeWidth={1.1} />
      <Ellipse cx={0} cy={-4.5} rx={7} ry={5} fill="#62C24F" stroke={OL} strokeWidth={1.6} />
      <Circle cx={-3.6} cy={-9} r={2.7} fill="#62C24F" stroke={OL} strokeWidth={1.4} />
      <Circle cx={3.6} cy={-9} r={2.7} fill="#62C24F" stroke={OL} strokeWidth={1.4} />
      <Circle cx={-3.6} cy={-9.3} r={1.5} fill="#FFFFFF" />
      <Circle cx={3.6} cy={-9.3} r={1.5} fill="#FFFFFF" />
      <Circle cx={-3.3} cy={-9.1} r={0.8} fill={OL} />
      <Circle cx={3.9} cy={-9.1} r={0.8} fill={OL} />
      <Path d="M-3.2 -4 Q0 -1.8 3.2 -4" stroke={OL} strokeWidth={1.1} fill="none" strokeLinecap="round" />
      <Ellipse cx={-2} cy={-6.5} rx={2} ry={1} fill="#9BE08A" opacity={0.8} />
    </G>
  );
}

/** Place de la grenouille sur son nénuphar (décor « lily »). */
export const LILY_FROG = { x: 8, y: -4 };

function PinkLily({ x, y }: { x: number; y: number }) {
  return (
    <G transform={`translate(${x} ${y})`}>
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <Ellipse key={a} cx={Math.cos((a * Math.PI) / 180) * 2.6} cy={Math.sin((a * Math.PI) / 180) * 1.6 - 1.5} rx={2.4} ry={1.5} fill="#FF9EC4" stroke={OL} strokeWidth={0.9} />
      ))}
      <Circle cx={0} cy={-1.8} r={1.3} fill="#FFD54F" />
    </G>
  );
}

function Reeds({ small }: { small?: boolean }) {
  const stems: [number, number, number][] = small
    ? [[-4, 26, -3], [2, 32, 2], [7, 22, 5]]
    : [[-8, 30, -5], [-2, 40, 0], [5, 34, 4], [11, 25, 8]];
  return (
    <G>
      <Ellipse cx={0} cy={1} rx={13} ry={3} fill="rgba(0,0,0,0.15)" />
      {[[-12, -17, -17], [13, -15, 19], [-3, -21, -7], [6, -14, 10]].map(([bx, h, tip], i) => (
        <Path key={`b${i}`} d={`M${bx - 2} 0 Q${bx} ${h / 2} ${tip} ${h} Q${bx + 1} ${h / 2} ${bx + 2} 0 Z`} fill={i % 2 ? '#4FA843' : '#62BC4E'} stroke={OL} strokeWidth={1.4} strokeLinejoin="round" />
      ))}
      {stems.map(([sx, h, lean], i) => {
        const d = `M${sx} 0 Q${sx + lean * 0.3} ${-h * 0.5} ${sx + lean} ${-h - 6}`;
        return (
          <G key={i}>
            <Path d={d} stroke={OL} strokeWidth={3.6} fill="none" strokeLinecap="round" />
            <Path d={d} stroke="#86BE4C" strokeWidth={1.7} fill="none" strokeLinecap="round" />
            <Rect x={sx + lean * 0.85 - 2.9} y={-h - 2} width={5.8} height={11} rx={2.9} fill="#8A5427" stroke={OL} strokeWidth={1.5} transform={`rotate(${lean * 1.6} ${sx + lean * 0.85} ${-h + 3})`} />
          </G>
        );
      })}
    </G>
  );
}

const BULBS = ['#FF5D8F', '#FFD54F', '#5FC4F0', '#7CD67A', '#FF8A3D', '#B78CFF'];

/** Ampoules de la guirlande (décor « garland »), le long d'une courbe. */
export const GARLAND_BULBS = [0.08, 0.24, 0.4, 0.56, 0.72, 0.88].map((t, i) => {
  const u = 1 - t;
  return { x: u * u * -22 + 2 * u * t * 0 + t * t * 22, y: u * u * -38 + 2 * u * t * -18 + t * t * -34 + 3, c: BULBS[i % BULBS.length] };
});

function Pumpkin({ lantern }: { lantern?: boolean }) {
  return (
    <G>
      <Shadow rx={15} />
      <Ellipse cx={-7} cy={-10} rx={8} ry={9.5} fill="#E57A1F" stroke={OL} strokeWidth={2} />
      <Ellipse cx={7} cy={-10} rx={8} ry={9.5} fill="#E57A1F" stroke={OL} strokeWidth={2} />
      <Ellipse cx={0} cy={-10.5} rx={8} ry={10.5} fill="#FF9433" stroke={OL} strokeWidth={2} />
      <Path d="M-1 -20 q0 -5 4 -7 l2 2 q-3 2 -3 5 Z" fill="#6E8B3D" stroke={OL} strokeWidth={1.4} strokeLinejoin="round" />
      {lantern ? (
        <G>
          <Path d="M-6 -14 L-2.5 -11 L-6.5 -10 Z M6 -14 L2.5 -11 L6.5 -10 Z" fill="#FFE27A" stroke={OL} strokeWidth={0.9} strokeLinejoin="round" />
          <Path d="M-7 -6 L-4.5 -4 L-2.2 -6 L0 -3.8 L2.2 -6 L4.5 -4 L7 -6 Q6 -1 0 -1 Q-6 -1 -7 -6 Z" fill="#FFE27A" stroke={OL} strokeWidth={0.9} strokeLinejoin="round" />
        </G>
      ) : (
        <Path d="M-4 -16 Q-6 -10 -4 -5" stroke="#FFC27A" strokeWidth={2.2} fill="none" strokeLinecap="round" />
      )}
    </G>
  );
}

function Crystals({ colors, glow }: { colors: [string, string, string]; glow?: string }) {
  return (
    <G>
      <Shadow rx={15} />
      {glow ? <Ellipse cx={0} cy={-2} rx={18} ry={5} fill={glow} opacity={0.35} /> : null}
      <Path d="M-12 0 L-16 -15 L-9 -24 L-4 0 Z" fill={colors[0]} stroke={OL} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M-5 0 L-3 -32 L5 -39 L9 0 Z" fill={colors[1]} stroke={OL} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M8 0 L12 -20 L17 -15 L15 0 Z" fill={colors[0]} stroke={OL} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M-1 -30 L0 -6" stroke="#FFFFFF" strokeWidth={2.2} opacity={0.75} strokeLinecap="round" />
      <Path d="M-11 -20 L-9 -6" stroke="#FFFFFF" strokeWidth={1.6} opacity={0.6} strokeLinecap="round" />
      <Path d="M3 -34 L7 -3" stroke={colors[2]} strokeWidth={2} opacity={0.8} />
    </G>
  );
}

/** Lanterne de mine, accrochée en (0, 0). */
export function LanternBody() {
  return (
    <G>
      <Line x1={0} y1={0} x2={0} y2={5} stroke={OL} strokeWidth={1.6} />
      <Path d="M-6 6 L0 2 L6 6 Z" fill="#3A3F4B" stroke={OL} strokeWidth={1.4} strokeLinejoin="round" />
      <Rect x={-5} y={6} width={10} height={12} rx={2} fill="#FFD54F" stroke={OL} strokeWidth={1.8} />
      <Path d="M-2 8 V16" stroke="#FFF6C8" strokeWidth={2} strokeLinecap="round" />
      <Rect x={-6} y={17} width={12} height={3} rx={1} fill="#3A3F4B" stroke={OL} strokeWidth={1.2} />
    </G>
  );
}

/** Drapeau pirate, attaché au mât en (0, 0). */
export function JollyFlag({ w = 24 }: { w?: number }) {
  const k = w / 24;
  return (
    <G transform={`scale(${k})`}>
      <Path d="M0 0 L24 2.5 Q20 9 24 15.5 L0 17 Z" fill="#1E1E24" stroke={OL} strokeWidth={1.6} strokeLinejoin="round" />
      <Path d="M6 13 L16 5 M6 5 L16 13" stroke="#F6EEDD" strokeWidth={2} strokeLinecap="round" />
      <Circle cx={11} cy={7.4} r={3.6} fill="#F6EEDD" />
      <Rect x={9} y={9.5} width={4} height={2.4} rx={0.6} fill="#F6EEDD" />
      <Circle cx={9.7} cy={7.2} r={0.9} fill="#1E1E24" />
      <Circle cx={12.3} cy={7.2} r={0.9} fill="#1E1E24" />
    </G>
  );
}

/** Queue de la vache, attachée en (0, 0). */
export function CowTail() {
  return (
    <G>
      <Path d="M0 0 Q-5 6 -4 14" stroke={OL} strokeWidth={3.2} fill="none" strokeLinecap="round" />
      <Path d="M0 0 Q-5 6 -4 14" stroke="#FFFFFF" strokeWidth={1.4} fill="none" strokeLinecap="round" />
      <Path d="M-4 12 q-3 3 -1 7 q2 -2 3 0 q1 -4 -2 -7 Z" fill="#2B2B33" stroke={OL} strokeWidth={1} />
    </G>
  );
}
export const COW_TAIL = { x: -17, y: -24 };

/** Forme lumineuse d'une enseigne néon : cœur, éclair ou étoile. */
export function NeonShape({ seed, bright = true }: { seed: number; bright?: boolean }) {
  const shape = seed % 3;
  const color = NEON[shape];
  const d =
    shape === 0
      ? 'M0 -41 C-4 -46 -11 -45 -11 -39 C-11 -34 -4 -31 0 -27 C4 -31 11 -34 11 -39 C11 -45 4 -46 0 -41 Z'
      : shape === 1
        ? 'M3 -50 L-7 -36 H-1 L-4 -24 L7 -39 H1 Z'
        : 'M0 -50 L3 -42 L11 -41 L5 -35 L7 -27 L0 -31 L-7 -27 L-5 -35 L-11 -41 L-3 -42 Z';
  return (
    <G>
      {bright ? <Path d={d} stroke={color} strokeWidth={7} fill="none" opacity={0.3} strokeLinejoin="round" /> : null}
      <Path d={d} stroke={bright ? color : '#5A6080'} strokeWidth={2.6} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      {bright ? <Path d={d} stroke="#FFFFFF" strokeWidth={0.9} fill="none" opacity={0.85} strokeLinejoin="round" /> : null}
    </G>
  );
}
export const NEON = ['#FF4FD8', '#5FF2FF', '#FFE45C'];

/** Le petit losange de l'hologramme, centré en (0, 0). */
export function HoloFigure() {
  return (
    <G>
      <Path d="M0 -12 L10 0 L0 12 L-10 0 Z" fill="rgba(95,242,255,0.25)" stroke="#5FF2FF" strokeWidth={2} strokeLinejoin="round" />
      <Path d="M0 -5 L4.5 0 L0 5 L-4.5 0 Z" fill="#CFFBFF" />
      <Path d="M-14 -6 H-11 M11 6 H14 M-13 5 H-10" stroke="#5FF2FF" strokeWidth={1.2} opacity={0.8} />
    </G>
  );
}

/** Décors ajoutés avec les 10 nouveaux mondes (null : décor d'origine). */
function newDecor(kind: DecorKind, seed: number, face: boolean, live: boolean): React.ReactNode {
  switch (kind) {
    /* ---- Lac ---- */
    case 'willow': {
      const fronds = [-27, -20, -13, 13, 20, 27];
      const fd = (fx: number) => `M${fx} -40 Q${fx + (fx < 0 ? -4 : 4)} -24 ${fx + (fx < 0 ? -1 : 1)} ${-9 - Math.abs(fx) * 0.12}`;
      return (
        <G>
          <Shadow rx={27} />
          <Trunk h={28} w={10} color="#7A5230" />
          {fronds.map((fx) => (
            <Path key={`o${fx}`} d={fd(fx)} stroke={OL} strokeWidth={8.4} strokeLinecap="round" fill="none" />
          ))}
          {fronds.map((fx) => (
            <Path key={`f${fx}`} d={fd(fx)} stroke={Math.abs(fx) === 20 ? '#4E9A4A' : '#64B356'} strokeWidth={4.6} strokeLinecap="round" fill="none" />
          ))}
          <Blob c={[[-15, -42, 15], [15, -42, 15], [0, -53, 18], [0, -38, 14]]} fill="#7CC46A" dark="#4E9A4A" light="#BDE8A0" />
          {[-9, 0, 9].map((fx) => (
            <Path key={`s${fx}`} d={`M${fx} -34 q1 6 0 10`} stroke="#4E9A4A" strokeWidth={2.4} fill="none" strokeLinecap="round" />
          ))}
          {face ? <Eyes y={-44} sleepy={isSleepy(seed)} /> : null}
        </G>
      );
    }
    case 'reeds':
      return <Reeds />;
    case 'lily':
      return (
        <G>
          <Ellipse cx={0} cy={-3} rx={26} ry={10} fill="#4AB083" />
          <Ellipse cx={0} cy={-3} rx={22.5} ry={8} fill="#3FA9F5" stroke={OL} strokeWidth={2} />
          <Ellipse cx={-8} cy={-5.5} rx={8} ry={1.8} fill="#9AD8FF" opacity={0.85} />
          <Path d={lilyPad(-11, -2, 6.5, 3.4)} fill="#43A047" stroke={OL} strokeWidth={1.4} strokeLinejoin="round" />
          <Path d={lilyPad(LILY_FROG.x, -3.5, 8.5, 4.2)} fill="#4CAF50" stroke={OL} strokeWidth={1.4} strokeLinejoin="round" />
          <PinkLily x={-11} y={-2.5} />
          {live ? null : (
            <G transform={`translate(${LILY_FROG.x} ${LILY_FROG.y})`}>
              <Frog />
            </G>
          )}
        </G>
      );
    case 'heron':
      return (
        <G>
          <Shadow rx={10} />
          <Path d="M0 0 V-17 M0 -12 L5 -9" stroke={OL} strokeWidth={3} strokeLinecap="round" fill="none" />
          <Path d="M0 0 V-17 M0 -12 L5 -9" stroke="#F2B23A" strokeWidth={1.4} strokeLinecap="round" fill="none" />
          <Path d="M-14 -20 L-8 -27 Q2 -32 8 -24 Q6 -16 -2 -16 Q-9 -16 -14 -20 Z" fill="#B9C7D6" stroke={OL} strokeWidth={2} strokeLinejoin="round" />
          <Path d="M-11 -21 Q-3 -26 4 -22" stroke="#8698AB" strokeWidth={2.4} fill="none" strokeLinecap="round" />
          <Path d="M5 -25 Q11 -33 5 -40 Q1 -46 6 -49" stroke={OL} strokeWidth={6.2} fill="none" strokeLinecap="round" />
          <Path d="M5 -25 Q11 -33 5 -40 Q1 -46 6 -49" stroke="#E3EAF1" strokeWidth={3.4} fill="none" strokeLinecap="round" />
          <Path d="M10 -51.5 L22 -49 L10 -47.5 Z" fill="#F2B23A" stroke={OL} strokeWidth={1.4} strokeLinejoin="round" />
          <Circle cx={7} cy={-50} r={4.6} fill="#E3EAF1" stroke={OL} strokeWidth={1.8} />
          <Path d="M4 -52 Q-2 -53 -5 -50" stroke="#2B2B33" strokeWidth={2} fill="none" strokeLinecap="round" />
          <Circle cx={8.4} cy={-50.6} r={1.2} fill={OL} />
        </G>
      );
    /* ---- Foire ---- */
    case 'balloons': {
      const b: [number, number, string][] = [
        [-11, -50, '#FF4F6E'],
        [10, -54, '#5FC4F0'],
        [0, -64, '#FFD54F'],
        [-3, -45, '#B78CFF'],
      ];
      return (
        <G>
          <Shadow rx={8} />
          {b.map(([bx, by], i) => (
            <Path key={`s${i}`} d={`M0 -5 Q${bx * 0.3} ${by * 0.5} ${bx} ${by + 11}`} stroke={OL} strokeWidth={1.1} fill="none" />
          ))}
          <Rect x={-4.5} y={-6} width={9} height={6} rx={1.5} fill="#8A5A2E" stroke={OL} strokeWidth={1.6} />
          {b.map(([bx, by, c], i) => (
            <G key={i}>
              <Path d={`M${bx - 2} ${by + 12.5} L${bx} ${by + 9.5} L${bx + 2} ${by + 12.5} Z`} fill={c} stroke={OL} strokeWidth={1} />
              <Ellipse cx={bx} cy={by} rx={8.5} ry={10.5} fill={c} stroke={OL} strokeWidth={2} />
              <Ellipse cx={bx - 3} cy={by - 4} rx={2.2} ry={3.6} fill="#FFFFFF" opacity={0.6} transform={`rotate(20 ${bx - 3} ${by - 4})`} />
            </G>
          ))}
        </G>
      );
    }
    case 'tent': {
      const c2 = seed % 2 ? '#3F8EDB' : '#E53935';
      return (
        <G>
          <Shadow rx={28} />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Rect key={`w${i}`} x={-24 + i * 8} y={-22} width={8} height={22} fill={i % 2 ? '#FFFFFF' : c2} />
          ))}
          <Rect x={-24} y={-22} width={48} height={22} fill="none" stroke={OL} strokeWidth={2.4} />
          <Path d="M-7 0 V-11 Q0 -18 7 -11 V0 Z" fill="#4A1F2E" stroke={OL} strokeWidth={2} />
          {[0, 1, 2, 3].map((i) => (
            <Path key={`r${i}`} d={`M0 -50 L${-28 + i * 14} -22 L${-14 + i * 14} -22 Z`} fill={i % 2 ? '#FFFFFF' : c2} />
          ))}
          <Path d="M-28 -22 L0 -50 L28 -22 Z" fill="none" stroke={OL} strokeWidth={2.4} strokeLinejoin="round" />
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <Path key={`v${i}`} d={`M${-28 + i * 8} -22 q4 6 8 0`} fill={i % 2 ? c2 : '#FFD54F'} stroke={OL} strokeWidth={1.4} />
          ))}
          <Line x1={0} y1={-50} x2={0} y2={-62} stroke={OL} strokeWidth={2} />
          <Path d="M0 -62 L11 -59 L0 -56 Z" fill="#FFD54F" stroke={OL} strokeWidth={1.3} strokeLinejoin="round" />
        </G>
      );
    }
    case 'popcorn':
      return (
        <G>
          <Shadow rx={18} />
          <Rect x={-16} y={-22} width={32} height={15} rx={2} fill="#E53935" stroke={OL} strokeWidth={2.2} />
          <Rect x={-12} y={-18} width={24} height={4.5} rx={1} fill="#FFFFFF" />
          <Circle cx={-9} cy={-5} r={5} fill="#3A3F4B" stroke={OL} strokeWidth={1.8} />
          <Circle cx={9} cy={-5} r={5} fill="#3A3F4B" stroke={OL} strokeWidth={1.8} />
          <Circle cx={-9} cy={-5} r={1.6} fill="#C9CDD3" />
          <Circle cx={9} cy={-5} r={1.6} fill="#C9CDD3" />
          <Rect x={-13} y={-42} width={26} height={20} fill="#E6F6FF" stroke={OL} strokeWidth={2} />
          {[[-9, -26], [-4, -27], [1, -26], [6, -27], [10, -26], [-7, -30], [-1, -31], [4, -30], [9, -31], [-4, -34], [2, -35], [7, -33.5]].map(([px, py], i) => (
            <Circle key={i} cx={px} cy={py} r={2.6} fill="#FFF6D6" stroke="#E2B04A" strokeWidth={1} />
          ))}
          <Path d="M-11 -40 V-25" stroke="#FFFFFF" strokeWidth={2} opacity={0.8} />
          {[0, 1, 2, 3].map((i) => (
            <Path key={`t${i}`} d={`M${-18 + i * 9} -42 h9 v5 q-4.5 4 -9 0 Z`} fill={i % 2 ? '#FFFFFF' : '#E53935'} stroke={OL} strokeWidth={1.4} />
          ))}
          <Path d="M-19 -42 L-13 -50 H13 L19 -42 Z" fill="#E53935" stroke={OL} strokeWidth={2} strokeLinejoin="round" />
        </G>
      );
    case 'garland':
      return (
        <G>
          <Ellipse cx={-22} cy={1} rx={5} ry={1.6} fill="rgba(0,0,0,0.2)" />
          <Ellipse cx={22} cy={1} rx={5} ry={1.6} fill="rgba(0,0,0,0.2)" />
          <Path d="M-22 0 V-40 M22 0 V-36" stroke={OL} strokeWidth={4.4} strokeLinecap="round" />
          <Path d="M-22 0 V-40 M22 0 V-36" stroke="#B97A3F" strokeWidth={2.2} strokeLinecap="round" />
          <Path d="M-22 -38 Q0 -18 22 -34" stroke={OL} strokeWidth={1.4} fill="none" />
          {GARLAND_BULBS.map((b, i) => (
            <G key={i}>
              <Rect x={b.x - 1.4} y={b.y - 4.6} width={2.8} height={2.4} fill="#3A3F4B" />
              <Ellipse cx={b.x} cy={b.y} rx={3.1} ry={3.6} fill={b.c} stroke={OL} strokeWidth={1.2} />
              <Circle cx={b.x - 1} cy={b.y - 1} r={1} fill="#FFFFFF" opacity={0.8} />
            </G>
          ))}
        </G>
      );
    /* ---- Ferme ---- */
    case 'hay':
      return (
        <G>
          <Shadow rx={20} />
          <Rect x={-18} y={-25} width={28} height={25} rx={5} fill="#E3B843" stroke={OL} strokeWidth={2.4} />
          <Path d="M-14 -19 h16 M-15 -12 h18 M-14 -5 h15" stroke="#C4952B" strokeWidth={1.8} strokeLinecap="round" />
          <Ellipse cx={10} cy={-12.5} rx={8} ry={12.5} fill="#F0CC5C" stroke={OL} strokeWidth={2.4} />
          <Path d="M10 -12.5 m-2 0 a2 2.5 0 1 1 4 0 a4 5.5 0 1 1 -8 0 a5.5 8 0 1 1 11 0" stroke="#C4952B" strokeWidth={1.5} fill="none" />
          <Path d="M-15 -24 l-3 -4 M-6 -25 l1 -5 M2 -25 l3 -4" stroke="#E3B843" strokeWidth={1.6} strokeLinecap="round" />
        </G>
      );
    case 'fence':
      return (
        <G>
          <Ellipse cx={0} cy={1} rx={26} ry={3} fill="rgba(0,0,0,0.18)" />
          <Rect x={-26} y={-18} width={52} height={4.5} rx={1} fill="#FFF3DE" stroke={OL} strokeWidth={1.8} />
          <Rect x={-26} y={-9} width={52} height={4.5} rx={1} fill="#FFF3DE" stroke={OL} strokeWidth={1.8} />
          {[-21, -7, 7, 21].map((px) => (
            <Path key={px} d={`M${px - 3.5} 0 V-20 L${px} -25 L${px + 3.5} -20 V0 Z`} fill="#FFFAF0" stroke={OL} strokeWidth={1.8} strokeLinejoin="round" />
          ))}
        </G>
      );
    case 'sunflower':
      return (
        <G>
          <Ellipse cx={0} cy={1} rx={8} ry={2} fill="rgba(0,0,0,0.18)" />
          <Path d="M0 0 Q3 -18 0 -36" stroke={OL} strokeWidth={5.2} fill="none" strokeLinecap="round" />
          <Path d="M0 0 Q3 -18 0 -36" stroke="#4E9A3A" strokeWidth={2.8} fill="none" strokeLinecap="round" />
          <Path d="M1.5 -12 q8 -9 15 -3 q-8 5 -15 3 Z" fill="#5DBB4F" stroke={OL} strokeWidth={1.5} strokeLinejoin="round" />
          <Path d="M1 -22 q-8 -9 -15 -3 q8 5 15 3 Z" fill="#5DBB4F" stroke={OL} strokeWidth={1.5} strokeLinejoin="round" />
          {Array.from({ length: 12 }, (_, i) => i * 30).map((a) => (
            <Ellipse key={a} cx={0} cy={-49} rx={3.6} ry={6.5} fill={a % 60 ? '#FFC928' : '#FFB300'} stroke={OL} strokeWidth={1.3} transform={`rotate(${a} 0 -42)`} />
          ))}
          <Circle cx={0} cy={-42} r={7.5} fill="#8A5427" stroke={OL} strokeWidth={1.8} />
          <Circle cx={-2.6} cy={-43.5} r={1.1} fill={OL} />
          <Circle cx={2.6} cy={-43.5} r={1.1} fill={OL} />
          <Path d="M-3 -40.5 Q0 -38 3 -40.5" stroke={OL} strokeWidth={1.2} fill="none" strokeLinecap="round" />
          <Circle cx={-4.6} cy={-41} r={1.2} fill="#FF8FB1" opacity={0.8} />
          <Circle cx={4.6} cy={-41} r={1.2} fill="#FF8FB1" opacity={0.8} />
        </G>
      );
    case 'pumpkin':
      return <Pumpkin />;
    case 'scarecrow':
      return (
        <G>
          <Shadow rx={13} />
          <Path d="M0 0 V-46 M-23 -31 H23" stroke={OL} strokeWidth={4.6} strokeLinecap="round" />
          <Path d="M0 0 V-46 M-23 -31 H23" stroke="#8A5A2E" strokeWidth={2.4} strokeLinecap="round" />
          <Path d="M-24 -31 l-4 -3 M-24 -31 l-5 1 M-24 -31 l-3 4 M24 -31 l4 -3 M24 -31 l5 1 M24 -31 l3 4" stroke="#E3B843" strokeWidth={1.8} strokeLinecap="round" />
          <Path d="M-21 -35 H-8 L-6 -28 H-20 Z M21 -35 H8 L6 -28 H20 Z" fill="#D9543A" stroke={OL} strokeWidth={1.8} strokeLinejoin="round" />
          <Path d="M-11 -37 H11 L13 -16 L6 -18 L0 -15 L-6 -18 L-13 -16 Z" fill="#D9543A" stroke={OL} strokeWidth={2} strokeLinejoin="round" />
          <Path d="M-5 -36 V-17 M5 -36 V-17 M-12 -28 H12 M-12 -22 H12" stroke="#9E3424" strokeWidth={1.3} />
          <Rect x={-4} y={-29} width={5} height={5} fill="#5FA8E0" stroke={OL} strokeWidth={1} />
          <Circle cx={0} cy={-44} r={8} fill="#E9D3A1" stroke={OL} strokeWidth={2} />
          <Path d="M-4 -46 l2.4 2.4 M-1.6 -46 l-2.4 2.4 M2 -46 l2.4 2.4 M4.4 -46 l-2.4 2.4" stroke={OL} strokeWidth={1.2} strokeLinecap="round" />
          <Path d="M-4 -40 Q0 -37.5 4 -40" stroke={OL} strokeWidth={1.2} fill="none" />
          <Path d="M-3 -40.6 v1.4 M0 -39.6 v1.4 M3 -40.6 v1.4" stroke={OL} strokeWidth={0.8} />
          <Ellipse cx={0} cy={-50} rx={14} ry={3.2} fill="#D9A93C" stroke={OL} strokeWidth={1.8} />
          <Path d="M-7 -50 Q-7 -60 0 -60 Q7 -60 7 -50 Z" fill="#E8BC4E" stroke={OL} strokeWidth={1.8} strokeLinejoin="round" />
          <Path d="M-7 -52 H7" stroke="#C8283C" strokeWidth={2} />
        </G>
      );
    case 'chicken':
      return (
        <G>
          <Ellipse cx={0} cy={1} rx={8} ry={2} fill="rgba(0,0,0,0.2)" />
          <Path d="M-2 -6 L-3 0 M2.5 -6 L3 0" stroke={OL} strokeWidth={3} strokeLinecap="round" />
          <Path d="M-2 -6 L-3 0 M2.5 -6 L3 0" stroke="#F2B23A" strokeWidth={1.5} strokeLinecap="round" />
          <Path d="M-7 -12 L-13 -21 L-11 -13 L-15 -17 L-9 -9 Z" fill="#FFFFFF" stroke={OL} strokeWidth={1.5} strokeLinejoin="round" />
          <Ellipse cx={-1} cy={-10.5} rx={9} ry={6.8} fill="#FFFFFF" stroke={OL} strokeWidth={2} />
          <Path d="M-5 -11 q4 4 8 0" stroke="#D5DAE0" strokeWidth={1.8} fill="none" strokeLinecap="round" />
          <Path d="M3.5 -21 q0.5 -3.5 3 -2 q1 -3 3.4 -0.6 q-2.4 1.6 -6.4 2.6 Z" fill="#E53935" stroke={OL} strokeWidth={1} strokeLinejoin="round" />
          <Circle cx={6.5} cy={-17.5} r={4.6} fill="#FFFFFF" stroke={OL} strokeWidth={1.8} />
          <Path d="M10.6 -18.6 L14.4 -17.2 L10.6 -15.8 Z" fill="#F2B23A" stroke={OL} strokeWidth={1} strokeLinejoin="round" />
          <Ellipse cx={10.2} cy={-14.4} rx={1.4} ry={2} fill="#E53935" />
          <Circle cx={7.6} cy={-18.4} r={1.1} fill={OL} />
        </G>
      );
    case 'cow':
      return (
        <G>
          <Shadow rx={22} />
          {[-12, -6, 6, 11].map((lx) => (
            <G key={lx}>
              <Rect x={lx - 2.4} y={-12} width={4.8} height={12} rx={1} fill="#FFFFFF" stroke={OL} strokeWidth={1.6} />
              <Rect x={lx - 2.4} y={-3} width={4.8} height={3} fill="#3A3F4B" />
            </G>
          ))}
          {live ? null : (
            <G transform={`translate(${COW_TAIL.x} ${COW_TAIL.y})`}>
              <CowTail />
            </G>
          )}
          <Rect x={-18} y={-28} width={33} height={17} rx={8} fill="#FFFFFF" stroke={OL} strokeWidth={2.2} />
          <Path d="M-12 -27 q7 -1 7 5 q-2 6 -8 3 q-3 -4 1 -8 Z M3 -22 q5 -3 8 1 q0 5 -5 5 q-5 -1 -3 -6 Z" fill="#2B2B33" />
          <Ellipse cx={-2} cy={-11} rx={4} ry={2.2} fill="#F7B6C2" stroke={OL} strokeWidth={1.2} />
          <Path d="M13 -33 q-2 -4 1 -6 M22 -33 q2 -4 -1 -6" stroke={OL} strokeWidth={3} strokeLinecap="round" fill="none" />
          <Path d="M13 -33 q-2 -4 1 -6 M22 -33 q2 -4 -1 -6" stroke="#F3E6CF" strokeWidth={1.5} strokeLinecap="round" fill="none" />
          <Ellipse cx={10.5} cy={-30} rx={3.6} ry={2} fill="#FFFFFF" stroke={OL} strokeWidth={1.4} transform="rotate(-25 10.5 -30)" />
          <Ellipse cx={17.5} cy={-27.5} rx={7} ry={6.6} fill="#FFFFFF" stroke={OL} strokeWidth={2} />
          <Ellipse cx={20} cy={-23} rx={5.6} ry={4} fill="#F7B6C2" stroke={OL} strokeWidth={1.6} />
          <Circle cx={18.4} cy={-23} r={0.9} fill={OL} />
          <Circle cx={21.8} cy={-23} r={0.9} fill={OL} />
          <Circle cx={16} cy={-29.5} r={1.2} fill={OL} />
          <Circle cx={20.6} cy={-29.5} r={1.2} fill={OL} />
        </G>
      );
    /* ---- Manoir ---- */
    case 'tombstone':
      return seed % 3 === 0 ? (
        <G>
          <Ellipse cx={0} cy={0} rx={13} ry={4} fill="#3B3655" />
          <Path d="M-3.5 0 V-20 H-11 V-27 H-3.5 V-35 H3.5 V-27 H11 V-20 H3.5 V0 Z" fill="#A7A3B8" stroke={OL} strokeWidth={2.2} strokeLinejoin="round" />
          <Path d="M-1.5 -32 V-4" stroke="#CFCBDD" strokeWidth={1.6} strokeLinecap="round" />
        </G>
      ) : (
        <G>
          <Ellipse cx={0} cy={0} rx={15} ry={4.5} fill="#3B3655" />
          <Path d="M-12 0 V-20 Q-12 -31 0 -31 Q12 -31 12 -20 V0 Z" fill="#A7A3B8" stroke={OL} strokeWidth={2.4} strokeLinejoin="round" transform={`rotate(${(seed % 5) - 2} 0 0)`} />
          <Path d="M-8 -19 Q-8 -26 -2 -27.5" stroke="#CFCBDD" strokeWidth={2.4} fill="none" strokeLinecap="round" />
          <Path d="M-5 -16 H5 M-4 -11 H4" stroke="#7D7892" strokeWidth={1.8} strokeLinecap="round" />
          <Path d="M6 -27 l-2 5 l2 3 l-2 4" stroke="#6E6984" strokeWidth={1.2} fill="none" />
          <Path d="M-14 1 q2 -6 3 0 M10 1 q2 -5 3 0" stroke="#5E7A5A" strokeWidth={1.6} fill="none" strokeLinecap="round" />
        </G>
      );
    case 'jackLantern':
      return <Pumpkin lantern />;
    case 'ironFence':
      return (
        <G>
          <Ellipse cx={0} cy={1} rx={26} ry={3} fill="rgba(0,0,0,0.2)" />
          <Path d="M-24 -8 H24 M-24 -24 H24" stroke={OL} strokeWidth={3.2} />
          {[-17.5, -11, -4.5, 2, 8.5, 15].map((bx) => (
            <G key={bx}>
              <Line x1={bx} y1={0} x2={bx} y2={-29} stroke={OL} strokeWidth={2.6} />
              <Path d={`M${bx - 2.4} -29 L${bx} -35 L${bx + 2.4} -29 Z`} fill="#4A4560" stroke={OL} strokeWidth={1.2} strokeLinejoin="round" />
            </G>
          ))}
          {[-24, 22].map((px) => (
            <G key={px}>
              <Rect x={px - 2.5} y={-32} width={5} height={32} fill="#3A3550" stroke={OL} strokeWidth={1.6} />
              <Circle cx={px} cy={-35} r={3.4} fill="#57506E" stroke={OL} strokeWidth={1.6} />
            </G>
          ))}
          <Path d="M-14 -16 q3 -4 6 0 q3 4 6 0 q3 -4 6 0 q3 4 6 0" stroke="#57506E" strokeWidth={1.4} fill="none" />
        </G>
      );
    case 'glowShroom':
      return (
        <G>
          <Ellipse cx={0} cy={0} rx={16} ry={4} fill="#6BFFD8" opacity={0.25} />
          {[[-8, 0, 0.8], [7, 0, 0.65], [0, 0, 1]].map(([mx, , k], i) => (
            <G key={i} transform={`translate(${mx} 0) scale(${k})`}>
              <Path d="M-3.4 0 Q-4 -8 -2.6 -13 H2.6 Q4 -8 3.4 0 Z" fill="#E6F7F2" stroke={OL} strokeWidth={1.8} strokeLinejoin="round" />
              <Path d="M-12 -12 Q-12 -26 0 -26 Q12 -26 12 -12 Q0 -9 -12 -12 Z" fill="#46E0C0" stroke={OL} strokeWidth={2.2} strokeLinejoin="round" />
              <Circle cx={-5} cy={-19} r={2.2} fill="#D8FFF6" />
              <Circle cx={4} cy={-21} r={2.6} fill="#D8FFF6" />
              <Circle cx={6} cy={-15} r={1.5} fill="#D8FFF6" />
            </G>
          ))}
        </G>
      );
    /* ---- Pirates ---- */
    case 'chest':
      return (
        <G>
          <Shadow rx={19} />
          <Path d="M-16 -18 L-15 -34 Q0 -42 15 -34 L16 -18 Z" fill="#B5703A" stroke={OL} strokeWidth={2.2} strokeLinejoin="round" />
          <Path d="M-12 -21 L-11.5 -31 Q0 -37 11.5 -31 L12 -21 Z" fill="#6E3E1C" />
          <Path d="M-15 -18 Q-10 -28 -3 -25 Q3 -30 9 -25 Q14 -27 15 -18 Z" fill="#FFD54F" stroke={OL} strokeWidth={1.6} strokeLinejoin="round" />
          {[[-9, -22], [-3, -24.5], [4, -23], [10, -21.5], [0, -20.5]].map(([cx, cy], i) => (
            <Circle key={i} cx={cx} cy={cy} r={2.6} fill="#FFC928" stroke="#C98C1C" strokeWidth={1} />
          ))}
          <Path d="M5 -28 l3 -3 l3 3 l-3 4 Z" fill="#E53935" stroke={OL} strokeWidth={1} strokeLinejoin="round" />
          <Rect x={-17} y={-19} width={34} height={19} rx={2} fill="#9C5B2A" stroke={OL} strokeWidth={2.4} />
          <Path d="M-12 -19 V0 M12 -19 V0" stroke="#F2C14E" strokeWidth={3.4} />
          <Path d="M-17 -12 H17" stroke="#7A4420" strokeWidth={1.6} />
          <Rect x={-3.5} y={-16} width={7} height={8} rx={1.5} fill="#F2C14E" stroke={OL} strokeWidth={1.4} />
          <Circle cx={0} cy={-12.5} r={1.2} fill={OL} />
        </G>
      );
    case 'cannon':
      return (
        <G>
          <Shadow rx={22} />
          {[[-22, -3], [-17, -3], [-19.5, -7.5]].map(([bx, by], i) => (
            <Circle key={i} cx={bx} cy={by} r={3} fill="#2B2B33" stroke={OL} strokeWidth={1.3} />
          ))}
          <G transform="rotate(-18 2 -16)">
            <Rect x={-14} y={-21} width={34} height={11} rx={5.5} fill="#3A3F4B" stroke={OL} strokeWidth={2.2} />
            <Rect x={16} y={-23} width={6} height={15} rx={2} fill="#4A505E" stroke={OL} strokeWidth={2} />
            <Path d="M-10 -18 H14" stroke="#7A8090" strokeWidth={2} strokeLinecap="round" />
            <Circle cx={-15} cy={-15.5} r={3} fill="#4A505E" stroke={OL} strokeWidth={1.6} />
          </G>
          <Path d="M-13 -3 L-10 -13 H9 L13 -3 Z" fill="#8A5A2E" stroke={OL} strokeWidth={2} strokeLinejoin="round" />
          {[-8, 8].map((wx) => (
            <G key={wx}>
              <Circle cx={wx} cy={-5} r={5.8} fill="#6E4423" stroke={OL} strokeWidth={2} />
              <Path d={`M${wx - 4} -5 H${wx + 4} M${wx} -9 V-1`} stroke="#B97A3F" strokeWidth={1.4} />
              <Circle cx={wx} cy={-5} r={1.6} fill="#F2C14E" />
            </G>
          ))}
        </G>
      );
    case 'anchor':
      return (
        <G>
          <Shadow rx={15} />
          <Path d="M-17 -15 Q-15 -2 0 -2 Q15 -2 17 -15" stroke={OL} strokeWidth={7.4} fill="none" strokeLinecap="round" />
          <Path d="M-17 -15 Q-15 -2 0 -2 Q15 -2 17 -15" stroke="#8E98A6" strokeWidth={4} fill="none" strokeLinecap="round" />
          <Path d="M-21 -13 L-17 -21 L-12 -13 Z M21 -13 L17 -21 L12 -13 Z" fill="#8E98A6" stroke={OL} strokeWidth={1.6} strokeLinejoin="round" />
          <Rect x={-3} y={-38} width={6} height={36} rx={2} fill="#8E98A6" stroke={OL} strokeWidth={2} />
          <Rect x={-11} y={-34} width={22} height={5} rx={2.5} fill="#7D8794" stroke={OL} strokeWidth={1.8} />
          <Circle cx={0} cy={-42} r={5} fill="none" stroke={OL} strokeWidth={4.4} />
          <Circle cx={0} cy={-42} r={5} fill="none" stroke="#A9B2BE" strokeWidth={2} />
          <Path d="M-1 -30 V-6" stroke="#C3CAD3" strokeWidth={1.4} />
          <Path d="M3 -40 Q12 -34 4 -26 Q-6 -20 4 -14" stroke={OL} strokeWidth={3.4} fill="none" strokeLinecap="round" />
          <Path d="M3 -40 Q12 -34 4 -26 Q-6 -20 4 -14" stroke="#D9B26F" strokeWidth={1.8} fill="none" strokeLinecap="round" />
        </G>
      );
    case 'jolly':
      return (
        <G>
          <Shadow rx={9} />
          <Path d="M-6 0 L0 -6 L6 0 Z" fill="#8A5A2E" stroke={OL} strokeWidth={1.6} strokeLinejoin="round" />
          <Line x1={0} y1={0} x2={0} y2={-62} stroke={OL} strokeWidth={4} strokeLinecap="round" />
          <Line x1={0} y1={0} x2={0} y2={-62} stroke="#A8743F" strokeWidth={2} strokeLinecap="round" />
          <Circle cx={0} cy={-63} r={2.6} fill="#FFD54F" stroke={OL} strokeWidth={1.2} />
          {live ? null : (
            <G transform="translate(1 -59)">
              <JollyFlag />
            </G>
          )}
        </G>
      );
    /* ---- Désert ---- */
    case 'cactus':
      return (
        <G>
          <Shadow rx={15} />
          <Path d="M-9 -20 H-14 Q-19 -20 -19 -26 V-35 Q-19 -39 -15.5 -39 Q-12 -39 -12 -35 V-27 H-9 Z" fill="#4FAE5A" stroke={OL} strokeWidth={2.2} strokeLinejoin="round" />
          <Path d="M9 -27 H13 Q18 -27 18 -33 V-41 Q18 -45 14.5 -45 Q11 -45 11 -41 V-34 H9 Z" fill="#4FAE5A" stroke={OL} strokeWidth={2.2} strokeLinejoin="round" />
          <Path d="M-9.5 0 V-42 Q-9.5 -52 0 -52 Q9.5 -52 9.5 -42 V0 Z" fill="#5DBB63" stroke={OL} strokeWidth={2.4} strokeLinejoin="round" />
          <Path d="M-4 -46 V-3 M4 -46 V-3" stroke="#3E9C45" strokeWidth={1.6} />
          <Path d="M-6.5 -44 V-34" stroke="#9BE08F" strokeWidth={2.2} strokeLinecap="round" />
          {[[-7, -14], [7, -18], [-7, -26], [7, -9]].map(([sx, sy], i) => (
            <Path key={i} d={`M${sx} ${sy} l${sx < 0 ? -2.4 : 2.4} -1`} stroke="#FFF3D6" strokeWidth={1.1} strokeLinecap="round" />
          ))}
          {[0, 72, 144, 216, 288].map((a) => (
            <Circle key={a} cx={Math.cos((a * Math.PI) / 180) * 3} cy={-53 + Math.sin((a * Math.PI) / 180) * 2} r={2.4} fill="#FF7EB6" stroke={OL} strokeWidth={1} />
          ))}
          <Circle cx={0} cy={-53} r={1.6} fill="#FFD54F" />
          {face ? <Eyes y={-32} sleepy={isSleepy(seed)} /> : null}
        </G>
      );
    case 'skull':
      return (
        <G>
          <Ellipse cx={0} cy={1} rx={13} ry={3} fill="rgba(0,0,0,0.15)" />
          <Path d="M-6 -11 Q-15 -13 -19 -21 Q-11 -16 -4 -14 Z M6 -11 Q15 -13 19 -21 Q11 -16 4 -14 Z" fill="#F6EEDD" stroke={OL} strokeWidth={1.5} strokeLinejoin="round" />
          <Path d="M-8 -12 Q-9 -16 -4 -16 H4 Q9 -16 8 -12 L5 -2 Q0 1 -5 -2 Z" fill="#F6EEDD" stroke={OL} strokeWidth={2} strokeLinejoin="round" />
          <Ellipse cx={-3.6} cy={-10.5} rx={2.2} ry={2.6} fill="#5A4632" />
          <Ellipse cx={3.6} cy={-10.5} rx={2.2} ry={2.6} fill="#5A4632" />
          <Path d="M-1.6 -4 v1.6 M1.6 -4 v1.6" stroke="#5A4632" strokeWidth={1.4} strokeLinecap="round" />
        </G>
      );
    case 'dune':
      return (
        <G>
          <Path d="M-30 0 Q-16 -19 4 -17 Q19 -15 30 0 Z" fill="#F6C878" stroke={OL} strokeWidth={2} strokeLinejoin="round" />
          <Path d="M4 -17 Q9 -8 11 0 H30 Q19 -15 4 -17 Z" fill="#E0A657" />
          <Path d="M-30 0 Q-16 -19 4 -17 Q19 -15 30 0" fill="none" stroke={OL} strokeWidth={2} />
          <Path d="M-18 -6 q5 -3 10 0 M-6 -3 q4 -2 8 0" stroke="#E7B266" strokeWidth={1.4} fill="none" strokeLinecap="round" />
        </G>
      );
    case 'sandRock':
      return (
        <G>
          <Shadow rx={21} />
          <Path d="M-21 0 L-18 -19 L-11 -26 H7 L14 -21 L20 0 Z" fill="#D9774A" stroke={OL} strokeWidth={2.4} strokeLinejoin="round" />
          <Path d="M7 -26 L14 -21 L20 0 H9 L11 -20 Z" fill="#B95E36" />
          <Path d="M-21 0 L-18 -19 L-11 -26 H7 L14 -21 L20 0" fill="none" stroke={OL} strokeWidth={2.4} strokeLinejoin="round" />
          <Path d="M-18 -10 H15 M-15 -18 H11" stroke="#B95E36" strokeWidth={1.8} />
          <Path d="M-14 -23 H2" stroke="#F2A273" strokeWidth={2.4} strokeLinecap="round" />
        </G>
      );
    /* ---- Mines ---- */
    case 'gem':
      return <Crystals colors={['#2FB7DA', '#7FE8FF', '#1A8FB5']} glow="#5FD8F0" />;
    case 'oreRock':
      return (
        <G>
          <Shadow rx={18} />
          <Path d="M-18 0 L-15 -13 L-6 -21 L7 -20 L17 -9 L16 0 Z" fill="#7D7488" stroke={OL} strokeWidth={2.4} strokeLinejoin="round" />
          <Path d="M-11 -13 L-5 -17 L3 -16.5" stroke="#9E96AA" strokeWidth={3} fill="none" strokeLinecap="round" />
          {[[-8, -7, 3.2], [4, -11, 2.6], [9, -4, 2.2], [-2, -3, 1.8]].map(([gx, gy, r], i) => (
            <Path key={i} d={`M${gx - r} ${gy} L${gx - r * 0.3} ${gy - r} L${gx + r} ${gy - r * 0.4} L${gx + r * 0.6} ${gy + r * 0.8} L${gx - r * 0.5} ${gy + r * 0.7} Z`} fill="#FFC928" stroke={OL} strokeWidth={1.2} strokeLinejoin="round" />
          ))}
        </G>
      );
    case 'lantern':
      return (
        <G>
          <Shadow rx={8} />
          <Rect x={-2.6} y={-50} width={5.2} height={50} fill="#8A5A2E" stroke={OL} strokeWidth={1.8} />
          <Rect x={-2.6} y={-52} width={18} height={4.6} rx={1} fill="#8A5A2E" stroke={OL} strokeWidth={1.6} />
          {live ? null : (
            <G transform="translate(12 -48)">
              <LanternBody />
            </G>
          )}
        </G>
      );
    case 'stalagmite':
      return (
        <G>
          <Shadow rx={15} />
          <Path d="M-15 0 L-10 -22 L-5 0 Z" fill="#8F8496" stroke={OL} strokeWidth={2} strokeLinejoin="round" />
          <Path d="M-6 0 L0 -36 L6 0 Z" fill="#A49AAD" stroke={OL} strokeWidth={2.2} strokeLinejoin="round" />
          <Path d="M4 0 L9.5 -17 L15 0 Z" fill="#8F8496" stroke={OL} strokeWidth={2} strokeLinejoin="round" />
          <Path d="M-1.5 -28 L-3 -6" stroke="#C6BECD" strokeWidth={2} strokeLinecap="round" />
          <Path d="M-6 -6 h3 M2 -13 h3 M-12 -8 h3" stroke="#7A6F82" strokeWidth={1.2} />
        </G>
      );
    case 'timber':
      return (
        <G>
          <Shadow rx={21} />
          <Rect x={-19} y={-9} width={36} height={9} rx={2} fill="#A8743F" stroke={OL} strokeWidth={2} />
          <Rect x={-15} y={-17} width={30} height={8.5} rx={2} fill="#B98048" stroke={OL} strokeWidth={2} />
          <Circle cx={17} cy={-4.5} r={3.4} fill="#E3B47C" stroke={OL} strokeWidth={1.4} />
          <Circle cx={15} cy={-12.8} r={3.2} fill="#E3B47C" stroke={OL} strokeWidth={1.4} />
          <Line x1={-8} y1={-2} x2={10} y2={-38} stroke={OL} strokeWidth={4.4} strokeLinecap="round" />
          <Line x1={-8} y1={-2} x2={10} y2={-38} stroke="#C99A62" strokeWidth={2.4} strokeLinecap="round" />
          <Path d="M-1 -38 Q10 -44 22 -34 L20 -32 Q10 -38 1 -35 Z" fill="#9AA3AD" stroke={OL} strokeWidth={1.8} strokeLinejoin="round" />
        </G>
      );
    case 'minecart':
      return (
        <G>
          <Shadow rx={22} />
          <Path d="M-25 -1 H25" stroke={OL} strokeWidth={3.6} />
          <Path d="M-25 -1 H25" stroke="#C9D1DA" strokeWidth={1.6} />
          <Path d="M-15 -11 Q-14 -18 -8 -19 Q-4 -24 1 -20 Q6 -25 10 -19 Q15 -18 15 -11 Z" fill="#6E6680" stroke={OL} strokeWidth={1.8} strokeLinejoin="round" />
          <Path d="M-7 -19 l3 -3 l3 2 l-2 3 Z M4 -21 l3 -2 l2 3 l-3 2 Z" fill="#FFC928" stroke={OL} strokeWidth={1} strokeLinejoin="round" />
          <Path d="M-2 -21 l2 -4 l2 4 l-2 2 Z" fill="#7FE8FF" stroke={OL} strokeWidth={1} strokeLinejoin="round" />
          <Path d="M-18 -16 H18 L14 -5 H-14 Z" fill="#8C6A4E" stroke={OL} strokeWidth={2.2} strokeLinejoin="round" />
          <Path d="M-17 -13 H17" stroke="#5E4632" strokeWidth={1.6} />
          {[-11, 0, 11].map((rx) => (
            <Circle key={rx} cx={rx} cy={-9} r={1} fill="#D9C2A6" />
          ))}
          <Circle cx={-9} cy={-4} r={4.4} fill="#3A3F4B" stroke={OL} strokeWidth={1.8} />
          <Circle cx={9} cy={-4} r={4.4} fill="#3A3F4B" stroke={OL} strokeWidth={1.8} />
        </G>
      );
    /* ---- Archipel ---- */
    case 'islet': {
      const top = seed % 3;
      return (
        <G transform="translate(0 -8)">
          <Ellipse cx={0} cy={14} rx={16} ry={3} fill="#5E9FC9" opacity={0.25} />
          <Path d="M-23 -22 Q-19 -6 -6 0 Q0 3 5 -2 Q17 -9 23 -22 Z" fill="#A8744A" stroke={OL} strokeWidth={2.2} strokeLinejoin="round" />
          <Path d="M-14 -14 Q-6 -10 2 -12 M-6 -5 Q0 -4 4 -6" stroke="#8A5A2E" strokeWidth={1.6} fill="none" strokeLinecap="round" />
          <Path d="M-6 0 q-1 5 1 8 M3 -1 q2 5 0 9" stroke="#6E8B3D" strokeWidth={1.4} fill="none" strokeLinecap="round" />
          <Ellipse cx={0} cy={-22} rx={24} ry={7} fill="#6CC04A" stroke={OL} strokeWidth={2.2} />
          <Ellipse cx={-6} cy={-24} rx={10} ry={2.4} fill="#A6E07F" opacity={0.85} />
          {top === 0 ? (
            <G transform="translate(4 -24) scale(0.55)">
              <Trunk h={18} />
              <Blob c={[[-10, -26, 12], [10, -26, 12], [0, -36, 14]]} fill="#4CAF50" dark="#357A38" light="#8BD982" />
            </G>
          ) : top === 1 ? (
            <G transform="translate(-4 -24) scale(0.6)">
              <Blob c={[[-9, -9, 10], [8, -9, 10], [0, -16, 11]]} fill="#3E9C45" dark="#2D7432" light="#79C97A" />
            </G>
          ) : (
            <G>
              {[-10, -2, 8].map((fx, i) => (
                <Circle key={fx} cx={fx} cy={-24 - (i % 2)} r={2} fill={['#FF8FB1', '#FFFFFF', '#FFD54F'][i]} stroke={OL} strokeWidth={0.9} />
              ))}
            </G>
          )}
        </G>
      );
    }
    case 'cloud':
      return (
        <G transform="translate(0 -14) scale(0.9)">
          <Blob c={[[-16, -6, 11], [0, -13, 14], [16, -6, 11], [0, -2, 12]]} fill="#FFFFFF" dark="#CFE6F5" />
        </G>
      );
    case 'hotAir': {
      const c = ['#FF7043', '#AB47BC', '#26A69A'][seed % 3];
      return (
        <G>
          <Ellipse cx={0} cy={6} rx={8} ry={2} fill="#5E9FC9" opacity={0.25} />
          <Path d="M-7 -21 L-5 -10 M7 -21 L5 -10" stroke={OL} strokeWidth={1.2} />
          <Path d="M0 -66 C-22 -66 -26 -44 -18 -34 L-7 -21 H7 L18 -34 C26 -44 22 -66 0 -66 Z" fill={c} stroke={OL} strokeWidth={2.2} strokeLinejoin="round" />
          <Path d="M0 -66 C-9 -66 -11 -44 -7.5 -34 L-3 -21 H3 L7.5 -34 C11 -44 9 -66 0 -66 Z" fill="#FFD54F" stroke={OL} strokeWidth={1.4} strokeLinejoin="round" />
          <Path d="M-14 -58 Q-20 -46 -15 -38" stroke="#FFFFFF" strokeWidth={2.4} opacity={0.5} fill="none" strokeLinecap="round" />
          <Rect x={-6} y={-11} width={12} height={9} rx={1.5} fill="#A8743F" stroke={OL} strokeWidth={1.8} />
          <Path d="M-6 -7 H6" stroke="#7A5230" strokeWidth={1.2} />
        </G>
      );
    }
    case 'rainbow':
      return (
        <G>
          {['#FF5D5D', '#FFA94D', '#FFE45C', '#6FD27A', '#5FB2F0', '#A78BFA'].map((c, i) => (
            <Path key={c} d={`M${-27 + i * 2.4} -2 A${27 - i * 2.4} ${27 - i * 2.4} 0 0 1 ${27 - i * 2.4} -2`} stroke={c} strokeWidth={2.6} fill="none" />
          ))}
          <Path d="M-28.4 -2 A28.4 28.4 0 0 1 28.4 -2 M-13.2 -2 A13.2 13.2 0 0 1 13.2 -2" stroke={OL} strokeWidth={1.4} fill="none" />
          <G transform="translate(-22 0) scale(0.45)">
            <Blob c={[[-12, -6, 10], [4, -10, 12], [16, -4, 9]]} fill="#FFFFFF" dark="#CFE6F5" />
          </G>
          <G transform="translate(22 0) scale(0.45)">
            <Blob c={[[-14, -4, 9], [0, -10, 12], [14, -6, 10]]} fill="#FFFFFF" dark="#CFE6F5" />
          </G>
        </G>
      );
    /* ---- Néon ---- */
    case 'tower': {
      const tall = 56 + (seed % 3) * 10;
      const body = ['#3C4466', '#40375E', '#2F4A60'][seed % 3];
      const neon = NEON[seed % 2];
      return (
        <G>
          <Shadow rx={18} />
          <Rect x={-14} y={-tall} width={28} height={tall} fill={body} stroke={OL} strokeWidth={2.2} />
          <Rect x={6} y={-tall} width={8} height={tall} fill="rgba(0,0,0,0.22)" />
          {Array.from({ length: Math.floor((tall - 12) / 9) }, (_, r) =>
            [0, 1, 2].map((ci) => {
              const lit = (seed * 7 + r * 5 + ci * 3) % 4;
              return <Rect key={`${r}-${ci}`} x={-10 + ci * 7.5} y={-tall + 7 + r * 9} width={4.6} height={5} fill={lit === 0 ? '#5FF2FF' : lit === 1 ? '#FFE27A' : '#1E2236'} opacity={lit < 2 ? 0.95 : 1} />;
            }),
          )}
          <Rect x={-16} y={-tall - 4} width={32} height={5} fill="#4C5578" stroke={OL} strokeWidth={1.8} />
          <Path d={`M-15 ${-tall + 1} H15`} stroke={neon} strokeWidth={1.6} />
          <Line x1={-6} y1={-tall - 4} x2={-6} y2={-tall - 16} stroke={OL} strokeWidth={1.8} />
          <Circle cx={-6} cy={-tall - 17} r={2} fill="#FF4F6E" />
          <Rect x={-12} y={-12} width={9} height={12} fill="#1A1D2E" stroke={OL} strokeWidth={1.4} />
        </G>
      );
    }
    case 'neonSign':
      return (
        <G>
          <Shadow rx={9} />
          <Line x1={0} y1={0} x2={0} y2={-24} stroke={OL} strokeWidth={4.4} />
          <Line x1={0} y1={0} x2={0} y2={-24} stroke="#5A6080" strokeWidth={2.2} />
          <Rect x={-17} y={-56} width={34} height={32} rx={6} fill="#151829" stroke={OL} strokeWidth={2.4} />
          <Rect x={-13.5} y={-52.5} width={27} height={25} rx={4} fill="none" stroke="#2A2F4A" strokeWidth={1.4} />
          <NeonShape seed={seed} bright={!live} />
        </G>
      );
    case 'holo':
      return (
        <G>
          <Shadow rx={13} />
          <Path d="M-8 -9 L-17 -58 H17 L8 -9 Z" fill="#5FF2FF" opacity={0.14} />
          <Path d="M-8 -9 L-17 -58 M8 -9 L17 -58" stroke="#5FF2FF" strokeWidth={0.8} opacity={0.5} />
          <Ellipse cx={0} cy={-3} rx={12} ry={4} fill="#3A3F58" stroke={OL} strokeWidth={2} />
          <Rect x={-9} y={-10} width={18} height={6} rx={2} fill="#4A5070" stroke={OL} strokeWidth={1.8} />
          <Ellipse cx={0} cy={-10} rx={7} ry={2} fill="#5FF2FF" />
          {live ? null : (
            <G transform="translate(0 -36)">
              <HoloFigure />
            </G>
          )}
        </G>
      );
    case 'vending':
      return (
        <G>
          <Shadow rx={14} />
          <Rect x={-12} y={-46} width={24} height={46} rx={3} fill="#E03FC0" stroke={OL} strokeWidth={2.2} />
          <Rect x={-9.5} y={-41} width={13} height={28} rx={1} fill="#C9F7FF" stroke={OL} strokeWidth={1.6} />
          {[0, 1, 2].map((r) =>
            [0, 1, 2].map((ci) => <Rect key={`${r}${ci}`} x={-8 + ci * 4} y={-38 + r * 8.5} width={2.6} height={6} rx={1} fill={['#FF5D8F', '#FFD54F', '#7CD67A'][(r + ci) % 3]} stroke={OL} strokeWidth={0.6} />),
          )}
          <Rect x={5.5} y={-41} width={4.4} height={18} rx={1} fill="#2A2F48" />
          {[0, 1, 2].map((i) => (
            <Circle key={i} cx={7.7} cy={-37 + i * 5} r={1.1} fill={['#5FF2FF', '#FFE45C', '#FF4F6E'][i]} />
          ))}
          <Rect x={-9} y={-9} width={13} height={5} rx={1} fill="#1A1D2E" />
          <Rect x={-12} y={-52} width={24} height={6.4} rx={2} fill="#5FF2FF" stroke={OL} strokeWidth={1.6} />
        </G>
      );
    /* ---- Lune ---- */
    case 'crater':
      return (
        <G>
          <Ellipse cx={0} cy={-4} rx={22} ry={8} fill="#D6D9E2" stroke={OL} strokeWidth={2} />
          <Ellipse cx={0} cy={-3.4} rx={16} ry={5} fill="#8E93A6" />
          <Path d="M-14 -2.2 Q0 4 14 -2.2 Q0 1 -14 -2.2 Z" fill="#B2B6C5" />
          <Path d="M-17 -7 Q-8 -11.5 4 -11.4" stroke="#F2F3F7" strokeWidth={1.8} fill="none" strokeLinecap="round" />
        </G>
      );
    case 'moonFlag':
      return (
        <G>
          <Shadow rx={9} />
          <Line x1={0} y1={0} x2={0} y2={-52} stroke={OL} strokeWidth={3.6} />
          <Line x1={0} y1={0} x2={0} y2={-52} stroke="#E3E6EE" strokeWidth={1.6} />
          <Line x1={0} y1={-50} x2={26} y2={-50} stroke={OL} strokeWidth={2.2} />
          <Path d="M1 -50 H26 V-34 Q20 -36 14 -34 Q8 -32 1 -34 Z" fill="#5A6BA8" stroke={OL} strokeWidth={1.6} strokeLinejoin="round" />
          <Path d="M13.5 -47 L17 -42.5 L13.5 -38 L10 -42.5 Z" fill="#FFFFFF" />
          <Path d="M1 -47 H26" stroke="#FFD54F" strokeWidth={1.6} />
          {[[-12, 3], [-18, 1], [10, 4]].map(([fx, fy], i) => (
            <Ellipse key={i} cx={fx} cy={fy} rx={2.2} ry={1.2} fill="#A6ABBC" />
          ))}
        </G>
      );
    case 'dish':
      return (
        <G>
          <Shadow rx={14} />
          <Path d="M-9 0 L0 -17 L9 0 M0 -17 V0" stroke={OL} strokeWidth={3.4} strokeLinecap="round" fill="none" />
          <Path d="M-9 0 L0 -17 L9 0 M0 -17 V0" stroke="#AEB4C2" strokeWidth={1.6} strokeLinecap="round" fill="none" />
          <G transform="rotate(-28 0 -26)">
            <Path d="M-17 -26 Q0 -12 17 -26 Z" fill="#C3C7D3" stroke={OL} strokeWidth={2} strokeLinejoin="round" />
            <Ellipse cx={0} cy={-26} rx={17} ry={5} fill="#F2F3F7" stroke={OL} strokeWidth={2} />
            <Ellipse cx={0} cy={-26} rx={11} ry={3} fill="#DADDE6" />
            <Line x1={0} y1={-26} x2={0} y2={-40} stroke={OL} strokeWidth={1.8} />
            <Circle cx={0} cy={-41} r={2.4} fill="#FF4F6E" stroke={OL} strokeWidth={1.2} />
          </G>
        </G>
      );
    case 'lander':
      return (
        <G>
          <Shadow rx={24} />
          <Path d="M-11 -14 L-21 -1 M11 -14 L21 -1 M-6 -12 L-9 -1 M6 -12 L9 -1" stroke={OL} strokeWidth={3.2} strokeLinecap="round" />
          <Path d="M-11 -14 L-21 -1 M11 -14 L21 -1 M-6 -12 L-9 -1 M6 -12 L9 -1" stroke="#C9CDD6" strokeWidth={1.4} strokeLinecap="round" />
          {[-21, 21, -9, 9].map((fx) => (
            <Ellipse key={fx} cx={fx} cy={-1} rx={3.6} ry={1.4} fill="#C9CDD6" stroke={OL} strokeWidth={1.2} />
          ))}
          <Rect x={-14} y={-24} width={28} height={12} rx={1} fill="#F2C14E" stroke={OL} strokeWidth={2} />
          <Path d="M-10 -21 l3 4 l3 -3 l4 4 M3 -22 l3 3 l3 -2" stroke="#D49A22" strokeWidth={1.2} fill="none" />
          <Path d="M-10 -24 L-12 -35 L-5 -43 H6 L12 -35 L10 -24 Z" fill="#ECEEF3" stroke={OL} strokeWidth={2} strokeLinejoin="round" />
          <Path d="M-6 -36 L-2 -40 H3 L5 -36 Z" fill="#2B3A66" stroke={OL} strokeWidth={1.2} strokeLinejoin="round" />
          <Line x1={6} y1={-43} x2={10} y2={-52} stroke={OL} strokeWidth={1.6} />
          <Path d="M7 -52 Q10 -49 13 -53" stroke={OL} strokeWidth={1.6} fill="#ECEEF3" />
        </G>
      );
  }
  return null;
}

/* ------------------------------ Nouveaux grands décors ------------------------------ */

type S = -1 | 1;

/** Repères des grands décors, partagés avec la couche animée (live.tsx). */
export const LAKE = (x: number, y: number, s: S) => {
  const tip = x - s * 30;
  return {
    cx: x + s * 6,
    tip,
    fisher: { x: tip - s * 6, y: y + 12 },
    float: { x: tip + s * 24, y: y + 30 },
    pedalo: { x: x + s * 2, y: y - 24 },
    ripples: [
      { x: x + s * 40, y: y - 2 },
      { x: x + s * 6, y: y + 34 },
      { x: x - s * 4, y: y - 34 },
    ],
  };
};
export const FAIR = (x: number, y: number, s: S) => ({ wheel: { x: x + s * 8, y: y - 28, r: 50 }, tent: { x: x - s * 46, y: y + 66 } });
export const FERRIS_CARS = 8;
export const FARM = (x: number, y: number, s: S) => ({ barn: { x: x - s * 20, y: y + 64 }, mill: { x: x + s * 44, y: y + 28 }, hub: { x: x + s * 44, y: y + 28 - 74 } });
export const MANOR = (x: number, y: number, s: S) => ({ house: { x: x - s * 2, y: y + 64 }, moon: { x: x - s * 34, y: y - 78 } });
/** Fenêtres du manoir (repère local, tour du côté s). */
export const MANOR_WINDOWS = [
  { x: -36, y: -42, w: 10, h: 14 },
  { x: -15, y: -42, w: 10, h: 14 },
  { x: -36, y: -21, w: 10, h: 13 },
  { x: 31, y: -68, w: 10, h: 13 },
  { x: 31, y: -42, w: 10, h: 13 },
];
export const COVE = (x: number, y: number, s: S, width: number) => ({ edge: s < 0 ? 0 : width, inner: x - s * 64, ship: { x: x + s * 4, y: y - 40 }, rock: { x: x + s * 12, y: y + 100 } });
export const PYRAMIDS = (x: number, y: number, s: S) => ({ big: { x: x + s * 18, y: y + 48 }, small: { x: x - s * 46, y: y + 70 }, oasis: { x: x - s * 4, y: y + 96 }, palms: [{ x: x - s * 34, y: y + 94 }, { x: x + s * 26, y: y + 90 }] });
export const MINE = (x: number, y: number, s: S) => ({ door: { x: x - s * 10, y: y + 56 }, lamps: [{ x: x - s * 39, y: y + 14 }, { x: x + s * 19, y: y + 14 }], crystals: [{ x: x + s * 50, y: y + 46, k: 1.25 }, { x: x + s * 34, y: y - 28, k: 0.8 }] });
export const ISLANDS = (x: number, y: number, s: S) => [
  { x: x + s * 6, y: y - 8, k: 1 },
  { x: x - s * 44, y: y - 92, k: 0.42 },
  { x: x + s * 36, y: y + 96, k: 0.36 },
];
export const SKYLINE = (x: number, y: number, s: S) => ({ base: { x, y: y + 62 }, antenna: { x: x - s * 30, y: y + 62 - 186 }, board: { x: x + s * 9, y: y + 62 - 93 }, beams: [{ x: x - s * 30, y: y + 62 - 160 }, { x: x + s * 50, y: y + 62 - 80 }] });
/** Tours de la ville : gauche, droite, haut, couleur, néon (repère local). */
export const SKYLINE_BLD: [number, number, number, string, string][] = [
  [-76, -46, -96, '#3C4466', '#FF4FD8'],
  [-52, -8, -160, '#46507A', '#5FF2FF'],
  [-12, 28, -120, '#353D5E', '#FF4FD8'],
  [24, 72, -80, '#404A70', '#5FF2FF'],
];
/** Fenêtres qui s'allument et s'éteignent : [tour, rangée, colonne]. */
export const SKYLINE_FLICKER: [number, number, number][] = [
  [0, 2, 1],
  [1, 4, 2],
  [1, 9, 0],
  [2, 1, 3],
  [2, 6, 1],
  [3, 3, 4],
];
export const MOON_BASE = (x: number, y: number, s: S) => ({ lights: [-20, 0, 20, 38].map((lx) => ({ x: x + s * lx, y: y + 14 })).concat([-58, -38].map((lx) => ({ x: x + s * lx, y: y + 22 }))), antenna: { x: x + s * 24, y: y - 62 } });

function Gondola({ c }: { c: string }) {
  return (
    <G>
      <Line x1={0} y1={0} x2={0} y2={4} stroke={OL} strokeWidth={1.6} />
      <Path d="M-7 4 H7 L6 14 Q0 17 -6 14 Z" fill={c} stroke={OL} strokeWidth={1.8} strokeLinejoin="round" />
      <Path d="M-8 4 Q0 -1 8 4 Z" fill="#FFF1D6" stroke={OL} strokeWidth={1.4} strokeLinejoin="round" />
      <Rect x={-4} y={6.5} width={8} height={3.4} rx={1} fill="#BFE8FF" />
    </G>
  );
}
export const GONDOLA_COLORS = ['#FF5D8F', '#FFD54F', '#5FC4F0', '#7CD67A', '#FF8A3D', '#B78CFF', '#FF4F6E', '#26C6DA'];
export { Gondola };

/** Roue (cercle + rayons + ampoules) de la grande roue, centrée en (0, 0). */
export function FerrisRim({ r }: { r: number }) {
  return (
    <G>
      {Array.from({ length: FERRIS_CARS }, (_, i) => {
        const a = (i / FERRIS_CARS) * Math.PI * 2;
        return <Line key={i} x1={0} y1={0} x2={Math.cos(a) * r} y2={Math.sin(a) * r} stroke={OL} strokeWidth={2.2} />;
      })}
      <Circle cx={0} cy={0} r={r} fill="none" stroke={OL} strokeWidth={6} />
      <Circle cx={0} cy={0} r={r} fill="none" stroke="#FFFFFF" strokeWidth={2.8} />
      <Circle cx={0} cy={0} r={r * 0.62} fill="none" stroke={OL} strokeWidth={4} />
      <Circle cx={0} cy={0} r={r * 0.62} fill="none" stroke="#FF7BAC" strokeWidth={1.8} />
      {Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2 + 0.2;
        return <Circle key={`b${i}`} cx={Math.cos(a) * r} cy={Math.sin(a) * r} r={1.9} fill={i % 2 ? '#FFE45C' : '#FF5D8F'} />;
      })}
      <Circle cx={0} cy={0} r={7} fill="#FFD54F" stroke={OL} strokeWidth={2} />
      <Circle cx={0} cy={0} r={2.4} fill={OL} />
    </G>
  );
}

/** Ailes du moulin, moyeu en (0, 0). */
export function MillSails({ len = 42 }: { len?: number }) {
  return (
    <G>
      {[0, 90, 180, 270].map((a) => (
        <G key={a} transform={`rotate(${a})`}>
          <Rect x={-1.8} y={-len} width={3.6} height={len} fill="#8A5A2E" stroke={OL} strokeWidth={1.4} />
          <Rect x={2} y={-len + 2} width={11} height={len - 12} fill="#FFF6E6" stroke={OL} strokeWidth={1.8} />
          <Path d={`M2 ${-len + 10} h11 M2 ${-len + 18} h11 M2 ${-len + 26} h11 M7.5 ${-len + 2} v${len - 12}`} stroke="#C9A97A" strokeWidth={1} />
        </G>
      ))}
      <Circle cx={0} cy={0} r={5} fill="#7A4B26" stroke={OL} strokeWidth={2} />
    </G>
  );
}

/** Pédalo cygne, posé sur l'eau en (0, 0). */
export function Pedalo() {
  return (
    <G>
      <Ellipse cx={0} cy={1} rx={18} ry={4} fill="#BDE8FF" opacity={0.7} />
      <Path d="M-15 -4 Q-16 2 -8 3 H10 Q16 2 15 -6 Z" fill="#FFFFFF" stroke={OL} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M-13 -5 Q-17 -12 -12 -14 Q-9 -10 -8 -5 Z" fill="#FFFFFF" stroke={OL} strokeWidth={1.6} strokeLinejoin="round" />
      <Path d="M9 -5 Q15 -10 11 -18 Q9 -24 14 -26" stroke={OL} strokeWidth={5.6} fill="none" strokeLinecap="round" />
      <Path d="M9 -5 Q15 -10 11 -18 Q9 -24 14 -26" stroke="#FFFFFF" strokeWidth={3} fill="none" strokeLinecap="round" />
      <Path d="M16 -27 L21 -25.6 L16 -24 Z" fill="#FF8A3D" stroke={OL} strokeWidth={1} strokeLinejoin="round" />
      <Circle cx={14.6} cy={-26.6} r={0.9} fill={OL} />
      <Rect x={-8} y={-11} width={13} height={6} rx={2} fill="#FF5D8F" stroke={OL} strokeWidth={1.6} />
      <Circle cx={-4} cy={-15} r={3.4} fill="#F2C7A5" stroke={OL} strokeWidth={1.3} />
      <Circle cx={3} cy={-15} r={3.4} fill="#A8714E" stroke={OL} strokeWidth={1.3} />
      <Path d="M-7 -16 Q-4 -20 -1 -16 Z" fill="#E8C46A" />
      <Path d="M0 -16 Q3 -20 6 -16 Z" fill="#2B1B12" />
    </G>
  );
}

/** Galion pirate, ligne de flottaison en (0, 0), proue vers +x. */
export function Galleon({ live }: { live?: boolean }) {
  return (
    <G>
      <Ellipse cx={2} cy={6} rx={52} ry={6} fill="#1E9AA6" opacity={0.6} />
      <Line x1={44} y1={-22} x2={64} y2={-36} stroke={OL} strokeWidth={3} strokeLinecap="round" />
      <Path d="M-48 -32 H-27 L-25 -18 H34 L46 -24 Q42 2 24 8 H-34 Q-46 0 -48 -32 Z" fill="#8A4E28" stroke={OL} strokeWidth={2.6} strokeLinejoin="round" />
      <Path d="M-46 -24 H-26 M-25 -18 H34 L46 -24" stroke="#F2C14E" strokeWidth={2.2} fill="none" />
      <Path d="M-42 0 Q-10 4 30 2" stroke="#6E3E1C" strokeWidth={4} fill="none" />
      {[-18, -4, 10, 24].map((px) => (
        <G key={px}>
          <Circle cx={px} cy={-9} r={3.6} fill="#3A2414" stroke="#F2C14E" strokeWidth={1.4} />
        </G>
      ))}
      <Rect x={-46} y={-30} width={6} height={5} fill="#FFE27A" stroke={OL} strokeWidth={1} />
      <Rect x={-37} y={-30} width={6} height={5} fill="#FFE27A" stroke={OL} strokeWidth={1} />
      <Line x1={2} y1={-18} x2={2} y2={-92} stroke={OL} strokeWidth={4} />
      <Line x1={28} y1={-18} x2={28} y2={-70} stroke={OL} strokeWidth={3.4} />
      <Line x1={-34} y1={-32} x2={-34} y2={-62} stroke={OL} strokeWidth={3} />
      <Path d="M-16 -88 Q2 -84 20 -88 L18 -66 Q2 -62 -14 -66 Z" fill="#F7EEDC" stroke={OL} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M-20 -62 Q2 -56 24 -62 L22 -30 Q2 -24 -18 -30 Z" fill="#F7EEDC" stroke={OL} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M14 -66 Q28 -62 42 -66 L40 -36 Q28 -32 16 -36 Z" fill="#F7EEDC" stroke={OL} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M-34 -60 L-50 -38 H-34 Z" fill="#E9DCC0" stroke={OL} strokeWidth={1.8} strokeLinejoin="round" />
      <Path d="M-6 -54 Q2 -50 10 -54 M-6 -46 L10 -38 M10 -46 L-6 -38" stroke="#C8283C" strokeWidth={2} fill="none" strokeLinecap="round" />
      <Rect x={-4} y={-82} width={12} height={5} rx={1} fill="#8A4E28" stroke={OL} strokeWidth={1.4} />
      {live ? null : (
        <G transform="translate(3 -92)">
          <JollyFlag w={20} />
        </G>
      )}
    </G>
  );
}
/** Haut du grand mât (pour le drapeau animé), dans le repère du galion. */
export const GALLEON_FLAG = { x: 3, y: -92 };

/** Île volante, centre du dessus en (0, 0). */
export function SkyIsland({ main }: { main?: boolean }) {
  return (
    <G>
      <Path d="M-64 0 Q-58 30 -32 50 Q-12 72 6 70 Q24 62 40 40 Q58 22 64 0 Z" fill="#A8744A" stroke={OL} strokeWidth={2.6} strokeLinejoin="round" />
      <Path d="M8 66 Q26 56 40 40 Q56 22 62 4 L40 6 Q34 34 8 66 Z" fill="#8A5A2E" opacity={0.75} />
      <Path d="M-46 14 Q-20 22 6 16 Q24 12 44 16 M-28 36 Q-6 42 22 34" stroke="#8A5A2E" strokeWidth={2.4} fill="none" strokeLinecap="round" />
      <Path d="M-6 68 q-2 8 2 14 M12 62 q4 8 0 14 M-24 46 q-3 7 0 12" stroke="#6E8B3D" strokeWidth={2} fill="none" strokeLinecap="round" />
      <Path d="M0 70 L4 84 L8 69 Z" fill="#8A5A2E" stroke={OL} strokeWidth={1.6} strokeLinejoin="round" />
      <Ellipse cx={0} cy={0} rx={67} ry={16} fill="#6CC04A" stroke={OL} strokeWidth={2.6} />
      {[-52, -30, -6, 20, 44].map((gx, i) => (
        <Path key={gx} d={`M${gx - 6} ${12 - Math.abs(gx) * 0.08} q6 ${8 + (i % 2) * 4} 12 0`} fill="#58A83A" stroke={OL} strokeWidth={1.6} />
      ))}
      <Ellipse cx={-14} cy={-4} rx={34} ry={6} fill="#A6E07F" opacity={0.7} />
      {main ? (
        <G>
          <Ellipse cx={-36} cy={-1} rx={14} ry={4.4} fill="#5FC0F0" stroke={OL} strokeWidth={1.6} />
          <G transform="translate(14 -2)">
            <Rect x={-11} y={-20} width={22} height={20} fill="#FFF1D6" stroke={OL} strokeWidth={2} />
            <Path d="M-15 -18 L0 -34 L15 -18 Z" fill="#E5532A" stroke={OL} strokeWidth={2} strokeLinejoin="round" />
            <Rect x={5} y={-34} width={5} height={9} fill="#B5652E" stroke={OL} strokeWidth={1.4} />
            <Path d="M-4 0 V-9 Q0 -13 4 -9 V0 Z" fill="#8A5A2E" stroke={OL} strokeWidth={1.4} />
            <Rect x={-9} y={-15} width={5} height={5} fill="#BFE8FF" stroke={OL} strokeWidth={1.2} />
          </G>
          <G transform="translate(44 -2) scale(0.72)">
            <Trunk h={22} />
            <Blob c={[[-12, -32, 15], [12, -32, 15], [0, -46, 18], [0, -30, 14]]} fill="#4CAF50" dark="#357A38" light="#8BD982" />
          </G>
          {[-54, -18, 30].map((fx, i) => (
            <Circle key={fx} cx={fx} cy={-3 + (i % 2) * 3} r={2.2} fill={['#FF8FB1', '#FFD54F', '#FFFFFF'][i]} stroke={OL} strokeWidth={1} />
          ))}
        </G>
      ) : (
        <G transform="translate(4 -2) scale(0.9)">
          <Blob c={[[-12, -9, 11], [10, -9, 11], [0, -18, 13]]} fill="#3E9C45" dark="#2D7432" light="#79C97A" />
        </G>
      )}
    </G>
  );
}
/** Cascade de l'île principale : départ, largeur, longueur. */
export const WATERFALL = { x: -46, y: 2, w: 12, h: 118 };

/** Terre vue de la Lune, centrée en (0, 0). */
export function Earth({ r, continents = true }: { r: number; continents?: boolean }) {
  const k = r / 30;
  return (
    <G>
      <Circle cx={0} cy={0} r={r + 7} fill="#5FB2F0" opacity={0.18} />
      <Circle cx={0} cy={0} r={r} fill="#2F86D9" stroke={OL} strokeWidth={2.4} />
      {continents ? (
        <G transform={`scale(${k})`}>
          <Path d={EARTH_LAND} fill="#5DBB63" stroke={OL} strokeWidth={1.4} strokeLinejoin="round" />
        </G>
      ) : null}
      <Path d={`M${-r * 0.75} ${-r * 0.45} q${r * 0.4} ${-r * 0.2} ${r * 0.8} ${-r * 0.05} M${-r * 0.3} ${r * 0.55} q${r * 0.4} ${-r * 0.12} ${r * 0.9} ${r * 0.05}`} stroke="#FFFFFF" strokeWidth={2.6 * k} fill="none" strokeLinecap="round" opacity={0.85} />
    </G>
  );
}
const EARTH_LAND = 'M-20 -18 Q-12 -24 -4 -20 Q2 -14 -4 -8 Q-10 -2 -6 6 Q-4 14 -12 16 Q-20 12 -22 2 Q-26 -8 -20 -18 Z M8 -22 Q18 -22 22 -12 Q26 -2 18 2 Q12 0 10 -8 Q6 -14 8 -22 Z M8 10 Q16 8 18 16 Q14 24 6 22 Q2 16 8 10 Z';
export { EARTH_LAND };

/** Ciel noir étoilé de la Lune, au-dessus de l'horizon courbe. */
export function MoonSky({ width, h, sky, earth, live }: { width: number; h: number; sky: string; earth: { x: number; y: number }; live: boolean }) {
  const horizon = `M0 ${h} Q${width / 2} ${h - 140} ${width} ${h}`;
  return (
    <G>
      <Path d={`M0 -80 H${width} V${h} Q${width / 2} ${h - 140} 0 ${h} Z`} fill={sky} />
      {Array.from({ length: 34 }, (_, i) => {
        const sx = ((i * 97 + 13) % 100) / 100 * width;
        const sy = ((i * 61 + 7) % 100) / 100 * (h - 70) + 4;
        const r = 0.7 + ((i * 7) % 3) * 0.5;
        return <Circle key={i} cx={sx} cy={sy} r={r} fill={i % 5 ? '#FFFFFF' : '#FFE9A8'} opacity={0.55 + ((i * 3) % 4) * 0.12} />;
      })}
      {live ? null : (
        <G transform={`translate(${earth.x} ${earth.y})`}>
          <Earth r={30} />
        </G>
      )}
      <Path d={horizon} stroke="#FFFFFF" strokeWidth={8} fill="none" opacity={0.22} transform="translate(0 -3)" />
      <Path d={horizon} stroke={OL} strokeWidth={2.6} fill="none" />
      <Path d={`M${width * 0.08} ${h - 22} q14 -10 30 -6 M${width * 0.62} ${h - 58} q16 -6 28 0`} stroke="#E4E6EE" strokeWidth={2.4} fill="none" strokeLinecap="round" />
    </G>
  );
}

/** Chapiteau rayé de la foire, pied en (x, y). */
export function BigTop({ x, y, flag = true }: { x: number; y: number; flag?: boolean }) {
  const st = [0, 1, 2, 3, 4, 5, 6, 7];
  return (
          <G transform={`translate(${x} ${y})`}>
            <Ellipse cx={0} cy={2} rx={46} ry={7} fill="rgba(0,0,0,0.22)" />
            {st.map((i) => (
              <Rect key={`w${i}`} x={-40 + i * 10} y={-26} width={10} height={26} fill={i % 2 ? '#FFFFFF' : '#E53935'} />
            ))}
            <Rect x={-40} y={-26} width={80} height={26} fill="none" stroke={OL} strokeWidth={SW} />
            <Path d="M-10 0 V-14 Q0 -24 10 -14 V0 Z" fill="#4A1F2E" stroke={OL} strokeWidth={2.2} />
            <Path d="M-10 -14 Q-16 -6 -14 0 M10 -14 Q16 -6 14 0" stroke="#FFD54F" strokeWidth={2} fill="none" />
            {st.map((i) => (
              <Path key={`r${i}`} d={`M0 -64 L${-46 + i * 11.5} -26 L${-34.5 + i * 11.5} -26 Z`} fill={i % 2 ? '#FFFFFF' : '#E53935'} />
            ))}
            <Path d="M-46 -26 L0 -64 L46 -26 Z" fill="none" stroke={OL} strokeWidth={SW} strokeLinejoin="round" />
            {Array.from({ length: 9 }, (_, i) => (
              <Path key={`v${i}`} d={`M${-46 + i * 10.2} -26 q5.1 7 10.2 0`} fill={i % 2 ? '#E53935' : '#FFD54F'} stroke={OL} strokeWidth={1.5} />
            ))}
            <Line x1={0} y1={-64} x2={0} y2={-80} stroke={OL} strokeWidth={2.4} />
            <Circle cx={0} cy={-64} r={3} fill="#FFD54F" stroke={OL} strokeWidth={1.4} />
            {flag ? <Path d="M0 -80 L14 -76 L0 -72 Z" fill="#FFD54F" stroke={OL} strokeWidth={1.4} strokeLinejoin="round" /> : null}
          </G>
  );
}
export const BIGTOP_FLAG = { x: 0, y: -80 };

function NewHero({ kind, x, y, side, width, live }: { kind: HeroKind; x: number; y: number; side: S; width: number; live: boolean }) {
  const s = side;
  switch (kind) {
    case 'lake': {
      const L = LAKE(x, y, s);
      const blob = (k: number) =>
        `M${-84 * k} ${-6 * k} C${-86 * k} ${-42 * k} ${-40 * k} ${-58 * k} ${4 * k} ${-54 * k} C${46 * k} ${-52 * k} ${88 * k} ${-38 * k} ${84 * k} ${2 * k} C${82 * k} ${36 * k} ${44 * k} ${58 * k} ${0} ${54 * k} C${-46 * k} ${52 * k} ${-82 * k} ${30 * k} ${-84 * k} ${-6 * k} Z`;
      const fy = y + 12;
      return (
        <G>
          <G transform={`translate(${L.cx} ${y}) scale(${s} 1)`}>
            <Path d={blob(1.1)} fill="#EADBA6" />
            <Path d={blob(1.1)} fill="none" stroke="#C9B67C" strokeWidth={2} strokeDasharray="2 7" />
            <Path d={blob(1)} fill="#3FA9F5" stroke={OL} strokeWidth={SW} />
            <Ellipse cx={14} cy={6} rx={50} ry={28} fill="#2E93E0" opacity={0.55} />
            <Path d="M-50 -24 q16 -6 32 -2 M10 -34 q12 -4 24 0 M30 24 q12 -4 22 0" stroke="#9AD8FF" strokeWidth={3} fill="none" strokeLinecap="round" />
            <Path d={lilyPad(48, 24, 9, 5)} fill="#43A047" stroke={OL} strokeWidth={1.6} strokeLinejoin="round" />
            <Path d={lilyPad(62, 6, 7, 4)} fill="#4CAF50" stroke={OL} strokeWidth={1.6} strokeLinejoin="round" />
            <Path d={lilyPad(34, 38, 6, 3.4)} fill="#4CAF50" stroke={OL} strokeWidth={1.4} strokeLinejoin="round" />
            <PinkLily x={48} y={23} />
          </G>
          <G transform={`translate(${x + s * 60} ${y - 40}) scale(0.75)`}>
            <Reeds small />
          </G>
          <G transform={`translate(${x + s * 74} ${y + 30}) scale(0.7)`}>
            <Reeds small />
          </G>
          {/* ponton */}
          <G>
            {[0.25, 0.6, 0.95].map((t) => (
              <Rect key={t} x={L.tip - s * 52 * (1 - t) - 2.5} y={fy + 4} width={5} height={12} fill="#6E4423" stroke={OL} strokeWidth={1.4} />
            ))}
            <Path d={`M${L.tip - s * 60} ${fy - 6} H${L.tip} V${fy + 6} H${L.tip - s * 60} Z`} fill="#C99A62" stroke={OL} strokeWidth={2.2} strokeLinejoin="round" />
            {Array.from({ length: 7 }, (_, i) => (
              <Line key={i} x1={L.tip - s * (6 + i * 8)} y1={fy - 6} x2={L.tip - s * (6 + i * 8)} y2={fy + 6} stroke="#8A5A2E" strokeWidth={1.3} />
            ))}
          </G>
          {/* pêcheur assis au bout du ponton */}
          <G transform={`translate(${L.fisher.x} ${L.fisher.y}) scale(${s} 1)`}>
            <Path d="M2 -2 L8 2 L8 10" stroke={OL} strokeWidth={4} strokeLinecap="round" fill="none" />
            <Path d="M2 -2 L8 2 L8 10" stroke="#2F3A56" strokeWidth={2.4} strokeLinecap="round" fill="none" />
            <Rect x={-5} y={-16} width={10} height={14} rx={3.5} fill="#E5532A" stroke={OL} strokeWidth={1.6} />
            <Circle cx={0} cy={-21} r={5} fill="#D9A27A" stroke={OL} strokeWidth={1.6} />
            <Ellipse cx={0} cy={-25} rx={8} ry={2.2} fill="#F3D27A" stroke={OL} strokeWidth={1.2} />
            <Path d="M-4 -25 Q0 -31 4 -25 Z" fill="#F3D27A" stroke={OL} strokeWidth={1.2} />
            <Line x1={4} y1={-10} x2={28} y2={-30} stroke={OL} strokeWidth={2.2} strokeLinecap="round" />
            <Line x1={4} y1={-10} x2={28} y2={-30} stroke="#B97A3F" strokeWidth={1} strokeLinecap="round" />
            <Path d={`M28 -30 Q31 -4 ${24} ${30 - 12}`} stroke="#FFFFFF" strokeWidth={0.9} fill="none" opacity={0.9} />
          </G>
          {live ? null : (
            <G>
              <G transform={`translate(${L.float.x} ${L.float.y})`}>
                <Circle cx={0} cy={-2} r={2.6} fill="#E53935" stroke={OL} strokeWidth={1.2} />
              </G>
              <G transform={`translate(${L.pedalo.x} ${L.pedalo.y}) scale(${-s} 1)`}>
                <Pedalo />
              </G>
            </G>
          )}
        </G>
      );
    }
    case 'fair': {
      const F = FAIR(x, y, s);
      const { x: wx, y: wy, r } = F.wheel;
      const base = y + 46;
      const t = F.tent;
      return (
        <G>
          <Ellipse cx={wx} cy={base + 2} rx={44} ry={7} fill="rgba(0,0,0,0.2)" />
          {/* pieds de la roue */}
          <Path d={`M${wx - 36} ${base} L${wx} ${wy} L${wx + 36} ${base}`} stroke={OL} strokeWidth={8} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          <Path d={`M${wx - 36} ${base} L${wx} ${wy} L${wx + 36} ${base}`} stroke="#E8467C" strokeWidth={4.4} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          <Path d={`M${wx - 24} ${base - 22} H${wx + 24}`} stroke={OL} strokeWidth={3} />
          {live ? null : (
            <G>
              <G transform={`translate(${wx} ${wy}) rotate(10)`}>
                <FerrisRim r={r} />
              </G>
              {Array.from({ length: FERRIS_CARS }, (_, i) => {
                const a = (i / FERRIS_CARS) * Math.PI * 2 + (10 * Math.PI) / 180;
                return (
                  <G key={i} transform={`translate(${wx + Math.cos(a) * r} ${wy + Math.sin(a) * r})`}>
                    <Gondola c={GONDOLA_COLORS[i]} />
                  </G>
                );
              })}
            </G>
          )}
          {[-36, 36].map((dx) => (
            <Rect key={dx} x={wx + dx - 6} y={base - 3} width={12} height={5} rx={2} fill="#FFF1D6" stroke={OL} strokeWidth={1.6} />
          ))}
          {live ? null : <BigTop x={t.x} y={t.y} />}
        </G>
      );
    }
    case 'farm': {
      const F = FARM(x, y, s);
      const m = F.mill;
      const b = F.barn;
      return (
        <G>
          {/* moulin */}
          <G transform={`translate(${m.x} ${m.y})`}>
            <Ellipse cx={0} cy={2} rx={24} ry={5} fill="rgba(0,0,0,0.2)" />
            <Path d="M-17 0 L-10 -70 H10 L17 0 Z" fill="#EBD9B4" stroke={OL} strokeWidth={SW} strokeLinejoin="round" />
            <Path d="M4 -70 H10 L17 0 H8 Z" fill="#D6BF92" />
            <Path d="M-17 0 L-10 -70 H10 L17 0 Z" fill="none" stroke={OL} strokeWidth={SW} strokeLinejoin="round" />
            <Path d="M-5 0 V-12 Q0 -17 5 -12 V0 Z" fill="#7A4B26" stroke={OL} strokeWidth={1.8} />
            <Rect x={-4} y={-44} width={8} height={9} rx={4} fill="#BFE8FF" stroke={OL} strokeWidth={1.6} />
            <Path d="M-14 -68 Q0 -90 14 -68 Z" fill="#B5652E" stroke={OL} strokeWidth={SW} strokeLinejoin="round" />
            {live ? null : (
              <G transform="translate(0 -74) rotate(22)">
                <MillSails />
              </G>
            )}
          </G>
          {/* grange */}
          <G transform={`translate(${b.x} ${b.y})`}>
            <Ellipse cx={0} cy={2} rx={50} ry={8} fill="rgba(0,0,0,0.22)" />
            <Path d="M-42 0 V-40 L-34 -62 L0 -78 L34 -62 L42 -40 V0 Z" fill="#C8402E" stroke={OL} strokeWidth={SW} strokeLinejoin="round" />
            <Path d="M-46 -38 L-36 -64 L0 -82 L36 -64 L46 -38" fill="none" stroke={OL} strokeWidth={7} strokeLinejoin="round" strokeLinecap="round" />
            <Path d="M-46 -38 L-36 -64 L0 -82 L36 -64 L46 -38" fill="none" stroke="#FFFFFF" strokeWidth={3.4} strokeLinejoin="round" strokeLinecap="round" />
            {[-30, -18, 18, 30].map((px) => (
              <Line key={px} x1={px} y1={-4} x2={px} y2={-44} stroke="#A8301F" strokeWidth={1.6} />
            ))}
            <Rect x={-17} y={-32} width={34} height={32} fill="#A8301F" stroke={OL} strokeWidth={2.2} />
            <Rect x={-17} y={-32} width={34} height={32} fill="none" stroke="#FFFFFF" strokeWidth={2.4} />
            <Path d="M-15 -30 L15 -2 M15 -30 L-15 -2" stroke="#FFFFFF" strokeWidth={2.4} />
            <Line x1={0} y1={-32} x2={0} y2={0} stroke="#FFFFFF" strokeWidth={2} />
            <Rect x={-9} y={-60} width={18} height={14} fill="#5C2A1E" stroke="#FFFFFF" strokeWidth={2.4} />
            <Path d="M-7 -50 q3 -6 7 -3 q3 -5 7 0 v4 h-14 Z" fill="#E3B843" />
            <Path d="M-46 -38 L-36 -64" stroke={OL} strokeWidth={1.2} />
          </G>
          {/* botte de foin devant */}
          <G transform={`translate(${b.x - s * 52} ${b.y + 8}) scale(0.8)`}>{newDecor('hay', 0, false, false)}</G>
        </G>
      );
    }
    case 'manor': {
      const M = MANOR(x, y, s);
      return (
        <G>
          <G transform={`translate(${M.moon.x} ${M.moon.y})`}>
            <Circle cx={0} cy={0} r={34} fill="#FFF3C4" opacity={0.18} />
            <Circle cx={0} cy={0} r={26} fill="#FFF1C2" stroke={OL} strokeWidth={2.2} />
            <Circle cx={-8} cy={-6} r={5} fill="#EADBA0" />
            <Circle cx={7} cy={8} r={4} fill="#EADBA0" />
            <Circle cx={9} cy={-9} r={2.5} fill="#EADBA0" />
          </G>
          <G transform={`translate(${M.house.x} ${M.house.y}) scale(${s} 1)`}>
            <Ellipse cx={0} cy={2} rx={64} ry={9} fill="rgba(0,0,0,0.3)" />
            {/* cheminée */}
            <Path d="M-38 -66 L-37 -88 H-28 L-28 -72 Z" fill="#574D73" stroke={OL} strokeWidth={2.2} strokeLinejoin="round" />
            <Rect x={-40} y={-92} width={14} height={5} fill="#3A3354" stroke={OL} strokeWidth={1.8} />
            {/* corps */}
            <Rect x={-48} y={-56} width={74} height={56} fill="#6B5F8A" stroke={OL} strokeWidth={SW} />
            <Path d="M-48 -8 H26 M-48 -30 H26" stroke="#5B5078" strokeWidth={1.6} />
            <Path d="M-56 -52 Q-30 -70 -10 -102 Q8 -72 32 -52 Z" fill="#3A3354" stroke={OL} strokeWidth={SW} strokeLinejoin="round" />
            <Path d="M-44 -60 Q-26 -68 -18 -80 M-30 -58 Q-14 -66 -8 -84 M4 -66 Q14 -60 20 -56" stroke="#4E4670" strokeWidth={2} fill="none" />
            <Circle cx={-10} cy={-70} r={6} fill="#FFD45A" stroke={OL} strokeWidth={2} />
            <Path d="M-10 -76 V-64 M-16 -70 H-4" stroke={OL} strokeWidth={1.4} />
            {/* tour */}
            <Rect x={22} y={-86} width={30} height={86} fill="#5E527E" stroke={OL} strokeWidth={SW} />
            <Path d="M14 -84 Q30 -96 36 -132 Q40 -112 48 -104 Q56 -96 60 -84 Z" fill="#3A3354" stroke={OL} strokeWidth={SW} strokeLinejoin="round" />
            <Path d="M36 -132 Q44 -136 46 -128" stroke={OL} strokeWidth={2.2} fill="none" strokeLinecap="round" />
            {/* porte et marches */}
            <Path d="M-6 0 V-20 Q2 -30 10 -20 V0 Z" fill="#3A2414" stroke={OL} strokeWidth={2.2} />
            <Circle cx={6} cy={-9} r={1.2} fill="#F2C14E" />
            <Rect x={-12} y={-2} width={28} height={4} fill="#857B9E" stroke={OL} strokeWidth={1.6} />
            {MANOR_WINDOWS.map((w, i) => (
              <G key={i}>
                <Path d={`M${w.x} ${w.y + w.h} V${w.y + w.w / 2} Q${w.x + w.w / 2} ${w.y - 2} ${w.x + w.w} ${w.y + w.w / 2} V${w.y + w.h} Z`} fill={i === 2 ? '#2A2540' : '#FFD45A'} stroke={OL} strokeWidth={2} />
                <Path d={`M${w.x + w.w / 2} ${w.y + 2} V${w.y + w.h} M${w.x} ${w.y + w.h * 0.6} H${w.x + w.w}`} stroke={OL} strokeWidth={1.2} />
              </G>
            ))}
            <Path d="M-50 -4 L-58 -26 M-58 -26 l-5 -4 M-58 -26 l2 -7" stroke={OL} strokeWidth={3} strokeLinecap="round" fill="none" />
          </G>
        </G>
      );
    }
    case 'cove': {
      const C = COVE(x, y, s, width);
      const { edge, inner } = C;
      const d = `M${edge} ${y - 175} L${inner} ${y - 175} Q${inner - s * 24} ${y - 120} ${inner + s * 4} ${y - 70} Q${inner + s * 26} ${y - 20} ${inner - s * 2} ${y + 30} Q${inner - s * 30} ${y + 80} ${inner + s * 2} ${y + 130} Q${inner + s * 16} ${y + 160} ${inner} ${y + 175} L${edge} ${y + 175} Z`;
      const k = C.rock;
      return (
        <G>
          <Path d={d} fill="#FFF3D6" transform={`translate(${-s * -10} 0)`} />
          <Path d={d} fill="#2EC4C9" stroke={OL} strokeWidth={SW} />
          <Path d={d} fill="#1FA6B5" opacity={0.55} transform={`translate(${s * 26} 0) scale(1 0.94)`} origin={`${edge}, ${y}`} />
          {[-140, -100, 40, 150].map((dy, i) => (
            <Path key={dy} d={`M${edge - s * (22 + (i % 2) * 26) - 16} ${y + dy} q8 -6 16 0 q8 6 16 0`} stroke="#C8FBFF" strokeWidth={3} fill="none" strokeLinecap="round" />
          ))}
          {/* rocher en tête de mort */}
          <G transform={`translate(${k.x} ${k.y})`}>
            <Ellipse cx={0} cy={6} rx={40} ry={8} fill="#BDF4F7" opacity={0.75} />
            <Path d="M-32 8 Q-36 -30 -4 -40 Q30 -40 34 -10 Q36 2 32 8 Z" fill="#8E8A80" stroke={OL} strokeWidth={SW} strokeLinejoin="round" />
            <Path d="M14 -36 Q32 -26 32 8 H22 Q26 -16 14 -36 Z" fill="#76726A" />
            <Path d="M-32 8 Q-36 -30 -4 -40 Q30 -40 34 -10 Q36 2 32 8" fill="none" stroke={OL} strokeWidth={SW} strokeLinejoin="round" />
            <Ellipse cx={-12} cy={-16} rx={7} ry={8} fill="#2B2B33" stroke={OL} strokeWidth={1.6} />
            <Ellipse cx={12} cy={-16} rx={7} ry={8} fill="#2B2B33" stroke={OL} strokeWidth={1.6} />
            <Path d="M0 -8 L-3 -2 H3 Z" fill="#2B2B33" />
            <Path d="M-12 2 V7 M-4 3 V8 M4 3 V8 M12 2 V7" stroke="#2B2B33" strokeWidth={2.4} strokeLinecap="round" />
            <Path d="M-22 -30 Q-12 -36 0 -36" stroke="#AAA69C" strokeWidth={3} fill="none" strokeLinecap="round" />
          </G>
          {live ? null : (
            <G transform={`translate(${C.ship.x} ${C.ship.y}) scale(${-s * 0.86} 0.86)`}>
              <Galleon />
            </G>
          )}
        </G>
      );
    }
    case 'pyramids': {
      const P = PYRAMIDS(x, y, s);
      const pyr = (px: number, py: number, half: number, h: number) => (
        <G transform={`translate(${px} ${py})`}>
          <Ellipse cx={half * 0.3} cy={2} rx={half * 1.15} ry={8} fill="rgba(0,0,0,0.18)" />
          <Path d={`M${-half} 0 L0 ${-h} L${half * 0.35} 0 Z`} fill="#F2C877" />
          <Path d={`M${half * 0.35} 0 L0 ${-h} L${half} 0 Z`} fill="#D49B4E" />
          {[0.25, 0.5, 0.75].map((t) => (
            <Path key={t} d={`M${-half * (1 - t)} ${-h * t} L${half * 0.35 * (1 - t)} ${-h * t} L${half * (1 - t)} ${-h * t}`} stroke="#B98236" strokeWidth={1.6} fill="none" opacity={0.7} />
          ))}
          <Path d={`M0 ${-h} L${half * 0.35} 0`} stroke="#B98236" strokeWidth={1.6} />
          <Path d={`M${-half} 0 L0 ${-h} L${half} 0 Z`} fill="none" stroke={OL} strokeWidth={SW} strokeLinejoin="round" />
          <Path d={`M${-h * 0.1} ${-h * 0.92} L0 ${-h} L${h * 0.06} ${-h * 0.94}`} fill="#FFE27A" stroke={OL} strokeWidth={1.4} strokeLinejoin="round" />
        </G>
      );
      return (
        <G>
          {pyr(P.small.x, P.small.y, 40, 64)}
          {pyr(P.big.x, P.big.y, 66, 108)}
          <G transform={`translate(${P.big.x - s * 10} ${P.big.y})`}>
            <Path d="M-6 0 V-10 Q0 -16 6 -10 V0 Z" fill="#6E4A2A" stroke={OL} strokeWidth={1.8} />
          </G>
          <G transform={`translate(${P.oasis.x} ${P.oasis.y})`}>
            <Ellipse cx={0} cy={0} rx={38} ry={13} fill="#7CC46A" />
            <Ellipse cx={0} cy={0} rx={31} ry={9.5} fill="#3FB8E8" stroke={OL} strokeWidth={2.2} />
            <Ellipse cx={-8} cy={-2} rx={12} ry={2.4} fill="#A8E6FF" opacity={0.85} />
          </G>
          {live
            ? null
            : P.palms.map((p, i) => <DecorSprite key={i} kind="palm" x={p.x} y={p.y} scale={0.72} flip={i === 1} seed={i} />)}
        </G>
      );
    }
    case 'mine': {
      return (
        <G>
          <G transform={`translate(${x} ${y}) scale(${s} 1)`}>
            <Ellipse cx={0} cy={58} rx={86} ry={10} fill="rgba(0,0,0,0.25)" />
            <Path d="M-84 56 L-74 14 L-60 -14 L-42 -40 L-20 -62 L2 -56 L18 -74 L40 -52 L58 -28 L70 2 L84 56 Z" fill="#7A7385" stroke={OL} strokeWidth={SW} strokeLinejoin="round" />
            <Path d="M18 -74 L40 -52 L58 -28 L70 2 L84 56 H40 L50 10 L34 -28 Z" fill="#655E70" />
            <Path d="M-60 -14 L-42 -40 L-20 -62 L-30 -30 Z" fill="#958EA0" />
            <Path d="M-84 56 L-74 14 L-60 -14 L-42 -40 L-20 -62 L2 -56 L18 -74 L40 -52 L58 -28 L70 2 L84 56" fill="none" stroke={OL} strokeWidth={SW} strokeLinejoin="round" />
            <Path d="M-62 30 L-48 18 M44 30 L56 40 M-4 -40 L8 -30" stroke="#5A5366" strokeWidth={2} strokeLinecap="round" />
            {/* rails qui sortent de la galerie */}
            <Path d="M-14 56 L-22 104 M-6 56 L2 104" stroke="#5E4026" strokeWidth={1} />
            {[62, 74, 87, 100].map((ty, i) => (
              <Line key={ty} x1={-20 - i * 1.6} y1={ty} x2={0 + i * 1.6} y2={ty} stroke="#6E4A2A" strokeWidth={4} strokeLinecap="round" />
            ))}
            <Path d="M-15 56 L-23 104 M-5 56 L3 104" stroke={OL} strokeWidth={4} strokeLinecap="round" />
            <Path d="M-15 56 L-23 104 M-5 56 L3 104" stroke="#C9D1DA" strokeWidth={1.8} strokeLinecap="round" />
            {/* entrée */}
            <Path d="M-34 56 V18 Q-10 -6 14 18 V56 Z" fill="#1C1820" />
            <Path d="M-28 56 V24 Q-10 4 8 24 V56 Z" fill="#0F0C12" opacity={0.8} />
            <Rect x={-40} y={10} width={8} height={46} fill="#8A5A2E" stroke={OL} strokeWidth={2.2} />
            <Rect x={12} y={10} width={8} height={46} fill="#8A5A2E" stroke={OL} strokeWidth={2.2} />
            <Rect x={-46} y={2} width={72} height={10} rx={1.5} fill="#A8743F" stroke={OL} strokeWidth={2.2} />
            <Path d="M-42 7 H22" stroke="#7A5230" strokeWidth={1.4} />
            <Line x1={-39} y1={12} x2={-39} y2={14} stroke={OL} strokeWidth={1.4} />
            <Line x1={19} y1={12} x2={19} y2={14} stroke={OL} strokeWidth={1.4} />
            <G transform="translate(-39 13) scale(0.85)">
              <LanternBody />
            </G>
            <G transform="translate(19 13) scale(0.85)">
              <LanternBody />
            </G>
            <G transform="translate(50 46) scale(1.25)">
              <Crystals colors={['#2FB7DA', '#7FE8FF', '#1A8FB5']} glow="#5FD8F0" />
            </G>
            <G transform="translate(34 -28) scale(0.8)">
              <Crystals colors={['#7C63F0', '#B39DFF', '#5A44C8']} />
            </G>
          </G>
          {live ? null : (
            <G transform={`translate(${x - s * 10} ${y + 90}) scale(0.95)`}>{newDecor('minecart', 0, false, false)}</G>
          )}
        </G>
      );
    }
    case 'skyIslands': {
      if (live) return null;
      const I = ISLANDS(x, y, s);
      return (
        <G>
          {I.map((p, i) => (
            <G key={i} transform={`translate(${p.x} ${p.y}) scale(${p.k * s} ${p.k})`}>
              {i === 0 ? <Rect x={WATERFALL.x} y={WATERFALL.y} width={WATERFALL.w} height={WATERFALL.h} fill="#8FDBFF" opacity={0.85} /> : null}
              {i === 0 ? <Path d={`M${WATERFALL.x + 3} 10 V${WATERFALL.h - 10} M${WATERFALL.x + 8} 20 V${WATERFALL.h - 30}`} stroke="#FFFFFF" strokeWidth={2} strokeDasharray="10 8" /> : null}
              <SkyIsland main={i === 0} />
            </G>
          ))}
        </G>
      );
    }
    case 'skyline': {
      const B = SKYLINE(x, y, s);
      const bld = SKYLINE_BLD;
      return (
        <G transform={`translate(${B.base.x} ${B.base.y}) scale(${s} 1)`}>
          <Ellipse cx={0} cy={3} rx={84} ry={9} fill="rgba(0,0,0,0.3)" />
          <Rect x={-80} y={-110} width={160} height={110} fill="#FF4FD8" opacity={0.06} />
          {bld.map(([x0, x1, top, c, neon], bi) => (
            <G key={bi}>
              <Rect x={x0} y={top} width={x1 - x0} height={-top} fill={c} stroke={OL} strokeWidth={SW} />
              <Rect x={x1 - (x1 - x0) * 0.25} y={top} width={(x1 - x0) * 0.25} height={-top} fill="rgba(0,0,0,0.2)" />
              {Array.from({ length: Math.floor((-top - 14) / 11) }, (_, r) =>
                Array.from({ length: Math.floor((x1 - x0 - 6) / 8) }, (_, ci) => {
                  const lit = (bi * 11 + r * 7 + ci * 5) % 5;
                  return <Rect key={`${r}-${ci}`} x={x0 + 5 + ci * 8} y={top + 8 + r * 11} width={4.4} height={6} fill={lit === 0 ? '#5FF2FF' : lit < 3 ? '#FFE27A' : '#1E2236'} />;
                }),
              )}
              <Path d={`M${x0 + 1} ${top + 2} H${x1 - 1}`} stroke={neon} strokeWidth={2.4} />
              <Path d={`M${x0 + 1} ${top + 2} H${x1 - 1}`} stroke={neon} strokeWidth={7} opacity={0.25} />
            </G>
          ))}
          <Path d="M-34 -160 L-30 -172 L-26 -160 Z" fill="#46507A" stroke={OL} strokeWidth={1.8} strokeLinejoin="round" />
          <Line x1={-30} y1={-172} x2={-30} y2={-184} stroke={OL} strokeWidth={2} />
          {live ? null : <Circle cx={-30} cy={-186} r={3} fill="#FF4F6E" stroke={OL} strokeWidth={1.2} />}
          {/* panneau géant */}
          <Rect x={-6} y={-104} width={30} height={22} rx={3} fill="#151829" stroke={OL} strokeWidth={2.2} />
          <G transform="translate(9 -71) scale(0.6)">
            <NeonShape seed={0} bright={!live} />
          </G>
          {/* boutiques au pied des tours */}
          <Rect x={-70} y={-24} width={40} height={24} fill="#2E3450" stroke={OL} strokeWidth={2.2} />
          <Rect x={-66} y={-18} width={32} height={12} fill="#FFE27A" opacity={0.9} />
          <Path d="M-72 -26 H-28" stroke="#5FF2FF" strokeWidth={3} />
          <Rect x={34} y={-20} width={32} height={20} fill="#3A2F58" stroke={OL} strokeWidth={2.2} />
          <Rect x={38} y={-14} width={11} height={14} fill="#1A1D2E" />
          <Rect x={52} y={-15} width={10} height={8} fill="#FF4FD8" opacity={0.8} />
          <Path d="M32 -22 H68" stroke="#FF4FD8" strokeWidth={3} />
        </G>
      );
    }
    case 'moonBase': {
      return (
        <G transform={`translate(${x} ${y}) scale(${s} 1)`}>
          {/* grand cratère */}
          <Ellipse cx={4} cy={66} rx={70} ry={24} fill="#D9DCE4" stroke={OL} strokeWidth={SW} />
          <Ellipse cx={4} cy={67} rx={56} ry={16} fill="#8A8FA3" />
          <Path d="M-46 72 Q4 92 54 72 Q4 84 -46 72 Z" fill="#AEB2C2" />
          <Path d="M-58 56 Q-20 40 30 42" stroke="#F4F5F8" strokeWidth={3} fill="none" strokeLinecap="round" />
          {/* panneaux solaires */}
          <Line x1={62} y1={18} x2={62} y2={-14} stroke={OL} strokeWidth={3} />
          <Ellipse cx={62} cy={19} rx={8} ry={2.4} fill="rgba(0,0,0,0.2)" />
          <G transform="rotate(-12 62 -20)">
            <Rect x={46} y={-30} width={32} height={16} fill="#2B3A66" stroke={OL} strokeWidth={2} />
            <Path d="M54 -30 V-14 M62 -30 V-14 M70 -30 V-14 M46 -22 H78" stroke="#5A78C8" strokeWidth={1.2} />
          </G>
          {/* antenne */}
          <Line x1={24} y1={-20} x2={24} y2={-60} stroke={OL} strokeWidth={3} />
          <Line x1={24} y1={-20} x2={24} y2={-60} stroke="#E3E6EE" strokeWidth={1.4} />
          <Path d="M16 -50 Q24 -44 32 -50" stroke={OL} strokeWidth={2} fill="#F2F3F7" />
          {live ? null : <Circle cx={24} cy={-62} r={3} fill="#FF4F6E" stroke={OL} strokeWidth={1.2} />}
          {/* dômes */}
          <Ellipse cx={-10} cy={20} rx={70} ry={8} fill="rgba(0,0,0,0.18)" />
          <Rect x={-36} y={10} width={20} height={9} fill="#ECEEF3" stroke={OL} strokeWidth={1.8} />
          <Path d="M-62 20 A16 16 0 0 1 -30 20 Z" fill="#BFE3FF" stroke={OL} strokeWidth={2.2} />
          <Path d="M-55 14 Q-52 8 -46 6" stroke="#FFFFFF" strokeWidth={2} fill="none" strokeLinecap="round" />
          <Rect x={-64} y={19} width={36} height={6} rx={2} fill="#ECEEF3" stroke={OL} strokeWidth={1.8} />
          <Path d="M-24 12 A32 32 0 0 1 40 12 Z" fill="#BFE3FF" stroke={OL} strokeWidth={SW} />
          <Path d="M-24 12 A32 32 0 0 1 40 12 M8 -20 V12 M-14 -8 Q8 -2 30 -8 M-20 2 Q8 8 36 2" stroke="#FFFFFF" strokeWidth={1.6} fill="none" opacity={0.85} />
          <Path d="M-12 -2 Q-8 -14 4 -18" stroke="#FFFFFF" strokeWidth={3} fill="none" strokeLinecap="round" />
          <Rect x={-28} y={10} width={72} height={8} rx={2} fill="#ECEEF3" stroke={OL} strokeWidth={2} />
          <Rect x={2} y={0} width={12} height={12} rx={2} fill="#5A6BA8" stroke={OL} strokeWidth={1.6} />
          {live
            ? null
            : [-20, 0, 20, 38].map((lx) => <Circle key={lx} cx={lx} cy={14} r={1.8} fill="#5FF2FF" />).concat([-58, -38].map((lx) => <Circle key={lx} cx={lx} cy={22} r={1.6} fill="#FFE45C" />))}
        </G>
      );
    }
  }
  return null;
}
