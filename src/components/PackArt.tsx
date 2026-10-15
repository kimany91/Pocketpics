import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { CARDS_PER_PACK } from '../game/draws';
import { fonts } from '../theme';
import { Sweep } from './card/Frame';

export const PACK_RATIO = 1.62;
/** Position de la ligne de déchirure (fraction de la hauteur). */
export const TEAR_LINE = 0.15;

/** Sachet de cartes métallisé. `lucky` : paquet brillant, tout en or. */
export function PackArt({ width, shimmer = true, lucky = false }: { width: number; shimmer?: boolean; lucky?: boolean }) {
  const height = width * PACK_RATIO;
  const crimp = Math.max(8, width * 0.05);
  return (
    <View style={[styles.pack, { width, height, borderRadius: width * 0.045 }]}>
      {lucky ? (
        <LinearGradient
          colors={['#7A5410', '#E9B84A', '#FFF1C2', '#C8902A', '#6B460C']}
          locations={[0, 0.3, 0.5, 0.72, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <>
          <LinearGradient colors={['#2C2B36', '#141419', '#24222E', '#0F0F13']} locations={[0, 0.35, 0.7, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <LinearGradient
            colors={['rgba(255,120,190,0.16)', 'rgba(255,220,120,0.10)', 'rgba(120,255,200,0.12)', 'rgba(120,180,255,0.16)', 'rgba(200,140,255,0.14)']}
            start={{ x: 0, y: 0.2 }}
            end={{ x: 1, y: 0.8 }}
            style={StyleSheet.absoluteFill}
          />
        </>
      )}
      {shimmer ? <Sweep width={width} height={height} duration={lucky ? 1800 : 3400} intensity={lucky ? 0.5 : 0.16} /> : null}

      <Crimp height={crimp} width={width} style={{ top: 0 }} lucky={lucky} />
      <Crimp height={crimp} width={width} style={{ bottom: 0 }} lucky={lucky} />

      <View style={[styles.tear, { top: height * TEAR_LINE }]}>
        {Array.from({ length: 22 }).map((_, i) => (
          <View key={i} style={styles.dash} />
        ))}
      </View>

      <View style={styles.center}>
        <View style={[styles.emblem, { width: width * 0.3, height: width * 0.3 }]}>
          <LinearGradient
            colors={['#FF8FC0', '#FFD27A', '#8CFFC1', '#7CCBFF', '#B99CFF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFill, { borderRadius: width * 0.04 }]}
          />
          <View style={[styles.emblemInner, { borderRadius: width * 0.028, margin: width * 0.018 }]}>
            <View style={[styles.diamond, { width: width * 0.08, height: width * 0.08 }]} />
          </View>
        </View>
        <Text style={[styles.brand, { fontSize: width * 0.105, marginTop: width * 0.09 }, lucky && styles.luckyText]}>PocketPics</Text>
        <Text style={[styles.sub, { fontSize: Math.max(9, width * 0.042), letterSpacing: width * 0.012 }, lucky && styles.luckySub]}>
          {lucky ? 'PAQUET BRILLANT' : `BOOSTER · ${CARDS_PER_PACK} CARTES`}
        </Text>
      </View>

      <View style={[StyleSheet.absoluteFill, styles.edge, { borderRadius: width * 0.045 }]} pointerEvents="none" />
    </View>
  );
}

function Crimp({ height, width, style, lucky }: { height: number; width: number; style: object; lucky?: boolean }) {
  const n = Math.round(width / 5);
  return (
    <View style={[styles.crimp, { height }, style]}>
      <LinearGradient colors={lucky ? ['#F5D27A', '#9C6A16'] : ['#4A4956', '#2A2933']} style={StyleSheet.absoluteFill} />
      <View style={styles.crimpRow}>
        {Array.from({ length: n }).map((_, i) => (
          <View key={i} style={styles.crimpLine} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pack: { overflow: 'hidden', backgroundColor: '#15151A' },
  luckyText: { color: '#3A2604' },
  luckySub: { color: '#5A3C08' },
  crimp: { position: 'absolute', left: 0, right: 0, overflow: 'hidden' },
  crimpRow: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 },
  crimpLine: { width: 1, height: '100%', backgroundColor: 'rgba(0,0,0,0.35)' },
  tear: { position: 'absolute', left: 8, right: 8, height: 1, flexDirection: 'row', justifyContent: 'space-between' },
  dash: { width: 6, height: 1, backgroundColor: 'rgba(255,255,255,0.22)' },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingTop: '8%' },
  emblem: { transform: [{ rotate: '45deg' }] },
  emblemInner: { flex: 1, backgroundColor: '#111116', alignItems: 'center', justifyContent: 'center' },
  diamond: { backgroundColor: '#F5F3EE', borderRadius: 2 },
  brand: { fontFamily: fonts.black, color: '#F5F3EE', letterSpacing: -0.5 },
  sub: { fontFamily: fonts.semibold, color: 'rgba(245,243,238,0.5)', marginTop: 6 },
  edge: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
});
