/**
 * Fenêtre d'import de la version navigateur. Elle s'ouvre à chaque arrivée sur
 * le jeu. Le sélecteur de photos ne peut s'ouvrir que sur un tap du joueur :
 * le bouton « Choisir mes photos » déclenche donc l'import directement.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { galleryPhotoCount, getGalleryAccess, onGalleryChange } from '../game/gallery';
import { colors } from '../theme';
import { AppText } from './AppText';
import { Button } from './Button';

interface Props {
  open: boolean;
  onClose(): void;
  onPick(): void;
  onFolder?: () => void;
  onDemo(): void;
}

export function GalleryImportSheet({ open, onClose, onPick, onFolder, onDemo }: Props) {
  const insets = useSafeAreaInsets();
  const [count, setCount] = useState(0);

  useEffect(() => {
    const refresh = () => setCount(galleryPhotoCount() ?? 0);
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
          PocketPics tire ses cartes dans tes photos. Ton navigateur ne peut pas les lire tout seul : sélectionne-les ici, tu peux tout prendre d'un coup.
        </AppText>

        {count > 0 ? (
          <AppText variant="label" style={{ color: colors.success }}>
            {`${count} photo${count > 1 ? 's' : ''} déjà dans ta galerie`}
          </AppText>
        ) : null}

        <Button label="Choisir mes photos" icon="images" size="lg" onPress={onPick} />
        {onFolder ? <Button label="Importer un dossier entier" icon="folder-open" kind="secondary" onPress={onFolder} /> : null}

        <AppText variant="caption" style={{ textAlign: 'center', lineHeight: 19 }}>
          Rien ne s'ouvre ? Copie des photos puis appuie sur Ctrl+V, ou glisse-les sur cette page.
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
