/**
 * Photo de profil ronde, avec sa pastille : un petit rond de la couleur de la
 * rareté de la carte d'où vient la photo (en dégradé pour les raretés à
 * reflets : Légendaire, Ultra Légendaire, Divine, Galaxy).
 *
 * Le tour de la photo s'anime selon la rareté (voir `avatarAura`) : rien
 * jusqu'à Super Rare, un léger halo pour Épique, un halo qui respire pour
 * Mythique, en plus un anneau qui tourne pour Légendaire et Ultra Légendaire,
 * et pour Divine (et Galaxy) la photo brille avec un reflet qui la traverse.
 *
 * Une photo reçue d'un ami passe au filtre de contenu adulte sur ce téléphone
 * avant d'être montrée : floutée en attendant, remplacée par `fallback` si
 * elle est censurée. Sans photo, on montre aussi `fallback` (l'emblème de rang).
 */
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { type ReactNode, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ZoomIn,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { botArt } from '../../battle/botArt';
import { avatarAura } from '../../game/avatarAura';
import { Glow } from '../fx';
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
  const aura = avatarAura(rarity.rank);
  return (
    <Animated.View key={photo.at} entering={ZoomIn.springify().damping(12)} style={{ width: size, height: size }}>
      {aura.glow > 0 ? <AuraGlow color={rarity.color} size={size} strength={aura.glow} pulse={aura.pulse} /> : null}
      {aura.spin ? <SpinRing colors={rarity.frame.length > 1 ? rarity.frame : [rarity.color, '#FFFFFF']} size={size} width={ring * 2.2} /> : null}
      <View
        style={[
          styles.round,
          { width: size, height: size, borderRadius: size / 2, borderWidth: ring, borderColor: rarity.color },
          // lueur collée au tour, plus forte avec la rareté
          aura.halo > 0 ? { boxShadow: `0px 0px ${Math.round((aura.halo * size) / 100)}px ${rarity.color}` } : null,
        ]}
      >
        <Image
          // image du jeu (nombre sur téléphone, objet sur le web) : telle quelle ; sinon une adresse
          source={typeof photo.source === 'string' ? { uri: photo.source } : photo.source}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={0}
        />
        {aura.sheen && verdict !== 'pending' ? <Sheen size={size} /> : null}
        {verdict === 'pending' ? <HiddenPhoto source={{ uri: foreignUri }} width={size - ring * 2} height={size - ring * 2} mark="pending" /> : null}
      </View>
      <RarityDot rarity={photo.rarity} size={dot} style={{ right: -dot * 0.08, bottom: -dot * 0.08 }} />
    </Animated.View>
  );
}

/** Halo de la couleur de la rareté derrière la photo ; il respire doucement pour les plus rares. */
function AuraGlow({ color, size, strength, pulse }: { color: string; size: number; strength: number; pulse: boolean }) {
  const o = useSharedValue(strength);
  useEffect(() => {
    if (!pulse) return;
    o.value = withRepeat(withSequence(withTiming(strength, { duration: 1300, easing: Easing.inOut(Easing.sin) }), withTiming(strength * 0.55, { duration: 1300, easing: Easing.inOut(Easing.sin) })), -1, false);
    return () => cancelAnimation(o);
  }, [pulse, strength, o]);
  const g = size * (1.35 + strength * 0.6);
  return <Glow color={color} size={g} opacity={o} style={{ left: (size - g) / 2, top: (size - g) / 2 }} />;
}

/** Anneau aux couleurs du cadre de la rareté, qui tourne autour de la photo. */
function SpinRing({ colors: c, size, width }: { colors: string[]; size: number; width: number }) {
  const rot = useSharedValue(0);
  useEffect(() => {
    rot.value = withRepeat(withTiming(360, { duration: 4200, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(rot);
  }, [rot]);
  const d = size + width * 2;
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: -width, top: -width, width: d, height: d, borderRadius: d / 2, overflow: 'hidden' }, style]}>
      <LinearGradient colors={[...c, c[0]] as unknown as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

/** Divine et Galaxy : un reflet traverse la photo depuis le côté, de temps en temps. */
function Sheen({ size }: { size: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(500, withRepeat(withSequence(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), withTiming(1, { duration: 1300 }), withTiming(0, { duration: 0 })), -1, false));
    return () => cancelAnimation(p);
  }, [p]);
  const band = size * 0.42;
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: -band * 1.5 + p.value * (size + band * 2) }, { skewX: '-22deg' }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: -size * 0.2, bottom: -size * 0.2, left: 0, width: band }, style]}>
      <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.6)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
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
