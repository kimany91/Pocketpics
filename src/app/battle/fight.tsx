/**
 * Écran de combat. La logique est dans src/battle/engine.ts ; ici on met en
 * scène les évènements un par un (message, élan, coup, jauge, K.O.), on fait
 * jouer le bot, et on propose au joueur ses actions : attaque classique,
 * attaque spéciale (mini-jeu de précision), ou changer de carte.
 *
 * Mise en scène : décor flou de l'arène, ouverture « VS », bandeau à chaque
 * changement de tour, et le cadre du message prend la couleur du camp dont on
 * parle. Un coup se joue en trois temps : l'élan (`use`), la ruée de la carte
 * qui attaque (`hit`, `STRIKE_MS`), puis l'impact au contact : image figée un
 * instant, chiffre, tremblement de l'écran à la mesure des PV perdus (zoom et
 * éclair en plus sur un critique). Au K.O., la carte éclate ; le dernier K.O.
 * affiche un grand « K.O. ! » avant l'écran de fin (confettis, étoiles une à une,
 * pièces qui défilent).
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  withDelay,
  FadeInLeft,
  FadeInRight,
  FadeInUp,
  ZoomIn,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type AdResult, showRewardedAd } from '../../ads/rewarded';
import { ONLINE_TRACK, startBattleMusic, stopBattleMusic } from '../../audio/music';
import { type Sfx, playSfx } from '../../audio/sfx';
import { type Level, TOTAL_LEVELS, getLevel, hiddenAdjust, levelFighters, levelMmr, starsFor } from '../../battle/levels';
import { botAction, botReplacement } from '../../battle/bot';
import { portraitRef } from '../../battle/arenas';
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
  reviveSide,
  resolveAttack,
} from '../../battle/engine';
import { ATTACK_KIND_LABEL, type Attack, type AttackKind, BATTLE, STATUS_KINDS, kindOf } from '../../battle/stats';
import { type BattleController, type Move, type Step, applyMove } from '../../net/battleNet';
import { useMatch } from '../../net/match';
import { useSocial } from '../../net/social';
import { CoinIcon } from '../../components/Coin';
import { MvpBadge } from '../../components/battle/MvpBadge';
import { CHALLENGE_REWARD } from '../../game/quests';
import { RankEmblem } from '../../components/rank/RankEmblem';
import type { SoloReward } from '../../game/economy';
import { DIVISION_POINTS, rankOf, shownMmr } from '../../game/rank';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { type ActKind, type FighterStatus, FighterView, HpBar, type Popup, type ReactKind, STRIKE_MS, type StrikeKind } from '../../components/battle/FighterView';
import { KIND_LOOK, STATUS_LOOK, activeStatuses, attackHint, turnOf } from '../../components/battle/kinds';
import { FitLines, FitText, type TextPart, fitFontSize } from '../../components/battle/FitText';
import { ArenaBackdrop } from '../../components/battle/ArenaBackdrop';
import { InspectFighter } from '../../components/battle/InspectFighter';
import { QUALITY_LABEL, TimingBar } from '../../components/battle/TimingBar';
import { TurnBanner } from '../../components/battle/TurnBanner';
import { VsIntro } from '../../components/battle/VsIntro';
import { SoundSheet } from '../../components/SoundSheet';
import { CardFace } from '../../components/card/CardFace';
import { Burst, Confetti, Flash, Glow, ImpactLines, Rays, Shockwave } from '../../components/fx';
import { getRarity } from '../../game/rarity';
import { useGame } from '../../state/game';
import { TutoArrow, TutoBubble } from '../../components/tuto/TutoArrow';
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

/** L'adversaire du mode solo : le bot de l'arène, qui « réfléchit » un instant avant de jouer. */
class BotController implements BattleController {
  /** `edge` : adaptation cachée de l'adversaire aux cartes du joueur (voir hiddenAdjust). */
  constructor(
    private level: number,
    private edge = 0,
  ) {}
  async submit(move: Move, b: Battle): Promise<Step> {
    return applyMove(b, 0, move);
  }
  async next(b: Battle): Promise<Step> {
    await sleep(b.mustReplace === 1 ? 500 : 700);
    return b.mustReplace === 1 ? replace(b, 1, botReplacement(b, 1, this.level)) : act(b, botAction(b, 1, this.level, Math.random, this.edge));
  }
}

/** Qui est en face : le bot d'une arène, ou un joueur en ligne. */
interface Foe {
  name: string;
  tint: string;
  mmr: number;
  /** Titre en haut de l'écran. */
  label: string;
  art?: { uri: string } | number;
  image(ref: string): { imageSource?: number; imageUri?: string };
  /** Monde final : la Galerie (`gallery`) ou son boss, le Grand Portrait (`portrait`). */
  stage?: 'gallery' | 'portrait';
}

const ONLINE_TINT = '#7C9CFF';
/** En ligne : temps pour jouer son coup, après quoi un coup est joué automatiquement. */
const TURN_SECONDS = 40;

export default function FightScreen() {
  const params = useLocalSearchParams<{ level?: string; deck?: string; online?: string; challenge?: string }>();
  const online = params.online === '1';
  const level: Level | undefined = online ? undefined : (getLevel(Number(params.level)) ?? undefined);
  const allCards = useGame((s) => s.cards);
  const winLevel = useGame((s) => s.winLevel);
  const finishRanked = useGame((s) => s.finishRanked);
  const myMmr = useGame((s) => (s.save ? shownMmr(s.save.rank) : 0));
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  // Tout est figé au début du combat : deck, adversaire, contrôleur.
  const [setup] = useState(() => {
    const m = useMatch.getState();
    const ids = online ? m.myDeck : String(params.deck ?? '').split(',');
    const deck = ids
      .map((id) => allCards.find((c) => c.id === id))
      .filter((c): c is Card => !!c)
      .slice(0, 4);
    if (online) {
      if (!m.start || !m.controller || !m.opp) return null;
      // ses images arrivent une par une pendant le combat (voir `oppArt`) : on lit
      // la table au moment de l'affichage, pas une fois pour toutes
      const bot = m.bot;
      const foe: Foe = {
        name: m.opp.name,
        tint: ONLINE_TINT,
        mmr: m.opp.mmr,
        label: 'Combat classé',
        art: bot && m.oppDeck?.[0] ? botArt(m.oppDeck[0].ref) : undefined,
        image: (ref) => (bot ? { imageSource: botArt(ref) } : { imageUri: useMatch.getState().oppArt[ref] || undefined }),
      };
      return { deck, foe, battle: m.start, controller: m.controller };
    }
    if (!level || deck.length === 0) return null;
    const foe: Foe = {
      name: level.world.bot,
      tint: level.world.tint,
      mmr: levelMmr(level.n),
      label: level.world.final
        ? `${level.boss ? 'Boss final' : level.world.place} · Niveau ${level.n}`
        : `${level.boss ? 'Boss · ' : ''}Monde ${level.world.n} · Niveau ${level.n}`,
      art: botArt(portraitRef(level.world)),
      image: (ref) => ({ imageSource: botArt(ref) }),
      stage: level.world.final ? (level.boss ? 'portrait' : 'gallery') : undefined,
    };
    // difficulté cachée : l'adversaire s'adapte si les cartes choisies sont bien au-dessus de la normale
    const mine = deck.map(toFighter);
    const hidden = hiddenAdjust(level, mine);
    return { deck, foe, battle: createBattle(mine, levelFighters(level, hidden.mult), { catchUp: 1 }), controller: new BotController(level.botLevel, hidden.edge) as BattleController };
  });
  /** Tuto : premier combat solo, guidé par des bulles. Sa fin (gagné ou perdu) termine la phase 1. */
  const [tuto] = useState(() => !online && !!level && useGame.getState().save?.tutorial.step === 'battle');
  /** Tuto : coups joués et visées faites (les bulles changent au fil du combat). */
  const [tutoTurns, setTutoTurns] = useState(0);
  const [tutoAims, setTutoAims] = useState(0);
  const [tutoDone, setTutoDone] = useState(false);
  const deck = setup?.deck ?? [];
  const foeInfo = setup?.foe;
  const controller = setup?.controller;
  const [battle, setBattle] = useState<Battle | null>(setup?.battle ?? null);
  const [shown, setShown] = useState<Battle | null>(battle);
  /** Coup de l'adversaire reçu, à mettre en scène dès que possible. */
  const [incoming, setIncoming] = useState<Step | null>(null);
  const asked = useRef<Battle | null>(null);
  /** Gains en fin de combat : pièces (solo) ou points de rang (en ligne). */
  const [reward, setReward] = useState<SoloReward | null>(null);
  const [starsWon, setStarsWon] = useState(0);
  /** Victoire contre le Grand Portrait alors que la carte Galaxy n'est pas encore gagnée. */
  const [galaxyWin, setGalaxyWin] = useState(false);
  /** Carte du joueur qui a fait le plus de dégâts. */
  const [mvp, setMvp] = useState<{ card: Card; dealt: number } | null>(null);
  /** Défi du jour réussi pendant ce combat (prime versée). */
  const [challengeWon, setChallengeWon] = useState(false);
  const [rankChange, setRankChange] = useState<{ before: number; after: number } | null>(null);
  const [endReason, setEndReason] = useState<'gone' | 'lost' | null>(null);
  /** L'adversaire est parti : le combat ne compte pour personne. */
  const [cancelled, setCancelled] = useState(false);
  /** Solo : déjà revenu une fois grâce à une pub (une seule fois par combat). */
  const [revived, setRevived] = useState(false);
  const [turnLeft, setTurnLeft] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>('idle');
  const [msg, setMsg] = useState<Msg>([{ text: setup ? `${setup.foe.name} te défie !` : '' }]);
  /** Camp dont parle le message (couleur du cadre), et clé pour rejouer son apparition. */
  const [speaker, setSpeaker] = useState<SideId | null>(1);
  const [msgKey, setMsgKey] = useState(0);
  const say = (m: Msg, side: SideId | null) => {
    setMsg(m);
    setSpeaker(side);
    setMsgKey((k) => k + 1);
  };
  /** Ouverture « VS » : le combat attend qu'elle soit finie. */
  const [intro, setIntro] = useState(true);
  /** Éclair plein écran (critique, coup de grâce, K.O.), de la couleur du coup. */
  const [flash, setFlash] = useState<{ n: number; color: string; peak: number }>({ n: 0, color: '#FFFFFF', peak: 0.22 });
  const flashScreen = (color = '#FFFFFF', peak = 0.22) => setFlash((f) => ({ n: f.n + 1, color, peak }));
  const shakeX = useSharedValue(0);
  const shakeY = useSharedValue(0);
  const punchV = useSharedValue(0);
  /** L'écran tremble, d'autant plus que le coup est fort (après l'arrêt sur image `delay`). */
  const shake = (power: number, delay = 0) => {
    // la Galerie, monde final : les coups secouent un peu plus fort
    const heavy = setup?.foe.stage ? 1.25 : 1;
    const a = Math.min(14 * heavy, power * heavy);
    const seq = (k: number) =>
      withDelay(
        delay,
        withSequence(
          withTiming(a * k, { duration: 35 }),
          withTiming(-a * 0.8 * k, { duration: 45 }),
          withTiming(a * 0.5 * k, { duration: 45 }),
          withTiming(-a * 0.25 * k, { duration: 45 }),
          withTiming(0, { duration: 60, easing: Easing.out(Easing.quad) }),
        ),
      );
    shakeX.value = seq(1);
    shakeY.value = seq(-0.6);
  };
  /** Petit coup de zoom de la « caméra » sur les gros coups. */
  const punch = (amount: number) => {
    punchV.value = withSequence(withTiming(amount, { duration: 60, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 320, easing: Easing.out(Easing.cubic) }));
  };
  const stageStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }, { translateY: shakeY.value }, { scale: 1 + punchV.value }] }));
  /** Bandeau de changement de tour (rejoué à chaque changement). */
  const [banner, setBanner] = useState<{ key: number; mine: boolean } | null>(null);
  const lastBanner = useRef<boolean | null>(null);
  const showBanner = (mine: boolean) => {
    if (lastBanner.current === mine) return;
    lastBanner.current = mine;
    setBanner((b) => ({ key: (b?.key ?? 0) + 1, mine }));
  };
  /** Grand « K.O. ! » quand la dernière carte d'un camp tombe. */
  const [koStamp, setKoStamp] = useState<{ n: number; won: boolean }>({ n: 0, won: true });
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
    music.current = startBattleMusic(online ? ONLINE_TRACK : (level?.world.id ?? 1));
    const token = music.current;
    return () => stopBattleMusic(token, 500);
  }, []);
  // Animations : une « action » (la carte qui agit) et une « réaction » (la carte qui subit) par camp.
  type ActFx = { key: number; kind: ActKind; color?: string };
  type ReactFx = { key: number; kind: ReactKind; strong?: boolean; color?: string; hitstop?: number };
  type StrikeFx = { key: number; kind: StrikeKind; color: string };
  type CastFx = { key: number; color: string; icon: (typeof KIND_LOOK)[AttackKind]['icon'] };
  const [acts, setActs] = useState<[ActFx, ActFx]>([
    { key: 0, kind: 'basic' },
    { key: 0, kind: 'basic' },
  ]);
  const [reacts, setReacts] = useState<[ReactFx, ReactFx]>([
    { key: 0, kind: 'hurt' },
    { key: 0, kind: 'hurt' },
  ]);
  const [strikes, setStrikes] = useState<[StrikeFx | undefined, StrikeFx | undefined]>([undefined, undefined]);
  const [casts, setCasts] = useState<[CastFx | undefined, CastFx | undefined]>([undefined, undefined]);
  const [shatters, setShatters] = useState<[number, number]>([0, 0]);
  // 0 : les cartes arrivent sur le terrain à la fin de l'ouverture
  const [enters, setEnters] = useState<[number, number]>([0, 0]);
  const [popups, setPopups] = useState<[Popup[], Popup[]]>([[], []]);
  const fxKey = useRef(0);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const doAct = (side: SideId, kind: ActKind, color?: string) =>
    setActs((a) => {
      const next: typeof a = [a[0], a[1]];
      next[side] = { key: ++fxKey.current, kind, color };
      return next;
    });
  const doReact = (side: SideId, kind: ReactKind, strong = false, color?: string, hitstop = 0) =>
    setReacts((a) => {
      const next: typeof a = [a[0], a[1]];
      next[side] = { key: ++fxKey.current, kind, strong, color, hitstop };
      return next;
    });
  const doStrike = (side: SideId, kind: StrikeKind, color: string) =>
    setStrikes((a) => {
      const next: typeof a = [a[0], a[1]];
      next[side] = { key: ++fxKey.current, kind, color };
      return next;
    });
  const doCast = (side: SideId, kind: AttackKind) =>
    setCasts((a) => {
      const next: typeof a = [a[0], a[1]];
      next[side] = { key: ++fxKey.current, color: KIND_LOOK[kind].color, icon: KIND_LOOK[kind].icon };
      return next;
    });
  const doShatter = (side: SideId) => setShatters((k) => (side === 0 ? [k[0] + 1, k[1]] : [k[0], k[1] + 1]));
  const doEnter = (side: SideId) => setEnters((e) => (side === 0 ? [e[0] + 1, e[1]] : [e[0], e[1] + 1]));
  const popup = (side: SideId, p: Omit<Popup, 'key'>) =>
    setPopups((all) => {
      const next: [Popup[], Popup[]] = [all[0], all[1]];
      next[side] = [...all[side].slice(-3), { ...p, key: ++fxKey.current }];
      return next;
    });

  /** En ligne, une carte sans nom s'appelle « Carte Épique » des deux côtés : on précise « ta » ou « sa ». */
  const who = (name: string, side: SideId) => (online && /^Carte /.test(name) ? `${side === 0 ? 'ta' : 'sa'} carte${name.slice(5)}` : name);
  const nameParts = (name: string, side: SideId): TextPart => ({ text: who(name, side), bold: true, color: side === 0 ? colors.text : foeInfo?.tint });

  /** Met en scène les évènements d'une action, puis passe au nouvel état. */
  const play = async (events: BattleEvent[], final: Battle) => {
    if (!foeInfo) return;
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
            say({ top: [nameParts(e.fighter, e.side), { text: e.copied ? ' copie' : ' utilise' }], attack: `${e.attack.name} !` }, e.side);
            setShown(view);
            if (e.copied) {
              doAct(e.side, 'mirror');
              await sleep(380);
            }
            // attaque spéciale : rayons, anneau et icône de son type
            if (e.special || e.copied) doCast(e.side, kind);
            // l'élan : la carte se charge, puis chaque coup la fait foncer (« hit »)
            doAct(e.side, actFor(kind, e.special, before, e.side), KIND_LOOK[kind].color);
            playSfx(soundFor(kind), { volume: 0.6 });
            const flourish = e.special || e.copied ? 140 : 0;
            await sleep(STATUS_KINDS.includes(kind) ? 500 : (e.side === 0 ? 340 : 620) + flourish);
            break;
          }
          case 'hit': {
            const strong = e.quality === 'crit' || !!e.execute;
            const kind = e.kind as AttackKind;
            const color = e.execute ? '#FF2E3F' : (KIND_LOOK[kind]?.color ?? '#FFFFFF');
            // la carte qui attaque fonce ; tout part au moment du contact
            doStrike(other(e.side), kind === 'slap' ? 'slap' : kind === 'recoil' ? 'heavy' : 'dash', color);
            await sleep(STRIKE_MS);
            if (!alive.current) return;
            setShown(view);
            /** Arrêt sur image au contact : plus long sur un gros coup. */
            const hitstop = e.damage <= 0 ? 0 : strong ? 110 : e.guarded ? 40 : 70;
            if (e.damage > 0) {
              doReact(e.side, e.execute ? 'execute' : e.guarded ? 'guarded' : e.kind === 'slap' ? 'slapped' : 'hurt', strong, color, hitstop);
              // l'écran tremble selon la part de PV perdue ; un critique fait aussi un éclair et un coup de zoom
              const part = Math.min(1, e.damage / Math.max(1, before.sides[e.side].fighters[before.sides[e.side].active].maxHp));
              shake(e.guarded ? 2 : 3 + part * 16 + (strong ? 5 : 0), hitstop);
              if (strong) {
                flashScreen(e.execute ? '#FF2E3F' : '#FFF3C2', 0.26);
                punch(0.035);
              } else if (part > 0.25) punch(0.015);
            } else doReact(e.side, 'whiff');
            if (e.quality === 'miss') playSfx('miss');
            else if (e.quality === 'crit' || e.execute) playSfx('crit');
            else playSfx(e.kind === 'slap' ? 'slap' : 'hit', { volume: e.quality === 'weak' || e.guarded ? 0.6 : 1 });
            if (e.guarded) playSfx('shield', { volume: 0.6 });
            if (e.damage > 0) (strong ? haptic.heavy : haptic.medium)();
            if (hitstop) await sleep(hitstop);
            const q = QUALITY_LABEL[e.quality];
            const tag = hitTag(e);
            popup(
              e.side,
              e.damage > 0
                ? {
                    main: `-${e.damage}`,
                    color: strong ? colors.gold : '#FFFFFF',
                    sub: tag ?? q.text,
                    subColor: tag ? colors.gold : q.color,
                    big: strong,
                  }
                : { main: 'Raté !', color: '#C9C8D2', soft: true },
            );
            // le coup fatal : on enchaîne vite sur le K.O.
            await sleep(e.hp <= 0 ? 520 : e.execute ? 820 : strong ? 700 : 600);
            break;
          }
          case 'status': {
            setShown(view);
            const look = STATUS_TEXT[e.status];
            say([nameParts(e.fighter, e.side), { text: look.text }], e.side);
            playSfx(look.sound, { volume: 0.8 });
            if (e.status === 'guard') doAct(e.side, 'guard');
            await sleep(1150);
            break;
          }
          case 'heal':
            setShown(view);
            doReact(e.side, 'heal');
            popup(e.side, { main: `+${e.amount}`, color: colors.success, sub: 'Soin' , subColor: colors.success });
            say([nameParts(e.fighter, e.side), { text: ` récupère ${e.amount} PV !` }], e.side);
            playSfx('heal');
            haptic.success();
            await sleep(1150);
            break;
          case 'dodged':
            // elle fonce… dans le vide
            doStrike(other(e.side), 'whiff', '#5EE6D6');
            await sleep(70);
            if (!alive.current) return;
            setShown(view);
            doReact(e.side, 'dodged');
            popup(e.side, { main: 'Esquivé !', color: '#5EE6D6' });
            say([nameParts(e.fighter, e.side), { text: ' esquive l’attaque !' }], e.side);
            playSfx('swipe', { volume: 0.9 });
            haptic.light();
            await sleep(1100);
            break;
          case 'dodgeFail':
            say([nameParts(e.fighter, e.side), { text: ' n’arrive pas à esquiver !' }], e.side);
            await sleep(550);
            break;
          case 'recoil':
            setShown(view);
            doReact(e.side, 'recoil');
            popup(e.side, { main: `-${e.damage}`, color: '#FF8A7A', sub: 'Contrecoup', subColor: '#FF8A7A' });
            shake(4);
            say([nameParts(e.fighter, e.side), { text: ' encaisse le contrecoup !' }], e.side);
            playSfx('hit', { volume: 0.6 });
            await sleep(950);
            break;
          case 'poisonTick':
            setShown(view);
            doReact(e.side, 'poison');
            popup(e.side, { main: `-${e.damage}`, color: '#D9A6FF', sub: 'Poison', subColor: '#D9A6FF' });
            shake(3);
            say([nameParts(e.fighter, e.side), { text: ' souffre du poison !' }], e.side);
            playSfx('poison');
            haptic.light();
            await sleep(1100);
            break;
          case 'stun':
            setShown(view);
            say([nameParts(e.fighter, e.side), { text: ` est étourdie pendant ${e.turns} tour${e.turns > 1 ? 's' : ''} !` }], e.side);
            playSfx('stun', { volume: 0.8 });
            await sleep(1200);
            break;
          case 'stunned':
            setShown(view);
            say([nameParts(e.fighter, e.side), { text: e.left > 0 ? ' est étourdie et ne peut pas attaquer !' : ' est étourdie… mais reprend ses esprits !' }], e.side);
            playSfx('stun', { volume: 0.5 });
            await sleep(1300);
            break;
          case 'ko': {
            setShown(view);
            say([nameParts(e.fighter, e.side), { text: ' est K.O. !' }], e.side);
            // la carte fissurée éclate en morceaux
            doShatter(e.side);
            playSfx('ko');
            haptic.heavy();
            shake(12);
            punch(0.03);
            flashScreen('#FFFFFF', 0.3);
            const last = view.sides[e.side].fighters.every((f) => f.hp <= 0);
            if (last) setKoStamp((k) => ({ n: k.n + 1, won: e.side === 1 }));
            await sleep(last ? 1500 : 1200);
            break;
          }
          case 'switch':
            setShown(view);
            // la nouvelle carte arrive sans les chiffres de la précédente
            setPopups((all) => (e.side === 0 ? [[], all[1]] : [all[0], []]));
            doEnter(e.side);
            const cosmic = getRarity(view.sides[e.side].fighters[e.to]?.rarity ?? '').frameStyle === 'galaxy';
            if (cosmic) {
              // la carte Galaxy surgit d'un tourbillon : éclair violet, l'écran tremble
              playSfx('ultra', { volume: 0.8 });
              haptic.heavy();
              flashScreen('#B98CFF', 0.4);
              shake(9, 700);
              punch(0.03);
              say([{ text: `${foeInfo.name} révèle sa carte ` }, { text: 'Galaxy', bold: true, color: '#3FD0FF' }, { text: ' !' }], e.side);
              await sleep(1700);
              break;
            }
            playSfx('swipe', { volume: 0.7 });
            if (e.side === 0) say(e.forced ? [{ text: 'À toi, ' }, nameParts(e.fighter, 0), { text: ' !' }] : [{ text: 'Reviens ! À toi, ' }, nameParts(e.fighter, 0), { text: ' !' }], e.side);
            else say([{ text: `${foeInfo.name} ${e.forced ? 'envoie' : 'rappelle sa carte et envoie'} ` }, nameParts(e.fighter, 1), { text: ' !' }], e.side);
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

  /**
   * Combat annulé : l'adversaire est parti. Ça ne compte pour personne — celui
   * qui reste ne gagne rien (sinon abandonner serait un cadeau), et celui qui
   * est parti a déjà perdu ses points de son côté.
   */
  const cancel = () => {
    if (!foeInfo) return;
    setCancelled(true);
    setResult(0);
    setEndReason('gone');
    setMode('idle');
    stopBattleMusic(music.current, 600);
    useGame.getState().cancelRanked();
    setRankChange(null);
    haptic.warning();
  };

  /** Fin du combat : pièces en solo, points de rang en ligne. */
  const finish = (winner: SideId, reason: 'gone' | 'lost' | null = null) => {
    if (!foeInfo) return;
    setResult(winner);
    setEndReason(reason);
    setMode('idle');
    stopBattleMusic(music.current, 600);
    // MVP : la carte qui a retiré le plus de PV à l'adversaire
    if (battle) {
      const best = [...battle.sides[0].fighters].sort((a, b) => (b.dealt ?? 0) - (a.dealt ?? 0))[0];
      const card = best && (best.dealt ?? 0) > 0 ? deck.find((c) => c.id === best.ref) : undefined;
      setMvp(card ? { card, dealt: best.dealt } : null);
    }
    if (online) setRankChange(finishRanked(winner === 0));
    else if (winner === 0 && level && battle) {
      // étoiles : 3 sans perdre de carte, 2 en en perdant une, 1 sinon
      const stars = starsFor(battle.sides[0].fighters.filter((f) => f.hp <= 0).length);
      setStarsWon(stars);
      setReward(winLevel(level.n, stars));
      if (params.challenge === '1') setChallengeWon(useGame.getState().completeChallenge(level.n, deck.map((c) => c.id)));
      if (level.world.final && level.boss && !useGame.getState().save?.galaxyClaimed) setGalaxyWin(true);
    }
    // Tuto : fin du premier combat, tout le jeu se débloque (phase 2)
    if (tuto) {
      useGame.getState().advanceTuto('battle');
      setTutoDone(true);
    }
    if (winner === 0) {
      playSfx('win');
      haptic.success();
    } else {
      playSfx('lose');
      haptic.warning();
    }
  };

  /**
   * Solo, après une défaite : une pub regardée jusqu'au bout fait revenir la plus
   * forte des cartes tombées (moitié de ses PV) et le combat reprend.
   */
  const revive = async (): Promise<AdResult> => {
    const r = await showRewardedAd();
    if (r !== 'rewarded' || !battle || !alive.current) return r;
    const back = reviveSide(battle, 0);
    asked.current = null;
    setRevived(true);
    setMvp(null);
    setShown(back);
    setBattle(back);
    setEndReason(null);
    setResult(null);
    music.current = startBattleMusic(level?.world.id ?? 1);
    playSfx('heal');
    haptic.success();
    return r;
  };

  // Ses images arrivent une par une pendant le combat : la première sert de décor.
  const oppArt = useMatch((s) => s.oppArt);
  const firstArt = Object.values(oppArt)[0];
  const foeArt = foeInfo?.art ?? (firstArt ? { uri: firstArt } : undefined);

  // En ligne : l'adversaire part (victoire) ou ma connexion lâche (défaite).
  const oppGone = useMatch((s) => s.oppGone);
  const lostConnection = useMatch((s) => s.lostConnection);
  useEffect(() => {
    if (!online || result !== null) return;
    if (oppGone) cancel();
    else if (lostConnection) finish(1, 'lost');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, oppGone, lostConnection, result]);
  // En quittant l'écran, on ferme la partie en ligne.
  useEffect(() => () => {
    if (online) useMatch.getState().leave();
  }, [online]);

  // Déroulé du combat : fin, remplacements après K.O., tour de l'adversaire ou du joueur.
  useEffect(() => {
    // En pause pendant qu'on regarde une carte ou qu'on règle le son.
    if (!battle || !controller || busy || result !== null || inspect || soundOpen || intro) return;
    if (battle.winner !== null) {
      finish(battle.winner);
      return;
    }
    // Au tour de l'adversaire : on lui demande son coup une seule fois par état du combat.
    if (battle.mustReplace === 1 || (battle.turn === 1 && battle.mustReplace === null)) {
      setMode('idle');
      if (asked.current !== battle) {
        asked.current = battle;
        if (battle.mustReplace === null) showBanner(false);
        if (online) say([{ text: `${foeInfo?.name ?? 'L’adversaire'} choisit son coup…` }], 1);
        controller
          .next(battle)
          .then((step) => alive.current && setIncoming(step))
          .catch((err) => console.warn('Coup adverse impossible', err));
      }
      return;
    }
    // Une confirmation d'envoi en cours (ex. retour de « Info ») reste affichée.
    if (mode === 'confirmSwitch') return;
    if (battle.mustReplace === 0) {
      setMode('replace');
      say([{ text: 'Choisis ta prochaine carte' }], 0);
      return;
    }
    const me = activeOf(battle, 0);
    showBanner(true);
    setMode('menu');
    say(me.stun > 0 ? [nameParts(me.name, 0), { text: ' est étourdie…' }] : [{ text: 'Que doit faire ' }, nameParts(me.name, 0), { text: ' ?' }], 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battle, busy, result, inspect, soundOpen, intro]);

  // Coup adverse arrivé : on le met en scène (après la pause éventuelle).
  useEffect(() => {
    if (!incoming || busy || result !== null || inspect || soundOpen || intro) return;
    const step = incoming;
    setIncoming(null);
    void play(step.events, step.battle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming, busy, result, inspect, soundOpen, intro]);

  /** Envoie le coup du joueur, puis met en scène ce qui en résulte. */
  const submit = (move: Move) => {
    if (!battle || !controller) return;
    if (tuto && move.type === 'act') setTutoTurns((n) => n + 1);
    setBusy(true);
    setMode('idle');
    setTurnLeft(null);
    controller
      .submit(move, battle)
      .then((step) => {
        if (alive.current) void play(step.events, step.battle);
      })
      .catch((err) => {
        console.warn('Coup impossible', err);
        if (alive.current) setBusy(false);
      });
  };

  // En ligne : un temps limité pour jouer, sinon un coup part tout seul.
  const autoMove = useRef<() => void>(() => {});
  useEffect(() => {
    if (!online || !battle || busy || result !== null || battle.winner !== null) {
      setTurnLeft(null);
      return;
    }
    const mine = battle.mustReplace === 0 || (battle.turn === 0 && battle.mustReplace === null);
    if (!mine) {
      setTurnLeft(null);
      return;
    }
    const end = Date.now() + TURN_SECONDS * 1000;
    setTurnLeft(TURN_SECONDS);
    const t = setInterval(() => {
      const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setTurnLeft(left);
      if (left === 0) {
        clearInterval(t);
        autoMove.current();
      }
    }, 250);
    return () => clearInterval(t);
  }, [online, battle, busy, result]);

  const endIntro = () => {
    setIntro(false);
    // l'adversaire arrive, puis ta carte
    doEnter(1);
    setTimeout(() => alive.current && doEnter(0), 260);
  };

  const layout = useMemo(() => {
    const avail = height - insets.top - insets.bottom;
    // Petits écrans (iPhone SE…) : message, remplaçantes et boutons plus compacts.
    const compact = avail < 720;
    const msgH = compact ? 76 : 96;
    const benchH = compact ? 64 : 84;
    const actionsH = compact ? 114 : 140;
    const fixed = 48 + msgH + 22 + benchH + actionsH + 20;
    const cardW = Math.max(78, Math.min(width * 0.4, 168, (avail - fixed) / (CARD_RATIO * 1.9)));
    return { cardW, foeW: cardW * 0.9, compact, msgH, benchH, actionsH, thumbW: compact ? 34 : 42 };
  }, [width, height, insets]);

  if (!foeInfo || !battle || !shown) {
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
      submit({ type: 'act', action: { type: 'attack', slot, timings: [] } });
      return;
    }
    setPending({ slot, attack: r.attack, hits });
    setMode('timing');
  };

  const onTimed = (timings: number[]) => {
    if (!pending) return;
    if (tuto) setTutoAims((n) => n + 1);
    const slot = pending.slot;
    setPending(null);
    submit({ type: 'act', action: { type: 'attack', slot, timings } });
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
    const to = switchTo;
    setSwitchTo(null);
    submit(confirmFrom === 'replace' ? { type: 'replace', to } : { type: 'act', action: { type: 'switch', to } });
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

  const doPass = () => submit({ type: 'act', action: { type: 'pass' } });

  // Temps écoulé (en ligne) : remplaçante au hasard, ou coup classique mal visé.
  autoMove.current = () => {
    setInspect(null);
    setSoundOpen(false);
    setSwitchTo(null);
    setPending(null);
    if (battle.mustReplace === 0) {
      const i = battle.sides[0].fighters.findIndex((f, k) => k !== battle.sides[0].active && f.hp > 0);
      if (i >= 0) submit({ type: 'replace', to: i });
      return;
    }
    if (activeOf(battle, 0).stun > 0) return doPass();
    const hits = hitsOf(activeOf(battle, 0).attacks[0]);
    submit({ type: 'act', action: { type: 'attack', slot: 0, timings: Array(Math.max(1, hits)).fill(0.4) } });
  };

  const special = resolveAttack(shown, 0, 1);
  const specialKind = kindOf(me.attacks[1]);
  // Tuto : la bulle du moment (rien pendant l'ouverture, une fiche ouverte ou la fin)
  const tutoOn = tuto && !intro && result === null && !inspect && !soundOpen && !quitting && !busy;
  const benchAlive = shown.sides[0].fighters.some((f, i) => i !== shown.sides[0].active && f.hp > 0);
  const tutoAttack =
    tutoOn && mode === 'menu' && !stunned
      ? tutoTurns === 0
        ? { slot: 0, text: 'C’est ton tour ! Touche ton attaque classique', sub: 'Elle marche à chaque tour' }
        : tutoTurns === 1 && special && me.usesLeft > 0
          ? { slot: 1, text: 'Essaie ton attaque spéciale !', sub: `Plus forte, mais limitée : ${me.usesLeft}/${me.maxUses} utilisations` }
          : null
      : null;
  const tutoBench =
    tutoOn && mode === 'replace'
      ? { text: 'Ta carte est K.O. ! Touche une remplaçante pour l’envoyer' }
      : tutoOn && mode === 'menu' && !stunned && tutoTurns === 2 && benchAlive
        ? { text: 'Astuce : touche une remplaçante pour changer de carte', sub: 'Ça utilise ton tour. Sinon, attaque !' }
        : null;
  const tutoActions =
    tutoOn && mode === 'timing' && tutoAims < 2
      ? { text: 'Touche la barre, puis touche encore quand le curseur passe sur la cible dorée !', sub: 'Plus tu es près du centre, plus le coup fait mal' }
      : tutoOn && mode === 'menu' && stunned
        ? { text: 'Ta carte est étourdie : passe ton tour, ou envoie une remplaçante' }
        : null;
  const tutoConfirm = tutoOn && mode === 'confirmSwitch' ? (confirmFrom === 'replace' ? 'Touche Envoyer pour la faire entrer' : 'Touche Envoyer pour changer de carte') : null;
  const infoW = Math.max(110, width - layout.cardW - 56);

  return (
    <View style={styles.root}>
      <ArenaBackdrop art={foeArt} tint={foeInfo.tint} width={width} height={height} final={!!foeInfo.stage} />
      <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 12) }}>
        <View style={styles.header}>
          <Pressable onPress={() => setQuitting(true)} hitSlop={12} style={styles.round} accessibilityLabel="Abandonner le combat">
            <Ionicons name="close" size={20} color={colors.text} />
          </Pressable>
          <AppText variant="label" style={{ color: colors.textDim }} numberOfLines={1}>{foeInfo.label}</AppText>
          <Pressable onPress={() => setSoundOpen(true)} hitSlop={12} style={styles.round} accessibilityLabel="Régler le son">
            <Ionicons name="musical-notes" size={17} color={colors.text} />
          </Pressable>
        </View>

        <Animated.View style={stageStyle}>
        {/* Adversaire : infos à gauche, carte à droite */}
        <View style={[styles.row, { paddingHorizontal: 20 }]}>
          <Nameplate width={infoW} accent={foeInfo.tint}>
            <AppText variant="heading" numberOfLines={1}>
              {cap(who(foe.name, 1))}
            </AppText>
            <View style={styles.labelRow}>
              <AppText variant="label" style={{ color: getRarity(foe.rarity).color }}>
                {getRarity(foe.rarity).label}
              </AppText>
              {/* cartes restantes : des points plus petits quand l'adversaire en a plus de 4 (jusqu'à 8) */}
              <View style={[styles.dots, shown.sides[1].fighters.length > 4 && styles.dotsMany]}>
                {shown.sides[1].fighters.map((f, i) => (
                  <View
                    key={i}
                    style={[
                      styles.dot,
                      shown.sides[1].fighters.length > 4 && styles.dotSmall,
                      f.hp > 0 ? { backgroundColor: getRarity(f.rarity).frameStyle === 'galaxy' ? '#3FD0FF' : foeInfo.tint } : styles.dotKo,
                      i === shown.sides[1].active && styles.dotActive,
                    ]}
                  />
                ))}
              </View>
            </View>
            <HpBar hp={foe.hp} maxHp={foe.maxHp} width={Math.min(infoW - 26, 190)} />
            <StatusChips fighter={foe} />
          </Nameplate>
          <Pressable onPress={() => look(1, shown.sides[1].active)} disabled={mode === 'timing'} accessibilityLabel={`Voir ${foe.name}`}>
          <FighterView
            key={foe.ref}
            card={{ id: foe.ref, rarity: foe.rarity, name: foe.name }}
            {...foeInfo.image(foe.ref)}
            width={layout.foeW}
            facing={-1}
            act={acts[1]}
            strike={strikes[1]}
            react={reacts[1]}
            cast={casts[1]}
            shatter={shatters[1]}
            active={!intro && result === null && !busy && shown.turn === 1 && shown.mustReplace === null}
            enter={enters[1]}
            ko={foe.hp <= 0}
            status={statusOf(foe)}
            popups={popups[1]}
          />
          </Pressable>
        </View>

        <View style={[styles.message, { height: layout.msgH }]}>
          <View style={[styles.messageBar, { backgroundColor: speaker === 1 ? foeInfo.tint : speaker === 0 ? getRarity(me.rarity).color : colors.textFaint }]} />
          <Animated.View key={`msg-${msgKey}`} entering={(speaker === 1 ? FadeInRight : FadeInLeft).duration(200)} style={styles.messageInner}>
            {Array.isArray(msg) ? (
              <FitText parts={capParts(msg)} lines={layout.compact ? 2 : 3} maxSize={layout.compact ? 24 : 30} minSize={14} initialWidth={width - 80} />
            ) : (
              <FitLines
                initialWidth={width - 80}
                lines={[
                  { parts: capParts(msg.top), maxSize: layout.compact ? 17 : 21, minSize: 11 },
                  { parts: [{ text: msg.attack, bold: true, color: colors.gold }], maxSize: layout.compact ? 30 : 38, minSize: 14 },
                ]}
              />
            )}
          </Animated.View>
          {!intro && result === null ? <TurnTab mine={shown.turn === 0 || shown.mustReplace === 0} bot={foeInfo.name} tint={foeInfo.tint} left={turnLeft} /> : null}
          {banner && !intro && result === null ? <TurnBanner key={`banner-${banner.key}`} mine={banner.mine} name={foeInfo.name} tint={foeInfo.tint} width={width} /> : null}
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
              strike={strikes[0]}
              react={reacts[0]}
              cast={casts[0]}
              shatter={shatters[0]}
              active={canPlay}
              enter={enters[0]}
              ko={me.hp <= 0}
              status={statusOf(me)}
              popups={popups[0]}
            />
            </Pressable>
          ) : null}
          <Nameplate width={infoW} accent={getRarity(me.rarity).color} right>
            <AppText variant="heading" numberOfLines={2} style={{ textAlign: 'right' }}>
              {cap(who(me.name, 0))}
            </AppText>
            <AppText variant="label" style={{ color: getRarity(me.rarity).color }}>
              {getRarity(me.rarity).label}
            </AppText>
            <HpBar hp={me.hp} maxHp={me.maxHp} width={Math.min(infoW - 26, 190)} />
            <StatusChips fighter={me} align="flex-end" />
          </Nameplate>
        </View>
        </Animated.View>

        {/* Remplaçantes : un toucher pour changer de carte (ça utilise le tour) */}
        <View style={[styles.bench, { height: layout.benchH }]}>
          <AppText variant="caption" numberOfLines={2} style={{ width: 92 }}>
            {mode === 'replace' ? 'Choisis ta carte' : 'Remplaçantes'}
          </AppText>
          <View style={[styles.benchCards, tutoBench && { zIndex: 10 }]}>
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
            {tutoBench ? <TutoArrow key={tutoBench.text} text={tutoBench.text} sub={tutoBench.sub} gap={4} /> : null}
          </View>
        </View>

        {/* Actions */}
        <View style={[styles.actions, { minHeight: layout.actionsH }]}>
          {/* le contenu est en bas : la bulle du tuto se pose juste au-dessus */}
          <View>
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
                  <View style={{ flex: 1.2 }}>
                    <Button label="Envoyer" icon="swap-horizontal" onPress={doSwitch} />
                    {tutoConfirm ? <TutoArrow key={tutoConfirm} text={tutoConfirm} ring={14} gap={6} /> : null}
                  </View>
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
                  index={0}
                  attack={me.attacks[0]}
                  tag="Classique"
                  hint={attackHint(shown, me, foe, me.attacks[0], false)}
                  accent={colors.text}
                  compact={layout.compact}
                  disabled={!canPlay}
                  onPress={() => attack(0)}
                  tuto={tutoAttack?.slot === 0 ? tutoAttack : undefined}
                />
                <AttackButton
                  index={1}
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
                  tuto={tutoAttack?.slot === 1 ? tutoAttack : undefined}
                />
              </View>
            )}
            {tutoActions ? <TutoArrow key={tutoActions.text} text={tutoActions.text} sub={tutoActions.sub} gap={4} /> : null}
          </View>
        </View>
      </View>

      <Flash trigger={flash.n} color={flash.color} peak={flash.peak} />
      {koStamp.n > 0 && result === null ? <KoStamp key={koStamp.n} won={koStamp.won} /> : null}
      {intro ? (
        <VsIntro arenaLabel={foeInfo.label} bot={foeInfo.name} tint={foeInfo.tint} width={width} myMmr={myMmr} foeMmr={foeInfo.mmr} stage={foeInfo.stage} art={foeArt} onDone={endIntro} />
      ) : null}

      {inspect ? (
        <InspectOverlay inspect={inspect} battle={shown} deck={deck} foe={foeInfo} onClose={() => setInspect(null)} />
      ) : null}
      {soundOpen ? <SoundSheet onClose={() => setSoundOpen(false)} /> : null}

      {result !== null ? (
        online ? (
          <OnlineResult outcome={cancelled ? 'cancel' : result === 0 ? 'win' : 'loss'} change={rankChange} opp={foeInfo.name} reason={endReason} mvp={cancelled ? null : mvp} />
        ) : level ? (
          <ResultOverlay
            won={result === 0}
            levelN={level.n}
            deck={deck.map((c) => c.id).join(',')}
            reward={reward}
            stars={starsWon}
            galaxy={galaxyWin}
            mvp={mvp}
            challenge={params.challenge === '1'}
            challengeWon={challengeWon}
            onRevive={!revived && params.challenge !== '1' && result === 1 ? revive : undefined}
            tutoDone={tutoDone}
          />
        ) : null
      ) : null}
      {quitting ? (
        <Animated.View entering={FadeIn.duration(150)} style={[StyleSheet.absoluteFill, styles.overlay]}>
          <Animated.View entering={ZoomIn.duration(200)} style={styles.dialog}>
            <AppText variant="title" style={{ textAlign: 'center' }}>
              Abandonner ?
            </AppText>
            <AppText variant="caption" style={{ textAlign: 'center', marginTop: 6 }}>
              {online ? 'Le combat sera perdu, avec ses points de rang. Tes cartes ne risquent rien.' : 'Le combat sera perdu. Tes cartes ne risquent rien.'}
            </AppText>
            <View style={[styles.twoButtons, { marginTop: 18 }]}>
              <Button label="Continuer" kind="secondary" style={{ flex: 1 }} onPress={() => setQuitting(false)} />
              <Button
                label="Abandonner"
                kind="danger"
                style={{ flex: 1 }}
                onPress={() => {
                  if (online) {
                    useMatch.getState().quit();
                    finishRanked(false);
                  }
                  router.back();
                }}
              />
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
  foe,
  onClose,
}: {
  inspect: { side: SideId; index: number };
  battle: Battle;
  deck: Card[];
  foe: Foe;
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
      {...foe.image(f.ref)}
      owner={`Carte de ${foe.name}`}
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

/** Plaque d'infos d'une carte (nom, rareté, PV) : un bloc sombre incliné, liseré de la couleur du camp. */
function Nameplate({ width, accent, right, children }: { width: number; accent: string; right?: boolean; children: ReactNode }) {
  return (
    <View style={{ width }}>
      <View style={[StyleSheet.absoluteFill, styles.plate, right ? { borderRightWidth: 3, borderRightColor: accent } : { borderLeftWidth: 3, borderLeftColor: accent }]} />
      <View style={[styles.plateInner, right && { alignItems: 'flex-end' }]}>{children}</View>
    </View>
  );
}

/** Onglet au-dessus du message : à qui est le tour (et, en ligne, le temps qu'il reste). */
function TurnTab({ mine, bot, tint, left = null }: { mine: boolean; bot: string; tint: string; left?: number | null }) {
  const hurry = mine && left !== null && left <= 10;
  return (
    <Animated.View
      key={mine ? 'me' : 'bot'}
      entering={ZoomIn.duration(180)}
      style={[styles.turnTab, mine ? { left: 14, backgroundColor: hurry ? colors.danger : colors.gold } : { right: 14, backgroundColor: tint }]}
    >
      <AppText style={styles.turnText} numberOfLines={1}>
        {mine ? (left !== null ? `Ton tour · ${left} s` : 'Ton tour') : turnOf(bot)}
      </AppText>
    </Animated.View>
  );
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
  index,
  attack,
  tag,
  kind,
  uses,
  hint,
  accent,
  compact,
  disabled,
  onPress,
  tuto,
}: {
  /** Place du bouton : les deux boutons entrent l'un après l'autre. */
  index: number;
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
  /** Tuto : consigne et flèche sur ce bouton. */
  tuto?: { text: string; sub?: string };
}) {
  const { width } = useWindowDimensions();
  // Deux boutons côte à côte : le nom de l'attaque doit toujours tenir en entier.
  const btnW = (width - 42) / 2;
  const inner = btnW - 30;
  const nameSize = Math.floor(fitFontSize([{ text: attack.name }], inner, 2, compact ? 16 : 17, 11));
  const hot = hint.hot && !disabled;
  // Bon moment pour cette attaque : le liseré doré respire.
  const glow = useSharedValue(0);
  useEffect(() => {
    if (!hot) {
      cancelAnimation(glow);
      glow.value = 0;
      return;
    }
    glow.value = withRepeat(withTiming(1, { duration: 750, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(glow);
  }, [hot, glow]);
  // À ton tour : le bouton se réveille (petit bond et reflet qui le traverse)
  const press = useSharedValue(0);
  const ready = useSharedValue(disabled ? 0 : 2);
  useEffect(() => {
    if (disabled) {
      ready.value = 0;
      return;
    }
    ready.value = withDelay(index * 90, withTiming(2, { duration: 760, easing: Easing.out(Easing.quad) }));
  }, [disabled, ready, index]);
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.35 + glow.value * 0.65 }));
  const wrapStyle = useAnimatedStyle(() => {
    const r = ready.value;
    const bump = r > 0 && r < 0.6 ? Math.sin((r / 0.6) * Math.PI) * 0.045 : 0;
    return { transform: [{ scale: 1 + bump - press.value * 0.05 }] };
  });
  const sheenStyle = useAnimatedStyle(() => {
    const r = Math.min(1, ready.value / 1.4);
    return { opacity: r > 0 && r < 1 ? 1 : 0, transform: [{ translateX: -btnW * 0.6 + r * btnW * 1.8 }, { skewX: '-20deg' }] };
  });
  const edge = hot ? colors.gold : accent;
  return (
    <Animated.View entering={FadeInDown.delay(index * 70).springify().damping(15)} style={[{ flex: 1 }, wrapStyle]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => {
          press.value = withTiming(1, { duration: 70 });
        }}
        onPressOut={() => {
          press.value = withSpring(0, { damping: 10, stiffness: 320 });
        }}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={attack.name}
        style={({ pressed }) => [
          styles.attack,
          compact && { minHeight: 70, paddingVertical: 8 },
          // bouton « physique » : une lèvre en bas qui s'enfonce quand on appuie
          { borderColor: `${edge}55`, borderBottomColor: `${edge}AA` },
          hot && styles.attackHot,
          disabled && { opacity: 0.4 },
          pressed && styles.attackPressed,
        ]}
      >
        {hot ? <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.attackGlow, glowStyle]} /> : null}
        <Animated.View pointerEvents="none" style={[styles.sheen, { width: btnW * 0.35 }, sheenStyle]} />
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
      {tuto ? <TutoArrow key={tuto.text} text={tuto.text} sub={tuto.sub} ring={16} gap={6} /> : null}
    </Animated.View>
  );
}

/** Le dernier K.O. : un grand « K.O. ! » s'écrase au milieu de l'écran. */
function KoStamp({ won }: { won: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(120, withSequence(withTiming(1, { duration: 170, easing: Easing.in(Easing.quad) }), withTiming(1, { duration: 820 }), withTiming(2, { duration: 320 })));
    return () => cancelAnimation(t);
  }, [t]);
  const style = useAnimatedStyle(() => {
    const v = t.value;
    const sc = v < 1 ? 2.8 - 1.8 * v : 1 + (v - 1) * 0.12;
    return { opacity: v < 1 ? v : 2 - v, transform: [{ scale: sc }, { rotate: '-8deg' }] };
  });
  const color = won ? colors.gold : colors.danger;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center, { zIndex: 15 }]}>
      <ImpactLines trigger={1} color={color} size={420} count={16} thickness={6} delay={290} duration={520} />
      <Shockwave trigger={1} color={color} size={170} delay={290} duration={700} />
      <Animated.View style={style}>
        <AppText style={[styles.koStamp, { color }]}>K.O. !</AppText>
      </Animated.View>
    </View>
  );
}

const CONFETTI = [colors.gold, '#FFF3C2', colors.success, '#7CC8FF', '#FF8A3D', '#FF5A67', '#C9A6FF'];

/** Pièces gagnées : le compteur défile jusqu'au total, puis la pastille rebondit. */
function CoinCount({ coins, delay }: { coins: number; delay: number }) {
  const [n, setN] = useState(0);
  const bump = useSharedValue(0);
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const steps = Math.min(18, Math.max(1, coins));
    const start = setTimeout(() => {
      let i = 0;
      timer = setInterval(() => {
        i++;
        setN(Math.round((coins * i) / steps));
        if (i % 2 === 0) playSfx('tick', { volume: 0.35 });
        if (i >= steps) {
          clearInterval(timer);
          bump.value = withSequence(withTiming(1, { duration: 90 }), withSpring(0, { damping: 6, stiffness: 260 }));
          playSfx('up3', { volume: 0.6 });
          haptic.light();
        }
      }, 45);
    }, delay);
    return () => {
      clearTimeout(start);
      if (timer) clearInterval(timer);
    };
  }, [coins, delay, bump]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 + bump.value * 0.18 }] }));
  return (
    <Animated.View entering={ZoomIn.delay(delay - 150).springify().damping(9)} style={[styles.coinsWon, style]}>
      <CoinIcon size={26} />
      <AppText style={styles.coinsText}>{`+${n}`}</AppText>
    </Animated.View>
  );
}

/** Une étoile de fin de niveau : elle tombe à sa place, gagnée (dorée, étincelles) ou non (grise). */
function ResultStar({ index, earned, show }: { index: number; earned: boolean; show: boolean }) {
  const size = index === 1 ? 50 : 40;
  if (!show) return <View style={{ width: size, height: size }} />;
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', transform: [{ translateY: index === 1 ? -12 : 0 }] }}>
      {earned ? (
        <View style={{ position: 'absolute', width: 0, height: 0, alignItems: 'center', justifyContent: 'center' }}>
          <Glow color={colors.gold} size={size * 2.4} style={{ left: -size * 1.2, top: -size * 1.2 }} />
          <Burst trigger={1} colors={[colors.gold, '#FFF3C2', '#FFFFFF']} count={10} radius={size * 1.5} />
        </View>
      ) : null}
      <Animated.View entering={ZoomIn.springify().damping(earned ? 7 : 12).stiffness(earned ? 260 : 160)} style={{ transform: [{ rotate: `${(index - 1) * 12}deg` }] }}>
        <Ionicons name="star" size={size} color={earned ? colors.gold : 'rgba(255,255,255,0.14)'} />
      </Animated.View>
    </View>
  );
}

const GALAXY_COLORS = ['#B23CFF', '#3FD0FF', '#FF5FCB', colors.gold, '#FFFFFF', '#7C5CFF'];

function ResultOverlay({
  won,
  levelN,
  deck,
  reward,
  stars,
  galaxy = false,
  mvp,
  challenge = false,
  challengeWon = false,
  onRevive,
  tutoDone = false,
}: {
  won: boolean;
  levelN: number;
  deck: string;
  reward: SoloReward | null;
  stars: number;
  mvp: { card: Card; dealt: number } | null;
  /** Combat lancé depuis le défi du jour, et s'il est réussi. */
  challenge?: boolean;
  challengeWon?: boolean;
  /** Victoire contre le Grand Portrait, carte Galaxy pas encore gagnée : célébration cosmique et bouton de révélation. */
  galaxy?: boolean;
  /** Défaite en solo : revivre en regardant une pub (absent si déjà fait, ou pendant le défi du jour). */
  onRevive?: () => Promise<AdResult>;
  /** Tuto : ce combat vient de terminer la phase guidée. */
  tutoDone?: boolean;
}) {
  const { width, height } = useWindowDimensions();
  // suivi en direct : une fois la carte révélée (retour de l'écran d'ouverture), le bouton disparaît
  const galaxyClaimed = useGame((s) => s.save?.galaxyClaimed ?? false);
  const cosmic = won && galaxy;
  const canReveal = cosmic && !galaxyClaimed;
  const next = levelN < TOTAL_LEVELS ? getLevel(levelN + 1) : null;
  // les étoiles tombent une à une, chacune avec son petit son
  const [starsShown, setStarsShown] = useState(0);
  useEffect(() => {
    if (!won) return;
    const timers = [0, 1, 2].map((i) =>
      setTimeout(() => {
        setStarsShown(i + 1);
        if (i < stars) {
          playSfx(`up${i + 2}` as Sfx, { volume: 0.7 });
          haptic.light();
        }
      }, 620 + i * 320),
    );
    return () => timers.forEach(clearTimeout);
  }, [won, stars]);
  const coinsAt = 620 + 3 * 320 + 150;
  const raysSize = Math.min(width * 1.1, 420);
  return (
    <Animated.View entering={FadeIn.duration(won ? 300 : 500)} style={[StyleSheet.absoluteFill, styles.overlay, !won && styles.overlayLost]}>
      {won ? <Confetti width={width} height={height} colors={cosmic ? GALAXY_COLORS : CONFETTI} count={cosmic ? 44 : 34} /> : null}
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        {won ? (
          <View pointerEvents="none" style={{ position: 'absolute', width: raysSize, height: raysSize }}>
            <Rays colors={cosmic ? ['#B23CFF', '#3FD0FF', colors.gold] : [colors.gold, '#FFF3C2']} size={raysSize} visible duration={cosmic ? 9000 : 14000} />
          </View>
        ) : null}
        <View pointerEvents="none" style={{ position: 'absolute', width: 260, height: 260, opacity: won ? 0.55 : 0.35 }}>
          <Glow color={cosmic ? '#B98CFF' : won ? colors.gold : '#5A6A8A'} size={260} />
        </View>
        {won ? (
          <View style={{ position: 'absolute' }}>
            <Burst trigger={1} colors={cosmic ? GALAXY_COLORS : [colors.gold, '#FFF3C2', colors.success]} count={cosmic ? 40 : 30} radius={cosmic ? 200 : 170} />
          </View>
        ) : null}
        <Animated.View
          entering={won ? ZoomIn.springify().damping(10) : FadeInDown.duration(700)}
          style={[styles.medal, { backgroundColor: won ? colors.gold : colors.surface2 }, won ? styles.medalWon : styles.medalLost, cosmic && styles.medalGalaxy]}
        >
          {cosmic ? <LinearGradient pointerEvents="none" colors={['#3B1C8C', '#B23CFF', '#3FD0FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: 48 }]} /> : null}
          <Ionicons name={cosmic ? 'planet' : won ? 'trophy' : 'refresh'} size={40} color={cosmic ? '#FFFFFF' : won ? '#141414' : colors.textDim} />
        </Animated.View>
      </View>
      {won ? (
        <View style={styles.resultStars}>
          {[0, 1, 2].map((i) => (
            <ResultStar key={i} index={i} earned={i < stars} show={starsShown > i} />
          ))}
        </View>
      ) : null}
      <View style={{ alignItems: 'center', marginTop: 22, paddingHorizontal: 32 }}>
        <Animated.View entering={won ? ZoomIn.delay(160).springify().damping(9) : FadeIn.delay(250).duration(600)}>
          <AppText variant="display" style={won ? [styles.winTitle, cosmic && styles.galaxyTitle] : styles.loseTitle}>
            {won ? 'Victoire !' : 'Défaite'}
          </AppText>
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(won ? 320 : 450)}>
          <AppText variant="body" style={{ textAlign: 'center', color: colors.textDim, marginTop: 6 }}>
            {cosmic
              ? canReveal
                ? 'Le Grand Portrait est tombé ! Une carte Galaxy, unique, t’attend.'
                : 'Le Grand Portrait est tombé ! Tu as terminé toute l’aventure.'
              : won
              ? next
                ? next.world.n !== getLevel(levelN)?.world.n
                  ? `Monde terminé ! Direction ${next.world.place}.`
                  : `Niveau ${levelN} gagné. Le niveau ${next.n} t’attend.`
                : 'Tu as terminé toute l’aventure. Bravo !'
              : 'Change de cartes ou vise mieux la cible, et retente ta chance.'}
          </AppText>
        </Animated.View>
      </View>
      {won && reward ? (
        reward.coins > 0 ? (
          <View style={{ alignItems: 'center', marginTop: 18, gap: 6 }}>
            <CoinCount coins={reward.coins} delay={coinsAt} />
            <Animated.View entering={FadeIn.delay(coinsAt + 300)}>
              <AppText variant="caption" style={{ textAlign: 'center', paddingHorizontal: 32 }}>
                pièces gagnées pour ta première victoire ici
              </AppText>
            </Animated.View>
          </View>
        ) : (
          <Animated.View entering={FadeIn.delay(coinsAt)} style={{ marginTop: 16 }}>
            <AppText variant="caption" style={{ textAlign: 'center', paddingHorizontal: 32 }}>
              Pièces déjà gagnées sur ce niveau : rejouer sert à améliorer tes étoiles.
            </AppText>
          </Animated.View>
        )
      ) : null}
      {challengeWon ? (
        <Animated.View entering={ZoomIn.delay(coinsAt + 450).springify().damping(10)} style={styles.challengeWon}>
          <Ionicons name="flame" size={18} color="#FF9A3C" />
          <AppText style={styles.challengeWonText}>Défi du jour réussi</AppText>
          <CoinIcon size={18} />
          <AppText style={styles.challengeWonPrize}>{`+${CHALLENGE_REWARD}`}</AppText>
        </Animated.View>
      ) : null}
      {tutoDone ? (
        // Phase 2 du tuto : le menu « tuto terminé » prendra la suite
        <Animated.View entering={FadeInDown.delay(won ? coinsAt : 600)} style={{ alignSelf: 'stretch', paddingHorizontal: 24, marginTop: 16 }}>
          <TutoBubble text="Premier combat terminé ! Tout le jeu est débloqué." sub="Multijoueur, collection, échanges, quêtes : à toi de jouer." />
        </Animated.View>
      ) : null}
      {mvp ? (
        <View style={{ marginTop: 16, alignSelf: 'stretch' }}>
          <MvpBadge card={mvp.card} dealt={mvp.dealt} delay={won ? coinsAt + 600 : 500} />
        </View>
      ) : null}
      <Animated.View entering={FadeInDown.delay(won ? 900 : 650).springify().damping(16)} style={{ alignSelf: 'stretch', gap: 10, marginTop: mvp ? 20 : 30, paddingHorizontal: 32 }}>
        {canReveal ? <RevealGalaxyButton /> : null}
        {won && next ? (
          <Button label={`Niveau ${next.n}`} size="lg" icon="arrow-forward" onPress={() => router.replace({ pathname: '/battle/deck', params: { level: String(next.n) } })} />
        ) : null}
        {!won && onRevive ? <ReviveButton onRevive={onRevive} /> : null}
        {!won ? (
          <Button
            label={challenge ? 'Retenter le défi' : 'Réessayer'}
            size="lg"
            icon="refresh"
            kind={onRevive ? 'secondary' : 'primary'}
            onPress={() => router.replace({ pathname: '/battle/fight', params: { level: String(levelN), deck, ...(challenge ? { challenge: '1' } : null) } })}
          />
        ) : null}
        <Button label="Retour à la carte" kind="secondary" onPress={() => router.back()} />
      </Animated.View>
    </Animated.View>
  );
}

/** « Revivre » : une pub, et la plus forte des cartes tombées revient au combat (une fois par combat). */
function ReviveButton({ onRevive }: { onRevive(): Promise<AdResult> }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  return (
    <View style={{ gap: 6 }}>
      <Button
        label="Revivre · regarder une pub"
        icon="heart"
        size="lg"
        shimmer
        loading={busy}
        onPress={async () => {
          if (busy) return;
          setBusy(true);
          setNote(null);
          const r = await onRevive();
          setBusy(false);
          if (r === 'unavailable') setNote('Aucune pub disponible pour le moment.');
          else if (r === 'skipped') setNote('Pub fermée avant la fin : pas de deuxième chance.');
        }}
      />
      <AppText variant="caption" style={{ textAlign: 'center' }}>
        {note ?? 'Ta meilleure carte tombée revient avec la moitié de ses PV. Une fois par combat.'}
      </AppText>
    </View>
  );
}

/** « Révèle ta carte Galaxy » : le bouton respire dans un halo cosmique, et mène à l'écran d'ouverture. */
function RevealGalaxyButton() {
  const glow = useSharedValue(0);
  useEffect(() => {
    glow.value = withRepeat(withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(glow);
  }, [glow]);
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.45 + glow.value * 0.5, transform: [{ scaleX: 1 + glow.value * 0.08 }] }));
  return (
    <View>
      <Animated.View pointerEvents="none" style={[styles.revealGlow, glowStyle]}>
        <Glow color="#B98CFF" size={92} stretchX={4.2} />
      </Animated.View>
      <Button label="Révèle ta carte Galaxy" size="lg" icon="planet" onPress={() => router.push({ pathname: '/open', params: { galaxy: '1' } })} />
    </View>
  );
}

/**
 * Fin d'un combat en ligne : le rang avant/après, la barre qui se remplit (ou
 * se vide), promotion éventuelle. `cancel` : l'adversaire est parti, rien ne
 * bouge pour celui qui reste.
 */
function OnlineResult({
  outcome,
  change,
  opp,
  reason,
  mvp,
}: {
  outcome: 'win' | 'loss' | 'cancel';
  change: { before: number; after: number } | null;
  opp: string;
  reason: 'gone' | 'lost' | null;
  mvp: { card: Card; dealt: number } | null;
}) {
  const won = outcome === 'win';
  const cancelled = outcome === 'cancel';
  const before = change?.before ?? 0;
  const after = change?.after ?? before;
  const rb = rankOf(before);
  const ra = rankOf(after);
  const delta = after - before;
  const promoted = ra.index > rb.index;
  const demoted = ra.index < rb.index;
  const [second, setSecond] = useState(false);
  const fill = useSharedValue(rb.progress);
  useEffect(() => {
    const ease = { duration: 900, easing: Easing.out(Easing.cubic) };
    if (!promoted && !demoted) {
      fill.value = withDelay(500, withTiming(ra.progress, ease));
      return;
    }
    // on remplit (ou vide) la division, puis on passe à la suivante
    fill.value = withDelay(500, withTiming(promoted ? 1 : 0, ease));
    const t = setTimeout(() => {
      setSecond(true);
      fill.value = promoted ? 0 : 1;
      fill.value = withTiming(ra.progress, ease);
      if (promoted) {
        playSfx('up2');
        haptic.success();
      } else haptic.warning();
    }, 1500);
    return () => clearTimeout(t);
  }, [fill, promoted, demoted, ra.progress]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${Math.max(0, Math.min(1, fill.value)) * 100}%` }));
  const shownRank = second ? ra : rb;

  const { width, height } = useWindowDimensions();
  return (
    <Animated.View entering={FadeIn.duration(won ? 300 : 500)} style={[StyleSheet.absoluteFill, styles.overlay, !won && styles.overlayLost]}>
      {won && !cancelled ? <Confetti width={width} height={height} colors={[...CONFETTI, shownRank.tier.color]} count={30} /> : null}
      <View style={{ alignItems: 'center', justifyContent: 'center', height: 150 }}>
        {won && !cancelled ? (
          <View pointerEvents="none" style={{ position: 'absolute', width: Math.min(width * 1.05, 400), height: Math.min(width * 1.05, 400) }}>
            <Rays colors={[shownRank.tier.color, '#FFF3C2']} size={Math.min(width * 1.05, 400)} visible />
          </View>
        ) : null}
        {won ? (
          <View style={{ position: 'absolute' }}>
            <Burst trigger={1} colors={[colors.gold, '#FFF3C2', shownRank.tier.color]} count={30} radius={160} />
          </View>
        ) : null}
        <RankEmblem key={shownRank.index} rank={shownRank} size={110} />
      </View>
      <Animated.View entering={FadeInDown.delay(200)} style={{ alignItems: 'center', marginTop: 18, paddingHorizontal: 32, gap: 6 }}>
        <AppText variant="display" style={cancelled ? styles.cancelTitle : won ? styles.winTitle : styles.loseTitle}>
          {cancelled ? 'Combat annulé' : won ? 'Victoire !' : 'Défaite'}
        </AppText>
        {reason ? (
          <AppText variant="caption" style={{ textAlign: 'center' }}>
            {reason === 'gone' ? `${opp} a quitté le combat. Ton rang ne bouge pas.` : 'Connexion perdue : le combat compte comme une défaite.'}
          </AppText>
        ) : null}
        {second && (promoted || demoted) ? (
          <Animated.View entering={ZoomIn.springify().damping(9)} style={[styles.promo, { backgroundColor: promoted ? shownRank.tier.color : colors.surface2 }]}>
            <AppText style={[styles.promoText, { color: promoted ? '#141414' : colors.text }]}>{promoted ? `Promotion : ${ra.label} !` : `Rétrogradé : ${ra.label}`}</AppText>
          </Animated.View>
        ) : (
          <AppText style={[styles.rankLabel, { color: shownRank.tier.color }]}>{shownRank.label}</AppText>
        )}
        <View style={styles.rankTrack}>
          <Animated.View style={[styles.rankFill, { backgroundColor: shownRank.tier.color }, fillStyle]} />
        </View>
        <AppText style={[styles.delta, { color: delta > 0 ? colors.success : delta < 0 ? colors.danger : colors.textDim }]}>
          {cancelled ? 'Aucun point gagné ni perdu' : !change ? '' : delta === 0 && !won ? 'Aucun point perdu : tu es au plus bas' : `${delta >= 0 ? '+' : '−'}${Math.abs(delta)} points de rang`}
        </AppText>
        {change ? <AppText variant="caption">{`${ra.points}/${DIVISION_POINTS} dans ${ra.label}`}</AppText> : null}
      </Animated.View>
      {mvp ? (
        <View style={{ marginTop: 18, alignSelf: 'stretch' }}>
          <MvpBadge card={mvp.card} dealt={mvp.dealt} delay={900} />
        </View>
      ) : null}
      <Animated.View entering={FadeInDown.delay(350)} style={{ alignSelf: 'stretch', gap: 10, marginTop: 28, paddingHorizontal: 32 }}>
        <Button
          label="Retour"
          size="lg"
          onPress={() => {
            useSocial.getState().announce();
            router.back();
          }}
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, overflow: 'hidden' },
  resultStars: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 18, height: 62 },
  coinsWon: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, height: 52, borderRadius: 26, backgroundColor: 'rgba(247,201,72,0.14)', borderWidth: 1.5, borderColor: 'rgba(247,201,72,0.5)' },
  coinsText: { fontFamily: fonts.black, fontSize: 28, color: colors.gold },
  challengeWon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 12,
    paddingHorizontal: 14,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,122,44,0.16)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,122,44,0.55)',
  },
  challengeWonText: { fontFamily: fonts.bold, fontSize: 14, color: colors.text },
  challengeWonPrize: { fontFamily: fonts.black, fontSize: 16, color: colors.gold },
  promo: { paddingHorizontal: 14, height: 34, borderRadius: 8, justifyContent: 'center', transform: [{ skewX: '-10deg' }] },
  promoText: { fontFamily: fonts.black, fontSize: 16, letterSpacing: 0.3 },
  rankLabel: { fontFamily: fonts.black, fontSize: 22 },
  rankTrack: { alignSelf: 'stretch', height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginTop: 6 },
  rankFill: { height: 10, borderRadius: 5 },
  delta: { fontFamily: fonts.bold, fontSize: 16, marginTop: 4 },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  round: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dots: { flexDirection: 'row', gap: 5 },
  dotsMany: { gap: 3, flexShrink: 1, flexWrap: 'wrap' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotSmall: { width: 6, height: 6, borderRadius: 3 },
  dotKo: { borderWidth: 1.5, borderColor: colors.textFaint },
  dotActive: { transform: [{ scale: 1.3 }] },
  message: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(10,10,13,0.86)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    flexDirection: 'row',
  },
  messageBar: { width: 4, alignSelf: 'stretch', borderTopLeftRadius: 13, borderBottomLeftRadius: 13 },
  messageInner: { flex: 1, paddingHorizontal: 16, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  turnTab: { position: 'absolute', top: -11, height: 22, paddingHorizontal: 10, borderRadius: 4, justifyContent: 'center', transform: [{ skewX: '-12deg' }] },
  turnText: { fontFamily: fonts.black, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase', color: '#141414' },
  plate: { backgroundColor: 'rgba(10,10,13,0.72)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', transform: [{ skewX: '-8deg' }] },
  plateInner: { paddingHorizontal: 12, paddingVertical: 9, gap: 5 },
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
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#18181D',
    borderWidth: 1.5,
    borderBottomWidth: 5,
    justifyContent: 'center',
    gap: 3,
    overflow: 'hidden',
  },
  attackPressed: { borderBottomWidth: 2, transform: [{ translateY: 3 }], backgroundColor: '#1F1F26' },
  sheen: { position: 'absolute', top: -10, bottom: -10, left: 0, backgroundColor: 'rgba(255,255,255,0.16)' },
  koStamp: {
    fontFamily: fonts.black,
    fontSize: 86,
    lineHeight: 96,
    letterSpacing: -3,
    textShadowColor: '#000',
    textShadowOffset: { width: 4, height: 6 },
    textShadowRadius: 0,
  },
  attackGlow: { borderRadius: 16, borderWidth: 2, borderColor: colors.gold, margin: -1.5 },
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
  medalGalaxy: { borderColor: '#E3D2FF', shadowColor: '#B98CFF', overflow: 'hidden' },
  galaxyTitle: { color: '#E3D2FF', textShadowColor: '#4B1D8F' },
  revealGlow: { position: 'absolute', left: 0, right: 0, top: -16, bottom: -16, alignItems: 'center', justifyContent: 'center' },
  medalWon: { borderWidth: 4, borderColor: '#FFF3C2', shadowColor: colors.gold, shadowOpacity: 0.8, shadowRadius: 22 },
  medalLost: { borderWidth: 2, borderColor: colors.borderStrong },
  overlayLost: { backgroundColor: 'rgba(6,7,12,0.92)' },
  cancelTitle: { color: colors.textDim, textAlign: 'center' },
  winTitle: { color: colors.gold, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 0 },
  loseTitle: { color: colors.textDim },
});
