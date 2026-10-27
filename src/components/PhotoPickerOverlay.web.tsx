/**
 * Un vrai sélecteur de photos du navigateur, invisible, posé sur un bouton.
 * Le doigt touche directement le champ : sur iPhone (Safari, Chrome), c'est la
 * seule façon sûre d'ouvrir la galerie, un clic déclenché par le code étant
 * parfois ignoré.
 */
import { createElement } from 'react';

export function PhotoPickerOverlay({ onFiles, label }: { onFiles(files: File[]): void; label: string }) {
  return createElement('input', {
    type: 'file',
    accept: 'image/*',
    multiple: true,
    'aria-label': label,
    title: label,
    onChange: (e: { currentTarget: HTMLInputElement }) => {
      const input = e.currentTarget;
      const files = Array.from(input.files ?? []);
      // vidé : choisir à nouveau les mêmes photos redéclenche l'import
      input.value = '';
      if (files.length > 0) onFiles(files);
    },
    style: { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', zIndex: 5, fontSize: 0 },
  });
}
