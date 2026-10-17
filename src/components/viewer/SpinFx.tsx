/**
 * Effet déclenché quand on fait tourner vite une carte : rien pour une Commune,
 * puis de plus en plus grandiose avec la rareté.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { Rarity } from '../../game/rarity';
import { Burst, Flash, Glow, LightPillar, Rays, Shockwave } from '../fx';

const CHROMA = ['#FF7EB3', '#FFE07A', '#8CFFB4', '#7CCBFF', '#C9A6FF'];
const GOLD = ['#F7C948', '#FFF1B8', '#E0A526'];
const DIVINE = ['#FFFFFF', '#FFE7A0', '#FFB3DA', '#A6E4FF', '#F5CF63'];
const GALAXY = ['#B98CFF', '#FF5FCB', '#3FD0FF', '#FFFFFF', '#6F7BFF'];

function palette(r: Rarity) {
  if (r.frameStyle === 'galaxy') return GALAXY;
  if (r.frameStyle === 'divine') return DIVINE;
  if (r.frameStyle === 'chromatic') return CHROMA;
  if (r.frameStyle === 'gold') return GOLD;
  return [r.color, '#FFFFFF'];
}

/** Temps minimum entre deux effets, pour laisser le son de la rareté se jouer. */
export function spinCooldown(rank: number) {
  if (rank >= 6) return 2800;
  if (rank >= 5) return 2200;
  if (rank >= 3) return 1400;
  return 900;
}

export function SpinFx({ trigger, rarity, cardW, screenW, screenH }: { trigger: number; rarity: Rarity; cardW: number; screenW: number; screenH: number }) {
  const rank = rarity.rank;
  const [rays, setRays] = useState(false);
  useEffect(() => {
    if (trigger <= 0 || rank < 5) return;
    setRays(true);
    const t = setTimeout(() => setRays(false), 1500);
    return () => clearTimeout(t);
  }, [trigger, rank]);
  if (rank < 1) return null;
  const colors = palette(rarity);
  const count = [0, 10, 16, 22, 30, 42, 56, 76, 90][Math.min(rank, 8)] ?? 0;
  const galaxy = rarity.frameStyle === 'galaxy';
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={styles.center}>
        {rank >= 5 ? <Rays colors={galaxy ? ['#B98CFF', '#3FD0FF', '#FF5FCB'] : rank >= 7 ? ['#FFE7A0', '#FFFFFF', '#FFB3DA'] : rank >= 6 ? ['#FF9AD0', '#7FD8FF', '#9DFFC5'] : ['#F7C948', '#FFF1B8']} size={screenW * 1.6} visible={rays} /> : null}
        {rank >= 5 ? <LightPillar trigger={trigger} color={rarity.color} width={cardW * 1.1} height={screenH * 1.2} /> : null}
        {rank >= 3 ? <PulseGlow trigger={trigger} color={rarity.color} size={cardW * 2.6} /> : null}
        <Shockwave key={`a${trigger}`} trigger={rank >= 2 ? trigger : 0} color={rarity.color} size={cardW * 1.1} />
        <Shockwave key={`b${trigger}`} trigger={rank >= 3 ? trigger : 0} color={colors[1] ?? '#FFF'} size={cardW * 1.1} delay={130} />
        <Shockwave key={`c${trigger}`} trigger={rank >= 6 ? trigger : 0} color={colors[2] ?? '#FFF'} size={cardW * 1.1} delay={260} />
        <Burst trigger={trigger} colors={colors} count={count} radius={cardW * (rank >= 5 ? 1.5 : 1.05)} />
        {rank >= 7 ? <Burst trigger={trigger} colors={galaxy ? ['#FFFFFF', '#E6DBFF', '#8FE8FF'] : ['#FFFFFF', '#FFF6D8']} count={40} radius={cardW * 2.1} /> : null}
        {galaxy ? <Shockwave key={`d${trigger}`} trigger={trigger} color="#3FD0FF" size={cardW * 1.6} delay={380} /> : null}
      </View>
      {rank >= 4 ? <Flash trigger={trigger} color={rank >= 5 ? '#FFFFFF' : rarity.color} peak={rank >= 7 ? 0.6 : rank >= 5 ? 0.38 : 0.18} /> : null}
      {rank >= 7 ? <Flash trigger={trigger} color={galaxy ? '#B98CFF' : '#FFE7A0'} peak={0.3} /> : null}
    </View>
  );
}

function PulseGlow({ trigger, color, size }: { trigger: number; color: string; size: number }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (trigger <= 0) return;
    setOn(true);
    const t = setTimeout(() => setOn(false), 700);
    return () => clearTimeout(t);
  }, [trigger]);
  return on ? <Glow color={color} size={size} style={{ opacity: 0.8 }} /> : null;
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
});
