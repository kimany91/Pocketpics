/**
 * La carte de l'aventure solo : une longue route qui serpente vers le haut à
 * travers les 21 mondes, du Parc jusqu'à la Galerie. Chaque monde a son sol,
 * ses décors, son grand décor, son panneau, et son adversaire qui attend à
 * côté de son boss. Juste après la Tempête, le sanctuaire de la Divine
 * barre la route tant que la Divine n'est pas débloquée ; tout en haut, la
 * route file droit jusqu'au Grand Portrait.
 *
 * Chaque monde est un SVG à part (une seule image géante serait trop lourde
 * sur téléphone) ; la route est tracée en entier dans chacun, et chaque SVG
 * n'en montre que sa tranche.
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { G, Path, Rect } from 'react-native-svg';

import { ARENAS, portraitRef } from '../../battle/arenas';
import { botArt } from '../../battle/botArt';
import { DIVINE_GATE, TOTAL_LEVELS, WORLDS, firstLevel, getLevel, lastLevel, needsDivine, worldOf } from '../../battle/levels';
import { colors, fonts } from '../../theme';
import { AppText } from '../AppText';
import { Embers, Glow, Twinkles } from '../fx';
import { DecorSprite, GRAND, HeroDecor, MoonSky, Road, Texture } from './decor';
import { WorldLive, isLive } from './live';
import { type MapLayout, ROAD_W, type WorldArea, mapLayout } from './mapLayout';
import { PlayerPin } from './Pin';
import { type Rect4, SanctuarySection, type SanctuaryState } from './Sanctuary';
import { OUTLINE, SKY_H, WORLD_LOOKS } from './worlds';

/** Portrait de l'adversaire du monde à la place w (illustration de sa meilleure carte, d'après l'id fixe du monde). */
const portraitOf = (w: number) => botArt(portraitRef(ARENAS[w - 1]));

/* --------------------------------- Mondes --------------------------------- */

/** `alive` : le monde est près de l'écran, ses décors s'animent (sinon, dessin immobile, plus léger). */
const WorldSection = memo(function WorldSection({ area, layout, alive }: { area: WorldArea; layout: MapLayout; alive: boolean }) {
  const look = WORLD_LOOKS[area.w - 1];
  const next = area.nextGround;
  const h = area.bottom - area.top;
  const W = layout.width;
  // bord ondulé du monde suivant (ou du sanctuaire), en haut de celui-ci
  let wave = '';
  if (next) {
    const t = area.top;
    wave = `M0 ${t} H${W} V${t + 16}`;
    for (let x = W; x > 0; x -= 44) wave += ` Q${x - 11} ${t + 34} ${x - 22} ${t + 18} Q${x - 33} ${t + 4} ${x - 44} ${t + 16}`;
    wave += ' Z';
  }
  return (
    <View style={{ position: 'absolute', left: 0, top: area.top, width: W, height: h }} pointerEvents="none">
      <Svg width={W} height={h} viewBox={`0 ${area.top} ${W} ${h}`}>
        <Rect x={0} y={area.top} width={W} height={h} fill={look.ground} />
        {area.texture.map((p, i) => (
          <Texture key={i} kind={look.texture} x={p.x} y={p.y} color={look.speck} />
        ))}
        {next ? (
          <G>
            <Path d={wave} fill={next} />
            <Path d={wave} fill="none" stroke="rgba(0,0,0,0.18)" strokeWidth={3} />
          </G>
        ) : null}
        {/* en haut de la Lune : le ciel noir ; la route le traverse vers la Galerie */}
        {look.sky && area.sky ? (
          <G transform={`translate(0 ${area.top})`}>
            <MoonSky width={W} h={SKY_H} sky={look.sky} earth={{ x: area.sky.earth.x, y: area.sky.earth.y - area.top }} live={alive} />
          </G>
        ) : null}
        <HeroDecor kind={area.hero.kind} x={area.hero.x} y={area.hero.y} side={area.hero.side} width={W} live={alive} />
        {/* route : ombre, bordure, chaussée, pointillés (ou planches, rails, néons, tapis) */}
        <Road d={layout.road} look={look} w={ROAD_W} rails={area.rails} />
        {area.decor.map((d, i) => (alive && isLive(d.kind) ? null : <DecorSprite key={i} {...d} seed={i + area.w * 13} />))}
        {area.ropes ? (
          <G>
            {[area.ropes.left, area.ropes.right].map((d, i) => (
              <G key={i}>
                <Path d={d} stroke={OUTLINE} strokeWidth={5} fill="none" strokeLinecap="round" />
                <Path d={d} stroke="#B3132F" strokeWidth={2.8} fill="none" strokeLinecap="round" />
                <Path d={d} stroke="#FF6B86" strokeWidth={0.9} fill="none" opacity={0.6} />
              </G>
            ))}
          </G>
        ) : null}
      </Svg>
      {look.straight ? <GrandPortrait area={area} /> : null}
      <WorldLife area={area} width={W} />
      {alive ? <WorldLive area={area} width={W} liveDecor={area.decor.flatMap((d, i) => (isLive(d.kind) ? [{ d, seed: i + area.w * 13 }] : []))} /> : null}
    </View>
  );
});

/**
 * Toile et plaque du Grand Portrait : l'illustration du boss final se pose dans
 * le cadre doré dès qu'elle existe (sinon, la toile sombre dessinée reste).
 */
function GrandPortrait({ area }: { area: WorldArea }) {
  const art = portraitOf(area.w);
  const { x, y } = area.hero;
  const local = y - area.top;
  const iw = GRAND.w - GRAND.border * 2;
  const ih = GRAND.h - GRAND.border * 2;
  return (
    <>
      {art !== undefined ? <Image source={art} resizeMode="cover" style={[styles.abs, { left: x - iw / 2, top: local - ih / 2, width: iw, height: ih }]} /> : null}
      <View style={[styles.abs, { left: x - 80, top: local + GRAND.h / 2 - 14, width: 160, height: 24, alignItems: 'center', justifyContent: 'center' }]}>
        <AppText style={styles.plaque} numberOfLines={1}>
          {ARENAS[area.w - 1]?.bot.toUpperCase()}
        </AppText>
      </View>
    </>
  );
}

/** Ce qui bouge dans un monde : braises du volcan, éclairs, étoiles, lumière du phare. */
function WorldLife({ area, width }: { area: WorldArea; width: number }) {
  const { kind, x, y } = area.hero;
  const local = { x, y: y - area.top };
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (kind === 'storm') {
      pulse.value = withRepeat(withSequence(withDelay(2200, withTiming(1, { duration: 60 })), withTiming(0.2, { duration: 80 }), withTiming(0.9, { duration: 60 }), withTiming(0, { duration: 500 })), -1);
    } else {
      pulse.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.sin) }), -1, true);
    }
    return () => cancelAnimation(pulse);
  }, [kind, pulse]);
  const glow = useAnimatedStyle(() => ({ opacity: 0.35 + pulse.value * 0.55 }));
  const flash = useAnimatedStyle(() => ({ opacity: pulse.value * 0.22 }));
  const h = area.bottom - area.top;
  if (kind === 'volcano')
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Animated.View style={[styles.abs, { left: local.x - 70, top: local.y - 70 }, glow]}>
          <Glow color="#FF7A2C" size={140} />
        </Animated.View>
        <View style={[styles.abs, { left: local.x - 60, top: local.y - 240, width: 120, height: 220 }]}>
          <Embers width={120} height={220} colors={['#FF7A2C', '#FFD54F']} count={10} speed={1.4} size={12} />
        </View>
      </View>
    );
  if (kind === 'storm')
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#E8E4FF' }, flash]} />
        <Animated.View style={[styles.abs, { left: local.x - 60, top: local.y - 30 }, glow]}>
          <Glow color="#FFE14D" size={120} />
        </Animated.View>
      </View>
    );
  if (kind === 'ringPlanet')
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Twinkles width={width} height={h} count={16} colors={['#FFFFFF', '#D9CCFF', '#FFE9A8']} size={0.05} />
      </View>
    );
  if (kind === 'lighthouse')
    return (
      <Animated.View style={[styles.abs, { left: local.x - 60, top: local.y + 30 - 148 }, glow]} pointerEvents="none">
        <Glow color="#FFE27A" size={120} />
      </Animated.View>
    );
  return null;
}

/* --------------------------------- Niveaux -------------------------------- */

/**
 * done : gagné (au moins 1 étoile) ; open : derrière le joueur mais jamais
 * gagné (monde ajouté après coup dans une ancienne sauvegarde), jouable ;
 * current : le prochain niveau ; locked : pas encore accessible.
 */
type NodeState = 'done' | 'open' | 'current' | 'locked';

function LevelNode({ n, state, stars, onPress }: { n: number; state: NodeState; stars: number; onPress(): void }) {
  const level = getLevel(n);
  const boss = !!level?.boss;
  const w = worldOf(n);
  const look = WORLD_LOOKS[w - 1];
  const art = boss ? portraitOf(w) : undefined;
  const size = boss ? 68 : 54;
  const locked = state === 'locked';

  const pulse = useSharedValue(0);
  useEffect(() => {
    if (state !== 'current') return;
    pulse.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }), -1);
    return () => cancelAnimation(pulse);
  }, [state, pulse]);
  const ring = useAnimatedStyle(() => ({ opacity: (1 - pulse.value) * 0.7, transform: [{ scale: 1 + pulse.value * 0.6 }] }));

  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Niveau ${n}${boss ? ', boss' : ''}${locked ? ', verrouillé' : state === 'done' ? `, ${stars} étoile${stars > 1 ? 's' : ''}` : ', à jouer'}`} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={[styles.nodeShadow, { width: size * 0.9, height: size * 0.3, top: size * 0.82, borderRadius: size }]} />
      {state === 'current' ? <Animated.View style={[styles.abs, { width: size, height: size, borderRadius: size, borderWidth: 4, borderColor: '#FFFFFF' }, ring]} /> : null}
      <View style={[styles.nodeOuter, { width: size, height: size, borderRadius: size / 2 }]}>
        <LinearGradient pointerEvents="none"
          colors={locked ? ['#C9CDD3', '#8C929B'] : boss ? ['#FFE9A0', '#F2A922', '#B8761A'] : ['#FFF0A8', '#F6C33C', '#C98C1C']}
          style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
        />
        <View style={[styles.nodeInner, { width: size - 14, height: size - 14, borderRadius: size, backgroundColor: locked ? '#6E747D' : look.node }, state === 'open' && styles.nodeOpen]}>
          {boss && !locked && art !== undefined ? (
            <Image source={art} style={{ width: size - 16, height: size - 16, borderRadius: size }} />
          ) : boss && !locked ? (
            <Ionicons name="sparkles" size={size * 0.38} color="#FFE29A" />
          ) : locked ? (
            <Ionicons name="lock-closed" size={size * 0.32} color="#D7DBE0" />
          ) : (
            <AppText style={[styles.nodeNum, { fontSize: n >= 100 ? 16 : n >= 10 ? 19 : 22 }]}>{n}</AppText>
          )}
        </View>
      </View>
      {boss ? (
        <View style={[styles.abs, { top: -20 }]}>
          <Svg width={36} height={24} viewBox="0 0 36 24">
            <Path d="M3 21 L5 6 L12 13 L18 2 L24 13 L31 6 L33 21 Z" fill={locked ? '#9AA0A8' : '#FFD54F'} stroke={OUTLINE} strokeWidth={2.4} strokeLinejoin="round" />
          </Svg>
        </View>
      ) : null}
      {state === 'open' && !boss ? (
        <View style={styles.newTag}>
          <AppText style={styles.newText}>!</AppText>
        </View>
      ) : null}
      {boss ? (
        <View style={[styles.bossTag, locked && { backgroundColor: '#6E747D' }]}>
          <AppText style={styles.bossText} numberOfLines={1}>{`BOSS · ${n}`}</AppText>
        </View>
      ) : null}
      {state === 'done' ? (
        <View style={[styles.stars, { top: boss ? -40 : -20 }]}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ transform: [{ translateY: i === 1 ? -5 : 0 }] }}>
              <Ionicons name="star" size={17} color={i < stars ? '#FFD54F' : 'rgba(0,0,0,0.35)'} style={styles.starIcon} />
            </View>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

function WorldSign({ area }: { area: WorldArea }) {
  const level = getLevel(firstLevel(area.w));
  if (!level) return null;
  const look = WORLD_LOOKS[area.w - 1];
  return (
    <View style={[styles.abs, { left: area.sign.x - 90, top: area.sign.y - 34, width: 180, alignItems: 'center' }]} pointerEvents="none">
      <View style={[styles.sign, { backgroundColor: look.node, transform: [{ rotate: `${area.sign.side * -3}deg` }] }]}>
        <AppText style={styles.signKicker}>{`Monde ${area.w}`}</AppText>
        <AppText style={styles.signName} numberOfLines={1}>
          {level.world.place.toUpperCase()}
        </AppText>
      </View>
      <View style={styles.signPost} />
    </View>
  );
}

function Mascot({ area, defeated }: { area: WorldArea; defeated: boolean }) {
  const level = getLevel(lastLevel(area.w));
  const bob = useSharedValue(0);
  useEffect(() => {
    bob.value = withRepeat(withTiming(1, { duration: 1500 + area.w * 70, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(bob);
  }, [bob, area.w]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -bob.value * 5 }, { rotate: `${(bob.value - 0.5) * 6}deg` }] }));
  if (!level) return null;
  return (
    <Animated.View style={[styles.abs, { left: area.mascot.x - 60, top: area.mascot.y - 44, width: 120, alignItems: 'center' }, style]} pointerEvents="none">
      <View style={[styles.mascotRing, { borderColor: WORLD_LOOKS[area.w - 1].node }]}>
        <Image source={portraitOf(area.w)} style={[styles.mascotImg, defeated && { opacity: 0.55 }]} />
      </View>
      <View style={styles.mascotName}>
        <AppText style={styles.mascotText} numberOfLines={1}>
          {defeated ? `${level.world.bot} ✓` : level.world.bot}
        </AppText>
      </View>
    </Animated.View>
  );
}

/* ---------------------------------- Carte --------------------------------- */

/** « La Lune » → « la Lune », pour la phrase du haut de la carte. */
const lastPlace = (() => {
  const p = ARENAS[WORLDS - 1]?.place ?? '';
  return /^(Le|La|Les|L') ?/.test(p) ? p.charAt(0).toLowerCase() + p.slice(1) : p;
})();

export function SagaMap({
  cleared,
  stars,
  playerInitial,
  onPick,
  divineUnlocked,
  onSanctuary,
  focusKey = 0,
  topInset = 0,
}: {
  /** Niveaux terminés (le suivant est à jouer). */
  cleared: number;
  stars: number[];
  playerInitial: string;
  onPick(n: number): void;
  /** La Divine a été débloquée au sanctuaire (sinon les niveaux suivants restent fermés). */
  divineUnlocked: boolean;
  /** La carte Divine touchée quand le sanctuaire est atteint : sa place à l'écran. */
  onSanctuary(from: Rect4): void;
  /** Changer cette valeur fait défiler la carte jusqu'au niveau à jouer. */
  focusKey?: number;
  topInset?: number;
}) {
  const { width, height } = useWindowDimensions();
  const layout = mapLayout(width);
  const scroll = useRef<ScrollView>(null);
  const current = Math.min(TOTAL_LEVELS, cleared + 1);
  /** La Tempête est battue mais la Divine pas encore débloquée : le joueur attend au sanctuaire. */
  const gated = cleared >= DIVINE_GATE && !divineUnlocked;
  const sanctuaryState: SanctuaryState = cleared < DIVINE_GATE ? 'far' : divineUnlocked ? 'open' : 'ready';
  const focusY = (gated ? layout.sanctuary.y : layout.nodes[current - 1].y) - height * 0.55;
  const startY = Math.max(0, Math.min(layout.height - height, focusY));

  // Mondes animés : ceux qui touchent l'écran (avec une marge), recalculés au défilement ; « s » : le sanctuaire.
  const aliveFor = (y: number) => {
    const near = (top: number, bottom: number) => bottom > y - 250 && top < y + height + 250;
    const ids: string[] = layout.worlds.filter((a) => near(a.top, a.bottom)).map((a) => String(a.w));
    if (near(layout.sanctuary.top, layout.sanctuary.bottom)) ids.push('s');
    return ids.join(',');
  };
  const [alive, setAlive] = useState(() => aliveFor(startY));
  const aliveSet = new Set(alive.split(','));

  // Au départ, on centre la carte sur le niveau à jouer (ou sur le sanctuaire).
  useEffect(() => {
    const t = setTimeout(() => scroll.current?.scrollTo({ y: startY, animated: false }), 30);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]);
  // Sur demande (après la cérémonie), on glisse jusqu'au niveau à jouer.
  useEffect(() => {
    if (!focusKey) return;
    const t = setTimeout(() => scroll.current?.scrollTo({ y: startY, animated: true }), 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  return (
    <ScrollView
      ref={scroll}
      style={{ flex: 1, backgroundColor: WORLD_LOOKS[0].ground }}
      contentContainerStyle={{ height: layout.height }}
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={120}
      onScroll={(e) => {
        const next = aliveFor(e.nativeEvent.contentOffset.y);
        if (next !== alive) setAlive(next);
      }}
    >
      {layout.worlds.map((a) => (
        <WorldSection key={a.w} area={a} layout={layout} alive={aliveSet.has(String(a.w))} />
      ))}
      <SanctuarySection
        s={layout.sanctuary}
        width={width}
        nextGround={WORLD_LOOKS[worldOf(DIVINE_GATE + 1) - 1].ground}
        alive={aliveSet.has('s')}
        state={sanctuaryState}
        playerInitial={playerInitial}
        onUnlock={onSanctuary}
      />
      {layout.worlds.map((a) => (
        <WorldSign key={`s${a.w}`} area={a} />
      ))}
      {layout.worlds.map((a) =>
        WORLD_LOOKS[a.w - 1].straight ? null : <Mascot key={`m${a.w}`} area={a} defeated={(stars[lastLevel(a.w) - 1] ?? 0) > 0} />,
      )}
      {layout.nodes.map((p, i) => {
        const n = i + 1;
        const boss = !!getLevel(n)?.boss;
        const size = boss ? 68 : 54;
        const won = (stars[i] ?? 0) > 0;
        // après le sanctuaire, rien ne se joue tant que la Divine n'est pas débloquée (les niveaux gagnés gardent leurs étoiles)
        const barred = needsDivine(n) && !divineUnlocked;
        const state: NodeState = won ? 'done' : barred ? 'locked' : n <= cleared ? 'open' : n === current && cleared < TOTAL_LEVELS ? 'current' : 'locked';
        return (
          <View key={n} style={[styles.abs, { left: p.x - size / 2, top: p.y - size / 2 }]}>
            <LevelNode n={n} state={state} stars={stars[i] ?? 0} onPress={() => onPick(n)} />
            {state === 'current' && !gated ? (
              <View style={[styles.abs, { left: size / 2 - 20, top: boss ? -86 : -62 }]}>
                <PlayerPin initial={playerInitial} />
              </View>
            ) : null}
          </View>
        );
      })}
      {/* haut de la carte : un voile pour la fin de l'aventure */}
      <LinearGradient colors={['rgba(9,9,11,0.85)', 'rgba(9,9,11,0)']} style={[styles.abs, { left: 0, right: 0, top: 0, height: 140 + topInset }]} pointerEvents="none" />
      <View style={[styles.abs, { top: 50 + topInset, left: 0, right: 0, alignItems: 'center' }]} pointerEvents="none">
        <AppText style={styles.end}>{cleared >= TOTAL_LEVELS ? 'Aventure terminée !' : `Tout en haut : ${lastPlace}`}</AppText>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  nodeShadow: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.28)' },
  nodeOuter: { borderWidth: 3, borderColor: OUTLINE, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  nodeInner: { borderWidth: 2.5, borderColor: OUTLINE, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  nodeNum: { fontFamily: fonts.black, color: '#FFFFFF', textShadowColor: OUTLINE, textShadowOffset: { width: 1.5, height: 2 }, textShadowRadius: 0 },
  bossTag: { position: 'absolute', bottom: -12, width: 74, alignItems: 'center', height: 19, borderRadius: 6, backgroundColor: '#C8283C', borderWidth: 2, borderColor: OUTLINE, justifyContent: 'center' },
  bossText: { fontFamily: fonts.black, fontSize: 10, color: '#FFFFFF', letterSpacing: 0.5 },
  stars: { position: 'absolute', flexDirection: 'row', gap: 1 },
  plaque: { fontFamily: fonts.black, fontSize: 10, letterSpacing: 0.6, color: '#4A2A00' },
  nodeOpen: { borderColor: '#FFFFFF' },
  newTag: { position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: '#FF4F6E', borderWidth: 2.5, borderColor: OUTLINE, alignItems: 'center', justifyContent: 'center' },
  newText: { fontFamily: fonts.black, fontSize: 13, lineHeight: 16, color: '#FFFFFF' },
  starIcon: { textShadowColor: OUTLINE, textShadowOffset: { width: 0, height: 1.5 }, textShadowRadius: 1 },
  sign: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 10, borderWidth: 3, borderColor: OUTLINE, alignItems: 'center', minWidth: 120 },
  signKicker: { fontFamily: fonts.bold, fontSize: 10, letterSpacing: 1.2, color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase' },
  signName: { fontFamily: fonts.black, fontSize: 19, color: '#FFFFFF', letterSpacing: 0.5, textShadowColor: OUTLINE, textShadowOffset: { width: 1.5, height: 2 }, textShadowRadius: 0 },
  signPost: { width: 8, height: 18, backgroundColor: '#8A5A2E', borderWidth: 2, borderTopWidth: 0, borderColor: OUTLINE },
  mascotRing: { width: 60, height: 60, borderRadius: 30, borderWidth: 4, backgroundColor: '#FFFFFF', overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 6, shadowOffset: { width: 0, height: 4 } },
  mascotImg: { width: '100%', height: '100%' },
  mascotName: { marginTop: -8, paddingHorizontal: 8, height: 20, borderRadius: 6, backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: OUTLINE, justifyContent: 'center' },
  mascotText: { fontFamily: fonts.black, fontSize: 11, color: '#141414' },
  end: { fontFamily: fonts.black, fontSize: 14, color: colors.text, letterSpacing: 0.5, opacity: 0.8 },
});
