/**
 * Ornements dorés de la carte Divine : couronne au sommet, pendentif en bas,
 * filigranes aux coins et gemmes sur les côtés. Ils débordent de la carte
 * et lui donnent sa silhouette particulière.
 */
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';

export function DivineOrnaments({ width, height }: { width: number; height: number }) {
  const m = width * 0.1; // débordement autour de la carte
  const W = width;
  const H = height;
  const cx = m + W / 2;
  const top = m;
  const bottom = m + H;
  const sw = Math.max(1.2, W * 0.016);

  // Couronne : dôme pointu qui dépasse au-dessus du bord supérieur
  const a = W * 0.24;
  const crest = [
    `M ${cx - a} ${top + W * 0.035}`,
    `C ${cx - a * 0.75} ${top - m * 0.15}, ${cx - a * 0.45} ${top - m * 0.2}, ${cx - a * 0.3} ${top - m * 0.45}`,
    `C ${cx - a * 0.18} ${top - m * 0.7}, ${cx - a * 0.08} ${top - m * 0.75}, ${cx} ${top - m * 0.98}`,
    `C ${cx + a * 0.08} ${top - m * 0.75}, ${cx + a * 0.18} ${top - m * 0.7}, ${cx + a * 0.3} ${top - m * 0.45}`,
    `C ${cx + a * 0.45} ${top - m * 0.2}, ${cx + a * 0.75} ${top - m * 0.15}, ${cx + a} ${top + W * 0.035}`,
    `Q ${cx} ${top - m * 0.05} ${cx - a} ${top + W * 0.035} Z`,
  ].join(' ');

  // Pendentif : version plus petite, tournée vers le bas
  const b = W * 0.16;
  const pendant = [
    `M ${cx - b} ${bottom - W * 0.03}`,
    `C ${cx - b * 0.6} ${bottom + m * 0.2}, ${cx - b * 0.25} ${bottom + m * 0.3}, ${cx} ${bottom + m * 0.75}`,
    `C ${cx + b * 0.25} ${bottom + m * 0.3}, ${cx + b * 0.6} ${bottom + m * 0.2}, ${cx + b} ${bottom - W * 0.03}`,
    `Q ${cx} ${bottom + m * 0.05} ${cx - b} ${bottom - W * 0.03} Z`,
  ].join(' ');

  // Filigrane de coin (haut-gauche), recopié en miroir sur les autres coins
  const r = m * 0.9;
  const leg = W * 0.2;
  const corner = [
    `M ${m - r * 0.35} ${m + leg}`,
    `C ${m - r * 0.75} ${m + leg * 0.4}, ${m - r * 0.8} ${m - r * 0.8}, ${m + leg * 0.4} ${m - r * 0.75}`,
    `L ${m + leg} ${m - r * 0.35}`,
  ].join(' ');
  const curl = `M ${m - r * 0.45} ${m - r * 0.45} m ${-r * 0.22} 0 a ${r * 0.22} ${r * 0.22} 0 1 0 ${r * 0.44} 0 a ${r * 0.22} ${r * 0.22} 0 1 0 ${-r * 0.44} 0`;
  const total = { w: W + 2 * m, h: H + 2 * m };
  const mirror = (sx: number, sy: number) =>
    `translate(${sx < 0 ? total.w : 0} ${sy < 0 ? total.h : 0}) scale(${sx} ${sy})`;

  const gem = (x: number, y: number, s: number) =>
    `M ${x} ${y - s} L ${x + s * 0.75} ${y} L ${x} ${y + s} L ${x - s * 0.75} ${y} Z`;

  return (
    <View pointerEvents="none" style={[styles.wrap, { left: -m, top: -m, width: total.w, height: total.h }]}>
      <Svg width={total.w} height={total.h}>
        <Defs>
          <LinearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#FFF7D6" />
            <Stop offset="0.3" stopColor="#F3C24F" />
            <Stop offset="0.55" stopColor="#B7862A" />
            <Stop offset="0.75" stopColor="#FFE9A1" />
            <Stop offset="1" stopColor="#D7A23A" />
          </LinearGradient>
          <LinearGradient id="chroma" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#FF8FC0" />
            <Stop offset="0.3" stopColor="#FFE38A" />
            <Stop offset="0.55" stopColor="#8CFFC8" />
            <Stop offset="0.8" stopColor="#7CCBFF" />
            <Stop offset="1" stopColor="#C49CFF" />
          </LinearGradient>
        </Defs>

        {[
          [1, 1],
          [-1, 1],
          [1, -1],
          [-1, -1],
        ].map(([sx, sy]) => (
          <G key={`${sx}${sy}`} transform={mirror(sx, sy)}>
            <Path d={corner} stroke="url(#gold)" strokeWidth={sw * 1.6} strokeLinecap="round" fill="none" />
            <Path d={curl} fill="url(#gold)" />
          </G>
        ))}

        <Path d={crest} fill="url(#gold)" stroke="#6B4A12" strokeOpacity={0.5} strokeWidth={sw * 0.6} />
        <Path d={gem(cx, top - m * 0.35, W * 0.05)} fill="url(#chroma)" stroke="#FFF7D6" strokeWidth={sw * 0.8} />
        <Circle cx={cx - a * 0.55} cy={top - m * 0.02} r={W * 0.014} fill="#FFF7D6" />
        <Circle cx={cx + a * 0.55} cy={top - m * 0.02} r={W * 0.014} fill="#FFF7D6" />

        <Path d={pendant} fill="url(#gold)" stroke="#6B4A12" strokeOpacity={0.5} strokeWidth={sw * 0.6} />
        <Path d={gem(cx, bottom + m * 0.25, W * 0.032)} fill="url(#chroma)" stroke="#FFF7D6" strokeWidth={sw * 0.7} />

        <Path d={gem(m, m + H / 2, W * 0.045)} fill="url(#chroma)" stroke="url(#gold)" strokeWidth={sw} />
        <Path d={gem(m + W, m + H / 2, W * 0.045)} fill="url(#chroma)" stroke="url(#gold)" strokeWidth={sw} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute' },
});
