/**
 * Écran de combat. La logique est dans src/battle/engine.ts ; ici on met en
 * scène les évènements un par un (message, élan, coup, jauge, K.O.), on fait
 * jouer le bot, et on propose au joueur ses actions : attaque classique,
 * attaque spéciale (mini-jeu de précision), ou changer de carte.
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { startBattleMusic, stopBattleMusic } from '../../audio/music';
import { type Sfx, playSfx } from '../../audio/sfx';
import { arenaFighters, getArena } from '../../battle/arenas';
import { botAction, botReplacement } from '../../battle/bot';
import { botArt } from '../../battle/botArt';
import {
  type Battle,
  type BattleEvent,
  type Fighter,
  type FighterInput,
  type HitFlags,
  type SideId,
  type StatusName,
  act,
  activeOf,
  canExecute,
  createBattle,
  hitsOf,
  isEnraged,
  other,
  replace,
  resolveAttack,
} from '../../battle/engine';
import { ATTACK_KIND_LABEL, type Attack, type AttackKind, BATTLE, STATUS_KINDS, kindOf } from '../../battle/stats';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { type ActKind, type FighterStatus, FighterView, HpBar, type Popup, type ReactKind } from '../../components/battle/FighterView';
import { KIND_LOOK, STATUS_LOOK, activeStatuses, attackHint } from '../../components/battle/kinds';
import { FitLines, FitText, type TextPart, fitFontSize } from '../../components/battle/FitText';
import { InspectFighter } from '../../components/battle/InspectFighter';
import { QUALITY_LABEL, TimingBar } from '../../components/battle/TimingBar';
import { SoundSheet } from '../../components/SoundSheet';
import { CardFace } from '../../components/card/CardFace';
import { Burst } from '../../components/fx';
import { getRarity } from '../../game/rarity';
import { useGame } from '../../state/game';
import type { Card } from '../../storage/model';
import { CARD_RATIO, colors, fonts } from '../../theme';
import { haptic } from '../../utils/haptics';

type Mode = 'idle' | 'menu' | 'timing' | 'confirmSwitch' | 'replace';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Nom affiché d'une carte du joueur (ou sa rareté si elle n'a pas de nom). */
const fighterName = (c: Card) => c.name ?? `ta carte ${getRarity(c.rarity).label}`;

/** Majuscule en début de phrase (« ta carte Rare » → « Ta carte Rare »). */
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
/** Message du combat : une phrase, ou « Carte utilise » + le nom de l'attaque seul sur sa ligne. */
type Msg = TextPart[] | { top: TextPart[]; attack: string };

const capParts = (parts: TextPart[]): TextPart[] => (parts.length ? [{ ...parts[0], text: cap(parts[0].text) }, ...parts.slice(1)] : parts);

const toFighter = (c: Card): FighterInput => ({ ref: c.id, name: fighterName(c), rarity: c.rarity, battle: c.battle });

export default function FightScreen() {
  const params = useLocalSearchParams<{ arena: string; deck: string }>();
  const arena = getArena(Number(params.arena));
  const allCards = useGame((s) => s.cards);
  const winArena = useGame((s) => s.winArena);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  // Le deck est figé au début du combat.
  const [deck] = useState<Card[]>(() =>
    String(params.deck ?? '')
      .split(',')
      .map((id) => allCards.find((c) => c.id === id))
      .filter((c): c is Card => !!c)
      .slice(0, 4),
  );
  const [battle, setBattle] = useState<Battle | null>(() => (arena && deck.length ? createBattle(deck.map(toFighter), arenaFighters(arena)) : null));
  const [shown, setShown] = useState<Battle | null>(battle);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>('idle');
  const [msg, setMsg] = useState<Msg>([{ text: arena ? `${arena.bot} te défie !` : '' }]);
  const [pending, setPending] = useState<{ slot: 0 | 1; attack: Attack; hits: number } | null>(null);
  const [switchTo, setSwitchTo] = useState<number | null>(null);
  const [result, setResult] = useState<SideId | null>(null);
  const [quitting, setQuitting] = useState(false);
  const [soundOpen, setSoundOpen] = useState(false);
  /** Carte affichée en grand (3D + stats). */
  const [inspect, setInspect] = useState<{ side: SideId; index: number } | null>(null);
  /** D'où vient la confirmation d'envoi : un changement (coûte le tour) ou un remplacement après K.O. */
  const [confirmFrom, setConfirmFrom] = useState<'menu' | 'replace'>('menu');
  const music = useRef(0);
  useEffect(() => {
    music.current = startBattleMusic();
    const token = music.current;
    return () => stopBattleMusic(token, 500);
  }, []);
  // Animations : une « action » (la carte qui agit) et une « réaction » (la carte qui subit) par camp.
  const [acts, setActs] = useState<[{ key: number; kind: ActKind }, { key: number; kind: ActKind }]>([
    { key: 0, kind: 'basic' },
    { key: 0, kind: 'basic' },
  ]);
  const [reacts, setReacts] = useState<[{ key: number; kind: ReactKind }, { key: number; kind: ReactKind }]>([
    { key: 0, kind: 'hurt' },
    { key: 0, kind: 'hurt' },
  ]);
  const [enters, setEnters] = useState<[number, number]>([1, 1]);
  const [popups, setPopups] = useState<[Popup[], Popup[]]>([[], []]);
  const fxKey = useRef(0);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const doAct = (side: SideId, kind: ActKind) =>
    setActs((a) => {
      const next: typeof a = [a[0], a[1]];
      next[side] = { key: ++fxKey.current, kind };
      return next;
    });
  const doReact = (side: SideId, kind: ReactKind) =>
    setReacts((a) => {
      const next: typeof a = [a[0], a[1]];
      next[side] = { key: ++fxKey.current, kind };
      return next;
    });
  const doEnter = (side: SideId) => setEnters((e) => (side === 0 ? [e[0] + 1, e[1]] : [e[0], e[1] + 1]));
  const popup = (side: SideId, p: Omit<Popup, 'key'>) =>
    setPopups((all) => {
      const next: [Popup[], Popup[]] = [all[0], all[1]];
      next[side] = [...all[side].slice(-3), { ...p, key: ++fxKey.current }];
      return next;
    });

  const nameParts = (name: string, side: SideId): TextPart => ({ text: name, bold: true, color: side === 0 ? colors.text : arena?.tint });

  /** Met en scène les évènements d'une action, puis passe au nouvel état. */
  const play = async (events: BattleEvent[], final: Battle) => {
    if (!arena) return;
    setBusy(true);
    setMode('idle');
    let view = shown ?? final;
    try {
      for (const e of events) {
        if (!alive.current) return;
        const before = view;
        view = applyEvent(view, e);
        switch (e.t) {
          case 'use': {
            const kind = kindOf(e.attack);
            setMsg({ top: [nameParts(e.fighter, e.side), { text: e.copied ? ' copie' : ' utilise' }], attack: `${e.attack.name} !` });
            setShown(view);
            if (e.copied) {
              doAct(e.side, 'mirror');
              await sleep(380);
            }
            doAct(e.side, actFor(kind, e.special, before, e.side));
            playSfx(soundFor(kind), { volume: 0.6 });
            await sleep(STATUS_KINDS.includes(kind) ? 500 : e.side === 0 ? 650 : 900);
            break;
          }
          case 'hit': {
            setShown(view);
            if (e.damage > 0) doReact(e.side, e.execute ? 'execute' : e.guarded ? 'guarded' : e.kind === 'slap' ? 'slapped' : 'hurt');
            const q = QUALITY_LABEL[e.quality];
            const tag = hitTag(e);
            popup(e.side, {
              main: e.damage > 0 ? `-${e.damage}` : '0',
              color: e.damage <= 0 ? colors.textDim : e.quality === 'crit' || e.execute ? colors.gold : '#FFFFFF',
              sub: tag ?? q.text,
              subColor: tag ? colors.gold : q.color,
              big: e.quality === 'crit' || !!e.execute,
            });
            if (e.quality === 'miss') playSfx('miss');
            else if (e.quality === 'crit' || e.execute) playSfx('crit');
            else playSfx(e.kind === 'slap' ? 'slap' : 'hit', { volume: e.quality === 'weak' || e.guarded ? 0.6 : 1 });
            if (e.guarded) playSfx('shield', { volume: 0.6 });
            if (e.damage > 0) (e.quality === 'crit' || e.execute ? haptic.heavy : haptic.medium)();
            await sleep(e.execute ? 950 : 700);
            break;
          }
          case 'status': {
            setShown(view);
            const look = STATUS_TEXT[e.status];
            setMsg([nameParts(e.fighter, e.side), { text: look.text }]);
            playSfx(look.sound, { volume: 0.8 });
            if (e.status === 'guard') doAct(e.side, 'guard');
            await sleep(1150);
            break;
          }
          case 'heal':
            setShown(view);
            doReact(e.side, 'heal');
            popup(e.side, { main: `+${e.amount}`, color: colors.success, sub: 'Soin' , subColor: colors.success });
            setMsg([nameParts(e.fighter, e.side), { text: ` récupère ${e.amount} PV !` }]);
            playSfx('heal');
            haptic.success();
            await sleep(1150);
            break;
          case 'dodged':
            setShown(view);
            doReact(e.side, 'dodged');
            popup(e.side, { main: 'Esquivé !', color: '#5EE6D6' });
            setMsg([nameParts(e.fighter, e.side), { text: ' esquive l’attaque !' }]);
            playSfx('swipe', { volume: 0.9 });
            haptic.light();
            await sleep(1100);
            break;
          case 'dodgeFail':
            setMsg([nameParts(e.fighter, e.side), { text: ' n’arrive pas à esquiver !' }]);
            await sleep(550);
            break;
          case 'recoil':
            setShown(view);
            doReact(e.side, 'recoil');
            popup(e.side, { main: `-${e.damage}`, color: '#FF8A7A', sub: 'Contrecoup', subColor: '#FF8A7A' });
            setMsg([nameParts(e.fighter, e.side), { text: ' encaisse le contrecoup !' }]);
            playSfx('hit', { volume: 0.6 });
            await sleep(950);
            break;
          case 'poisonTick':
            setShown(view);
            doReact(e.side, 'poison');
            popup(e.side, { main: `-${e.damage}`, color: '#D9A6FF', sub: 'Poison', subColor: '#D9A6FF' });
            setMsg([nameParts(e.fighter, e.side), { text: ' souffre du poison !' }]);
            playSfx('poison');
            haptic.light();
            await sleep(1100);
            break;
          case 'stun':
            setShown(view);
            setMsg([nameParts(e.fighter, e.side), { text: ` est étourdie pendant ${e.turns} tour${e.turns > 1 ? 's' : ''} !` }]);
            playSfx('stun', { volume: 0.8 });
            await sleep(1200);
            break;
          case 'stunned':
            setShown(view);
            setMsg([nameParts(e.fighter, e.side), { text: e.left > 0 ? ' est étourdie et ne peut pas attaquer !' : ' est étourdie… mais reprend ses esprits !' }]);
            playSfx('stun', { volume: 0.5 });
            await sleep(1300);
            break;
          case 'ko':
            setShown(view);
            setMsg([nameParts(e.fighter, e.side), { text: ' est K.O. !' }]);
            playSfx('ko');
            haptic.heavy();
            await sleep(1300);
            break;
          case 'switch':
            setShown(view);
            doEnter(e.side);
            playSfx('swipe', { volume: 0.7 });
            if (e.side === 0) setMsg(e.forced ? [{ text: 'À toi, ' }, nameParts(e.fighter, 0), { text: ' !' }] : [{ text: 'Reviens ! À toi, ' }, nameParts(e.fighter, 0), { text: ' !' }]);
            else setMsg([{ text: `${arena.bot} ${e.forced ? 'envoie' : 'rappelle sa carte et envoie'} ` }, nameParts(e.fighter, 1), { text: ' !' }]);
            await sleep(1000);
            break;
          case 'win':
            break;
        }
      }
    } catch (err) {
      // Une mise en scène qui échoue ne doit jamais bloquer le combat : on passe directement à la suite.
      console.warn('Mise en scène du combat interrompue', err);
    }
    if (!alive.current) return;
    setShown(final);
    setBattle(final);
    setBusy(false);
  };

  // Déroulé du combat : fin, remplacements après K.O., tour du bot ou du joueur.
  useEffect(() => {
    // En pause pendant qu'on regarde une carte ou qu'on règle le son.
    if (!battle || !arena || busy || result !== null || inspect || soundOpen) return;
    if (battle.winner !== null) {
      setResult(battle.winner);
      stopBattleMusic(music.current, 600);
      if (battle.winner === 0) {
        winArena(arena.n);
        playSfx('win');
        haptic.success();
      } else {
        playSfx('lose');
        haptic.warning();
      }
      return;
    }
    if (battle.mustReplace === 1) {
      const t = setTimeout(() => {
        const r = replace(battle, 1, botReplacement(battle, 1, arena.level));
        void play(r.events, r.battle);
      }, 500);
      return () => clearTimeout(t);
    }
    // Une confirmation d'envoi en cours (ex. retour de « Info ») reste affichée.
    if (mode === 'confirmSwitch') return;
    if (battle.mustReplace === 0) {
      setMode('replace');
      setMsg([{ text: 'Choisis ta prochaine carte' }]);
      return;
    }
    if (battle.turn === 1) {
      setMode('idle');
      const t = setTimeout(() => {
        const r = act(battle, botAction(battle, 1, arena.level));
        void play(r.events, r.battle);
      }, 700);
      return () => clearTimeout(t);
    }
    const me = activeOf(battle, 0);
    setMode('menu');
    setMsg(me.stun > 0 ? [nameParts(me.name, 0), { text: ' est étourdie…' }] : [{ text: 'Que doit faire ' }, nameParts(me.name, 0), { text: ' ?' }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battle, busy, result, inspect, soundOpen]);

  const layout = useMemo(() => {
    const avail = height - insets.top - insets.bottom;
    // Petits écrans (iPhone SE…) : message, remplaçantes et boutons plus compacts.
    const compact = avail < 720;
    const msgH = compact ? 76 : 96;
    const benchH = compact ? 64 : 84;
    const actionsH = compact ? 114 : 140;
    const fixed = 48 + msgH + 12 + benchH + actionsH + 20;
    const cardW = Math.max(78, Math.min(width * 0.4, 168, (avail - fixed) / (CARD_RATIO * 1.9)));
    return { cardW, foeW: cardW * 0.9, compact, msgH, benchH, actionsH, thumbW: compact ? 34 : 42 };
  }, [width, height, insets]);

  if (!arena || !battle || !shown) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <AppText variant="heading">Combat introuvable</AppText>
        <Button label="Retour" kind="secondary" style={{ marginTop: 16 }} onPress={() => router.back()} />
      </View>
    );
  }

  const me = activeOf(shown, 0);
  const foe = activeOf(shown, 1);
  const myCard = deck.find((c) => c.id === me.ref);
  const canPlay = mode === 'menu' && !busy;
  const stunned = me.stun > 0;

  const attack = (slot: 0 | 1) => {
    if (!canPlay || stunned) return;
    const r = resolveAttack(battle, 0, slot);
    if (!r) return;
    haptic.light();
    const hits = hitsOf(r.attack);
    if (hits === 0) {
      // garde, soin, esquive, concentration : pas de mini-jeu, l'effet part tout de suite
      const res = act(battle, { type: 'attack', slot, timings: [] });
      void play(res.events, res.battle);
      return;
    }
    setPending({ slot, attack: r.attack, hits });
    setMode('timing');
  };

  const onTimed = (timings: number[]) => {
    if (!pending) return;
    const r = act(battle, { type: 'attack', slot: pending.slot, timings });
    setPending(null);
    void play(r.events, r.battle);
  };

  const onBench = (i: number) => {
    if (busy) return;
    const f = shown.sides[0].fighters[i];
    if (!f || f.hp <= 0) return;
    if (mode === 'replace' || mode === 'menu' || mode === 'confirmSwitch') {
      haptic.tick();
      if (mode !== 'confirmSwitch') setConfirmFrom(mode === 'replace' ? 'replace' : 'menu');
      setSwitchTo(i);
      setMode('confirmSwitch');
    }
  };

  const doSwitch = () => {
    if (switchTo === null) return;
    haptic.light();
    const r = confirmFrom === 'replace' ? replace(battle, 0, switchTo) : act(battle, { type: 'switch', to: switchTo });
    setSwitchTo(null);
    void play(r.events, r.battle);
  };

  const cancelSwitch = () => {
    setSwitchTo(null);
    setMode(confirmFrom);
  };

  const look = (side: SideId, index: number) => {
    if (mode === 'timing') return;
    haptic.light();
    setInspect({ side, index });
  };

  const doPass = () => {
    const r = act(battle, { type: 'pass' });
    void play(r.events, r.battle);
  };

  const special = resolveAttack(shown, 0, 1);
  const specialKind = kindOf(me.attacks[1]);
  const infoW = Math.max(110, width - layout.cardW - 56);

  return (
    <View style={styles.root}>
      <LinearGradient colors={[`${arena.tint}33`, colors.bg, colors.bg]} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} />
      <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 12) }}>
        <View style={styles.header}>
          <Pressable onPress={() => setQuitting(true)} hitSlop={12} style={styles.round} accessibilityLabel="Abandonner le combat">
            <Ionicons name="close" size={20} color={colors.text} />
          </Pressable>
          <AppText variant="label" style={{ color: colors.textDim }} numberOfLines={1}>{`Arène ${arena.n} · ${arena.place}`}</AppText>
          <Pressable onPress={() => setSoundOpen(true)} hitSlop={12} style={styles.round} accessibilityLabel="Régler le son">
            <Ionicons name="musical-notes" size={17} color={colors.text} />
          </Pressable>
        </View>

        {/* Adversaire : infos à gauche, carte à droite */}
        <View style={[styles.row, { paddingHorizontal: 20 }]}>
          <View style={{ width: infoW, gap: 5 }}>
            <AppText variant="heading" numberOfLines={1}>
              {foe.name}
            </AppText>
            <View style={styles.labelRow}>
              <AppText variant="label" style={{ color: getRarity(foe.rarity).color }}>
                {getRarity(foe.rarity).label}
              </AppText>
              <View style={styles.dots}>
                {shown.sides[1].fighters.map((f, i) => (
                  <View key={i} style={[styles.dot, f.hp > 0 ? { backgroundColor: arena.tint } : styles.dotKo, i === shown.sides[1].active && styles.dotActive]} />
                ))}
              </View>
            </View>
            <HpBar hp={foe.hp} maxHp={foe.maxHp} width={Math.min(infoW, 190)} />
            <StatusChips fighter={foe} />
          </View>
          <Pressable onPress={() => look(1, shown.sides[1].active)} disabled={mode === 'timing'} accessibilityLabel={`Voir ${foe.name}`}>
          <FighterView
            key={foe.ref}
            card={{ id: foe.ref, rarity: foe.rarity, name: foe.name }}
            imageSource={botArt(foe.ref)}
            width={layout.foeW}
            facing={-1}
            act={acts[1]}
            react={reacts[1]}
            enter={enters[1]}
            ko={foe.hp <= 0}
            status={statusOf(foe)}
            popups={popups[1]}
          />
          </Pressable>
        </View>

        <View style={[styles.message, { height: layout.msgH }]}>
          {Array.isArray(msg) ? (
            <FitText parts={capParts(msg)} lines={layout.compact ? 2 : 3} maxSize={layout.compact ? 24 : 30} minSize={14} initialWidth={width - 72} />
          ) : (
            <FitLines
              initialWidth={width - 72}
              lines={[
                { parts: capParts(msg.top), maxSize: layout.compact ? 17 : 21, minSize: 11 },
                { parts: [{ text: msg.attack, bold: true, color: colors.gold }], maxSize: layout.compact ? 30 : 38, minSize: 14 },
              ]}
            />
          )}
        </View>

        {/* Joueur : carte à gauche, infos à droite */}
        <View style={[styles.row, { paddingHorizontal: 20 }]}>
          {myCard ? (
            <Pressable onPress={() => look(0, shown.sides[0].active)} disabled={mode === 'timing'} accessibilityLabel={`Voir ${me.name}`}>
            <FighterView
              key={myCard.id}
              card={myCard}
              width={layout.cardW}
              facing={1}
              act={acts[0]}
              react={reacts[0]}
              enter={enters[0]}
              ko={me.hp <= 0}
              status={statusOf(me)}
              popups={popups[0]}
            />
            </Pressable>
          ) : null}
          <View style={{ width: infoW, gap: 6, alignItems: 'flex-end' }}>
            <AppText variant="heading" numberOfLines={2} style={{ textAlign: 'right' }}>
              {cap(me.name)}
            </AppText>
            <AppText variant="label" style={{ color: getRarity(me.rarity).color }}>
              {getRarity(me.rarity).label}
            </AppText>
            <HpBar hp={me.hp} maxHp={me.maxHp} width={Math.min(infoW, 190)} />
            <StatusChips fighter={me} align="flex-end" />
          </View>
        </View>

        {/* Remplaçantes : un toucher pour changer de carte (ça utilise le tour) */}
        <View style={[styles.bench, { height: layout.benchH }]}>
          <AppText variant="caption" numberOfLines={2} style={{ width: 92 }}>
            {mode === 'replace' ? 'Choisis ta carte' : 'Remplaçantes'}
          </AppText>
          <View style={styles.benchCards}>
            {shown.sides[0].fighters.map((f, i) => {
              if (i === shown.sides[0].active) return null;
              const c = deck.find((d) => d.id === f.ref);
              if (!c) return null;
              const ko = f.hp <= 0;
              const selectable = !ko && !busy && (mode === 'replace' || mode === 'menu' || mode === 'confirmSwitch');
              return (
                <Pressable
                  key={f.ref}
                  disabled={!selectable}
                  onPress={() => onBench(i)}
                  accessibilityLabel={`Envoyer ${f.name}`}
                  style={[styles.benchItem, ko && { opacity: 0.3 }, switchTo === i && mode === 'confirmSwitch' && styles.benchPicked, mode === 'replace' && !ko && styles.benchPulse]}
                >
                  <CardFace card={c} width={layout.thumbW} quality="thumb" animated={false} />
                  <HpBar hp={f.hp} maxHp={f.maxHp} width={layout.thumbW} compact />
                  {ko ? <AppText style={styles.ko}>K.O.</AppText> : null}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Actions */}
        <View style={[styles.actions, { minHeight: layout.actionsH }]}>
          {mode === 'timing' && pending ? (
            <Animated.View entering={FadeInUp.duration(220)}>
              <TimingBar hits={pending.hits} attackName={pending.attack.name} accent={getRarity(me.rarity).color} onDone={onTimed} compact={layout.compact} />
            </Animated.View>
          ) : mode === 'confirmSwitch' && switchTo !== null ? (
            <Animated.View entering={FadeIn.duration(180)} style={{ gap: 10 }}>
              <AppText variant="body" style={{ textAlign: 'center' }} numberOfLines={2}>
                {confirmFrom === 'replace'
                  ? `Envoyer ${shown.sides[0].fighters[switchTo].name} ?`
                  : `Envoyer ${shown.sides[0].fighters[switchTo].name} ? Ça utilise ton tour.`}
              </AppText>
              <View style={styles.twoButtons}>
                <Button label="Annuler" kind="secondary" style={{ flex: 1 }} onPress={cancelSwitch} />
                <Button label="Info" icon="information-circle-outline" kind="secondary" style={{ flex: 1 }} onPress={() => look(0, switchTo)} />
                <Button label="Envoyer" icon="swap-horizontal" style={{ flex: 1.2 }} onPress={doSwitch} />
              </View>
            </Animated.View>
          ) : mode === 'replace' ? (
            <AppText variant="body" style={{ textAlign: 'center', color: colors.textDim }}>
              Touche une remplaçante pour l'envoyer.
            </AppText>
          ) : stunned && mode === 'menu' ? (
            <View style={{ gap: 10 }}>
              <AppText variant="caption" style={{ textAlign: 'center' }}>
                Ta carte est étourdie : passe ton tour, ou envoie une remplaçante.
              </AppText>
              <Button label="Passer le tour" icon="hourglass-outline" kind="secondary" onPress={doPass} />
            </View>
          ) : (
            <View style={styles.twoButtons}>
              <AttackButton
                attack={me.attacks[0]}
                tag="Classique"
                hint={attackHint(shown, me, foe, me.attacks[0], false)}
                accent={colors.text}
                compact={layout.compact}
                disabled={!canPlay}
                onPress={() => attack(0)}
              />
              <AttackButton
                attack={me.attacks[1]}
                tag="Spéciale"
                kind={specialKind}
                uses={`${me.usesLeft}/${me.maxUses}`}
                hint={
                  me.usesLeft <= 0
                    ? { text: 'Plus d’utilisation', hot: false }
                    : me.jammed > 0
                      ? { text: `Brouillée · ${me.jammed} tour${me.jammed > 1 ? 's' : ''}`, hot: false }
                      : specialKind === 'mirror'
                        ? special
                          ? { text: `Copie ${special.attack.name} ×1,3`, hot: true }
                          : { text: 'Rien à copier', hot: false }
                        : attackHint(shown, me, foe, me.attacks[1], true)
                }
                accent={getRarity(me.rarity).color}
                compact={layout.compact}
                disabled={!canPlay || !special}
                onPress={() => attack(1)}
              />
            </View>
          )}
        </View>
      </View>

      {inspect ? (
        <InspectOverlay inspect={inspect} battle={shown} deck={deck} bot={arena.bot} onClose={() => setInspect(null)} />
      ) : null}
      {soundOpen ? <SoundSheet onClose={() => setSoundOpen(false)} /> : null}

      {result !== null ? <ResultOverlay won={result === 0} arenaN={arena.n} deck={deck.map((c) => c.id).join(',')} /> : null}
      {quitting ? (
        <Animated.View entering={FadeIn.duration(150)} style={[StyleSheet.absoluteFill, styles.overlay]}>
          <Animated.View entering={ZoomIn.duration(200)} style={styles.dialog}>
            <AppText variant="title" style={{ textAlign: 'center' }}>
              Abandonner ?
            </AppText>
            <AppText variant="caption" style={{ textAlign: 'center', marginTop: 6 }}>
              Le combat sera perdu. Tes cartes ne risquent rien.
            </AppText>
            <View style={[styles.twoButtons, { marginTop: 18 }]}>
              <Button label="Continuer" kind="secondary" style={{ flex: 1 }} onPress={() => setQuitting(false)} />
              <Button label="Abandonner" kind="danger" style={{ flex: 1 }} onPress={() => router.back()} />
            </View>
          </Animated.View>
        </Animated.View>
      ) : null}
    </View>
  );
}

function InspectOverlay({
  inspect,
  battle,
  deck,
  bot,
  onClose,
}: {
  inspect: { side: SideId; index: number };
  battle: Battle;
  deck: Card[];
  bot: string;
  onClose(): void;
}) {
  const side = battle.sides[inspect.side];
  const f = side.fighters[inspect.index];
  if (!f) return null;
  const status = f.hp <= 0 ? 'K.O.' : inspect.index === side.active ? 'En jeu' : 'Remplaçante';
  if (inspect.side === 0) {
    const card = deck.find((c) => c.id === f.ref);
    if (!card) return null;
    return <InspectFighter fighter={f} card={card} status={status} onClose={onClose} />;
  }
  return (
    <InspectFighter
      fighter={f}
      card={{ id: f.ref, rarity: f.rarity, name: f.name }}
      imageSource={botArt(f.ref)}
      owner={`Carte de ${bot}`}
      status={status}
      onClose={onClose}
    />
  );
}

/** États qui durent, pour l'affichage de la carte. */
const statusOf = (f: Fighter): FighterStatus => ({
  guard: f.guard > 0,
  dodge: f.dodge > 0,
  focus: f.focus,
  marked: f.marked,
  weak: f.weak,
  jammed: f.jammed > 0,
  poison: f.poison > 0,
  chain: f.chain,
  stunned: f.stun > 0,
});

/** Animation de la carte qui lance une attaque, selon ce que fait l'attaque. */
function actFor(kind: AttackKind, special: boolean, b: Battle, side: SideId): ActKind {
  switch (kind) {
    case 'basic':
      return special ? 'power' : 'basic';
    case 'double':
    case 'slap':
    case 'combo':
    case 'recoil':
    case 'heal':
    case 'guard':
    case 'dodge':
    case 'focus':
      return kind;
    case 'revenge':
      return isEnraged(b, activeOf(b, side)) ? 'rage' : 'basic';
    case 'finisher':
      return canExecute(activeOf(b, other(side))) ? 'finisher' : 'basic';
    case 'mark':
    case 'fatigue':
    case 'jam':
    case 'poison':
      return 'small';
    default:
      return 'basic';
  }
}

/** Son au lancement de l'attaque. */
function soundFor(kind: AttackKind): Sfx {
  if (kind === 'focus') return 'focus';
  if (kind === 'heal' || kind === 'guard') return 'up2';
  return 'swipe';
}

/** Ce que l'effet en cours change, en une phrase et un son. */
const STATUS_TEXT: Record<StatusName, { text: string; sound: Sfx }> = {
  guard: { text: ' lève sa garde : −70 % de dégâts pendant 3 tours !', sound: 'shield' },
  dodge: { text: ' se met de côté, prête à esquiver !', sound: 'swipe' },
  focus: { text: ' se concentre… son prochain coup sera énorme !', sound: 'focus' },
  mark: { text: ' est dans le viseur : le prochain coup fera double dégâts !', sound: 'lockon' },
  weak: { text: ' est épuisée : son prochain coup sera moitié moins fort !', sound: 'weaken' },
  jam: { text: ' est brouillée : plus de spéciale pendant 2 tours !', sound: 'jam' },
  poison: { text: ' est empoisonnée !', sound: 'poison' },
};

/** Petite ligne sous les dégâts : ce qui a rendu le coup spécial. */
function hitTag(e: HitFlags): string | null {
  if (e.execute) return 'Coup de grâce ×2,2';
  if (e.combo && e.combo > 1) return `Série ×${String(Math.round((1 + BATTLE.comboStep * (e.combo - 1)) * 10) / 10).replace('.', ',')}`;
  if (e.focused) return 'Concentré ×3,5';
  if (e.marked) return 'Dans le viseur ×2';
  if (e.enraged) return 'Représailles ×1,6';
  if (e.guarded) return 'Garde −70 %';
  if (e.weakened) return 'Épuisée ×0,5';
  return null;
}

/** Icônes des effets en cours (avec le nombre de tours restants). */
function StatusChips({ fighter, align = 'flex-start' }: { fighter: Fighter; align?: 'flex-start' | 'flex-end' }) {
  const list = activeStatuses(fighter);
  if (list.length === 0) return null;
  return (
    <View style={[styles.chips, { justifyContent: align }]}>
      {list.map(({ key, count }) => {
        const look = STATUS_LOOK[key];
        return (
          <Animated.View key={key} entering={ZoomIn.duration(200)} style={[styles.chip, { borderColor: `${look.color}66` }]} accessibilityLabel={look.label}>
            <Ionicons name={look.icon} size={11} color={look.color} />
            {count !== undefined ? <AppText style={[styles.chipText, { color: look.color }]}>{key === 'chain' ? `×${count + 1}` : count}</AppText> : null}
          </Animated.View>
        );
      })}
    </View>
  );
}

/** Applique un évènement à l'état affiché (les jauges bougent au bon moment). */
function applyEvent(b: Battle, e: BattleEvent): Battle {
  const next: Battle = {
    ...b,
    sides: [
      { ...b.sides[0], fighters: b.sides[0].fighters.map((f) => ({ ...f })) },
      { ...b.sides[1], fighters: b.sides[1].fighters.map((f) => ({ ...f })) },
    ],
  };
  const side = 'side' in e ? next.sides[e.side] : null;
  if (!side) return next;
  const f = side.fighters[side.active];
  if (e.t === 'hit' || e.t === 'heal' || e.t === 'recoil' || e.t === 'poisonTick') f.hp = e.hp;
  if (e.t === 'hit' && e.marked) f.marked = false;
  if (e.t === 'status') {
    if (e.status === 'guard') f.guard = BATTLE.guardTurns;
    if (e.status === 'dodge') f.dodge = BATTLE.dodgeTurns;
    if (e.status === 'focus') f.focus = true;
    if (e.status === 'mark') f.marked = true;
    if (e.status === 'weak') f.weak = true;
    if (e.status === 'jam') f.jammed = BATTLE.jamTurns;
    if (e.status === 'poison') f.poison = BATTLE.poisonTurns;
  }
  if (e.t === 'poisonTick') f.poison = e.left;
  if (e.t === 'stun') f.stun = e.turns;
  else if (e.t === 'stunned') f.stun = e.left;
  else if (e.t === 'switch') side.active = e.to;
  return next;
}

function AttackButton({
  attack,
  tag,
  kind,
  uses,
  hint,
  accent,
  compact,
  disabled,
  onPress,
}: {
  attack: Attack;
  tag: string;
  /** Type de l'attaque spéciale : son icône dit ce qu'elle fait, quel que soit son nom. */
  kind?: AttackKind;
  /** Utilisations restantes de la spéciale (« 2/3 »). */
  uses?: string;
  hint: { text: string; hot: boolean };
  accent: string;
  compact: boolean;
  disabled: boolean;
  onPress(): void;
}) {
  const { width } = useWindowDimensions();
  // Deux boutons côte à côte : le nom de l'attaque doit toujours tenir en entier.
  const inner = (width - 42) / 2 - 30;
  const nameSize = Math.floor(fitFontSize([{ text: attack.name }], inner, 2, compact ? 16 : 17, 11));
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={attack.name}
      style={({ pressed }) => [
        styles.attack,
        compact && { minHeight: 70, paddingVertical: 8 },
        { borderColor: hint.hot && !disabled ? colors.gold : `${accent}55` },
        hint.hot && !disabled && styles.attackHot,
        disabled && { opacity: 0.4 },
        pressed && { transform: [{ scale: 0.97 }] },
      ]}
    >
      <View style={styles.attackTagRow}>
        {kind ? <Ionicons name={KIND_LOOK[kind].icon} size={12} color={KIND_LOOK[kind].color} /> : null}
        <AppText style={[styles.attackTag, { color: accent, flex: 1 }]} numberOfLines={1}>
          {kind ? (kind === 'basic' ? 'Coup puissant' : ATTACK_KIND_LABEL[kind]) : tag}
        </AppText>
        {uses ? <AppText style={[styles.attackTag, { color: colors.textDim }]}>{uses}</AppText> : null}
      </View>
      <AppText
        style={[styles.attackName, { fontSize: nameSize, lineHeight: Math.round(nameSize * 1.2) }]}
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {attack.name}
      </AppText>
      <AppText variant="caption" numberOfLines={1} style={hint.hot && !disabled ? { color: colors.gold } : undefined}>
        {hint.text}
      </AppText>
    </Pressable>
  );
}

function ResultOverlay({ won, arenaN, deck }: { won: boolean; arenaN: number; deck: string }) {
  const next = getArena(arenaN + 1);
  return (
    <Animated.View entering={FadeIn.duration(250)} style={[StyleSheet.absoluteFill, styles.overlay]}>
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        {won ? (
          <View style={{ position: 'absolute' }}>
            <Burst trigger={1} colors={[colors.gold, '#FFF3C2', colors.success]} count={36} radius={170} />
          </View>
        ) : null}
        <Animated.View entering={ZoomIn.springify().damping(12)} style={[styles.medal, { backgroundColor: won ? colors.gold : colors.surface2 }]}>
          <Ionicons name={won ? 'trophy' : 'refresh'} size={40} color={won ? '#141414' : colors.text} />
        </Animated.View>
      </View>
      <Animated.View entering={FadeInDown.delay(200)} style={{ alignItems: 'center', marginTop: 22, paddingHorizontal: 32 }}>
        <AppText variant="display">{won ? 'Victoire !' : 'Défaite'}</AppText>
        <AppText variant="body" style={{ textAlign: 'center', color: colors.textDim, marginTop: 6 }}>
          {won ? (next ? `Arène ${arenaN} gagnée. L'arène ${next.n} est débloquée !` : 'Tu as gagné la dernière arène. Bravo !') : 'Change de cartes ou vise mieux la cible, et retente ta chance.'}
        </AppText>
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(350)} style={{ alignSelf: 'stretch', gap: 10, marginTop: 30, paddingHorizontal: 32 }}>
        {won && next ? (
          <Button label={`Arène ${next.n} · ${next.place}`} size="lg" icon="arrow-forward" onPress={() => router.replace({ pathname: '/battle/deck', params: { arena: String(next.n) } })} />
        ) : null}
        {!won ? <Button label="Réessayer" size="lg" icon="refresh" onPress={() => router.replace({ pathname: '/battle/fight', params: { arena: String(arenaN), deck } })} /> : null}
        <Button label="Retour aux arènes" kind="secondary" onPress={() => router.back()} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  round: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dots: { flexDirection: 'row', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotKo: { borderWidth: 1.5, borderColor: colors.textFaint },
  dotActive: { transform: [{ scale: 1.3 }] },
  message: {
    marginHorizontal: 16,
    marginVertical: 6,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bench: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20 },
  benchCards: { flexDirection: 'row', gap: 10 },
  benchItem: { alignItems: 'center', gap: 4, padding: 3, borderRadius: 8, borderWidth: 1.5, borderColor: 'transparent' },
  benchPicked: { borderColor: colors.gold },
  benchPulse: { borderColor: colors.success },
  ko: { position: 'absolute', top: 20, fontFamily: fonts.black, fontSize: 11, color: colors.danger },
  actions: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 16 },
  twoButtons: { flexDirection: 'row', gap: 10 },
  attack: {
    flex: 1,
    minHeight: 84,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    justifyContent: 'center',
    gap: 3,
  },
  attackTag: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase' },
  attackTagRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  attackHot: { backgroundColor: 'rgba(247,201,72,0.08)' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 5, height: 18, borderRadius: 9, borderWidth: 1, backgroundColor: 'rgba(0,0,0,0.25)' },
  chipText: { fontFamily: fonts.bold, fontSize: 10 },
  attackName: { fontFamily: fonts.bold, fontSize: 17, color: colors.text },
  overlay: { backgroundColor: 'rgba(5,5,7,0.88)', alignItems: 'center', justifyContent: 'center', zIndex: 20 },
  dialog: { width: '86%', maxWidth: 380, padding: 22, borderRadius: 24, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  medal: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
});
