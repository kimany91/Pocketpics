/**
 * Photo de profil ronde, avec sa pastille : un petit rond de la couleur de la
 * rareté de la carte d'où vient la photo (en dégradé pour les raretés à
 * reflets : Légendaire, Ultra Légendaire, Divine, Galaxy).
 *
 * Une photo reçue d'un ami passe au filtre de contenu adulte sur ce téléphone
 * avant d'être montrée : floutée en attendant, remplacée par `fallback` si
 * elle est censurée. Sans photo, on montre aussi `fallback` (l'emblème de rang).
 */
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { type ReactNode, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { botArt } from '../../battle/botArt';
import { avatarDataUri } from '../../game/avatar';
import { usePhotoVerdict } from '../../game/nsfwScan';
import { PAUL_PORTRAIT, isPaul } from '../../game/paul';
import { getRarity } from '../../game/rarity';
import { useSocial } from '../../net/social';
import { useGame } from '../../state/game';
import { myAvatarUri } from '../../storage/disk';
import { colors } from '../../theme';
import { HiddenPhoto } from '../card/HiddenPhoto';

export interface AvatarPhoto {
  /** Adresse de l'image, ou image intégrée à l'app (Paul). */
  source: string | number;
  rarity: string;
  /** Date de la photo : quand elle change, la nouvelle arrive avec une petite animation. */
  at: number;
  /** Venue d'un autre téléphone : vérifiée ici avant d'être montrée. */
  foreign: boolean;
}

/** Ma photo de profil (`null` : pas de photo). */
export function useMyAvatar(): AvatarPhoto | null {
  const avatar = useGame((s) => s.save?.avatar ?? null);
  if (!avatar) return null;
  const uri = myAvatarUri(avatar.at);
  return uri ? { source: uri, rarity: avatar.rarity, at: avatar.at, foreign: false } : null;
}

/** La photo de profil d'un ami, telle qu'on la connaît (gardée sur l'appareil). */
export function useFriendAvatar(code: string | undefined): AvatarPhoto | null {
  const av = useSocial((s) => (code ? s.avatars[code] : null));
  useEffect(() => {
    if (code && !isPaul(code) && av === undefined) useSocial.getState().loadAvatar(code);
  }, [code, av]);
  // Paul (bot du tuto) : son pigeon du parc
  if (isPaul(code)) {
    const art = botArt(PAUL_PORTRAIT);
    return art !== undefined ? { source: art, rarity: 'common', at: 1, foreign: false } : null;
  }
  return av ? { source: avatarDataUri(av.img), rarity: av.rarity, at: av.at, foreign: true } : null;
}

export function Avatar({ photo, size, fallback }: { photo: AvatarPhoto | null; size: number; fallback: ReactNode }) {
  const foreignUri = photo?.foreign && typeof photo.source === 'string' ? photo.source : undefined;
  const verdict = usePhotoVerdict(foreignUri);
  if (!photo || verdict === 'censored') return <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>{fallback}</View>;
  const rarity = getRarity(photo.rarity);
  const dot = Math.max(12, Math.round(size * 0.3));
  const ring = Math.max(2, Math.round(size * 0.035));
  return (
    <Animated.View key={photo.at} entering={ZoomIn.springify().damping(12)} style={{ width: size, height: size }}>
      <View style={[styles.round, { width: size, height: size, borderRadius: size / 2, borderWidth: ring, borderColor: rarity.color }]}>
        <Image
          // image du jeu (nombre sur téléphone, objet sur le web) : telle quelle ; sinon une adresse
          source={typeof photo.source === 'string' ? { uri: photo.source } : photo.source}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={0}
        />
        {verdict === 'pending' ? <HiddenPhoto source={{ uri: foreignUri }} width={size - ring * 2} height={size - ring * 2} mark="pending" /> : null}
      </View>
      <RarityDot rarity={photo.rarity} size={dot} style={{ right: -dot * 0.08, bottom: -dot * 0.08 }} />
    </Animated.View>
  );
}

/** La pastille : un rond de la couleur de la rareté, cerclé du fond pour se détacher de la photo. */
export function RarityDot({ rarity: id, size, style }: { rarity: string; size: number; style?: object }) {
  const rarity = getRarity(id);
  const border = Math.max(2, Math.round(size * 0.16));
  return (
    <View
      pointerEvents="none"
      style={[styles.dot, { width: size, height: size, borderRadius: size / 2, borderWidth: border, shadowColor: rarity.color }, style]}
      accessibilityLabel={`Rareté ${rarity.label}`}
    >
      {rarity.frameStyle === 'solid' ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: rarity.color, borderRadius: size / 2 }]} />
      ) : (
        <LinearGradient colors={rarity.frame as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  round: { overflow: 'hidden', backgroundColor: colors.surface2 },
  dot: {
    position: 'absolute',
    borderColor: colors.surface,
    shadowOpacity: 0.8,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
});
