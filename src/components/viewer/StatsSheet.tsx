/**
 * Stats de combat d'une carte, dans un panneau qui monte du bas de l'écran.
 * On peut y renommer les deux attaques : en combat, on lira
 * « <nom de la carte> utilise <nom de l'attaque> ! ».
 *
 * Tuto (étape `rename`) : `tutoSlot` pose une flèche sur l'attaque à renommer,
 * et `autoClose` referme le panneau une fois tout renommé.
 */
import { Ionicons } from '@expo/vector-icons';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { ATTACK_NAME_MAX, type Attack, MAX_HP, MAX_POWER, STATUS_KINDS, kindEffect, kindLabel, kindOf, powerLabel } from '../../battle/stats';
import { KIND_LOOK } from '../battle/kinds';
import { getRarity } from '../../game/rarity';
import type { Card } from '../../storage/model';
import { colors, fonts } from '../../theme';
import { haptic } from '../../utils/haptics';
import { AppText } from '../AppText';
import { TutoArrow } from '../tuto/TutoArrow';

export function StatsSheet({
  card,
  onClose,
  onRename,
  locked = false,
  onLocked,
  tutoSlot,
  autoClose = false,
}: {
  card: Card;
  onClose(): void;
  onRename(slot: 0 | 1, name: string): void;
  locked?: boolean;
  onLocked?(): void;
  /** Tuto : l'attaque à renommer maintenant. */
  tutoSlot?: 0 | 1;
  /** Tuto : tout est renommé, le panneau se referme tout seul. */
  autoClose?: boolean;
}) {
  const { height } = useWindowDimensions();
  const r = getRarity(card.rarity);
  const b = card.battle;
  const y = useSharedValue(height);
  const fade = useSharedValue(0);
  const hp = useCountUp(b.hp);

  useEffect(() => {
    // Le panneau monte d'un ressort ferme (léger dépassement, caché par le rab sous l'écran).
    y.value = withSpring(0, { damping: 19, stiffness: 190, mass: 0.9 });
    fade.value = withTiming(1, { duration: 250 });
  }, [y, fade]);

  const close = () => {
    fade.value = withTiming(0, { duration: 200 });
    y.value = withTiming(height, { duration: 240, easing: Easing.in(Easing.cubic) }, (fin) => {
      if (fin) scheduleOnRN(onClose);
    });
  };
  useEffect(() => {
    if (!autoClose) return;
    const t = setTimeout(close, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoClose]);

  // Glisser le panneau vers le bas pour le fermer.
  const drag = Gesture.Pan()
    .activeOffsetY(10)
    .failOffsetX([-20, 20])
    .onChange((e) => {
      y.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > 90 || e.velocityY > 700) scheduleOnRN(close);
      else y.value = withSpring(0, { damping: 18, stiffness: 220, velocity: e.velocityY });
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const backStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 30 }]}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.back, backStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Fermer les stats" />
      </Animated.View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.anchor} pointerEvents="box-none">
        <Animated.View style={[styles.sheet, sheetStyle]}>
          <GestureDetector gesture={drag}>
            <View style={styles.head}>
              <View style={styles.handle} />
              <View style={styles.titleRow}>
                <View style={{ flex: 1 }}>
                  <AppText variant="title">Stats de combat</AppText>
                  <AppText variant="label" style={{ color: r.color, marginTop: 2 }} numberOfLines={1}>
                    {card.name ? `${card.name} · ${r.label}` : r.label}
                  </AppText>
                </View>
                <Pressable onPress={close} hitSlop={12} style={styles.round} accessibilityLabel="Fermer">
                  <Ionicons name="close" size={20} color={colors.text} />
                </Pressable>
              </View>
            </View>
          </GestureDetector>

          <Rise index={0}>
            <View style={styles.hpRow}>
              <Ionicons name="heart" size={18} color={colors.danger} />
              <AppText style={styles.hpValue}>{hp}</AppText>
              <AppText variant="caption">PV</AppText>
              <Meter value={Math.min(1, b.hp / MAX_HP)} color={colors.danger} delay={180} />
            </View>
          </Rise>

          <Rise index={1}>
            <AttackRow slot={0} attack={b.attacks[0]} title="Attaque classique" sub="Illimitée" accent={colors.text} onRename={onRename} locked={locked} onLocked={onLocked} meterDelay={260} tuto={tutoSlot === 0 ? 'Renomme sa première attaque' : undefined} />
          </Rise>
          <Rise index={2}>
            <AttackRow
              slot={1}
              attack={b.attacks[1]}
              title="Attaque spéciale"
              sub={`${b.uses}× par combat`}
              accent={r.color}
              onRename={onRename} locked={locked} onLocked={onLocked}
              meterDelay={340}
              tuto={tutoSlot === 1 ? 'Maintenant, renomme la deuxième' : undefined}
            />
          </Rise>
          <Rise index={3}>
            <AppText variant="caption" style={styles.foot}>
              {locked ? 'Carte verrouillée : ses noms ne changent plus.' : 'Touche un nom pour le changer.'} En combat, on lira « {card.name ?? 'ta carte'} utilise … ! »
            </AppText>
          </Rise>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

function AttackRow({
  slot,
  attack,
  title,
  sub,
  accent,
  onRename,
  meterDelay = 0,
  locked = false,
  onLocked,
  tuto,
}: {
  slot: 0 | 1;
  attack: Attack;
  title: string;
  sub: string;
  accent: string;
  onRename(slot: 0 | 1, name: string): void;
  meterDelay?: number;
  /** Carte verrouillée : les noms d'attaque ne se changent plus. */
  locked?: boolean;
  onLocked?(): void;
  /** Tuto : consigne et flèche sur le nom de l'attaque. */
  tuto?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(attack.name);
  const kind = kindOf(attack);
  const save = () => {
    if (draft.trim()) {
      onRename(slot, draft);
      haptic.success();
    } else setDraft(attack.name);
    setEditing(false);
  };
  const power = kind === 'mirror' || STATUS_KINDS.includes(kind) ? null : Math.min(1, (attack.power * (kind === 'double' ? 2 : 1)) / MAX_POWER);
  return (
    <View style={[styles.attack, { borderColor: `${accent}40` }]}>
      <View style={styles.attackHead}>
        <AppText style={[styles.tag, { color: accent }]}>{title}</AppText>
        <AppText variant="caption">{sub}</AppText>
      </View>
      <View>
        {editing ? (
          <View style={styles.editRow}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              autoFocus
              maxLength={ATTACK_NAME_MAX}
              placeholder="Nom de l'attaque"
              placeholderTextColor={colors.textFaint}
              style={styles.input}
              returnKeyType="done"
              onSubmitEditing={save}
              onBlur={save}
              selectionColor={accent}
            />
            <Pressable onPress={save} style={styles.ok} accessibilityLabel="Valider le nom de l'attaque">
              <Ionicons name="checkmark" size={20} color="#0B0B0D" />
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={styles.nameRow}
            onPress={() => {
              if (locked) return onLocked?.();
              setDraft(attack.name);
              setEditing(true);
            }}
            accessibilityLabel={locked ? `${attack.name} (verrouillée)` : `Renommer ${attack.name}`}
          >
            <AppText style={styles.attackName} numberOfLines={1}>
              {attack.name}
            </AppText>
            <Ionicons name={locked ? 'lock-closed' : 'pencil'} size={14} color={locked ? '#FFE08A' : colors.textDim} />
          </Pressable>
        )}
        {tuto ? <TutoArrow key={editing ? 'edit' : 'name'} text={editing ? 'Écris un nom puis touche ✓' : tuto} sub={editing ? undefined : 'Touche son nom'} ring={12} gap={4} /> : null}
      </View>
      <View style={styles.effectRow}>
        <View style={[styles.kind, slot === 1 && { borderColor: `${KIND_LOOK[kind].color}66`, borderWidth: 1 }]}>
          {slot === 1 ? <Ionicons name={KIND_LOOK[kind].icon} size={12} color={KIND_LOOK[kind].color} /> : null}
          <AppText style={styles.kindText}>{kindLabel(attack, slot === 1)}</AppText>
        </View>
        <AppText variant="caption" style={{ flex: 1 }}>
          {kindEffect(attack, slot === 1)}
        </AppText>
      </View>
      <View style={styles.powerRow}>
        <Ionicons name="flash" size={13} color={colors.gold} />
        <AppText style={styles.powerText}>{powerLabel(attack)}</AppText>
        {power !== null ? <Meter value={power} color={colors.gold} delay={meterDelay} /> : null}
      </View>
    </View>
  );
}

/** Ligne du panneau qui monte en fondu, l'une après l'autre. */
function Rise({ index, children }: { index: number; children: ReactNode }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(90 + index * 60, withSpring(1, { damping: 16, stiffness: 170 }));
  }, [p, index]);
  const style = useAnimatedStyle(() => ({ opacity: Math.min(1, p.value * 1.4), transform: [{ translateY: (1 - p.value) * 22 }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** Jauge qui se remplit à l'ouverture du panneau. */
function Meter({ value, color, delay }: { value: number; color: string; delay: number }) {
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = withDelay(delay, withTiming(value, { duration: 620, easing: Easing.out(Easing.cubic) }));
  }, [w, value, delay]);
  const style = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  return (
    <View style={styles.meter}>
      <Animated.View style={[styles.meterFill, { backgroundColor: color }, style]} />
    </View>
  );
}

/** Nombre qui défile jusqu'à sa valeur à l'ouverture. */
function useCountUp(target: number, duration = 600) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = from.current;
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

const styles = StyleSheet.create({
  back: { backgroundColor: 'rgba(0,0,0,0.55)' },
  anchor: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 20,
    // Rab sous le bord de l'écran : le ressort d'ouverture peut dépasser sans laisser de vide.
    paddingBottom: 34 + 40,
    marginBottom: -40,
    gap: 12,
  },
  head: { paddingTop: 10 },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.borderStrong, marginBottom: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  round: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  hpRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hpValue: { fontFamily: fonts.black, fontSize: 24, color: colors.text, fontVariant: ['tabular-nums'] },
  meter: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginLeft: 6 },
  meterFill: { height: 6, borderRadius: 3 },
  attack: { padding: 14, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, gap: 8 },
  attackHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tag: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  attackName: { fontFamily: fonts.bold, fontSize: 20, color: colors.text, flexShrink: 1 },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    color: colors.text,
    fontFamily: fonts.semibold,
    fontSize: 17,
  },
  ok: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  effectRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kind: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: colors.surface2 },
  kindText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.text },
  powerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  powerText: { fontFamily: fonts.bold, fontSize: 14, color: colors.text, fontVariant: ['tabular-nums'] },
  foot: { textAlign: 'center', marginTop: 2 },
});
