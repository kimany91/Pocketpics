/**
 * Texte qui prend la plus grande taille possible sans jamais déborder de sa
 * boîte : la taille est calculée d'après la largeur réelle et la longueur du
 * texte (et sur téléphone, le système réduit encore si besoin).
 */
import { useState } from 'react';
import { type StyleProp, Text, type TextStyle, View } from 'react-native';

import { colors, fonts } from '../../theme';

export interface TextPart {
  text: string;
  color?: string;
  bold?: boolean;
}

/** Largeur moyenne d'un caractère de la police Sora, en fraction de la taille. */
const CHAR_W = 0.62;

export function fitFontSize(parts: TextPart[], width: number, lines: number, maxSize: number, minSize: number) {
  const text = parts.map((p) => p.text).join('');
  const chars = Math.max(1, text.length);
  const longestWord = Math.max(1, ...text.split(/\s+/).map((w) => w.length));
  // Assez de place pour tout le texte sur `lines` lignes (avec une marge pour les retours à la ligne)…
  const byLength = (width * lines * 0.86) / (chars * CHAR_W);
  // …et le mot le plus long doit tenir sur une ligne.
  const byWord = width / (longestWord * CHAR_W * 1.04);
  return Math.max(minSize, Math.min(maxSize, byLength, byWord));
}

export function FitText({
  parts,
  lines = 3,
  maxSize = 30,
  minSize = 14,
  style,
  initialWidth = 300,
}: {
  parts: TextPart[];
  lines?: number;
  maxSize?: number;
  minSize?: number;
  style?: StyleProp<TextStyle>;
  initialWidth?: number;
}) {
  const [width, setWidth] = useState(initialWidth);
  const size = Math.floor(fitFontSize(parts, width, lines, maxSize, minSize));
  return (
    <View style={{ alignSelf: 'stretch' }} onLayout={(e) => setWidth(Math.max(40, e.nativeEvent.layout.width))}>
      <Text
        numberOfLines={lines}
        adjustsFontSizeToFit
        minimumFontScale={0.5}
        style={[{ fontFamily: fonts.semibold, fontSize: size, lineHeight: Math.round(size * 1.22), color: colors.text, textAlign: 'center' }, style]}
      >
        {parts.map((p, i) => (
          <Text key={i} style={[p.color ? { color: p.color } : null, p.bold ? { fontFamily: fonts.black } : null]}>
            {p.text}
          </Text>
        ))}
      </Text>
    </View>
  );
}

export interface FitLine {
  parts: TextPart[];
  maxSize: number;
  minSize?: number;
}

/**
 * Plusieurs lignes imposées, chacune sur une seule ligne et aussi grande que
 * possible dans la largeur (ex. « Ta carte utilise » puis, en grand, le nom de l'attaque).
 */
export function FitLines({ lines, initialWidth = 300, style }: { lines: FitLine[]; initialWidth?: number; style?: StyleProp<TextStyle> }) {
  const [width, setWidth] = useState(initialWidth);
  return (
    <View style={{ alignSelf: 'stretch', alignItems: 'center' }} onLayout={(e) => setWidth(Math.max(40, e.nativeEvent.layout.width))}>
      {lines.map((line, i) => {
        const chars = Math.max(1, line.parts.reduce((n, p) => n + p.text.length, 0));
        // Les lignes en gras (police extra-grasse) sont plus larges.
        const charW = line.parts.some((p) => p.bold) ? CHAR_W * 1.12 : CHAR_W;
        const size = Math.floor(Math.max(line.minSize ?? 11, Math.min(line.maxSize, (width * 0.96) / (chars * charW))));
        return (
          <Text
            key={i}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.5}
            style={[{ fontFamily: fonts.semibold, fontSize: size, lineHeight: Math.round(size * 1.2), color: colors.text, textAlign: 'center' }, style]}
          >
            {line.parts.map((p, j) => (
              <Text key={j} style={[p.color ? { color: p.color } : null, p.bold ? { fontFamily: fonts.black } : null]}>
                {p.text}
              </Text>
            ))}
          </Text>
        );
      })}
    </View>
  );
}
