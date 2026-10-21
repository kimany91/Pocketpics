/**
 * Tuto, étape `pseudo` (onglet Profil, avant d'ajouter Paul) : le joueur choisit
 * son pseudo. C'est sous ce nom que ses amis le trouvent (« Pseudo#1234 »).
 */
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { playSfx } from '../../audio/sfx';
import { cleanPseudo } from '../../net/socialCore';
import { useSocial } from '../../net/social';
import { useGame } from '../../state/game';
import { colors, fonts } from '../../theme';
import { haptic } from '../../utils/haptics';
import { AppText } from '../AppText';
import { Button } from '../Button';
import { TutoArrow } from './TutoArrow';

/** Même limite que la sauvegarde. */
const NAME_MAX = 24;
/** Un pseudo d'au moins 2 caractères. */
const NAME_MIN = 2;

export function PseudoStep() {
  const [draft, setDraft] = useState('');
  const name = cleanPseudo(draft);
  const ok = name.length >= NAME_MIN;

  const validate = () => {
    if (!ok) return;
    const game = useGame.getState();
    game.setPlayerName(name);
    // les amis (et l'annuaire des pseudos) verront le nouveau nom
    useSocial.getState().announce();
    haptic.success();
    playSfx('up3', { volume: 0.6 });
    game.advanceTuto('pseudo');
  };

  return (
    <Animated.View entering={FadeInDown.duration(300)}>
      <AppText variant="heading" style={styles.title}>
        Ton pseudo
      </AppText>
      <TutoArrow inline text="Choisis ton pseudo puis touche Valider" sub="C’est le nom que tes amis verront et taperont pour t’ajouter" />
      <View style={styles.row}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Ton pseudo"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="words"
          autoCorrect={false}
          maxLength={NAME_MAX}
          style={styles.input}
          returnKeyType="done"
          onSubmitEditing={validate}
          selectionColor={colors.gold}
          accessibilityLabel="Ton pseudo"
        />
        <Button label="Valider" icon="checkmark" onPress={validate} disabled={!ok} />
      </View>
      <AppText variant="caption" style={{ marginTop: 8 }}>
        {draft && !ok ? 'Au moins 2 caractères (lettres, chiffres, espaces).' : 'Tu pourras le changer plus tard en touchant ton nom sur ton profil.'}
      </AppText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: 26, marginBottom: 10 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.gold,
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 16,
  },
});
