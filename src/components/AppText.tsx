import { StyleSheet, Text, type TextProps } from 'react-native';

import { colors, fonts } from '../theme';

type Variant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption' | 'mono';

const variants = StyleSheet.create({
  display: { fontFamily: fonts.black, fontSize: 32, letterSpacing: -0.8, color: colors.text },
  title: { fontFamily: fonts.bold, fontSize: 24, letterSpacing: -0.4, color: colors.text },
  heading: { fontFamily: fonts.semibold, fontSize: 17, letterSpacing: -0.2, color: colors.text },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.text },
  label: { fontFamily: fonts.semibold, fontSize: 13, letterSpacing: 0.2, color: colors.text },
  caption: { fontFamily: fonts.medium, fontSize: 12, color: colors.textDim },
  mono: { fontFamily: fonts.bold, fontSize: 30, letterSpacing: 4, color: colors.text },
});

export function AppText({ variant = 'body', style, ...rest }: TextProps & { variant?: Variant }) {
  return <Text {...rest} style={[variants[variant], style]} />;
}
