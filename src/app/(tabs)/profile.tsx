/**
 * Onglet Profil : le profil public du joueur, c'est-à-dire ce que ses amis
 * voient de lui. Son pseudo et son rang, son code ami et son QR code, ses
 * statistiques, ses cartes favorites, et ses amis (ajout par code ou par QR
 * code, demandes reçues, et la liste pour les défier).
 *
 * Les blocs « amis » sont les mêmes que ceux de l'écran Amis
 * (`src/components/profile/`).
 */
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { AppText } from '../../components/AppText';
import { FavoriteCards } from '../../components/profile/FavoriteCards';
import { FriendAdd } from '../../components/profile/FriendAdd';
import { FriendCodeCard } from '../../components/profile/FriendCodeCard';
import { FriendList } from '../../components/profile/FriendList';
import { FriendRequests } from '../../components/profile/FriendRequests';
import { ProfileCard } from '../../components/profile/ProfileCard';
import { ProfileStats } from '../../components/profile/ProfileStats';
import { useFreshFriends, useSocialScreen } from '../../components/profile/social';
import { Rise } from '../../components/Rise';
import { Screen } from '../../components/Screen';
import { useEntrance } from '../../theme/motion';

export default function ProfileTab() {
  const { visit, focused } = useEntrance();
  const { fresh, welcome } = useFreshFriends();
  useSocialScreen(focused);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Rise visit={visit} index={0}>
          <AppText variant="title">Profil</AppText>
          <AppText variant="caption" style={{ marginTop: 4 }}>
            Ton profil public : ce que tes amis voient de toi.
          </AppText>
        </Rise>

        <Rise visit={visit} index={1} style={{ marginTop: 18 }}>
          <ProfileCard active={focused} />
        </Rise>

        <Rise visit={visit} index={2} style={{ marginTop: 12 }}>
          <FriendCodeCard active={focused} />
        </Rise>

        <Section visit={visit} index={3} title="Statistiques">
          <ProfileStats />
        </Section>

        <Section visit={visit} index={4} title="Cartes favorites">
          <FavoriteCards />
        </Section>

        <Rise visit={visit} index={5}>
          <FriendAdd onAdded={welcome} />
        </Rise>
        <FriendRequests onAccepted={welcome} />
        <FriendList fresh={fresh} active={focused} />
      </ScrollView>
    </Screen>
  );
}

/** Titre de section et son contenu, en cascade (même rythme que les blocs amis). */
function Section({ visit, index, title, children }: { visit: number; index: number; title: string; children: ReactNode }) {
  return (
    <Rise visit={visit} index={index} style={styles.section}>
      <AppText variant="heading">{title}</AppText>
      {children}
    </Rise>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingTop: 12, paddingBottom: 40 },
  section: { marginTop: 26, gap: 10 },
});
