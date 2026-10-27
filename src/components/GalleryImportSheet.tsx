/**
 * Fenêtre d'import de la version navigateur. Elle s'ouvre à chaque arrivée sur
 * le jeu. Le sélecteur de photos ne peut s'ouvrir que sur un tap du joueur :
 * le bouton « Choisir mes photos » déclenche donc l'import directement.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { galleryPhotoCount, getGalleryAccess, importProgress, onGalleryChange } from '../game/gallery';
import { colors } from '../theme';
import { AppText } from './AppText';
import { Button } from './Button';

interface Props {
  open: boolean;
  onClose(): void;
  /** Téléphone : chaque photo se choisit une par une (le navigateur ne donne pas la galerie entière). */
  onPick(): void;
  /** Ordinateur : tout un dossier est importé d'un coup, sans choix de photo. */
  onFolder?: () => void;
  onDemo(): void;
}

export function GalleryImportSheet({ open, onClose, onPick, onFolder, onDemo }: Props) {
  const insets = useSafeAreaInsets();
  const [count, setCount] = useState(0);
  const [progress, setProgress] = useState(importProgress());

  useEffect(() => {
    const refresh = () => {
      setCount(galleryPhotoCount() ?? 0);
      setProgress(importProgress());
    };
    void getGalleryAccess().then(refresh);
    return onGalleryChange(refresh);
  }, []);

  if (!open) return null;

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Fermer" />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
        <View style={styles.grab} />
        <AppText variant="title">Ajoute tes photos</AppText>
        <AppText variant="caption" style={{ lineHeight: 19 }}>
          {onFolder
            ? 'PocketPics tire ses cartes au hasard dans toutes les photos du dossier que tu choisis. Tu ne choisis pas les cartes une par une.'
            : "PocketPics tire ses cartes au hasard dans tes photos. Ton navigateur ne donne pas accès à toute la galerie : sélectionne tout ce que tu veux mettre en jeu."}
        </AppText>

        {progress ? (
          <AppText variant="label" style={{ color: colors.gold }}>
            {`Import des photos… ${progress.done} / ${progress.total} (tu peux déjà jouer)`}
          </AppText>
        ) : count > 0 ? (
          <AppText variant="label" style={{ color: colors.success }}>
            {`${count} photo${count > 1 ? 's' : ''} déjà dans ta galerie`}
          </AppText>
        ) : null}

        {onFolder ? (
          <Button label="Importer mon dossier de photos" icon="folder-open" size="lg" onPress={onFolder} />
        ) : (
          <Button label="Choisir mes photos" icon="images" size="lg" onPress={onPick} />
        )}

        <AppText variant="caption" style={{ textAlign: 'center', lineHeight: 19 }}>
          {onFolder
            ? 'Choisis le dossier qui contient tes photos (ex. Images). Toutes les images, sous-dossiers compris, entrent dans le jeu.'
            : 'Beaucoup de photos ? Glisse le doigt sur la grille pour en cocher plein d’un coup. Elles sont réduites une par une, sans bloquer le téléphone.'}
        </AppText>

        <View style={styles.row}>
          <Pressable onPress={onClose} hitSlop={8}>
            <AppText variant="label" style={{ color: colors.text }}>
              {count > 0 ? 'Continuer' : 'Plus tard'}
            </AppText>
          </Pressable>
          <AppText variant="caption">{'   ·   '}</AppText>
          <Pressable onPress={onDemo} hitSlop={8}>
            <AppText variant="label" style={{ color: colors.textDim }}>
              Jouer avec des photos de démo
            </AppText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50, justifyContent: 'flex-end' },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 14,
  },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: 6 },
  row: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', rowGap: 6 },
});
