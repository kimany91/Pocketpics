/**
 * Stats de combat d'une carte, dans un panneau qui monte du bas de l'écran.
 * On peut y renommer les deux attaques : en combat, on lira
 * « <nom de la carte> utilise <nom de l'attaque> ! ».
 */
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { ATTACK_EFFECT, ATTACK_NAME_MAX, type Attack, MAX_HP, MAX_POWER, kindOf, powerLabel } from '../../battle/stats';
import { getRarity } from '../../game/rarity';
import type { Card } from '../../storage/model';
import { colors, fonts } from '../../theme';
import { haptic } from '../../utils/haptics';
import { AppText } from '../AppText';

const KIND_LABEL: Record<string, string> = {
  basic: 'Coup simple',
  double: 'Double frappe',
  slap: 'Gifle',
  mirror: 'Miroir',
};

export function StatsSheet({ card, onClose, onRename }: { card: Card; onClose(): void; onRename(slot: 0 | 1, name: string): void }) {
  const { height } = useWindowDimensions();
  const r = getRarity(card.rarity);
  const b = card.battle;
  const y = useSharedValue(height);
  const fade = useSharedValue(0);

  useEffect(() => {
    y.value = withTiming(0, { duration: 320, easing: Easing.out(Easing.cubic) });
    fade.value = withTiming(1, { duration: 250 });
  }, [y, fade]);

  const close = () => {
    fade.value = withTiming(0, { duration: 200 });
    y.value = withTiming(height, { duration: 240, easing: Easing.in(Easing.cubic) }, (fin) => {
      if (fin) scheduleOnRN(onClose);
    });
  };

  // Glisser le panneau vers le bas pour le fermer.
  const drag = Gesture.Pan()
    .activeOffsetY(10)
    .failOffsetX([-20, 20])
    .onChange((e) => {
      y.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > 90 || e.velocityY > 700) scheduleOnRN(close);
      else y.value = withTiming(0, { duration: 200 });
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

          <View style={styles.hpRow}>
            <Ionicons name="heart" size={18} color={colors.danger} />
            <AppText style={styles.hpValue}>{b.hp}</AppText>
            <AppText variant="caption">PV</AppText>
            <View style={styles.meter}>
              <View style={[styles.meterFill, { width: `${Math.min(100, (b.hp / MAX_HP) * 100)}%`, backgroundColor: colors.danger }]} />
            </View>
          </View>

          <AttackRow slot={0} attack={b.attacks[0]} title="Attaque classique" sub="Illimitée" accent={colors.text} onRename={onRename} />
          <AttackRow
            slot={1}
            attack={b.attacks[1]}
            title="Attaque spéciale"
            sub={`${b.uses}× par combat`}
            accent={r.color}
            onRename={onRename}
          />
          <AppText variant="caption" style={styles.foot}>
            Touche un nom pour le changer. En combat, on lira « {card.name ?? 'ta carte'} utilise … ! »
          </AppText>
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
}: {
  slot: 0 | 1;
  attack: Attack;
  title: string;
  sub: string;
  accent: string;
  onRename(slot: 0 | 1, name: string): void;
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
  const power = kind === 'mirror' ? null : Math.min(1, (attack.power * (kind === 'double' ? 2 : 1)) / MAX_POWER);
  return (
    <View style={[styles.attack, { borderColor: `${accent}40` }]}>
      <View style={styles.attackHead}>
        <AppText style={[styles.tag, { color: accent }]}>{title}</AppText>
        <AppText variant="caption">{sub}</AppText>
      </View>
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
            setDraft(attack.name);
            setEditing(true);
          }}
          accessibilityLabel={`Renommer ${attack.name}`}
        >
          <AppText style={styles.attackName} numberOfLines={1}>
            {attack.name}
          </AppText>
          <Ionicons name="pencil" size={14} color={colors.textDim} />
        </Pressable>
      )}
      <View style={styles.effectRow}>
        <View style={styles.kind}>
          <AppText style={styles.kindText}>{KIND_LABEL[kind]}</AppText>
        </View>
        <AppText variant="caption" style={{ flex: 1 }}>
          {ATTACK_EFFECT[kind]}
        </AppText>
      </View>
      <View style={styles.powerRow}>
        <Ionicons name="flash" size={13} color={colors.gold} />
        <AppText style={styles.powerText}>{powerLabel(attack)}</AppText>
        {power !== null ? (
          <View style={styles.meter}>
            <View style={[styles.meterFill, { width: `${power * 100}%`, backgroundColor: colors.gold }]} />
          </View>
        ) : null}
      </View>
    </View>
  );
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
    paddingBottom: 34,
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
  kind: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: colors.surface2 },
  kindText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.text },
  powerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  powerText: { fontFamily: fonts.bold, fontSize: 14, color: colors.text, fontVariant: ['tabular-nums'] },
  foot: { textAlign: 'center', marginTop: 2 },
});
