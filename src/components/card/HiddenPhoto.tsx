/**
 * Photo cachée par le filtre de contenu adulte (src/game/nsfw.ts).
 *
 * La photo n'est jamais montrée telle quelle : elle est affichée en une
 * minuscule image de quelques pixels (le téléphone la décode à cette taille),
 * agrandie, floutée puis assombrie. Il n'en reste que des taches de couleur.
 * Par-dessus : le tampon « CENSURÉ », ou « Vérification » tant que le
 * détecteur n'a pas répondu (nouvelle photo, ou photo reçue d'un autre joueur).
 */
import { Ionicons } from '@expo/vector-icons';
import { Image, type ImageSource } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { fonts } from '../../theme';

/** Largeur de la mosaïque, en pixels : la photo est réduite à ça. */
const MOSAIC = 8;

export function HiddenPhoto({ source, width, height, mark }: { source?: ImageSource | number; width: number; height: number; mark: 'censored' | 'pending' }) {
  const mh = Math.max(2, Math.round((MOSAIC * height) / width));
  // un peu plus grand que la fenêtre : le flou ne laisse pas de bord net
  const scale = (width / MOSAIC) * 1.3;
  const censored = mark === 'censored';
  const font = Math.max(8, Math.min(30, width * 0.14));
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.root]}>
      {source !== undefined ? (
        <Image
          source={source}
          blurRadius={2}
          contentFit="cover"
          transition={0}
          style={{ position: 'absolute', width: MOSAIC, height: mh, left: (width - MOSAIC) / 2, top: (height - mh) / 2, transform: [{ scale }] }}
        />
      ) : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: censored ? 'rgba(14,6,10,0.55)' : 'rgba(10,10,16,0.5)' }]} />
      {censored ? (
        <View style={[styles.stamp, { paddingHorizontal: font * 0.45, paddingVertical: font * 0.16, borderRadius: font * 0.22, borderWidth: Math.max(1.5, font * 0.11) }]}>
          <Text numberOfLines={1} style={[styles.stampText, { fontSize: font, letterSpacing: font * 0.04 }]}>
            CENSURÉ
          </Text>
        </View>
      ) : (
        <View style={styles.pending}>
          <Ionicons name="hourglass-outline" size={Math.max(12, Math.min(26, width * 0.12))} color="rgba(255,255,255,0.85)" />
          {width >= 100 ? <Text style={[styles.pendingText, { fontSize: Math.min(13, width * 0.075) }]}>Vérification…</Text> : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1A1418' },
  stamp: {
    transform: [{ rotate: '-14deg' }],
    backgroundColor: '#D7263D',
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  stampText: { fontFamily: fonts.black, color: '#FFFFFF', includeFontPadding: false },
  pending: { alignItems: 'center', gap: 4 },
  pendingText: { fontFamily: fonts.semibold, color: 'rgba(255,255,255,0.85)' },
});
