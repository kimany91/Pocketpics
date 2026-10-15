/**
 * Écran de combat. La logique est dans src/battle/engine.ts ; ici on met en
 * scène les évènements un par un (message, élan, coup, jauge, K.O.), on fait
 * jouer le bot, et on propose au joueur ses actions : attaque classique,
 * attaque spéciale (mini-jeu de précision), ou changer de carte.
 *
 * Mise en scène : décor flou de l'arène, ouverture « VS », l'écran tremble à
 * chaque coup (plus fort sur un critique), et le cadre du message prend la
 * couleur du camp dont on parle.
 */
import { Ionicons } from '@expo/vector-icons';
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
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { startBattleMusic, stopBattleMusic } from '../../audio/music';
import { type Sfx, playSfx } from '../../audio/sfx';
import { type Level, TOTAL_LEVELS, getLevel, levelFighters, levelMmr, starsFor } from '../../battle/levels';
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
import { type BattleController, type Move, type Step, applyMove } from '../../net/battleNet';
import { useMatch } from '../../net/match';
import { useSocial } from '../../net/social';
import { CoinIcon } from '../../components/Coin';
import { RankEmblem } from '../../components/rank/RankEmblem';
import type { SoloReward } from '../../game/economy';
import { DIVISION_POINTS, rankOf, shownMmr } from '../../game/rank';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { type ActKind, type FighterStatus, FighterView, HpBar, type Popup, type ReactKind } from '../../components/battle/FighterView';
import { KIND_LOOK, STATUS_LOOK, activeStatuses, attackHint } from '../../components/battle/kinds';
import { FitLines, FitText, type TextPart, fitFontSize } from '../../components/battle/FitText';
import { ArenaBackdrop } from '../../components/battle/ArenaBackdrop';
import { InspectFighter } from '../../components/battle/InspectFighter';
import { QUALITY_LABEL, TimingBar } from '../../components/battle/TimingBar';
import { VsIntro } from '../../components/battle/VsIntro';
import { SoundSheet } from '../../components/SoundSheet';
import { CardFace } from '../../components/card/CardFace';
import { Burst, Flash } from '../../components/fx';
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

/** L'adversaire du mode solo : le bot de l'arène, qui « réfléchit » un instant avant de jouer. */
class BotController implements BattleController {
  constructor(private level: number) {}
  async submit(move: Move, b: Battle): Promise<Step> {
    return applyMove(b, 0, move);
  }
  async next(b: Battle): Promise<Step> {
    await sleep(b.mustReplace === 1 ? 500 : 700);
    return b.mustReplace === 1 ? replace(b, 1, botReplacement(b, 1, this.level)) : act(b, botAction(b, 1, this.level));
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
}

const ONLINE_TINT = '#7C9CFF';
/** En ligne : temps pour jouer son coup, après quoi un coup est joué automatiquement. */
const TURN_SECONDS = 40;

export default function FightScreen() {
  const params = useLocalSearchParams<{ level?: string; deck?: string; online?: string }>();
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
      const thumbs = new Map((m.oppDeck ?? []).map((f) => [f.ref, f.thumb ? `data:image/jpeg;base64,${f.thumb}` : '']));
      const firstThumb = [...thumbs.values()].find(Boolean);
      const foe: Foe = {
        name: m.opp.name,
        tint: ONLINE_TINT,
        mmr: m.opp.mmr,
        label: 'Combat classé',
        art: firstThumb ? { uri: firstThumb } : undefined,
        image: (ref) => ({ imageUri: thumbs.get(ref) || undefined }),
      };
      return { deck, foe, battle: m.start, controller: m.controller };
    }
    if (!level || deck.length === 0) return null;
    const foe: Foe = {
      name: level.world.bot,
      tint: level.world.tint,
      mmr: levelMmr(level.n),
      label: `${level.boss ? 'Boss · ' : ''}Monde ${level.world.n} · Niveau ${level.n}`,
      art: botArt(`bot:${level.world.n}:3`),
      image: (ref) => ({ imageSource: botArt(ref) }),
    };
    return { deck, foe, battle: createBattle(deck.map(toFighter), levelFighters(level)), controller: new BotController(level.botLevel) as BattleController };
  });
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
  const [rankChange, setRankChange] = useState<{ before: number; after: number } | null>(null);
  const [endReason, setEndReason] = useState<'gone' | 'lost' | null>(null);
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
  /** Éclair blanc plein écran (critique, coup de grâce, K.O.). */
  const [flashN, setFlashN] = useState(0);
  const shakeX = useSharedValue(0);
  const shakeY = useSharedValue(0);
  /** L'écran tremble, d'autant plus que le coup est fort. */
  const shake = (power: number) => {
    const a = Math.min(14, power);
    const seq = (k: number) =>
      withSequence(
        withTiming(a * k, { duration: 35 }),
        withTiming(-a * 0.8 * k, { duration: 45 }),
        withTiming(a * 0.5 * k, { duration: 45 }),
        withTiming(-a * 0.25 * k, { duration: 45 }),
        withTiming(0, { duration: 60, easing: Easing.out(Easing.quad) }),
      );
    shakeX.value = seq(1);
    shakeY.value = seq(-0.6);
  };
  const stageStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }, { translateY: shakeY.value }] }));
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
  const [reacts, setReacts] = useState<[{ key: number; kind: ReactKind; strong?: boolean }, { key: number; kind: ReactKind; strong?: boolean }]>([
    { key: 0, kind: 'hurt' },
    { key: 0, kind: 'hurt' },
  ]);
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

  const doAct = (side: SideId, kind: ActKind) =>
    setActs((a) => {
      const next: typeof a = [a[0], a[1]];
      next[side] = { key: ++fxKey.current, kind };
      return next;
    });
  const doReact = (side: SideId, kind: ReactKind, strong = false) =>
    setReacts((a) => {
      const next: typeof a = [a[0], a[1]];
      next[side] = { key: ++fxKey.current, kind, strong };
      return next;
    });
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
            doAct(e.side, actFor(kind, e.special, before, e.side));
            playSfx(soundFor(kind), { volume: 0.6 });
            await sleep(STATUS_KINDS.includes(kind) ? 500 : e.side === 0 ? 650 : 900);
            break;
          }
          case 'hit': {
            setShown(view);
            const strong = e.quality === 'crit' || !!e.execute;
            if (e.damage > 0) {
              doReact(e.side, e.execute ? 'execute' : e.guarded ? 'guarded' : e.kind === 'slap' ? 'slapped' : 'hurt', strong);
              // l'écran tremble selon la part de PV perdue ; un critique fait aussi un éclair
              shake(e.guarded ? 2 : 3 + Math.min(1, e.damage / Math.max(1, before.sides[e.side].fighters[before.sides[e.side].active].maxHp)) * 16 + (strong ? 5 : 0));
              if (strong) setFlashN((n) => n + 1);
            }
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
            if (e.damage > 0) (strong ? haptic.heavy : haptic.medium)();
            await sleep(e.execute ? 950 : strong ? 820 : 700);
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
          case 'ko':
            setShown(view);
            say([nameParts(e.fighter, e.side), { text: ' est K.O. !' }], e.side);
            playSfx('ko');
            haptic.heavy();
            shake(10);
            setFlashN((n) => n + 1);
            await sleep(1300);
            break;
          case 'switch':
            setShown(view);
            doEnter(e.side);
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

  /** Fin du combat : pièces en solo, points de rang en ligne. */
  const finish = (winner: SideId, reason: 'gone' | 'lost' | null = null) => {
    if (!foeInfo) return;
    setResult(winner);
    setEndReason(reason);
    setMode('idle');
    stopBattleMusic(music.current, 600);
    if (online) setRankChange(finishRanked(winner === 0));
    else if (winner === 0 && level && battle) {
      // étoiles : 3 sans perdre de carte, 2 en en perdant une, 1 sinon
      const stars = starsFor(battle.sides[0].fighters.filter((f) => f.hp <= 0).length);
      setStarsWon(stars);
      setReward(winLevel(level.n, stars));
    }
    if (winner === 0) {
      playSfx('win');
      haptic.success();
    } else {
      playSfx('lose');
      haptic.warning();
    }
  };

  // En ligne : l'adversaire part (victoire) ou ma connexion lâche (défaite).
  const oppGone = useMatch((s) => s.oppGone);
  const lostConnection = useMatch((s) => s.lostConnection);
  useEffect(() => {
    if (!online || result !== null) return;
    if (oppGone) finish(0, 'gone');
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
  const infoW = Math.max(110, width - layout.cardW - 56);

  return (
    <View style={styles.root}>
      <ArenaBackdrop art={foeInfo.art} tint={foeInfo.tint} width={width} height={height} />
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
              <View style={styles.dots}>
                {shown.sides[1].fighters.map((f, i) => (
                  <View key={i} style={[styles.dot, f.hp > 0 ? { backgroundColor: foeInfo.tint } : styles.dotKo, i === shown.sides[1].active && styles.dotActive]} />
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
            react={reacts[1]}
            enter={enters[1]}
            ko={foe.hp <= 0}
            status={statusOf(foe)}
            popups={popups[1]}
          />
          </Pressable>
        </View>

        <View style={[styles.message, { height: layout.msgH }]}>
          <View style={[styles.messageBar, { backgroundColor: speaker === 1 ? foeInfo.tint : speaker === 0 ? getRarity(me.rarity).color : colors.textFaint }]} />
          <Animated.View key={msgKey} entering={(speaker === 1 ? FadeInRight : FadeInLeft).duration(200)} style={styles.messageInner}>
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

      <Flash trigger={flashN} peak={0.22} />
      {intro ? <VsIntro arenaLabel={foeInfo.label} bot={foeInfo.name} tint={foeInfo.tint} width={width} myMmr={myMmr} foeMmr={foeInfo.mmr} onDone={endIntro} /> : null}

      {inspect ? (
        <InspectOverlay inspect={inspect} battle={shown} deck={deck} foe={foeInfo} onClose={() => setInspect(null)} />
      ) : null}
      {soundOpen ? <SoundSheet onClose={() => setSoundOpen(false)} /> : null}

      {result !== null ? (
        online ? (
          <OnlineResult won={result === 0} change={rankChange} opp={foeInfo.name} reason={endReason} />
        ) : level ? (
          <ResultOverlay won={result === 0} levelN={level.n} deck={deck.map((c) => c.id).join(',')} reward={reward} stars={starsWon} />
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
        {mine ? (left !== null ? `Ton tour · ${left} s` : 'Ton tour') : `Tour de ${bot}`}
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
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.35 + glow.value * 0.65 }));
  const edge = hot ? colors.gold : accent;
  return (
    <Pressable
      onPress={onPress}
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

function ResultOverlay({ won, levelN, deck, reward, stars }: { won: boolean; levelN: number; deck: string; reward: SoloReward | null; stars: number }) {
  const next = levelN < TOTAL_LEVELS ? getLevel(levelN + 1) : null;
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
      {won ? (
        <View style={styles.resultStars}>
          {[0, 1, 2].map((i) => (
            <Animated.View key={i} entering={ZoomIn.delay(350 + i * 220).springify().damping(8)} style={{ transform: [{ translateY: i === 1 ? -10 : 0 }, { rotate: `${(i - 1) * 12}deg` }] }}>
              <Ionicons name="star" size={i === 1 ? 46 : 38} color={i < stars ? colors.gold : 'rgba(255,255,255,0.14)'} />
            </Animated.View>
          ))}
        </View>
      ) : null}
      <Animated.View entering={FadeInDown.delay(200)} style={{ alignItems: 'center', marginTop: 22, paddingHorizontal: 32 }}>
        <AppText variant="display">{won ? 'Victoire !' : 'Défaite'}</AppText>
        <AppText variant="body" style={{ textAlign: 'center', color: colors.textDim, marginTop: 6 }}>
          {won
            ? next
              ? next.world.n !== getLevel(levelN)?.world.n
                ? `Monde terminé ! Direction ${next.world.place}.`
                : `Niveau ${levelN} gagné. Le niveau ${next.n} t’attend.`
              : 'Tu as terminé toute l’aventure. Bravo !'
            : 'Change de cartes ou vise mieux la cible, et retente ta chance.'}
        </AppText>
      </Animated.View>
      {won && reward ? (
        <View style={{ alignItems: 'center', marginTop: 18, gap: 6 }}>
          <Animated.View entering={ZoomIn.delay(450).springify().damping(9)} style={styles.coinsWon}>
            <CoinIcon size={26} />
            <AppText style={styles.coinsText}>{`+${reward.coins}`}</AppText>
          </Animated.View>
          <Animated.View entering={FadeIn.delay(700)}>
            <AppText variant="caption" style={{ textAlign: 'center', paddingHorizontal: 32 }}>
              {reward.bonus
                ? `dont ${reward.bonus} de bonus pour ta première victoire ici`
                : reward.reduced
                  ? 'Gains réduits : tu as déjà gagné 5 combats aujourd’hui.'
                  : 'pièces gagnées'}
            </AppText>
          </Animated.View>
        </View>
      ) : null}
      <Animated.View entering={FadeInDown.delay(350)} style={{ alignSelf: 'stretch', gap: 10, marginTop: 30, paddingHorizontal: 32 }}>
        {won && next ? (
          <Button label={`Niveau ${next.n}`} size="lg" icon="arrow-forward" onPress={() => router.replace({ pathname: '/battle/deck', params: { level: String(next.n) } })} />
        ) : null}
        {!won ? <Button label="Réessayer" size="lg" icon="refresh" onPress={() => router.replace({ pathname: '/battle/fight', params: { level: String(levelN), deck } })} /> : null}
        <Button label="Retour à la carte" kind="secondary" onPress={() => router.back()} />
      </Animated.View>
    </Animated.View>
  );
}

/** Fin d'un combat en ligne : le rang avant/après, la barre qui se remplit (ou se vide), promotion éventuelle. */
function OnlineResult({ won, change, opp, reason }: { won: boolean; change: { before: number; after: number } | null; opp: string; reason: 'gone' | 'lost' | null }) {
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

  return (
    <Animated.View entering={FadeIn.duration(250)} style={[StyleSheet.absoluteFill, styles.overlay]}>
      <View style={{ alignItems: 'center', justifyContent: 'center', height: 150 }}>
        {won ? (
          <View style={{ position: 'absolute' }}>
            <Burst trigger={1} colors={[colors.gold, '#FFF3C2', shownRank.tier.color]} count={30} radius={160} />
          </View>
        ) : null}
        <RankEmblem key={shownRank.index} rank={shownRank} size={110} />
      </View>
      <Animated.View entering={FadeInDown.delay(200)} style={{ alignItems: 'center', marginTop: 18, paddingHorizontal: 32, gap: 6 }}>
        <AppText variant="display">{won ? 'Victoire !' : 'Défaite'}</AppText>
        {reason ? (
          <AppText variant="caption" style={{ textAlign: 'center' }}>
            {reason === 'gone' ? `${opp} a quitté le combat.` : 'Connexion perdue : le combat compte comme une défaite.'}
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
          {!change ? '' : delta === 0 && !won ? 'Aucun point perdu : tu es au plus bas' : `${delta >= 0 ? '+' : '−'}${Math.abs(delta)} points de rang`}
        </AppText>
        {change ? <AppText variant="caption">{`${ra.points}/${DIVISION_POINTS} dans ${ra.label}`}</AppText> : null}
      </Animated.View>
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
  resultStars: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginTop: 18 },
  coinsWon: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, height: 52, borderRadius: 26, backgroundColor: 'rgba(247,201,72,0.14)', borderWidth: 1.5, borderColor: 'rgba(247,201,72,0.5)' },
  coinsText: { fontFamily: fonts.black, fontSize: 28, color: colors.gold },
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
  dot: { width: 8, height: 8, borderRadius: 4 },
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
  },
  attackPressed: { borderBottomWidth: 2, transform: [{ translateY: 3 }], backgroundColor: '#1F1F26' },
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
});
