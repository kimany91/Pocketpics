import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '../components/AppText';
import { CardFace } from '../components/card/CardFace';
import { CARDS_PER_PACK, MAX_STORED_DRAWS } from '../game/draws';
import { LUCK, type LuckState, STARTER } from '../game/luck';
import { RARITIES, formatChance, getRarity } from '../game/rarity';
import { useGame } from '../state/game';
import { resetWebSave } from '../storage/disk';
import { colors } from '../theme';

export default function RatesScreen() {
  const cards = useGame((s) => s.cards);
  const save = useGame((s) => s.save);
  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <AppText variant="title">Taux d'obtention</AppText>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Fermer">
          <Ionicons name="close" size={24} color={colors.textDim} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 4 }}>
        <AppText variant="caption" style={{ marginBottom: 18 }}>
          {`Un tirage toutes les 12 h, jusqu'à ${MAX_STORED_DRAWS} en réserve. Chaque paquet contient ${CARDS_PER_PACK} photos de ta galerie, jamais deux fois la même.`}
        </AppText>
        {save ? <LuckPanel packs={save.totalPacksOpened} luck={save.luck} /> : null}
        <AppText variant="label" style={{ marginTop: 22, marginBottom: 4, color: colors.textDim }}>
          CHANCES DE BASE PAR CARTE
        </AppText>
        {[...RARITIES].reverse().map((r) => {
          const owned = cards.filter((c) => c.rarity === r.id).length;
          return (
            <View key={r.id} style={styles.row}>
              <CardFace card={{ id: `preview-${r.id}`, rarity: r.id, name: null }} width={44} quality="thumb" imageUri="" animated={r.rank >= 6} />
              <View style={{ flex: 1 }}>
                <AppText variant="heading" style={{ color: r.color }}>
                  {r.label}
                </AppText>
                <AppText variant="caption">{owned > 0 ? `${owned} dans ta collection` : 'Pas encore obtenue'}</AppText>
              </View>
              <AppText variant="heading" style={styles.pct}>
                {formatChance(r.id)}
              </AppText>
            </View>
          );
        })}
        {Platform.OS === 'web' ? <WebReset /> : null}
      </ScrollView>
    </View>
  );
}

/** Ta chance : paquets de départ, garanties qui approchent, paquets brillants. */
function LuckPanel({ packs, luck }: { packs: number; luck: LuckState }) {
  const starter = STARTER[packs];
  const epicLeft = LUCK.epic.hard - luck.sinceEpic;
  const legendLeft = LUCK.legend.hard - luck.sinceLegend;
  const luckyLeft = LUCK.lucky.hard - luck.packsSinceLucky;
  return (
    <View style={styles.luck}>
      <AppText variant="heading">Ta chance</AppText>
      {starter ? (
        <LuckRow
          icon="gift"
          color={getRarity(starter).color}
          title={`Paquet de départ ${packs + 1}/${STARTER.length}`}
          text={`Ton prochain paquet se termine par une ${getRarity(starter).label}.`}
        />
      ) : null}
      <LuckRow
        icon="trending-up"
        color={getRarity('epic').color}
        title="Épique ou mieux"
        text={`Plus tu en attends une, plus elle a de chances de tomber. Garantie au plus tard dans ${epicLeft} carte${epicLeft > 1 ? 's' : ''}.`}
        progress={luck.sinceEpic / LUCK.epic.hard}
      />
      <LuckRow
        icon="trending-up"
        color={getRarity('legendary').color}
        title="Légendaire ou mieux"
        text={`Même principe, sur plus long. Garantie au plus tard dans ${legendLeft} cartes.`}
        progress={luck.sinceLegend / LUCK.legend.hard}
      />
      <LuckRow
        icon="sparkles"
        color="#FFD86B"
        title="Paquets brillants"
        text={`Environ 1 paquet sur ${Math.round(1 / LUCK.lucky.chance)} est doré et contient une carte Super Rare ou mieux. Le prochain arrive au plus tard dans ${luckyLeft} paquet${luckyLeft > 1 ? 's' : ''}.`}
      />
    </View>
  );
}

function LuckRow({ icon, color, title, text, progress }: { icon: 'gift' | 'trending-up' | 'sparkles'; color: string; title: string; text: string; progress?: number }) {
  return (
    <View style={styles.luckRow}>
      <Ionicons name={icon} size={18} color={color} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, gap: 3 }}>
        <AppText variant="label" style={{ color }}>
          {title}
        </AppText>
        <AppText variant="caption">{text}</AppText>
        {progress !== undefined ? (
          <View style={styles.bar}>
            <View style={[styles.barFill, { width: `${Math.min(100, Math.max(3, progress * 100))}%`, backgroundColor: color }]} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** Version navigateur : repartir de zéro (collection, tirages et photos importées). */
function WebReset() {
  const [armed, setArmed] = useState(false);
  return (
    <Pressable
      style={styles.reset}
      onPress={async () => {
        if (!armed) return setArmed(true);
        await resetWebSave();
        try {
          globalThis.location?.reload();
        } catch {}
      }}
    >
      <AppText variant="label" style={{ color: colors.danger }}>
        {armed ? 'Toucher encore pour tout effacer' : 'Effacer ma partie de test'}
      </AppText>
      <AppText variant="caption" style={{ textAlign: 'center' }}>
        Supprime la collection, les tirages et les photos importées dans ce navigateur. La partie recommence avec les paquets de départ.
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  luck: { gap: 14, padding: 16, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  luckRow: { flexDirection: 'row', gap: 12 },
  bar: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginTop: 3 },
  barFill: { height: 4, borderRadius: 2 },
  reset: { alignItems: 'center', gap: 4, marginTop: 28, padding: 14, borderRadius: 14, backgroundColor: 'rgba(255,90,103,0.08)' },
  root: { flex: 1, backgroundColor: colors.bgElevated },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pct: { fontVariant: ['tabular-nums'] },
});
