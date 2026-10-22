/**
 * La boutique des emotes, en bas de l'écran des quêtes : les emotes
 * équipées, puis toutes les emotes avec leur état (équipée, à équiper, prix en
 * pièces, ou verrouillée avec la carte à tirer pour l'avoir). Toucher une
 * vignette la joue, avec son son.
 */
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeInDown, ZoomIn, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { playEmoteSound } from '../../audio/emoteSfx';
import { EMOTES, type EmoteDef, MAX_EQUIPPED, getEmote } from '../../game/emotes';
import { useGame } from '../../state/game';
import { colors, fonts } from '../../theme';
import { confirmAction } from '../../utils/confirm';
import { haptic } from '../../utils/haptics';
import { AppText } from '../AppText';
import { CoinIcon } from '../Coin';
import { notice } from '../Notice';
import { EmoteArt } from './EmoteArt';

export function EmoteShop({ active = true }: { /** Animations seulement quand l'écran est affiché. */ active?: boolean }) {
  const { width } = useWindowDimensions();
  const emotes = useGame((s) => s.save?.emotes);
  const coins = useGame((s) => s.save?.coins ?? 0);
  const owned = new Set(emotes?.owned ?? []);
  const equipped = (emotes?.equipped ?? []).filter((id) => !!getEmote(id));
  const cols = 3;
  const gap = 10;
  const tileW = Math.floor((Math.min(width, 520) - 32 - gap * (cols - 1)) / cols);
  const slotW = Math.floor((Math.min(width, 520) - 32 - 24 - 8 * (MAX_EQUIPPED - 1)) / MAX_EQUIPPED);

  const buy = (def: EmoteDef) => {
    if (def.price === null) return;
    if (coins < def.price) {
      haptic.warning();
      notice(`Il te manque ${def.price - coins} pièces pour « ${def.name} ».`, 'alert-circle');
      return;
    }
    confirmAction(`Acheter « ${def.name} » ?`, `Elle coûte ${def.price} pièces. Il t’en restera ${coins - def.price}.`, 'Acheter', () => {
      const res = useGame.getState().buyEmote(def.id);
      if (res === 'ok') {
        haptic.success();
        playEmoteSound(def.id);
        const full = (useGame.getState().save?.emotes.equipped.length ?? 0) >= MAX_EQUIPPED && !useGame.getState().save?.emotes.equipped.includes(def.id);
        notice(full ? `« ${def.name} » est à toi ! Retire une emote équipée pour la mettre.` : `« ${def.name} » est à toi, et équipée !`, 'happy');
      } else if (res === 'coins') notice('Pas assez de pièces.', 'alert-circle');
    });
  };

  const toggle = (def: EmoteDef) => {
    const res = useGame.getState().toggleEmote(def.id);
    if (res === 'full') {
      haptic.warning();
      notice(`${MAX_EQUIPPED} emotes au plus : retire d’abord une emote équipée.`, 'alert-circle');
    } else if (res === 'ok') haptic.tick();
  };

  return (
    <View style={{ gap: 14 }}>
      <View style={styles.slotsBox}>
        <View style={styles.slotsHead}>
          <AppText style={styles.slotsTitle}>Équipées</AppText>
          <AppText variant="caption">{`${equipped.length}/${MAX_EQUIPPED} · touche pour retirer`}</AppText>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {Array.from({ length: MAX_EQUIPPED }, (_, i) => {
            const id = equipped[i];
            const def = id ? getEmote(id) : null;
            return def ? (
              <Pressable key={`slot-${id}`} onPress={() => toggle(def)} accessibilityLabel={`Retirer ${def.name}`} style={[styles.slot, { width: slotW, height: slotW, borderColor: `${def.color}AA`, backgroundColor: `${def.color}22` }]}>
                <Animated.View entering={ZoomIn.springify().damping(12)}>
                  <EmoteArt id={def.id} size={slotW - 14} animated={active} />
                </Animated.View>
              </Pressable>
            ) : (
              <View key={`empty-${i}`} style={[styles.slot, styles.slotEmpty, { width: slotW, height: slotW }]}>
                <Ionicons name="add" size={22} color={colors.textFaint} />
              </View>
            );
          })}
        </View>
      </View>

      <View style={[styles.grid, { gap }]}>
        {EMOTES.map((def, i) => (
          <ShopTile
            key={def.id}
            def={def}
            width={tileW}
            index={i}
            owned={owned.has(def.id)}
            equipped={equipped.includes(def.id)}
            canPay={def.price !== null && coins >= def.price}
            active={active}
            onBuy={() => buy(def)}
            onToggle={() => toggle(def)}
          />
        ))}
      </View>
    </View>
  );
}

function ShopTile({
  def,
  width,
  index,
  owned,
  equipped,
  canPay,
  active,
  onBuy,
  onToggle,
}: {
  def: EmoteDef;
  width: number;
  index: number;
  owned: boolean;
  equipped: boolean;
  canPay: boolean;
  active: boolean;
  onBuy(): void;
  onToggle(): void;
}) {
  const [play, setPlay] = useState(0);
  const pop = useSharedValue(1);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const locked = !owned && !!def.pack;
  const preview = () => {
    haptic.light();
    setPlay((n) => n + 1);
    playEmoteSound(def.id);
    pop.value = withSequence(withTiming(1.12, { duration: 110 }), withSpring(1, { damping: 9 }));
  };
  const art = width - 34;
  return (
    <Animated.View entering={FadeInDown.delay(40 + index * 25).springify().damping(16)} style={[styles.tile, { width }, equipped && { borderColor: colors.gold }]}>
      <Pressable onPress={preview} accessibilityLabel={`Écouter l’emote ${def.name}`} style={[styles.artBox, { height: art + 6, backgroundColor: `${def.color}${locked ? '14' : '26'}` }]}>
        <Animated.View style={[popStyle, locked && { opacity: 0.4 }]}>
          <EmoteArt id={def.id} size={art} animated={active && (!locked || play > 0)} playKey={play} />
        </Animated.View>
        {locked ? (
          <View style={styles.lockBadge}>
            <Ionicons name="lock-closed" size={12} color={colors.text} />
          </View>
        ) : null}
        {equipped ? (
          <View style={styles.equippedBadge}>
            <Ionicons name="checkmark" size={12} color="#141414" />
          </View>
        ) : null}
      </Pressable>
      <AppText style={styles.name} numberOfLines={1}>
        {def.name}
      </AppText>
      {locked ? (
        <View style={styles.hintBox}>
          <Ionicons name="images-outline" size={12} color={colors.textDim} />
          <AppText style={styles.hint}>
            {def.pack?.hint}
          </AppText>
        </View>
      ) : owned ? (
        <Pressable onPress={onToggle} style={[styles.action, equipped ? styles.actionOn : styles.actionEquip]} accessibilityLabel={equipped ? `Retirer ${def.name}` : `Équiper ${def.name}`}>
          <AppText style={[styles.actionText, equipped && { color: colors.gold }]}>{equipped ? 'Équipée' : 'Équiper'}</AppText>
        </Pressable>
      ) : (
        <Pressable onPress={onBuy} style={[styles.action, styles.actionBuy, !canPay && { opacity: 0.55 }]} accessibilityLabel={`Acheter ${def.name} pour ${def.price} pièces`}>
          <CoinIcon size={13} />
          <AppText style={styles.price}>{def.price}</AppText>
        </Pressable>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  slotsBox: { padding: 12, gap: 10, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  slotsHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  slotsTitle: { fontFamily: fonts.black, fontSize: 12, letterSpacing: 1.2, color: colors.gold, textTransform: 'uppercase' },
  slot: { borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  slotEmpty: { borderStyle: 'dashed', borderColor: colors.borderStrong, backgroundColor: 'rgba(255,255,255,0.02)' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  tile: { padding: 8, gap: 6, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center' },
  artBox: { alignSelf: 'stretch', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  lockBadge: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  equippedBadge: { position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gold },
  name: { fontFamily: fonts.bold, fontSize: 13, color: colors.text },
  // pas de hauteur fixe ni de troncature : la tuile grandit avec le texte (2 ou 3 lignes)
  hintBox: { alignSelf: 'stretch', alignItems: 'center', gap: 3, minHeight: 42, paddingHorizontal: 2 },
  hint: { alignSelf: 'stretch', fontFamily: fonts.semibold, fontSize: 10.5, lineHeight: 13, color: colors.textDim, textAlign: 'center' },
  action: { alignSelf: 'stretch', height: 30, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  actionEquip: { backgroundColor: colors.text },
  actionOn: { backgroundColor: 'rgba(247,201,72,0.12)', borderWidth: 1, borderColor: 'rgba(247,201,72,0.5)' },
  actionBuy: { backgroundColor: 'rgba(247,201,72,0.16)', borderWidth: 1, borderColor: 'rgba(247,201,72,0.55)' },
  actionText: { fontFamily: fonts.bold, fontSize: 12, color: '#141414' },
  price: { fontFamily: fonts.black, fontSize: 13, color: colors.gold },
});
