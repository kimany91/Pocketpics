/**
 * Le film d'une carte vidéo, joué dans la fenêtre de la carte à la place de
 * l'image fixe, en boucle et sans son (comme les cartes immersives des autres
 * jeux de cartes). L'image reste dessous : la vidéo apparaît en fondu par
 * dessus, donc il n'y a jamais de trou pendant qu'elle se charge.
 *
 * Le lecteur n'existe que pendant la lecture : rien ne tourne en arrière-plan.
 */
import { VideoView, useVideoPlayer } from 'expo-video';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { cardVideoUri } from '../../storage/disk';

export function CardVideo({ cardId, playing, radius }: { cardId: string; playing: boolean; radius: number }) {
  const uri = cardVideoUri(cardId);
  // on ne monte le lecteur qu'à la première lecture, et on le garde ensuite
  // pendant la visite (relancer le film doit être instantané)
  const [used, setUsed] = useState(playing);
  useEffect(() => {
    if (playing) setUsed(true);
  }, [playing]);

  if (!uri || !used) return null;
  return <Player uri={uri} playing={playing} radius={radius} />;
}

function Player({ uri, playing, radius }: { uri: string; playing: boolean; radius: number }) {
  const player = useVideoPlayer({ uri }, (p) => {
    p.loop = true;
    p.muted = true;
  });

  useEffect(() => {
    try {
      if (playing) {
        player.currentTime = 0;
        player.play();
      } else {
        player.pause();
      }
    } catch {
      // lecteur déjà libéré (on quitte l'écran) : rien à faire
    }
  }, [playing, player]);

  if (!playing) return null;
  // le fondu est porté par la vue, jamais par le lecteur lui-même : sur le web,
  // l'animer directement casse le rendu (ce n'est pas un élément ordinaire)
  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      exiting={FadeOut.duration(180)}
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}
    >
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
        accessibilityLabel="Vidéo de la carte"
      />
    </Animated.View>
  );
}
