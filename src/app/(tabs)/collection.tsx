import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { type ComponentProps, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type ViewToken,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  Easing,
  type SharedValue,
  cancelAnimation,
  interpolate,
  interpolateColor,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AppText } from '../../components/AppText';
import { CardActions } from '../../components/card/CardActions';
import { CardFace } from '../../components/card/CardFace';
import { Screen } from '../../components/Screen';
import { RARITIES, getRarity } from '../../game/rarity';
import { type ThumbRect, registerThumb, useCollectionView } from '../../state/collectionView';
import { useGame } from '../../state/game';
import type { Card } from '../../storage/model';
import { CARD_RATIO, colors, fonts } from '../../theme';
import { haptic } from '../../utils/haptics';
import { useMotionTilt } from '../../utils/motionTilt';

const sparkleTex = require('../../../assets/fx/sparkle.png');

type IconName = ComponentProps<typeof Ionicons>['name'];

type Sort = 'recent' | 'rarity';

/** Valeur du filtre « favoris » (distincte de tout id de rareté). */
const FAVORITES = '__favorites__';
/** Valeur du filtre « épinglées sur le profil ». */
const PINNED = '__pinned__';
const GAP = 10;

/* ------------------------------------------------------------------------ */
/*  Entrées animées de la grille                                             */
/* ------------------------------------------------------------------------ */

/**
 * Comment une miniature arrive à sa place :
 *  - `pop` : elle apparaît en rebondissant (première ouverture, nouvelle carte du filtre) ;
 *  - `move` : elle glisse depuis son ancienne place (tri, filtre) ;
 *  - `none` : rien (cartes chargées plus tard en faisant défiler).
 */
interface Entry {
  kind: 'none' | 'pop' | 'move';
  dx: number;
  dy: number;
  delay: number;
}
const STILL: Entry = { kind: 'none', dx: 0, dy: 0, delay: 0 };
/** Au-delà, une carte rendue plus tard (en faisant défiler) arrive sans animation. */
const ENTRY_WINDOW = 650;

interface Transition {
  at: number;
  /** Ancienne place (index) de chaque carte, `null` pour la toute première ouverture. */
  prev: Map<string, number> | null;
  prevScroll: number;
  nextScroll: number;
  entries: Map<string, Entry>;
}

/* ------------------------------------------------------------------------ */
/*  Reflets occasionnels des cartes rares                                    */
/* ------------------------------------------------------------------------ */

/** Déclencheurs de reflet des miniatures montées (une seule boucle pour toute la grille). */
const sheens = new Map<string, () => void>();

export default function CollectionScreen() {
  const { width, height } = useWindowDimensions();
  const cards = useGame((s) => s.cards);
  const [filter, setFilter] = useState<string | null>(null);
  const openId = useCollectionView((s) => s.openId);
  // Inclinaison du téléphone pour les reflets, captée seulement quand l'onglet est à l'écran
  // et qu'il y a des cartes chromatiques à faire briller.
  const motion = useSharedValue(0);
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const hasHolo = useMemo(() => cards.some((c) => ['chromatic', 'divine', 'galaxy'].includes(getRarity(c.rarity).frameStyle)), [cards]);
  const favCount = useMemo(() => cards.filter((c) => c.favorite).length, [cards]);
  // Cartes épinglées sur le profil : repère dans la grille, filtre, et menu d'appui long.
  const pinned = useGame((s) => s.save?.pinned);
  const pinnedSet = useMemo(() => new Set(pinned ?? []), [pinned]);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>('recent');
  const cols = width > 600 ? 4 : 3;
  const cardW = (width - 32 - GAP * (cols - 1)) / cols;
  const rowStep = cardW * CARD_RATIO + GAP;
  const colStep = cardW + GAP;

  const listRef = useRef<FlatList<Card>>(null);
  const scrollY = useRef(0);
  const scrollTopNext = useRef(false);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cards) m.set(c.rarity, (m.get(c.rarity) ?? 0) + 1);
    return m;
  }, [cards]);

  const data = useMemo(() => {
    const list =
      filter === FAVORITES
        ? cards.filter((c) => c.favorite)
        : filter === PINNED
          ? cards.filter((c) => pinnedSet.has(c.id))
          : filter
            ? cards.filter((c) => c.rarity === filter)
            : [...cards];
    return list.sort((a, b) =>
      sort === 'rarity'
        ? getRarity(b.rarity).rank - getRarity(a.rarity).rank || b.obtainedAt - a.obtainedAt
        : b.obtainedAt - a.obtainedAt,
    );
  }, [cards, filter, sort, pinnedSet]);
  const dataRef = useRef(data);

  // À chaque nouvel ordre : on retient d'où vient chaque carte pour la faire glisser à sa nouvelle place.
  const prevData = useRef<Card[] | null>(null);
  const transition = useMemo<Transition>(() => {
    const before = prevData.current;
    const prevScroll = scrollY.current;
    return {
      at: Date.now(),
      prev: before ? new Map(before.map((c, i) => [c.id, i])) : null,
      prevScroll,
      nextScroll: scrollTopNext.current ? 0 : prevScroll,
      entries: new Map(),
    };
  }, [data]);
  useEffect(() => {
    prevData.current = data;
    dataRef.current = data;
    scrollTopNext.current = false;
  }, [data]);

  const visibleRows = Math.ceil(height / rowStep) + 1;
  const entryFor = (id: string, index: number): Entry => {
    const t = transition;
    // Passé ce délai, plus d'animation : une carte qui revient à l'écran en faisant défiler ne rebondit pas.
    if (Date.now() - t.at > ENTRY_WINDOW) return STILL;
    const cached = t.entries.get(id);
    if (cached) return cached;
    const row = Math.floor(index / cols);
    const col = index % cols;
    const y = row * rowStep - t.nextScroll;
    let e = STILL;
    if (y > -rowStep && y < height) {
      if (!t.prev) {
        // Première ouverture : vague en diagonale depuis le coin haut-gauche.
        e = { kind: 'pop', dx: 0, dy: 0, delay: 60 + (row + col) * 55 };
      } else {
        const old = t.prev.get(id);
        if (old === undefined) {
          e = { kind: 'pop', dx: 0, dy: 0, delay: 40 + (Math.max(0, Math.floor(y / rowStep)) + col) * 35 };
        } else {
          const oy = Math.floor(old / cols) * rowStep - t.prevScroll;
          const dx = (old % cols) * colStep - col * colStep;
          const dy = oy - y;
          if (dx === 0 && dy === 0) e = STILL;
          else if (oy < -rowStep * 1.5 || oy > height + rowStep * 0.5) e = { kind: 'pop', dx: 0, dy: 0, delay: 60 + (Math.max(0, Math.floor(y / rowStep)) + col) * 35 };
          else e = { kind: 'move', dx, dy, delay: 0 };
        }
      }
    }
    if (index < visibleRows * cols) t.entries.set(id, e);
    return e;
  };

  /** Prépare un changement de filtre ou de tri : la grille repart du haut. */
  const reorder = (fn: () => void) => {
    haptic.tick();
    if (scrollY.current > 0) {
      scrollTopNext.current = true;
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
    fn();
  };

  // Plus aucun favori (ou plus aucune épinglée) : on revient à toutes les cartes
  // plutôt que d'afficher une grille vide.
  useEffect(() => {
    if (filter === FAVORITES && favCount === 0) setFilter(null);
    if (filter === PINNED && pinnedSet.size === 0) setFilter(null);
  }, [filter, favCount, pinnedSet]);

  // Cartes visibles, pour faire briller de temps en temps une carte rare à l'écran (une ou deux à la fois).
  const visible = useRef<string[]>([]);
  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken<Card>[] }) => {
    visible.current = viewableItems.filter((v) => v.item && getRarity(v.item.rarity).rank >= 1).map((v) => v.item.id);
  }).current;
  const rankOf = useMemo(() => new Map(cards.map((c) => [c.id, getRarity(c.rarity).rank])), [cards]);
  useEffect(() => {
    if (!focused || openId) return;
    const recent: string[] = [];
    const t = setInterval(() => {
      const pool = visible.current.filter((id) => !recent.includes(id) && sheens.has(id));
      if (!pool.length) return;
      // Les plus rares brillent plus souvent.
      const w = pool.map((id) => 1 + (rankOf.get(id) ?? 1) ** 1.6);
      let x = Math.random() * w.reduce((a, b) => a + b, 0);
      let pick = pool[0];
      for (let i = 0; i < pool.length; i++) {
        x -= w[i];
        if (x <= 0) {
          pick = pool[i];
          break;
        }
      }
      recent.push(pick);
      if (recent.length > 4) recent.shift();
      sheens.get(pick)?.();
    }, 900);
    return () => clearInterval(t);
  }, [focused, openId, rankOf]);

  const onOpen = useCallback((id: string, rect: ThumbRect | null) => {
    const view = useCollectionView.getState();
    view.setIds(dataRef.current.map((c) => c.id));
    view.open(id, rect);
    router.push(`/card/${id}`);
  }, []);

  // Appui long : le menu de la carte (épingler sur le profil, favori).
  const onLongPress = useCallback((id: string) => {
    haptic.medium();
    setMenuId(id);
  }, []);

  return (
    <Screen>
      <View style={styles.header}>
        <View style={{ flexShrink: 1 }}>
          <AppText variant="title">Collection</AppText>
          <CountLine total={cards.length} />
        </View>
        {cards.length > 0 ? <SortSwitch value={sort} onChange={(s) => reorder(() => setSort(s))} /> : null}
      </View>
      {cards.length > 0 ? <RarityBar counts={counts} total={cards.length} /> : null}

      {cards.length > 0 ? (
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <Chip label="Toutes" count={cards.length} active={filter === null} onPress={() => reorder(() => setFilter(null))} />
            {pinnedSet.size > 0 ? (
              <Chip
                label="Épinglées"
                icon="pin"
                count={pinnedSet.size}
                active={filter === PINNED}
                onPress={() => reorder(() => setFilter(filter === PINNED ? null : PINNED))}
              />
            ) : null}
            {favCount > 0 ? (
              <Chip label="★ Favoris" count={favCount} color={colors.gold} active={filter === FAVORITES} onPress={() => reorder(() => setFilter(filter === FAVORITES ? null : FAVORITES))} />
            ) : null}
            {RARITIES.filter((r) => counts.get(r.id)).map((r) => (
              <Chip key={r.id} label={r.label} count={counts.get(r.id) ?? 0} color={r.color} active={filter === r.id} onPress={() => reorder(() => setFilter(filter === r.id ? null : r.id))} />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {cards.length === 0 ? (
        <EmptyState />
      ) : (
        <View style={{ flex: 1 }}>
          <FlatList
            ref={listRef}
            ListHeaderComponent={focused && hasHolo ? <MotionFeed target={motion} /> : null}
            data={data}
            key={cols}
            numColumns={cols}
            keyExtractor={(c) => c.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24, gap: GAP }}
            columnWrapperStyle={{ gap: GAP }}
            initialNumToRender={18}
            windowSize={7}
            onScroll={(e) => {
              scrollY.current = e.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={32}
            onViewableItemsChanged={onViewable}
            viewabilityConfig={VIEWABILITY}
            renderItem={({ item, index }) => (
              <Thumb
                card={item}
                width={cardW}
                motion={motion}
                entry={entryFor(item.id, index)}
                pinned={pinnedSet.has(item.id)}
                onOpen={onOpen}
                onLongPress={onLongPress}
              />
            )}
          />
          {/* Fondu en haut : les cartes glissent sous les filtres au lieu d'être coupées net. */}
          <LinearGradient pointerEvents="none" colors={[colors.bg, 'rgba(9,9,11,0)']} style={styles.topFade} />
        </View>
      )}

      {menuId ? <CardActions cardId={menuId} onClose={() => setMenuId(null)} /> : null}
    </Screen>
  );
}

const VIEWABILITY = { itemVisiblePercentThreshold: 60 };

/** Capte l'inclinaison du téléphone, seulement tant que l'onglet est affiché. */
function MotionFeed({ target }: { target: SharedValue<number> }) {
  const tilt = useMotionTilt();
  useAnimatedReaction(
    () => tilt.value,
    (v) => {
      target.value = v;
    },
  );
  return null;
}

/* ------------------------------------------------------------------------ */
/*  Miniature                                                                */
/* ------------------------------------------------------------------------ */

const POP = { damping: 14, stiffness: 190, mass: 0.8 };
const GLIDE = { damping: 22, stiffness: 210, mass: 0.9 };
const PRESS = { damping: 16, stiffness: 320 };

const Thumb = memo(function Thumb({
  card,
  width,
  motion,
  entry,
  pinned,
  onOpen,
  onLongPress,
}: {
  card: Card;
  width: number;
  motion: SharedValue<number>;
  entry: Entry;
  /** Épinglée sur le profil : petite pastille en coin. */
  pinned: boolean;
  onOpen(id: string, rect: ThumbRect | null): void;
  onLongPress(id: string): void;
}) {
  const r = getRarity(card.rarity);
  const height = width * CARD_RATIO;
  // Cartes chromatiques (Ultra Légendaire, Divine) : le reflet suit les mouvements du téléphone.
  const holo = r.frameStyle === 'chromatic' || r.frameStyle === 'divine' || r.frameStyle === 'galaxy';
  // Masquée pendant que la carte est affichée en grand (elle s'est « envolée » de la grille).
  const away = useCollectionView((s) => s.openId === card.id);
  const box = useRef<View>(null);

  // Arrivée : pop (échelle + montée) ou glissement depuis l'ancienne place.
  const pop = useSharedValue(entry.kind === 'pop' ? 0 : 1);
  const tx = useSharedValue(entry.dx);
  const ty = useSharedValue(entry.dy);
  useEffect(() => {
    if (entry.kind === 'pop') {
      pop.value = 0;
      pop.value = withDelay(entry.delay, withSpring(1, POP));
    } else if (entry.kind === 'move') {
      tx.value = entry.dx;
      ty.value = entry.dy;
      tx.value = withSpring(0, GLIDE);
      ty.value = withSpring(0, GLIDE);
    }
  }, [entry, pop, tx, ty]);

  // Appui : la carte s'enfonce et penche vers le doigt.
  const press = useSharedValue(0);
  const px = useSharedValue(0);
  const py = useSharedValue(0);
  const onPressIn = (e: GestureResponderEvent) => {
    const { locationX, locationY } = e.nativeEvent;
    px.value = Number.isFinite(locationX) ? Math.max(-1, Math.min(1, (locationX / width) * 2 - 1)) : 0;
    py.value = Number.isFinite(locationY) ? Math.max(-1, Math.min(1, (locationY / height) * 2 - 1)) : 0;
    press.value = withSpring(1, PRESS);
  };
  const onPressOut = () => {
    press.value = withSpring(0, { damping: 11, stiffness: 260 });
  };

  const style = useAnimatedStyle(() => {
    const p = pop.value;
    const k = press.value;
    return {
      opacity: Math.min(1, p * 1.6),
      transform: [
        { translateX: tx.value },
        { translateY: ty.value + (1 - p) * 22 },
        { perspective: 700 },
        { rotateX: `${-py.value * 11 * k}deg` },
        { rotateY: `${px.value * 11 * k}deg` },
        { scale: (0.78 + p * 0.22) * (1 - k * 0.055) },
      ],
    };
  });

  const measure = useCallback(
    () =>
      new Promise<ThumbRect | null>((resolve) => {
        const node = box.current;
        if (!node) return resolve(null);
        const timer = setTimeout(() => resolve(null), 80);
        node.measureInWindow((x, y, w, h) => {
          clearTimeout(timer);
          resolve(w > 0 ? { x, y, width: w, height: h } : null);
        });
      }),
    [],
  );
  useEffect(() => registerThumb(card.id, measure), [card.id, measure]);

  // Reflet de passage (Rare et au-dessus), déclenché par la boucle de l'écran.
  const [sheen, setSheen] = useState(0);
  useEffect(() => {
    if (r.rank < 1) return;
    const fire = () => setSheen((n) => n + 1);
    sheens.set(card.id, fire);
    return () => {
      if (sheens.get(card.id) === fire) sheens.delete(card.id);
    };
  }, [card.id, r.rank]);
  const endSheen = useCallback(() => setSheen(0), []);

  return (
    <View ref={box} collapsable={false} style={{ width, height, opacity: away ? 0 : 1 }}>
      <Animated.View style={style}>
        <Pressable
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          onPress={() => {
            haptic.tick();
            measure().then((rect) => onOpen(card.id, rect));
          }}
          onLongPress={() => onLongPress(card.id)}
          delayLongPress={420}
          accessibilityRole="button"
          accessibilityLabel={`${card.name ? `${card.name}, ${r.label}` : `Carte ${r.label}`}${pinned ? ', épinglée sur ton profil' : ''}`}
          accessibilityHint="Appui long pour épingler la carte sur ton profil ou la mettre en favori"
        >
          <CardFace card={card} width={width} quality="thumb" animated={r.rank >= 6} tilt={holo ? motion : undefined} />
          {sheen > 0 ? <Sheen key={sheen} width={width} height={height} rank={r.rank} color={r.color} onDone={endSheen} /> : null}
          {card.favorite || pinned ? (
            <View style={styles.badges} pointerEvents="none">
              {card.favorite ? (
                <View style={[styles.badge, { backgroundColor: colors.gold }]}>
                  <Ionicons name="star" size={11} color="#1A1406" />
                </View>
              ) : null}
              {pinned ? (
                <View style={[styles.badge, { backgroundColor: colors.text }]}>
                  <Ionicons name="pin" size={11} color="#101014" />
                </View>
              ) : null}
            </View>
          ) : null}
        </Pressable>
      </Animated.View>
    </View>
  );
});

/**
 * Reflet qui traverse la carte une fois puis disparaît. Rien n'est monté entre deux reflets :
 * une grille de centaines de cartes ne fait tourner aucune animation au repos.
 */
function Sheen({ width, height, rank, color, onDone }: { width: number; height: number; rank: number; color: string; onDone(): void }) {
  const p = useSharedValue(0);
  const strong = rank >= 4;
  useEffect(() => {
    p.value = withTiming(1, { duration: strong ? 1250 : 1050, easing: Easing.inOut(Easing.quad) }, (fin) => {
      if (fin) scheduleOnRN(onDone);
    });
    return () => cancelAnimation(p);
  }, [p, strong, onDone]);
  const band = width * (strong ? 0.75 : 0.6);
  const bandStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -band * 1.4 + p.value * (width + band * 2.2) }, { rotate: '22deg' }],
  }));
  // Mythique et au-dessus : la gemme scintille au passage du reflet, le contour s'illumine.
  const glint = useAnimatedStyle(() => {
    const g = interpolate(p.value, [0.45, 0.62, 0.9], [0, 1, 0], 'clamp');
    return { opacity: g, transform: [{ scale: 0.3 + g * 0.9 }, { rotate: `${p.value * 90}deg` }] };
  });
  const rim = useAnimatedStyle(() => ({ opacity: interpolate(p.value, [0, 0.4, 1], [0, 0.9, 0]) }));
  const gem = Math.max(7, width * 0.07);
  const border = Math.max(3, width * 0.05);
  const g = width * 0.42;
  const radius = width * 0.07;
  const a = strong ? 0.6 : 0.38;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: strong ? 'visible' : 'hidden' }]}>
      <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
        <Animated.View style={[{ position: 'absolute', top: -height * 0.25, height: height * 1.5, width: band }, bandStyle]}>
          <LinearGradient pointerEvents="none"
            colors={['rgba(255,255,255,0)', `rgba(255,255,255,${a * 0.5})`, `rgba(255,255,255,${a})`, `rgba(255,255,255,${a * 0.5})`, 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </View>
      {strong ? (
        <>
          <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: 1.5, borderColor: color }, rim]} />
          <Animated.Image
            source={sparkleTex}
            style={[{ position: 'absolute', width: g, height: g, right: border + width * 0.035 + gem / 2 - g / 2, top: border + width * 0.035 + gem / 2 - g / 2, tintColor: '#FFFFFF' }, glint]}
          />
        </>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------------ */
/*  En-tête : compteur, répartition par rareté, tri, filtres                 */
/* ------------------------------------------------------------------------ */

/** Nombre qui défile jusqu'à sa nouvelle valeur (quelques images seulement, côté JS). */
function useCountUp(target: number, duration = 650) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = from.current;
    if (start === target) return;
    const t0 = Date.now();
    let raf = 0;
    const step = () => {
      const k = Math.min(1, (Date.now() - t0) / duration);
      const v = Math.round(start + (target - start) * (1 - (1 - k) ** 3));
      from.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return shown;
}

function CountLine({ total }: { total: number }) {
  const n = useCountUp(total);
  return (
    <AppText variant="caption" style={{ fontVariant: ['tabular-nums'] }}>
      {total === 0 ? 'Ta bibliothèque t’attend' : `${n} carte${total > 1 ? 's' : ''}`}
    </AppText>
  );
}

/** Fine barre de répartition des raretés : chaque segment s'allonge à son tour. */
function RarityBar({ counts, total }: { counts: Map<string, number>; total: number }) {
  const [w, setW] = useState(0);
  const segs = RARITIES.filter((r) => counts.get(r.id));
  return (
    <View style={styles.barWrap} onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}>
      <View style={styles.bar}>
        {w > 0
          ? segs.map((r, i) => {
              const before = segs.slice(0, i).reduce((a, s) => a + (counts.get(s.id) ?? 0), 0);
              return <Segment key={r.id} color={r.color} x={(before / total) * w} width={((counts.get(r.id) ?? 0) / total) * w} index={i} glow={r.rank >= 4} />;
            })
          : null}
      </View>
    </View>
  );
}

function Segment({ color, x, width, index, glow }: { color: string; x: number; width: number; index: number; glow: boolean }) {
  const sx = useSharedValue(x);
  const sw = useSharedValue(0);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      sx.value = x;
      sw.value = withDelay(120 + index * 70, withTiming(width, { duration: 520, easing: Easing.out(Easing.cubic) }));
    } else {
      sx.value = withTiming(x, { duration: 420, easing: Easing.out(Easing.cubic) });
      sw.value = withTiming(width, { duration: 420, easing: Easing.out(Easing.cubic) });
    }
  }, [x, width, index, sx, sw]);
  const style = useAnimatedStyle(() => ({ left: sx.value, width: Math.max(0, sw.value - 1.5) }));
  return <Animated.View style={[styles.seg, { backgroundColor: color }, glow && { shadowColor: color, shadowOpacity: 0.9, shadowRadius: 4 }, style]} />;
}

/** Interrupteur Récentes / Rareté : la pastille claire glisse sous l'option choisie. */
function SortSwitch({ value, onChange }: { value: Sort; onChange(s: Sort): void }) {
  const [layouts, setLayouts] = useState<Record<Sort, { x: number; width: number } | undefined>>({ recent: undefined, rarity: undefined });
  const x = useSharedValue(0);
  const w = useSharedValue(0);
  const ready = useRef(false);
  const cur = layouts[value];
  useEffect(() => {
    if (!cur) return;
    if (!ready.current) {
      ready.current = true;
      x.value = cur.x;
      w.value = cur.width;
    } else {
      x.value = withSpring(cur.x, { damping: 18, stiffness: 240 });
      w.value = withSpring(cur.width, { damping: 18, stiffness: 240 });
    }
  }, [cur, x, w]);
  const pill = useAnimatedStyle(() => ({ width: w.value, transform: [{ translateX: x.value }] }));
  return (
    <View style={styles.sort}>
      <Animated.View style={[styles.sortPill, pill]} />
      {(['recent', 'rarity'] as const).map((s) => (
        <Pressable
          key={s}
          onLayout={(e) => {
            const { x: lx, width: lw } = e.nativeEvent.layout;
            setLayouts((l) => (l[s]?.x === lx && l[s]?.width === lw ? l : { ...l, [s]: { x: lx, width: lw } }));
          }}
          onPress={() => value !== s && onChange(s)}
          style={styles.sortBtn}
          accessibilityRole="button"
          accessibilityState={{ selected: value === s }}
        >
          <AppText style={[styles.sortLabel, value === s && { color: colors.text }]}>{s === 'recent' ? 'Récentes' : 'Rareté'}</AppText>
        </Pressable>
      ))}
    </View>
  );
}

function Chip({
  label,
  count,
  active,
  onPress,
  color,
  icon,
}: {
  label: string;
  count: number;
  active: boolean;
  onPress(): void;
  /** Pastille de couleur devant l'intitulé (raretés). */
  color?: string;
  /** Icône devant l'intitulé, à la place de la pastille. */
  icon?: IconName;
}) {
  const on = useSharedValue(active ? 1 : 0);
  const squish = useSharedValue(0);
  const bump = useSharedValue(0);
  useEffect(() => {
    on.value = withTiming(active ? 1 : 0, { duration: 200, easing: Easing.out(Easing.quad) });
  }, [active, on]);
  // Le compteur saute quand il change (nouvelle carte, carte brûlée).
  const last = useRef(count);
  useEffect(() => {
    if (last.current === count) return;
    last.current = count;
    bump.value = withSequence(withTiming(1, { duration: 120 }), withSpring(0, { damping: 9, stiffness: 260 }));
  }, [count, bump]);
  const shown = useCountUp(count, 500);
  const box = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.value, [0, 1], [colors.surface, colors.text]),
    borderColor: interpolateColor(on.value, [0, 1], [colors.border, colors.text]),
    transform: [{ scale: (1 - squish.value * 0.07) * (1 + on.value * 0.02) }],
  }));
  const ink = useAnimatedStyle(() => ({ color: interpolateColor(on.value, [0, 1], [colors.textDim, '#0B0B0D']) }));
  const num = useAnimatedStyle(() => ({ transform: [{ scale: 1 + bump.value * 0.3 }] }));
  return (
    <Pressable
      onPressIn={() => {
        squish.value = withSpring(1, PRESS);
      }}
      onPressOut={() => {
        squish.value = withSpring(0, { damping: 10, stiffness: 260 });
      }}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Animated.View style={[styles.chip, box]}>
        {icon ? <Ionicons name={icon} size={12} color={active ? '#0B0B0D' : colors.textDim} /> : null}
        {!icon && color ? <View style={[styles.dot, { backgroundColor: color }]} /> : null}
        <Animated.Text style={[styles.chipLabel, ink]}>{label}</Animated.Text>
        <Animated.Text style={[styles.chipCount, ink, num]}>{shown}</Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

/* ------------------------------------------------------------------------ */
/*  Collection vide                                                          */
/* ------------------------------------------------------------------------ */

/** Trois dos de carte qui flottent doucement, et l'invitation à ouvrir un paquet. */
function EmptyState() {
  const t = useSharedValue(0);
  const enter = useSharedValue(0);
  useEffect(() => {
    enter.value = withSpring(1, { damping: 14, stiffness: 120 });
    t.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(t);
  }, [t, enter]);
  return (
    <View style={styles.empty}>
      <View style={styles.ghosts}>
        {[-1, 0, 1].map((k) => (
          <GhostCard key={k} k={k} t={t} enter={enter} />
        ))}
      </View>
      <AppText variant="heading" style={{ marginTop: 34 }}>
        Ta bibliothèque est vide
      </AppText>
      <AppText variant="caption" style={{ textAlign: 'center', marginTop: 6, lineHeight: 18 }}>
        Chaque paquet transforme tes photos en cartes.{'\n'}Les plus rares brilleront ici.
      </AppText>
      <Pressable
        onPress={() => {
          haptic.tick();
          router.navigate('/');
        }}
        style={({ pressed }) => [styles.cta, pressed && { transform: [{ scale: 0.96 }] }]}
        accessibilityRole="button"
      >
        <Ionicons name="sparkles" size={16} color="#1A1406" />
        <AppText style={styles.ctaLabel}>Ouvrir un paquet</AppText>
      </Pressable>
    </View>
  );
}

function GhostCard({ k, t, enter }: { k: number; t: SharedValue<number>; enter: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const phase = k === 0 ? t.value : 1 - t.value;
    return {
      opacity: enter.value * (k === 0 ? 1 : 0.55),
      transform: [
        { translateX: k * 46 * enter.value },
        { translateY: (k === 0 ? -8 : 6) + phase * (k === 0 ? -8 : 5) },
        { rotate: `${k * 12 * enter.value + (phase - 0.5) * (k === 0 ? 2 : 3)}deg` },
        { scale: 0.85 + enter.value * 0.15 },
      ],
    };
  });
  return (
    <Animated.View style={[styles.ghost, k === 0 && styles.ghostFront, style]}>
      {k === 0 ? (
        <>
          <LinearGradient pointerEvents="none" colors={['rgba(247,201,72,0.16)', 'rgba(247,201,72,0.02)']} style={StyleSheet.absoluteFill} />
          <View style={styles.ghostGem} />
          <Ionicons name="images-outline" size={26} color="rgba(247,201,72,0.75)" />
        </>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, gap: 12 },
  sort: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 12, padding: 3, borderWidth: 1, borderColor: colors.border },
  sortPill: { position: 'absolute', top: 3, bottom: 3, left: 0, borderRadius: 9, backgroundColor: colors.surface2, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  sortBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9 },
  sortLabel: { fontFamily: fonts.semibold, fontSize: 12, color: colors.textDim },
  barWrap: { paddingHorizontal: 16, paddingBottom: 14 },
  bar: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.05)', overflow: 'hidden' },
  seg: { position: 'absolute', top: 0, bottom: 0, borderRadius: 2 },
  chips: { paddingHorizontal: 16, gap: 8, paddingBottom: 10 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
  },
  chipLabel: { fontFamily: fonts.semibold, fontSize: 12 },
  chipCount: { fontFamily: fonts.bold, fontSize: 12, fontVariant: ['tabular-nums'], opacity: 0.8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  topFade: { position: 'absolute', left: 0, right: 0, top: 0, height: 12 },
  badges: { position: 'absolute', left: 5, top: 5, flexDirection: 'row', gap: 4 },
  badge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.35)',
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, paddingBottom: 80 },
  ghosts: { width: 200, height: 150, alignItems: 'center', justifyContent: 'center' },
  ghost: {
    position: 'absolute',
    width: 96,
    height: 96 * CARD_RATIO,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  ghostFront: { borderColor: 'rgba(247,201,72,0.45)', backgroundColor: colors.bgElevated, zIndex: 2 },
  ghostGem: { position: 'absolute', right: 9, top: 9, width: 8, height: 8, transform: [{ rotate: '45deg' }], backgroundColor: 'rgba(247,201,72,0.6)', borderRadius: 1 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 22,
    height: 46,
    paddingHorizontal: 22,
    borderRadius: 23,
    backgroundColor: colors.gold,
  },
  ctaLabel: { fontFamily: fonts.bold, fontSize: 15, color: '#1A1406' },
});
