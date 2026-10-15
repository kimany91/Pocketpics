/**
 * Demande de confirmation (« Quitter ? »). Sur téléphone, la boîte de dialogue
 * du système ; dans le navigateur, `Alert.alert` ne fait rien : on utilise
 * celle du navigateur.
 */
import { Alert, Platform } from 'react-native';

export function confirmAction(title: string, message: string, confirm: string, onConfirm: () => void, cancel = 'Annuler') {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: cancel, style: 'cancel' },
    { text: confirm, style: 'destructive', onPress: onConfirm },
  ]);
}
