/**
 * Demande de confirmation (« Quitter ? »). Sur téléphone, la boîte de dialogue
 * du système. Dans le navigateur, `Alert.alert` ne fait rien et `window.confirm`
 * est ignoré dans une page intégrée (iframe) : on affiche la boîte du jeu
 * (`ConfirmHost`, montée dans la mise en page racine).
 */
import { Alert, Platform } from 'react-native';
import { create } from 'zustand';

export interface ConfirmRequest {
  title: string;
  message: string;
  confirm: string;
  cancel: string;
  onConfirm(): void;
}

export const useConfirm = create<{ current: ConfirmRequest | null }>(() => ({ current: null }));

export function confirmAction(title: string, message: string, confirm: string, onConfirm: () => void, cancel = 'Annuler') {
  if (Platform.OS === 'web') {
    useConfirm.setState({ current: { title, message, confirm, cancel, onConfirm } });
    return;
  }
  Alert.alert(title, message, [
    { text: cancel, style: 'cancel' },
    { text: confirm, style: 'destructive', onPress: onConfirm },
  ]);
}

/** Réponse à la boîte affichée : elle se ferme, puis l'action part si c'est oui. */
export function answerConfirm(yes: boolean) {
  const req = useConfirm.getState().current;
  useConfirm.setState({ current: null });
  if (yes) req?.onConfirm();
}
