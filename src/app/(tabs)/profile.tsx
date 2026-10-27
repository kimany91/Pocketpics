/**
 * Onglet Profil : le profil public du joueur, c'est-à-dire ce que ses amis
 * voient de lui. Son pseudo et son rang, son code ami et son QR code, ses
 * cartes épinglées, ses 5 emotes équipées (et le bouton « Emotes » vers leur
 * page), ses statistiques, et ses amis (ajout par code ou par QR code,
 * demandes reçues, et la liste pour les défier).
 *
 * Les blocs « amis » sont les mêmes que ceux de l'écran Amis
 * (`src/components/profile/`).
 */
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { AppText } from '../../components/AppText';
import { EmoteProfile } from '../../components/emotes/EmoteProfile';
import { FriendAdd } from '../../components/profile/FriendAdd';
import { FriendCodeCard } from '../../components/profile/FriendCodeCard';
import { FriendList } from '../../components/profile/FriendList';
import { FriendRequests } from '../../components/profile/FriendRequests';
import { PinnedCards } from '../../components/profile/PinnedCards';
import { ProfileCard } from '../../components/profile/ProfileCard';
import { ProfileStats } from '../../components/profile/ProfileStats';
import { useFreshFriends, useSocialScreen } from '../../components/profile/social';
import { Rise } from '../../components/Rise';
import { PseudoStep } from '../../components/tuto/PseudoStep';
import { Screen } from '../../components/Screen';
import { TabHeader } from '../../components/TabHeader';
import { useTutoStep } from '../../state/useTuto';
import { GAME_VERSION, RELEASE_NAME, platformLabel } from '../../game/version';
import { inPhase1, phase2Todo } from '../../game/tutorial';
import { useGame } from '../../state/game';
import { useEntrance } from '../../theme/motion';

export default function ProfileTab() {
  const { visit, focused } = useEntrance();
  const { fresh, welcome } = useFreshFriends();
  useSocialScreen(focused);
  const step = useTutoStep();
  // phase 2 : le combat contre Paul reste à faire (flèche sur son « Défier »)
  const todoFight = useGame((s) => (s.save ? phase2Todo(s.save.tutorial).fight : false));

  // Tuto : les amis d'abord (ajouter Paul, puis le défier), le reste du profil ensuite
  if (inPhase1(step) || todoFight) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Rise visit={visit} index={0}>
            <TabHeader title="Profil" subtitle="Ce que tes amis voient de toi" icon="person" />
          </Rise>
          <Rise visit={visit} index={1}>
            {/* tuto : d'abord le pseudo, ensuite seulement l'ajout de Paul */}
            {step === 'pseudo' ? (
              <PseudoStep />
            ) : (
              <FriendAdd
                onAdded={welcome}
                hint={step === 'friend' ? { text: 'Ajoute ton premier ami : écris Paul#1234 puis touche Ajouter', sub: 'Paul est un ami du tuto, il va t’aider' } : undefined}
              />
            )}
          </Rise>
          <FriendRequests onAccepted={welcome} />
          <FriendList fresh={fresh} active={focused} />
          <Rise visit={visit} index={2} style={{ marginTop: 26 }}>
            <ProfileCard active={focused} />
          </Rise>
          <Rise visit={visit} index={3} style={{ marginTop: 12 }}>
            <FriendCodeCard active={focused} />
          </Rise>
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Rise visit={visit} index={0}>
          <TabHeader title="Profil" subtitle="Ce que tes amis voient de toi" icon="person" />
        </Rise>

        <Rise visit={visit} index={1} style={{ marginTop: 18 }}>
          <ProfileCard active={focused} />
        </Rise>

        <Rise visit={visit} index={2} style={{ marginTop: 12 }}>
          <FriendCodeCard active={focused} />
        </Rise>

        <Section visit={visit} index={3} title="Cartes épinglées">
          <PinnedCards />
        </Section>

        {/* les 5 emotes équipées, et le bouton de leur page */}
        <Section visit={visit} index={4} title="Mes emotes">
          <EmoteProfile active={focused} />
        </Section>

        <Section visit={visit} index={5} title="Statistiques">
          <ProfileStats />
          <AppText variant="caption" style={styles.version}>
            {RELEASE_NAME ? `PocketPics ${RELEASE_NAME} · version ${GAME_VERSION}` : `PocketPics · version ${GAME_VERSION} · ${platformLabel()}`}
          </AppText>
        </Section>

        <Rise visit={visit} index={6}>
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
  version: { textAlign: 'center', opacity: 0.8 },
});
