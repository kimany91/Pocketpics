# PocketPics

PocketPics est un jeu de cartes à collectionner fait à partir de ta galerie photo. Toutes les 12 h tu gagnes un tirage (2 au maximum en réserve). Chaque paquet prend des photos au hasard dans ta galerie et donne à chacune une rareté. Tu peux ensuite échanger tes cartes avec tes amis, en ligne ou en face à face.

- **Android et iOS** : Expo (React Native) + TypeScript, publiable sur le Play Store et l'App Store.
- **Mises à jour en ligne** : EAS Update (expo-updates est déjà configuré).
- **Multijoueur sans serveur à soi** : amis, défis et combats classés en ligne, échange chiffré de bout en bout (ou en Wi-Fi local). Tout passe par des relais publics, en Wi-Fi comme en 4G/5G.

## Le jeu

| Onglet | Contenu |
| --- | --- |
| **Tirage** | Paquet animé, réserve de tirages (3 max), compte à rebours jusqu'au prochain, taux d'obtention, solde de pièces. Sans tirage, on peut en acheter un avec des pièces |
| **Collection** | Grille de cartes, filtres par rareté, tri récentes/rareté. On touche une carte pour l'agrandir |
| **Combat** | Un menu à deux grands panneaux : **Aventure solo** (carte de 21 mondes, 130 niveaux, qui rapportent des pièces) et **Multijoueur** (rang, amis, combats classés par défi ou par code / QR code) |
| **Échange** | Héberger (QR code + code) ou rejoindre (scan QR ou saisie du code), puis échange classique |

**Ouverture d'un paquet**

1. On déchire le sachet au doigt le long des pointillés. Une lumière filtre par la déchirure, le sachet tremble sous le doigt, et un retour haptique se fait sentir à chaque cran.
2. Le paquet s'ouvre dans un flash et une gerbe d'étincelles. Les cartes jaillissent en éventail, puis se rassemblent en pile.
3. Une jauge en haut de l'écran compte les cartes du paquet et prend la couleur de chaque rareté révélée.
4. **Montée en puissance** : chaque carte arrive de dos, au niveau Commune. À chaque toucher, si elle vaut plus, elle monte d'un niveau (Rare, Super Rare, Épique… jusqu'à sa vraie rareté) : son de plus en plus aigu, couleur du dos, onde et étincelles, secousse. Quand elle a atteint sa rareté, le toucher suivant la retourne. Une Commune se retourne donc au premier toucher, une Mythique après 4 montées. Avant de retourner une Légendaire ou mieux, l'écran s'assombrit et un son monte.
5. La révélation dépend de la rareté : ondes de choc, étincelles, tremblement et zoom de l'écran, flash, rayons, colonne de lumière, bannière et vibrations de plus en plus fortes. Une rareté obtenue pour la première fois affiche « Première … ! ».
6. On glisse la carte pour passer à la suivante. La meilleure arrive en dernier.
7. Le récapitulatif retourne les cartes une à une et fait briller la meilleure. S'il reste des tirages, « Paquet suivant » enchaîne directement.

**Sons** (synthétisés par `scripts/generate-sounds.py`, y compris coup, critique, gifle, raté, étourdi, K.O., victoire et défaite pour les combats) : l'icône 🔊 de l'accueil ouvre deux curseurs, effets sonores (55 % par défaut) et musique de combat (45 %), enregistrés dans la sauvegarde. Sons : déchirure, éventail, glissement de carte, 7 paliers de montée de niveau, révélation (Commune à Super Rare), son spécial Épique/Mythique, son spécial Légendaire, son spécial Ultra Légendaire/Divine, suspense, briquet et feu.

**Retours haptiques** (`src/utils/haptics.ts`) : en déchirant le sachet, un cran à chaque avancée du doigt, de plus en plus marqué, puis un claquement sec juste avant que ça cède et un gros « crac » avec un grondement. Chaque toucher sur une carte (montée de niveau, retournement, carte qu'on envoie) vibre. Une Mythique ou mieux déclenche une longue vibration : 0,8 s pour une Mythique, jusqu'à 2,1 s pour une Divine. Sur iPhone, c'est une suite d'impacts très rapprochés ; sur Android, le moteur vibre en continu ; dans un navigateur qui le permet, `navigator.vibrate`.

**Reflets qui suivent le téléphone** (`src/utils/motionTilt.ts`) : dans la carte agrandie (et en combat), les reflets holographiques bougent quand on incline le téléphone, comme une vraie carte en main. Dans la collection, les cartes chromatiques (Ultra Légendaire, Divine) brillent aussi selon l'inclinaison, plus discrètement. Le capteur ne tourne que quand l'onglet est affiché. Dans le navigateur, on passe par `deviceorientation` (Safari demande l'autorisation au premier toucher).

**Carte agrandie** : on la fait tourner au doigt en semi-3D, avec de l'inertie. Un double-tap retourne la carte, et son dos affiche ses infos. On peut aussi la renommer. Le nom s'affiche sur la carte et la suit lors d'un échange.

**Cartes verrouillées.** Dans la salle d'échange, un cadenas sous chaque carte de son offre permet de la verrouiller (ça change l'accord : les deux validations sont à refaire, comme pour un changement de cartes). Celui qui la reçoit ne peut plus du tout la modifier : ni son nom, ni ceux de ses attaques, ni son cadrage. Le verrou fait partie de la carte (`locked` dans `src/storage/model.ts`) : il reste si elle est échangée de nouveau, et ne s'enlève jamais. Un petit cadenas s'affiche en haut à gauche de la carte. Recevoir une carte verrouillée est une quête unique.

**Pioche amicale.** On ouvre un paquet fait des photos de la galerie d'un ami en ligne. Elle se lance depuis son profil (sous « Défier » et « Échanger »), ou depuis le « ! » qui apparaît à côté du paquet de l'accueil dès qu'un ami est en ligne. La première fois, une page explique le principe. Ensuite, c'est une partie de pêche (`src/components/pioche/FishingScene.tsx`, écran `src/app/pioche/fish.tsx`) : le personnage lance sa canne, ses amis remontent à la surface, on touche celui chez qui piocher ; le téléphone vibre et la ligne tire pendant que l'ami prépare ses photos. L'ami reçoit une demande, comme pour un échange, qu'il accepte ou refuse. S'il refuse, ne répond pas en une minute ou est occupé (combat, échange ou ouverture), la ligne casse et rien n'est payé ; s'il accepte, son téléphone tire 5 photos au hasard et les envoie, et le personnage ramène un paquet qui se pose devant lui avant l'ouverture. C'est payé (un tirage, ou 200 pièces s'il n'en reste plus) dès qu'on commence à déchirer le paquet. L'ami voit chaque carte retournée en direct, puis seulement à la fin il valide ou refuse : s'il refuse, les cartes sont retirées et le paiement n'est pas rendu ; sans réponse en une minute, elles sont gardées. Les cartes sont créées avec la chance habituelle de celui qui pioche (`src/game/friendDraw.ts`, `src/net/pioche.ts`, écrans `src/app/pioche/`). Seules les photos qu'il n'a pas déjà en carte sont gardées. Sans tirage ni 200 pièces, 2 pubs peuvent payer la pioche (dans la limite des 2 paquets pub du jour). Une fois l'ami décidé, « Repiocher chez … » relance une pioche chez lui sans repasser par la page d'explication (il reçoit une nouvelle demande). La présence de chaque ami dit la version de sa Pioche amicale (`pv`) : une app trop ancienne (qui rejoindrait sans demander, ou afficherait la demande comme un défi) est signalée « doit mettre à jour le jeu » au lieu de recevoir la demande.

**Filtre de contenu adulte.** Chaque photo passe par un détecteur de pornographie qui tourne sur le téléphone, sans serveur (`src/game/nsfw.ts`) : le modèle NSFWJS MobileNetV2 (Infinite Red, licence MIT), un réseau de neurones entraîné sur environ 60 000 images qui donne la probabilité de 5 classes (dessin, hentai, neutre, porno, sexy), sur la photo entière ramenée à 224 × 224. Sur téléphone, il est converti en TFLite (`assets/nsfw/nsfw-mobilenet-v2-f16.tflite`, 5,2 Mo, par `scripts/convert-nsfw-model.py`) et tourne en natif avec `react-native-fast-tflite` (`src/game/nsfwModel.ts`) ; dans le navigateur, c'est TensorFlow.js, poids intégrés à l'app : rien n'est téléchargé (`src/game/nsfwModel.web.ts`). Une photo est censurée si porno + hentai atteint 40 %, si porno ou hentai est la classe en tête, si porno dépasse 25 % sur une image globalement osée, ou si « sexy » atteint 85 % (une photo en maillot de bain reste visible). C'est définitif (`censored` dans la carte ne repasse jamais à faux) : partout, la photo est réduite à quelques pixels, floutée et assombrie, avec un tampon « CENSURÉ ». Le nom, la rareté et les stats restent ; la carte sert en combat et s'échange, mais ne se recadre plus. Les photos d'un paquet sont vérifiées pendant qu'on le déchire : une photo censurée n'est jamais tirée, une autre prend sa place sans que le joueur le voie, et elle ne sera plus jamais proposée (`generatePack`, option `screen`, dans `src/game/pack.ts` ; même chose pour la carte Galaxy). Une photo de la Pioche amicale jugée censurée à la réception est retirée du paquet. Sans réponse du détecteur à temps (8 s), la photo est gardée, et la carte reste floutée (« Vérification… ») jusqu'à ce que ce soit fait. Chaque téléphone vérifie lui-même ce qu'il reçoit, sans croire l'autre (sauf pour être plus strict) : photos de la Pioche amicale (l'ami ne donne que des photos que son propre détecteur a jugées correctes), cartes et aperçus d'échange, cartes épinglées des amis, images des adversaires en ligne. Tout reste flouté tant que ce n'est pas vérifié. Les cartes d'avant le filtre restent visibles et sont vérifiées en fond après le démarrage, une à une (`nsfwScan`). La photo d'une carte censurée ne part ni en combat ni avec les cartes épinglées. Il faut une version compilée de l'app (module natif, pas Expo Go). Pour les tests dans le navigateur : `globalThis.__pocketpicsForceCensor = true` (ou un nombre n, pour les n vérifications suivantes) fait répondre « censurée », `globalThis.__pocketpicsNsfwHold = true` retient le détecteur, et `globalThis.__pocketpicsNsfwStats` donne les temps mesurés.

**Tuto.** Au premier lancement, seul l'onglet Tirage est ouvert, les autres ont un cadenas. Des flèches guident : ouvrir deux paquets ; l'onglet Profil se débloque, il faut y ajouter Paul#1234, un ami bot local jamais contacté par le réseau (`src/game/paul.ts`) ; le « ! » de la Pioche amicale apparaît, on pêche Paul et on ouvre gratuitement son paquet de 5 cartes communes, faites avec les illustrations du jeu (`src/game/paulPack.ts`) ; l'onglet Combat se débloque et le premier combat solo est expliqué pas à pas. Une fois ce combat fini, gagné ou perdu, tout le jeu est débloqué. Vient ensuite une phase secondaire, avec un menu « Tu as fini le tuto ! » : un échange d'une seule carte avec Paul, dans le vrai écran d'échange (Paul est un faux pair local, `src/trade/paulPeer.ts`), après quoi il refuse tous les échanges ; puis un combat amical contre lui (un bot, qui ne compte pas pour le rang). Pendant cette phase seulement, « Passer le tuto » apparaît en haut à gauche. Ensuite, Paul ne propose un combat amical que rarement, au plus une fois par jour (`src/game/paulChallenge.ts`). L'état du tuto est gardé dans la sauvegarde (`tutorial`, `src/game/tutorial.ts`) ; les parties existantes passent directement le tuto. Pour les tests dans le navigateur, `globalThis.__pocketpicsSkipTutorial = true` démarre une nouvelle partie sans tuto.

**Pubs récompensées.** Quand il n'y a plus de tirage, l'accueil propose, à côté de l'achat à 200 pièces, de regarder 2 pubs pour ouvrir un paquet (2 fois par jour au plus ; une pub regardée reste comptée jusqu'au soir). En solo, après une défaite, une pub permet de revivre une fois par combat : la plus forte des cartes tombées revient avec la moitié de ses PV (pas pendant le défi du jour). Une pub fermée avant la fin ne donne rien. Sur téléphone, ce sont des pubs Google AdMob (`react-native-google-mobile-ads`, formulaire de consentement européen inclus) ; ce sont les pubs de test de Google tant que les identifiants de `src/ads/config.ts` et de `app.json` ne sont pas remplacés par ceux de ton compte AdMob. Il faut une version compilée de l'app (pas Expo Go). Dans la démo navigateur, une pub simulée de 5 secondes la remplace (`src/components/ads/AdHost.web.tsx`).

- **Changer de carte** : glisser à côté de la carte (au-dessus, en dessous, sur les côtés), ou toucher les flèches. L'ordre suit celui de la collection (tri et filtre compris).
- **Zoom** : pincer à deux doigts zoome jusqu'à ×4 sur le point pincé ; une fois zoomé, un doigt déplace la carte au lieu de la tourner, et un double-tap revient à la taille normale. Le défilement entre cartes est suspendu pendant le zoom.
- **Favoris** : l'étoile en haut de la carte la met en favori. Les favoris ont un badge ★ dans la grille et un filtre « ★ Favoris ».
- **Rotation rapide** : faire tourner vite la carte déclenche un effet et le son de sa rareté, de plus en plus grandiose (rien pour une Commune).
- **Brûler une carte** : la corbeille demande confirmation (action irréversible). Un briquet s'allume, la carte brûle du bas vers le haut puis part en fumée. Sa photo redevient tirable dans un prochain paquet.

Chaque rareté haute a sa mise en scène :

| Rareté | Effets sur la carte | Décor |
| --- | --- | --- |
| Mythique | léger reflet holographique, scintillements rouges | lueur et braises rouges |
| Légendaire | foil holo doré (bandes de diffraction, paillettes, reflet de lumière) qui s'allume quand on penche, scintillements dorés | salle dorée, rayons et poussière d'or |
| Ultra Légendaire | le même foil en arc-en-ciel | rayons et lueurs chromatiques |
| Divine | foil chromatique et or à double bande croisée, paillettes intenses, forme ornementée (couronne, filigranes, gemmes), contour or irisé qui tourne vite et **halo lumineux** qui respire et change de couleur (or, rose, cyan, violet) ; halo et ornements à toutes les tailles, même en miniature en combat, pour reconnaître une Divine partout | espace : étoiles, nébuleuses, étoiles filantes |

## Combat

**Stats d'une carte.** Chaque carte a des PV et deux attaques, qui dépendent de sa rareté (`src/battle/stats.ts`). Elles sont tirées à partir de l'identifiant de la carte : une même carte a toujours les mêmes stats. Les anciennes cartes les reçoivent donc à la mise à jour, sans rien perdre, et un échange les transporte avec la carte. Dans la collection, on glisse vers le haut (ou on touche « Stats de combat ») pour les voir. On peut y **renommer les deux attaques**, puisqu'elles n'ont pas de type : en combat, on lira « <carte> utilise <attaque> ! ».

L'attaque classique est toujours un coup simple, illimité. Tous les effets sont réservés à l'attaque **spéciale** (utilisations limitées). Les plus puissants n'apparaissent qu'à partir d'une certaine rareté. Les chiffres ont été réglés par simulation : des milliers de combats bot contre bot, pour qu'aucune spéciale n'écrase les autres (`src/battle/stats.ts`, objets `BATTLE` et `SPECIAL`).

Les attaques n'ont pas de type et se renomment librement. Chacune a donc **son effet visuel**, pour qu'on comprenne ce qu'elle fait sans lire son nom. On retrouve aussi son icône sur le bouton, dans les stats et dans les effets en cours.

| Spéciale | Effet | Utilisations | Dès | Visuel en combat |
| --- | --- | --- | --- | --- |
| Coup puissant | Puissance ×1,6 | 3 | Commune | Élan, éclat blanc, gros coup |
| Double frappe | 2 coups à ×0,8, chacun avec sa visée | 3 | Commune | Deux coups rapides |
| Gifle | ×1,1, 1 chance sur 3 d'étourdir 1 à 2 tours | 3 | Commune | Revers de côté, la cible pivote, étoiles |
| Enchaînement | ×0,9, puis +120 % à chaque relance d'affilée, jusqu'à ×4,6. Toute autre action casse la série | 6 | Commune | Petits coups rapides, compteur ×N qui grossit |
| Cible | ×0,9, le prochain coup reçu par la cible fait double dégâts | 3 | Commune | Viseur rouge qui tourne sur la cible |
| Fatigue | ×1, le prochain coup de la cible fait moitié moins mal | 3 | Commune | La cible s'affaisse et se ternit |
| Garde | Pas de coup, −70 % de dégâts pendant 3 tours adverses | 2 | Rare | Bouclier de verre bleu devant la carte |
| Soin | Pas de coup, +60 % des PV max (impossible à PV pleins) | 2 | Rare | Lueur verte, étincelles, « +N » |
| Esquive | Pas de coup, 60 % d'éviter chaque attaque pendant 2 tours adverses | 2 | Super Rare | La carte se décale et se tourne, son ombre reste en place |
| Représailles | ×1, ou ×1,6 si la carte a été blessée au tour d'avant | 3 | Super Rare | Elle tremble et rougit de colère avant de frapper |
| Brouillage | ×1,2, pas de spéciale pendant 2 tours adverses | 2 | Épique | Parasites qui grésillent sur la cible |
| Poison | ×0,6, puis des dégâts au début de ses 3 tours (guéri en changeant de carte) | 2 | Épique | La cible vire au violet, des bulles en sortent |
| Coup de grâce | ×1,1, ou ×2,2 si la cible a moins de 50 % de PV | 2 | Épique | Grande entaille rouge en croix |
| Charge | ×2,1, la carte perd 15 % de ses PV (jamais K.O. par ce contrecoup) | 2 | Mythique | Gros recul puis elle fonce très loin |
| Concentration | Pas de coup, le prochain coup fait ×3,5 (perdu si la carte change) | 2 | Mythique | La carte gonfle, cadre et aura dorés qui pulsent |
| Miroir | Copie la dernière attaque adverse et la renvoie ×1,3 | 2 | Légendaire | La carte se retourne comme un miroir |

Les effets en cours disparaissent quand la carte quitte le terrain (sauf l'étourdissement). Les attaques qui ne frappent pas n'ont pas de mini-jeu de précision. Sur le bouton de la spéciale, une ligne dit ce qu'elle va faire maintenant. Elle passe en doré quand son bonus est prêt (« achève-la ! », « elle est blessée ! », « Série ×3,4 ! »).

| Rareté | PV | Puissance |
| --- | --- | --- |
| Commune → Divine | 50 → 115 | 12 → 32 |

(± 8 % selon la carte.)

**Précision (façon Undertale).** On choisit une attaque, puis une barre apparaît : on touche pour lancer le curseur, et on retouche quand il passe sur la cible au centre. Au centre, c'est un critique (× 1,5). Dans la zone verte, les dégâts baissent doucement jusqu'à × 1,075 au bord de la zone. En dehors, ça coûte cher (`tapMultiplier`) : de × 0,75 juste après la zone jusqu'à × 0,1 au bout de la barre. S'il n'y a pas de deuxième toucher, l'attaque est ratée. Appuyer n'importe quand ne suffit donc pas : en simulation, un joueur qui joue au hasard (cartes, remplaçantes et appuis) avec le deck de départ gagne le boss du Parc 5 % du temps, contre environ 90 % pour un joueur qui vise. Les bots gardent leur propre visée (`timingMultiplier`). Comme un joueur, ils appuient toujours : jamais de coup raté à 0 dégât, mais parfois un appui à côté de la zone verte, puni comme celui d'un joueur (de 20 % des coups pour un bot débutant à 3 % pour le plus fort). La double frappe enchaîne deux passages.

**Voir une carte.** En plein combat, on touche sa carte ou celle de l'adversaire pour la voir en 3D, comme dans la collection (rotation au doigt, zoom, dos), avec ses PV actuels, ses attaques et les utilisations de spéciale restantes. Quand on touche une remplaçante, trois boutons apparaissent : Annuler, Info (la même vue) et Envoyer. Le combat est en pause pendant qu'on regarde.

**Mise en scène.** Le décor est l'illustration du monde, floutée sous un voile sombre (`src/components/battle/ArenaBackdrop.tsx`). Le combat s'ouvre sur un écran « VS » d'environ 1,6 s (un toucher le passe), puis les cartes tombent sur leur socle. Au repos, elles flottent doucement. Une carte qui attaque fonce en diagonale vers l'adversaire en laissant une traînée. La carte touchée prend un éclat, une onde et des étincelles, sa jauge clignote, et l'écran tremble selon la part de PV perdue. Un critique ou un coup de grâce ajoute un éclair blanc. Le cadre du message prend la couleur du camp dont il parle, et un onglet dit à qui est le tour.

**Musique.** Chaque monde a sa propre musique de combat, composée par `python3 scripts/generate-music.py` (tout est synthétisé, rien sous licence) et encodée en AAC (`assets/music/world-<id>.m4a`, numérotés par l'id fixe du monde, 8,3 Mo pour les 21). Les combats en ligne prennent celle de la Tempête. La musique démarre en fondu au début du combat et s'arrête en fondu à la fin. Son volume se règle à part (45 % par défaut, enregistré dans la sauvegarde) dans la fenêtre « Son », ouverte depuis l'icône 🔊 de l'accueil ou depuis l'icône ♪ en combat.

Chaque morceau est une vraie petite composition en boucle (48 à 84 s), pas un accord qui se répète :

- **4 parties de 8 mesures** (en 4/4, en 12/8 pour la gigue des Pirates, en 3/4 pour la valse de la Galerie) : A (le thème), B (le développement, sur une autre grille d'accords), A' (le thème à l'octave avec une seconde voix à la tierce) et C (un pont plus calme, sur une troisième grille, qui remonte vers le début). Breaks de batterie en fin de partie, cymbale au début de la suivante.
- **Des mélodies construites** : un motif de 2 mesures qui suit un contour (arche, montée, vague…), sa réponse transposée sur les accords suivants (fin ouverte), la reprise du motif, puis une conclusion qui descend sur la tonique. Les temps forts tombent sur des notes de l'accord, et jamais plus de trois fois la même note d'affilée dans les nouveaux mondes.
- **Basse et accompagnement écrits par style** (rebond, reggae, oum-pa, marche, pompe électronique, galop métal, polka, deux-temps country, maqsoum, wagonnet, basse acide…), avec des accords qui s'enchaînent par le plus court chemin.

Dans l'ordre de la carte (n° = id du monde et du fichier) :

| # | Monde | Tonalité, tempo | Couleur | Instruments |
| --- | --- | --- | --- | --- |
| 1 | Le Parc | Fa majeur, 124 | Promenade joyeuse | Glockenspiel, sifflet, ukulélé, claps |
| 11 | Le Lac | Mib mixolydien, 108 (léger balancé) | Balade sur l'eau | Vibraphone, flûte, guitare en arpèges, contrebasse pizzicato, cordes |
| 2 | La Plage | Do majeur, 112 | Calypso | Steel drum, marimba en contretemps, bongos |
| 12 | La Foire | Réb majeur, 140 | Galop de manège | Orgue de manège à vapeur, orgue de barbarie, glockenspiel, tuba, sifflet à coulisse |
| 3 | Le Marché | Ré mineur harmonique, 144 | Tarentelle | Accordéon, violon, mandoline, tambourin |
| 13 | La Ferme | La majeur, 156 | Hoedown | Banjo, violon, harmonica, mandoline, cloche de vache, claps |
| 4 | La Forêt | Mi dorien, 100 | Aventure mystérieuse | Flûte, harpe, chœur, toms, wood-block |
| 14 | Le Manoir | Do mineur harmonique, 132 (balancé) | Frissons pour rire | Thérémine, xylophone, clavecin, orgue, célesta, pizzicati, wood-block |
| 5 | Le Port | Sol majeur, 118 (balancé) | Chant de marins | Violon, accordéon, tuba, cloche de bateau |
| 15 | Les Pirates | Sol mineur, 116 en 12/8 | Gigue de corsaires | Violon, cuivres et stabs, sifflet, mandoline, grosses caisses et toms, canons |
| 16 | Le Désert | Mi hijaz, 104 | Maqâm du désert | Oud, ney, harpe, bourdon, darbouka, cymbalettes |
| 6 | La Montagne | Ré lydien, 92 | Souffle épique | Cor, célesta, chœur, timbales, grelots |
| 17 | Les Mines | Fa# dorien, 136 | Wagonnets et cristaux | Cristaux en écho, cuivres, glockenspiel, basse synthé, pioches, gouttes |
| 7 | Le Volcan | Do# phrygien, 152 | Lourd et menaçant | Guitares saturées, cuivres, taïkos |
| 8 | La Tempête | Si mineur, 160 | Électrique | Supersaw, arpèges, basse pompée, tonnerre |
| 18 | L'Archipel | Lab lydien, 96 | Îles dans le ciel | Violons, cor, harpe, célesta, chœur, vent |
| 9 | Le Palais | Sib majeur, 112 | Fanfare royale | Cuivres, clavecin en basse d'Alberti, caisse claire de marche |
| 19 | Néon | Fa mineur, 148 | Ville cyberpunk | Lead carré en écho, supersaw en contretemps, basse acide, lasers |
| 10 | Le Cosmos | La mineur, 128 | Synthwave spatiale | Cloche, synthés, nappes, écho |
| 20 | La Lune | Sib phrygien, 94 | Épique et menaçant | Chœur sombre, cuivres graves, cordes spiccato, taïkos, timbales, glas, célesta en écho |
| 21 | La Galerie | Mib mineur hongrois, 110 en 3/4 | Grande valse finale | Grand orgue, violons, clavecin, chœur, orgue au pédalier, cloches tubulaires, cuivres, timbales, glas |

**Déroulé.** Avant le combat, on choisit 4 cartes (la première commence ; « Auto » prend les plus fortes). L'adversaire en a 4 aussi. On voit sa carte active et ses remplaçantes. Changer de carte est possible à tout moment, mais ça utilise le tour. Une carte K.O. est remplacée sans perdre de tour. Le camp qui n'a plus de carte debout perd.

**Aventure solo** (`src/battle/levels.ts`, mondes dans `src/battle/arenas.ts`). 20 mondes de 5 niveaux, puis la Galerie, monde final de 30 niveaux : 130 niveaux du bas vers le haut de la carte : le Parc, le Lac, la Plage, la Foire, le Marché, la Ferme, la Forêt, le Manoir, le Port, les Pirates, le Désert, la Montagne, les Mines, le Volcan, la Tempête, l'Archipel, le Palais, Néon, le Cosmos et la Lune, et enfin la Galerie. Aux 10 premiers mondes se sont ajoutés 10 nouveaux, glissés entre eux là où ils tombent logiquement. Chaque monde a son adversaire et ses 4 cartes, de plus en plus rares. Le bot vise de mieux en mieux, garde ses spéciales pour le bon moment et met à l'abri ses cartes en danger (`src/battle/bot.ts`). Gagner un niveau débloque le suivant. Les illustrations des adversaires sont générées par `scripts/generate-bot-art.py`, et les sons de combat par `python3 scripts/generate-sounds.py combat`.

| # | Monde | Adversaire | Cartes |
| --- | --- | --- | --- |
| 1 | Le Parc | Léo | Banc public (Commune), Pigeon fier (Commune), Toboggan (Commune), Cerf-volant (Rare) |
| 2 | Le Lac | Théo | Nénuphar (Commune), Grenouille (Rare), Pédalo (Commune), Héron (Rare) |
| 3 | La Plage | Nina | Château de sable (Commune), Crabe pressé (Rare), Parasol (Rare), Coucher doré (Rare) |
| 4 | La Foire | Lola | Barbe à papa (Rare), Ticket d'or (Rare), Autos tamponneuses (Rare), Grande roue (Rare) |
| 5 | Le Marché | Sam | Tomate géante (Rare), Baguette (Rare), Fromager (Rare), Pastèque (Super Rare) |
| 6 | La Ferme | Jules | Botte de foin (Rare), Tracteur (Super Rare), Vache (Rare), Coq chanteur (Super Rare) |
| 7 | La Forêt | Maya | Vieux chêne (Rare), Champignon (Super Rare), Renard roux (Super Rare), Clairière (Super Rare) |
| 8 | Le Manoir | Morgane | Chauve-souris (Super Rare), Portrait hanté (Super Rare), Chandelier (Super Rare), Fantôme (Super Rare) |
| 9 | Le Port | Hugo | Mouette (Super Rare), Phare (Épique), Chalutier (Super Rare), Ancre (Super Rare) |
| 10 | Les Pirates | Rox | Perroquet (Super Rare), Longue-vue (Super Rare), Canon (Épique), Coffre au trésor (Épique) |
| 11 | Le Désert | Yasmine | Cactus (Super Rare), Chameau (Épique), Mirage (Épique), Pyramide (Épique) |
| 12 | La Montagne | Inès | Chamois (Épique), Sommet (Épique), Avalanche (Épique), Refuge (Épique) |
| 13 | Les Mines | Gaspard | Wagonnet (Épique), Lanterne (Épique), Pépite d'or (Épique), Géode (Mythique) |
| 14 | Le Volcan | Kenji | Coulée de lave (Épique), Cendres (Mythique), Cratère (Mythique), Obsidienne (Épique) |
| 15 | La Tempête | Zoé | Éclair (Mythique), Ouragan (Mythique), Grêle (Épique), Œil du cyclone (Légendaire) |
| 16 | L'Archipel | Célia | Dirigeable (Mythique), Arc-en-ciel (Mythique), Cascade céleste (Légendaire), Île flottante (Légendaire) |
| 17 | Le Palais | Victor | Couronne (Légendaire), Trône (Mythique), Lustre (Mythique), Salle des glaces (Ultra Légendaire) |
| 18 | Néon | Kai | Hologramme (Mythique), Voiture volante (Légendaire), Gratte-ciel (Ultra Légendaire), Androïde (Ultra Légendaire) |
| 19 | Le Cosmos | Astra | Nébuleuse (Ultra Légendaire), Comète (Légendaire), Supernova (Divine), Lune rousse (Mythique) |
| 20 | La Lune | Séléna | Rover (Légendaire), Astronaute (Ultra Légendaire), Base lunaire (Divine), Clair de Terre (Divine) |
| 21 | La Galerie | Le Grand Portrait | Portrait doré, Statue d'ivoire, Vitrail céleste, Fresque éternelle, Sculpture de lumière, Tapisserie royale, Miroir sans fin, La Muse (Divines), Le Grand Portrait (Galaxy) |

- **Difficulté** : abordable au début, de plus en plus dure, **ultra dure sur la Lune**. Chaque monde est plus fort que celui d'avant : ses cartes sont un peu plus rares (la somme de leurs rangs de rareté monte d'au moins 1 à chaque monde), et les stats des cartes du bot sont ramenées à la moyenne de leur rareté, pour que le hasard ne rende jamais un monde plus facile que le précédent. Les premiers mondes, aux cartes très communes, sont renforcés (+12 % au niveau 1, qui fond jusqu'au milieu de l'aventure). L'adversaire aligne 3 cartes au niveau 1, puis 4. Dans un monde, chaque niveau est un peu plus fort que le précédent ; le 1er niveau rétrograde sa meilleure carte d'un cran, le 5e est un **boss** dont la meilleure carte monte d'un cran. La Lune surclasse toutes ses cartes d'un rang de plus (au-delà de la Divine, chaque rang en trop devient un bonus de stats) et renforce encore leurs stats. Le bot vise correctement dès le départ (4/10) et parfaitement à la fin. Tous ces réglages sont dans l'objet `TUNE`.
- **Réglé par simulation** (`tests/levels.test.ts`), avec un joueur qui vise bien. Avec les cartes des 3 paquets de départ, on passe les premiers mondes et on bloque vers le Manoir ou le Port : il faut ouvrir des paquets pour aller plus loin. Même avec le meilleur deck possible, le boss de la Lune ne tombe qu'environ 1 fois sur 30.

| Deck du joueur (boss de…) | Parc | Plage | Marché | Forêt | Port | Désert | Mines | Tempête | Palais | Cosmos | Lune (niv. 96) | Lune (boss) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Départ (Épique, 2 Super Rares, Rare) | 85 % | 64 % | 30 % | 35 % | 6 % | 9 % | 1 % | 0 % | 0 % | 0 % | 0 % | 0 % |
| Moyen (Légendaire, Mythique, 2 Épiques) | 100 % | 95 % | 90 % | 84 % | 70 % | 61 % | 37 % | 5 % | 3 % | 0 % | 0 % | 0 % |
| Fort (Ultra Légendaire, Légendaire, 2 Mythiques) | 100 % | 99 % | 99 % | 100 % | 96 % | 95 % | 81 % | 17 % | 7 % | 1 % | 1 % | 0 % |
| Au maximum (Divine, Ultra Légendaire, 2 Légendaires) | 100 % | 99 % | 100 % | 100 % | 100 % | 99 % | 97 % | 73 % | 55 % | 21 % | 31 % | 3 % |

- **Le sanctuaire de la Divine** : juste après la Tempête (15e monde), la route devient un pont au-dessus du vide, avec une grande carte Divine au milieu. Tant qu'on ne l'a pas débloquée, **aucune Divine ne sort des paquets** (une Divine tirée devient une Ultra Légendaire) et la suite de l'aventure reste fermée. Une fois la Tempête battue, toucher la carte la débloque avec une mise en scène, pour toujours (`divineUnlocked` dans la sauvegarde).
- **La Galerie, monde final** (niveaux 101 à 130) : après la Lune, une route toute droite de 30 niveaux, tous très durs (bot parfait). Au 1er niveau, l'adversaire aligne 4 Divines ; au 2e, une 5e carte (Mythique) qui monte d'un rang à chaque niveau jusqu'à la Divine, puis une 6e arrive, et ainsi de suite jusqu'à 8 cartes, avec des stats qui montent (et allégées un peu par carte quand l'équipe grandit, sinon c'est injouable). Au 30e niveau, **le Grand Portrait**, boss final du jeu, garde pour la fin sa **carte Galaxy**. Réglée par simulation avec 4 Divines : environ 66 % de victoires au 1er niveau, 50 % au 15e, 29 % au 20e, 13 % au 29e, 3 % contre le Grand Portrait (tous ces réglages dans `GALLERY`).
- **La carte Galaxy** : la rareté au-dessus de la Divine (rang 8), qui ne sort jamais d'un paquet. Battre le Grand Portrait la première fois débloque **une seule carte Galaxy par joueur**, créée à partir d'une nouvelle photo (`claimGalaxy`), avec une révélation à part. Elle ne s'échange pas.
- **Difficulté cachée** (`hiddenAdjust`, jamais affichée dans le jeu) : au début d'un combat solo, on compare la rareté des cartes choisies à celles qu'un joueur a normalement à ce point de l'aventure (départ, puis moyen, fort, maximum, et 4 Divines dans la Galerie). Avec des cartes normales ou faibles, rien ne change. Avec des cartes plus fortes, l'adversaire s'adapte : il appuie moins souvent à côté de la zone, vise mieux et fait plus de critiques (une Mythique dès le 2e niveau : un peu ; deux Mythiques : plus ; une Légendaire : encore plus), et avec des cartes de fin de jeu au début, ses stats montent aussi (jusqu'à ×1,8). Exemple simulé : un deck au maximum gagne le boss du Parc 86 % du temps au lieu de 100 %, celui de la Ferme 51 %.
- **Triche cachée en combat** (`catchUpMult` dans `src/battle/engine.ts`, solo uniquement, jamais affichée) : à chaque coup, on compare la force (PV × coup classique) des deux cartes en jeu. Si la carte du joueur est plus de ×1,3 plus forte que celle de l'adversaire (une Épique contre une Commune : environ ×1,5 à ×2), la carte dépassée frappe plus fort qu'elle ne devrait : bonus = 1 + (écart − 1,3), jusqu'à ×2. Le bonus reste toujours plus petit que l'écart, donc le joueur garde l'avantage. Rien n'est tiré au début du combat : si les cartes en jeu sont proches, il n'y a aucun bonus. En ligne, jamais.
- **Étoiles** : 3 si on gagne sans perdre de carte, 2 en en perdant une, 1 sinon. La meilleure note de chaque niveau est gardée (390 étoiles au total).
- **Anciennes sauvegardes** (`src/storage/model.ts`) : une partie commencée sur l'ancienne carte de 10 mondes garde ses étoiles, chaque niveau à sa nouvelle place, et reprend là où elle en était. Les nouveaux mondes glissés derrière le joueur sont ouverts : on peut y revenir quand on veut pour gagner leurs étoiles et leurs pièces.

**La carte** (`src/components/map/`). Une longue route qui serpente vers le haut, comme dans les jeux « saga » : niveau 1 en bas, on remonte la carte pour voir les mondes suivants. Chaque monde a son sol, sa route (sable, pavés, planches, tapis rouge, route d'étoiles…), ses décors dessinés façon dessin animé (contour sombre, reflets, arbres avec des yeux), un grand décor (mare et son canard, mer, halle du marché, arbre géant, phare, montagnes, volcan, nuage d'orage, château, planète à anneaux) et son panneau. Le passage d'un monde à l'autre se fait par un bord ondulé. Le portrait de l'adversaire de chaque monde attend à côté de son boss.

**Tout est vivant** (`src/components/map/live.tsx`) : herbes hautes, fleurs, arbres, palmiers, sapins et parasols ondulent, chacun à son rythme ; un arbre sur deux a des yeux qui regardent à gauche, à droite et clignent (l'arbre géant de la forêt aussi) ; des passants traversent le marché, le parc, la plage et le port, des gardes marchent devant le palais ; le canard nage dans la mare ; oiseaux, papillons et mouettes volent ; bateaux et bouées tanguent, les vagues vont et viennent ; le faisceau du phare tourne ; les drapeaux du château flottent ; le chalet fume ; il neige sur la montagne et il pleut dans la tempête ; la lave bouillonne et le volcan fume ; les cristaux et les étoiles scintillent, les planètes flottent, des étoiles filantes traversent le Cosmos. Pour rester fluide sur téléphone, seuls les mondes proches de l'écran sont animés ; les autres sont dessinés immobiles.

Les niveaux sont des pastilles dorées avec leur numéro, et leurs étoiles au-dessus une fois gagnés. Les boss sont plus grands, avec une couronne et le portrait de l'adversaire. Un repère à ton initiale sautille au-dessus du niveau à jouer, et la carte s'ouvre centrée dessus. Toucher un niveau ouvre sa fiche : adversaire et son rang, difficulté (1 à 5 flammes), ses cartes, gains, étoiles obtenues, puis « Jouer ». Toucher une carte de l'adversaire l'ouvre en grand, en 3D comme dans la collection (on la fait tourner, on la retourne), avec ses PV et ses attaques. Les niveaux pas encore débloqués s'ouvrent aussi, pour tout voir à l'avance : seul « Jouer » est bloqué. La carte est calculée une fois (positions, route, décors placés au hasard mais toujours au même endroit, jamais sur la route) et dessinée monde par monde en SVG.

## Pièces (`src/game/economy.ts`)

Les pièces se gagnent seulement en battant les niveaux de l'aventure solo, et servent à acheter un tirage quand la réserve est vide (200 pièces). Les tirages gratuits restent la base.

- **Chaque niveau rapporte 20 pièces, une seule fois** : à sa première victoire. Le montant est le même du niveau 1 au niveau 130.
- **Rejouer un niveau déjà gagné ne rapporte rien** : ça sert seulement à améliorer ses étoiles. Impossible donc de « farmer » des pièces.
- Une défaite, un abandon ou un combat en ligne ne rapportent rien.

Toute l'aventure rapporte donc 2 600 pièces, soit 13 tirages, étalés sur toute la progression. Un tirage acheté s'ajoute à la réserve et se consomme après les tirages gratuits. L'écran de victoire affiche le gain (ou « pièces déjà gagnées »), et la fiche de chaque niveau ce qu'il rapporte.

## Rang en ligne (`src/game/rank.ts`)

Six rangs, chacun en trois divisions : **Papier**, **Bronze**, **Argent**, **Titane**, **Diamant**, **Légende** (I, II, III). Comme dans Rocket League, une victoire ne fait pas monter d'une division d'un coup. Chaque division fait 100 points : une victoire en rapporte une partie, on remplit la barre, et on passe à la division suivante quand elle est pleine. Une défaite en retire, et on peut redescendre de la même façon (jamais sous Papier I).

- **Points par combat (formule Elo)** : 25 contre un adversaire de même niveau, jusqu'à 45 contre bien plus fort, 5 au minimum contre bien plus faible. Le gagnant prend exactement ce que le perdant perd. Il faut donc 4 victoires à niveau égal pour passer une division.
- **Abandon = défaite** : les points de la défaite sont retirés dès le début du combat, et rendus (avec le gain) en cas de victoire. Fermer l'app en plein combat compte donc comme une défaite, même sans serveur.
- **Tous les rangs** (`src/app/ranks.tsx`) : toucher « Ton rang » ouvre un écran avec les 18 rangs, de Papier I en bas à Légende III tout en haut, le long d'une grande barre de progression verticale qui se remplit jusqu'à ton rang (repère à ton initiale et tes points). Il s'ouvre centré sur ton rang et on remonte l'écran comme la carte de l'aventure pour voir les rangs suivants. Chaque rang a sa bande de couleur ; les rangs atteints sont en couleur, les suivants grisés avec un cadenas. Pas de décor : juste les rangs. En bas, ton rang et ta barre ; les toucher te ramène dessus.
- **Affichage** : une carte « Ton rang » dans l'onglet Combat (emblème, barre, bilan), le rang des deux joueurs dans l'ouverture « VS » de chaque combat (les bots solo ont un rang aussi, de Papier I au niveau 1 à Légende III au niveau 100), et en fin de combat en ligne la barre qui se remplit, avec « Promotion ! » ou « Rétrogradé ».
- **Emblèmes** (`src/components/rank/RankEmblem.tsx`) : feuille, écu de bronze, écu d'argent étoilé, hexagone de titane, gemme, couronne. Plus le rang est haut, plus l'apparition est travaillée : simple pose pour le Papier, reflets pour le Bronze et l'Argent, halo et anneau qui tourne pour le Titane, rayons, onde et scintillements pour le Diamant, double onde, braises et halo changeant pour la Légende.

## En ligne sans serveur : amis et combats classés

**Comment font les autres jeux.** Il y a deux familles. En **pair-à-pair (WebRTC)**, les téléphones se parlent directement : un service public sert juste à se trouver (traceurs BitTorrent, relais Nostr ou MQTT, comme la bibliothèque [Trystero](https://github.com/dmotz/trystero)). Mais derrière une box ou en 4G/5G (NAT de l'opérateur), environ 15 à 25 % des connexions n'arrivent pas à se joindre directement et ont besoin d'un relais (TURN), surtout sur mobile. Il faudrait aussi un module natif en plus. L'autre famille passe **tout par un relais** : plus simple et ça marche partout, au prix d'un petit détour.

**Ce que fait PocketPics.** Un combat au tour par tour échange quelques messages par tour, donc le relais suffit largement et ne coûte rien. On réutilise les relais MQTT publics déjà utilisés pour l'échange (`RELAYS`, `src/trade/online.ts`), joints en WebSocket sécurisé : ça passe en Wi-Fi comme en 4G/5G, sans ouvrir de port. Tout est chiffré de bout en bout (`tweetnacl`) : le relais ne voit ni les pseudos, ni les cartes, ni les codes.

- **Amis** (`src/net/socialCore.ts`, `src/net/social.ts`) : chaque joueur a un code ami de 10 caractères (et son QR code). Ce code donne une boîte aux lettres sur le relais (demandes d'ami, défis, refus) et une **présence** : un message « en ligne » retenu par le relais, rafraîchi toutes les 45 s. Si l'app se coupe sans prévenir, le relais publie lui-même « hors ligne » (dernière volonté MQTT). L'app se connecte à tous les relais à la fois, pour que deux amis se retrouvent même si l'un n'en joint qu'un. Ajouter un ami lui envoie une demande, qu'il accepte depuis son onglet Profil. S'il est hors ligne, la demande lui est renvoyée dès qu'il se connecte.
- **Pseudo#TAG** (`parseFriendInput`, `findPlayer`) : ce que les joueurs se donnent, c'est leur pseudo suivi de 4 caractères tirés au hasard, par exemple « Léo#7F3K ». On peut l'écrire « Léo#7F3K », « Léo #7F3K » ou « Léo7F3K » (les 4 derniers caractères sont toujours le tag ; majuscules, accents et espaces ne comptent pas). Le code ami de 10 caractères reste l'adresse interne et le contenu du QR code, qui marche toujours. Le lien entre les deux est un **annuaire sur le relais** : sous un sujet dérivé de pseudo + tag, chaque joueur garde un message retenu (chiffré avec ce pseudo + tag) qui donne son code ; changer de pseudo efface l'ancienne fiche. Avant d'écrire sa fiche, le jeu écoute un instant : si un autre joueur a déjà ce pseudo et ce tag, il tire d'autres caractères, sans écraser la fiche de l'autre. Les anciens joueurs reçoivent leur tag à la mise à jour, et leurs amis déjà ajoutés restent.
- **Notifications** (`src/notify/`, `expo-notifications`, version compilée uniquement) : « Tes paquets sont prêts » est programmée sur le téléphone pour l'heure où la réserve de tirages sera pleine (sans réseau). Pour les amis, sans serveur à nous : chaque joueur glisse son jeton de notification Expo dans sa présence chiffrée et sa fiche d'annuaire ; quand on défie, propose un échange, lance une Pioche amicale ou envoie une demande d'ami à quelqu'un dont l'app est fermée, notre app demande directement au service de notifications d'Expo de le prévenir. L'invitation est renvoyée toutes les 4 s pendant une minute, pour qu'il la reçoive en ouvrant l'app ; les renvois d'une invitation déjà traitée sont ignorés. L'autorisation est demandée après le premier paquet ouvert. Les notifications entre amis demandent un projet EAS (`eas init`, qui ajoute `extra.eas.projectId`) et les accès Firebase (Android) et Apple (iOS) déclarés sur EAS ; sans eux, seule « Tes paquets sont prêts » fonctionne.
- **Cartes épinglées des amis gardées** : quand un ami nous les envoie, elles sont enregistrées sur l'appareil (`savePinsCache`). Son profil les affiche ensuite même quand il est hors ligne (« vues aujourd'hui / hier / le … »), et les remplace par les nouvelles dès qu'il revient.
- **Une ligne par personne** (`src/net/friends.ts`) : un code ami, c'est une sauvegarde. Quelqu'un qui joue sur deux appareils (ou qui a réinstallé le jeu) a deux codes et apparaissait deux fois dans la liste, une fois en ligne et une fois hors ligne. Les lignes qui portent le même pseudo sont regroupées : on affiche celle de l'appareil allumé (avec « 2 appareils » en petit), et retirer l'ami retire tous ses codes. Un pseudo vide ou générique (« Ami ») ne regroupe rien.
- **Cartes épinglées** (`save.pinned`, 6 au plus) : on épingle une carte depuis sa fiche ou depuis la bibliothèque, et elles s'affichent sur le profil. Un ami les voit en ouvrant ton profil depuis sa liste d'amis : son téléphone demande les cartes au tien (`pins?`), qui répond **une carte par message** (`pin`) — avec son image, une carte pèse déjà des dizaines de kilo-octets, et six d'un coup ne passeraient pas sur un relais public. Les stats reçues sont recalculées à partir de l'identité de la carte (pas de triche possible), et un appui ouvre la vue 3D avec les attaques. Comme pour un défi, il faut que l'ami ait le jeu ouvert.
- **Défier un ami** : on touche « Défier » sur un ami en ligne. Il reçoit, où qu'il soit dans l'app, une carte « X te défie ! » avec son rang et une minute pour répondre. Seuls les amis peuvent défier.
- **Sans être amis** : « Créer un combat » affiche un code (et un QR code) que l'autre entre dans « Rejoindre un combat ».
- **Combat aléatoire** (`src/net/lobbyCore.ts`, `src/net/matchmaking.ts`) : un bouton, et le jeu cherche un adversaire parmi tous ceux qui en cherchent un au même moment. Pendant la recherche, le jeu ouvre déjà un salon de combat et annonce son code (chiffré) sur un sujet d'attente commun à tout le monde, toutes les 1,1 s. Quand il entend l'annonce de quelqu'un d'autre, l'un des deux rejoint l'autre : **celui dont l'identifiant tiré au hasard est le plus petit rejoint**, l'autre reste hôte. La règle étant la même des deux côtés, il n'y a jamais deux arrivants dans le même salon. À plusieurs annonces, on prend le rang le plus proche du sien ; une annonce de plus de 6 s ne compte plus, et un salon déjà complet est mis de côté 15 s.
- **Quand la file est vide** (`src/net/botMatch.ts`, `src/net/botNames.ts`, jamais dit dans le jeu) : au bout de 19 à 21 s (jamais la même durée, sinon ça se repère) sans personne, le combat part quand même, contre un adversaire tenu par le jeu. Rien ne le distingue d'un joueur : un pseudo pris parmi 100 (jamais le même deux fois de suite), un rang **proche du tien** — dans 14 % des cas bien au-dessus (+150 à +450 points, comme quand on tombe sur un joueur plus fort), dans 10 % un peu en dessous —, **une équipe des mêmes raretés que celles que tu viens de choisir** (il « choisit » après les avoir vues : même rareté, donc même puissance, c'est le jeu qui départage), l'habileté d'un bon joueur (7 à 10 sur 10 selon le rang), et des temps de réflexion irréguliers (0,7 à 4,6 s). Il valide ses cartes après 1 à 4 s, le combat compte pour le rang comme n'importe quel combat classé, et la triche cachée en combat (`catchUpMult`) s'applique aussi à lui. L'écran de recherche ne montre aucun décompte, seulement des phrases qui changent. Le rendez-vous est armé dès le départ, avant même de joindre les relais : un relais qui ne répond ni oui ni non (8 s d'attente au plus) ne peut pas laisser la recherche tourner sans fin.
- **Série cachée** (`streakTier`, `RankState.streak`, jamais montrée) : le jeu compte les victoires et les défaites d'affilée en classé. À **2 victoires de suite**, l'adversaire suivant a des cartes renforcées (×1,18) et vise mieux ; à **3**, ×1,45 et il joue au maximum ; à **4**, ×2,3 avec une visée parfaite — hors d'atteinte — puis la série repart de zéro. À **3 défaites de suite**, l'adversaire suivant est très abordable (×0,5, joue mal), puis la série repart aussi. Son rang affiché suit le même mouvement (±200 à 340 points), pour que ça reste crédible. En simulation : un bon joueur gagne environ la moitié des combats normaux, 0 % contre l'adversaire des 4 victoires, et 100 % contre celui des 3 défaites.
- **Le combat** (`src/net/battleNet.ts`, `src/net/match.ts`) : chacun choisit ses 4 cartes, puis l'hôte fait tourner le moteur de combat. Le deck part **sans les images** (un message minuscule), et chaque miniature suit dans son propre message (`art`) : une image pèse cent fois plus que le reste, et si elles voyageaient avec le deck, un relais lent ou qui limite le débit bloquerait le début du combat (les deux écrans restaient sur « en attente de l'autre joueur »). Les images s'affichent quand elles arrivent, le combat n'attend pas. C'est la seule source de vérité, donc les deux écrans ne peuvent pas diverger. L'invité envoie ses choix (attaque et précision, changement de carte), et l'hôte renvoie chaque résultat à mettre en scène. Chaque joueur se voit en bas de l'écran. L'hôte recalcule les PV et la puissance des cartes reçues à partir de leur identité, pour empêcher la triche sur les stats. Qui commence est tiré au sort. Chaque coup a 40 s : sinon un coup classique mal visé part tout seul.
- **Abandon** (`cancelMatch` dans `src/game/rank.ts`) : celui qui part perd ses points ; pour celui qui reste, le combat est **annulé** — son rang ne bouge pas, ni ses victoires, ni sa série. Sinon, quitter un combat offrirait des points à l'autre, et deux joueurs pourraient se faire monter en se quittant à tour de rôle. L'écran dit « Combat annulé », sans confettis.
- **Choix du relais** (`src/trade/online.ts`, `src/trade/relayCore.ts`) : tous les relais sont essayés en même temps, mais on garde toujours le premier de la liste qui répond. L'hôte et l'invité, qui ont la même liste, se retrouvent donc sur le même relais, et un relais muet ne fait pas attendre les autres. Si aucun ne répond, l'écran l'explique et propose « Réessayer ».
- **Démo sur claude.ai** (`src/trade/roomRelay.ts`) : la page de démo tourne dans un cadre protégé qui interdit les WebSocket vers l'extérieur, donc les relais MQTT publics y sont injoignables. Dans ce cadre, le jeu passe par le canal temps réel intégré à la page (`claude.use("room")`, déclaré à la publication avec le sujet `m` ouvert aux contributeurs) : chaque sujet devient un salon nommé, les messages sont découpés en morceaux de 4 Kio au plus, et la présence d'un joueur (message retenu) est gardée dans la présence du salon. Les envois se suivent au lieu de partir tous ensemble, avec une pause entre chaque morceau, et un morceau refusé (débit dépassé) est réessayé : sans ça, un gros message perdait des morceaux en silence et n'arrivait jamais. Échange, combats et amis y marchent entre personnes qui ont la démo ouverte et le droit d'y écrire (propriétaire, ou invités en Contributeur ; un simple lecteur ne peut pas envoyer). L'app mobile, et le fichier HTML de la démo ouvert en dehors de claude.ai, passent par les relais MQTT publics ; ils ne communiquent pas avec le lien claude.ai. Deux joueurs doivent donc ouvrir la même version pour se trouver. L'écran d'ajout d'ami le rappelle sur claude.ai, et le message « Aucun joueur » le précise.
- **Fiabilité** (`src/net/reliable.ts`) : un relais public peut perdre des messages. Chaque message est numéroté, confirmé et renvoyé tant qu'il n'est pas confirmé. Un coup ne se perd donc jamais, même avec 30 % de pertes (testé). Un adversaire qui ne répond plus pendant 20 s a quitté : victoire.

**Limites d'un jeu sans serveur** : un défi n'arrive que si l'app de l'ami est ouverte (pas de notification quand elle est fermée), et chaque téléphone tient son propre rang (un joueur qui modifie sa sauvegarde peut tricher sur son rang affiché). Les relais publics gratuits n'offrent aucune garantie : **pour une version publiée, remplace-les par ton propre relais MQTT** (Mosquitto, EMQX, HiveMQ Cloud…). Rien d'autre à changer.

## Chance (`src/game/luck.ts`)

La table des raretés ci-dessous donne les chances **de base** de chaque carte. Trois mécaniques s'y ajoutent, avec un état rangé dans la sauvegarde (`luck`).

- **Divine à débloquer** : tant que la Divine n'a pas été débloquée au sanctuaire de l'aventure (après le Volcan), aucune Divine ne sort des paquets : une Divine tirée devient une Ultra Légendaire. La Galaxy ne sort jamais d'un paquet.
- **Paquets de départ** : dans une nouvelle partie, le 1er et le 2e paquet se terminent par une **Super Rare**, le 3e par une **Épique** (exactement). Les autres cartes de ces paquets restent en dessous (Rare au plus dans les deux premiers, Super Rare au plus dans le 3e), pour que la belle carte soit révélée en dernier. Ça ne se produit qu'une fois, et « Effacer ma partie de test » (navigateur) relance une partie neuve, donc ces paquets aussi.
- **Malchance** : après 20 cartes sans Épique ou mieux, la chance d'en avoir une monte de 2,5 points par carte. Elle est garantie à la 40e carte. Même principe pour Légendaire ou mieux : la chance monte après 180 cartes, et la Légendaire est garantie à la 350e. Le compteur repart à zéro dès que la carte sort.
- **Paquets brillants** : 1 paquet sur 20 environ (garanti au plus tard au 30e) est doré et contient une carte Super Rare ou mieux. Le sachet doré et l'annonce apparaissent avant de déchirer.

Réglé par simulation (3 000 joueurs × 300 paquets) :

| | Sans | Avec |
| --- | --- | --- |
| Épiques ou mieux par paquet | 0,48 | 0,54 |
| Légendaires ou mieux / 100 paquets | 5 | 6 |
| Pire attente d'une Épique | ~28 paquets | 8 paquets |
| Pire attente d'une Légendaire | ~190 paquets | ~60 paquets |

Ces coups de pouce restent invisibles pour le joueur : pas de compteur affiché, la surprise reste entière (seules les chances de base sont montrées dans « Taux d'obtention »).

## Cartes chromatiques

Une carte tirée sur cent (`CHROMATIC_ODDS` dans `src/game/rarity.ts`), **à n'importe quelle rareté**, est **chromatique** : sa photo est traversée d'un voile arc-en-ciel qui se déplace quand on tourne la carte au doigt (ou qu'on bouge le téléphone). C'est un champ de la carte (`chromatic` dans `src/storage/model.ts`), décidé au tirage et conservé par les échanges. L'effet est dessiné par `src/components/card/Chromatic.tsx`, dans le même esprit que les reflets des cartes rares (`Foil.tsx`).

## Recadrer une carte

Le format d'une carte rogne souvent la photo au mauvais endroit. Depuis le menu d'appui long de la bibliothèque, « Recadrer la carte » ouvre un écran (`src/app/card/crop.tsx`) où l'on déplace la photo au doigt et où on l'agrandit à deux doigts, dans une fenêtre au format de la carte. En validant, `cropCard(id, rect)` (dans `src/state/game.ts`) recoupe la photo et la miniature et les réécrit à la place des anciennes (`cropImage` dans `src/game/gallery.ts`, et la version canvas dans `gallery.web.ts`). Le recadrage est définitif : la carte garde la partie choisie.

## Raretés

Les taux se règlent dans `src/game/rarity.ts`, en poids sur 100 000 tirages.

| Rareté | Contour | Chance par carte |
| --- | --- | --- |
| Commune | blanc / beige | 52 % |
| Rare | bleu pâle | 26 % |
| Super Rare | vert émeraude | 12,5 % |
| Épique | violet | 6 % |
| Mythique | rouge | 2,5 % |
| Légendaire | jauge or animée | 0,85 % |
| Ultra Légendaire | chromatique animé | 0,12 % (≈ 1 / 830) |
| Divine | toute la carte en holo or/argent + scintillement | 0,03 % (≈ 1 / 3 300) |

Chaque paquet contient 5 cartes. **Deux photos identiques ne peuvent jamais être tirées.** Le jeu retient chaque photo déjà tirée (son identifiant dans la galerie) ainsi que son empreinte md5. Une copie exacte d'une photo déjà tirée, par exemple un doublon enregistré deux fois, est donc écartée aussi.

## Lancer le projet

Le jeu utilise des modules natifs (accès réseau local, galerie), donc **Expo Go ne suffit pas**. Il faut un « development build ».

```bash
npm install
npx expo run:android          # nécessite Android Studio, ou :
npx eas-cli@latest build --profile development --platform android
npm start                     # puis ouvrir l'app de dev sur le téléphone
```

Version navigateur de test (l'échange en ligne y fonctionne aussi, sauf dans une fenêtre qui bloque les WebSockets) : `npm run web`, ou `node scripts/build-web-demo.mjs` pour obtenir `dist-demo/pocketpics.html` (images et polices intégrées) et, à côté, le dossier `dist-demo/music/` des 20 musiques de combat (en `.mp4`, servi par tous les hébergeurs) : à héberger ensemble n'importe où (sans le dossier, le jeu marche mais sans musique).
- **Fenêtre d'import** : à chaque arrivée sur la version navigateur, une fenêtre propose d'ajouter tes photos. Sur ordinateur (Chrome, Edge, Safari, Firefox), on importe un dossier entier, sous-dossiers compris, sans choisir les photos une par une. Sur téléphone, le navigateur ne donne pas accès à la galerie entière : on sélectionne les photos avec le sélecteur. Elle revient en rechargeant la page.
- **Limite** : une page web ne peut pas lire la galerie seule. La version navigateur reste donc un test ; le jeu complet sur téléphone (`expo run`, ou build de développement EAS) lit toute la galerie automatiquement, sans choix.
- **Galerie** : un navigateur ne laisse aucun site lire la galerie tout seul. « Ouvrir ma galerie » ouvre le sélecteur de photos de l'appareil, où l'on peut tout sélectionner. Sur ordinateur, « Importer un dossier » ajoute un dossier entier. Des photos de démo générées sont aussi disponibles. Si le sélecteur est bloqué (fenêtre intégrée, webview), on peut aussi coller des photos (Ctrl+V) ou les glisser sur la page.
- **Sauvegarde** : les photos importées, la collection et les tirages restent dans le navigateur (IndexedDB) d'une visite à l'autre. L'écran des taux d'obtention permet de tout effacer.
- **Tests** : sur la version navigateur seulement, un petit bouton rond flottant (flèche circulaire, en haut à gauche du paquet de l'accueil) recharge les tirages pour ne pas attendre 12 h. Il n'existe pas sur Android ni iOS.

Vérifications :

```bash
npm run typecheck   # TypeScript
npm test            # tests de logique : raretés, recharge, codes d'échange, sauvegarde
```

## Publier sur le Play Store / l'App Store

```bash
npx eas-cli@latest login
npx eas-cli@latest init                                         # crée le projet EAS (projectId)
npx eas-cli@latest build --platform android --profile production # génère le .aab
npx eas-cli@latest submit --platform android                     # envoi vers la Play Console
```

Pour iOS, c'est la même chose avec `--platform ios`, ce qui demande un compte Apple Developer. Les identifiants `com.pocketpics.app` se changent dans `app.json`.

## Mises à jour en ligne (OTA)

Après `eas init`, une mise à jour du code JavaScript (gameplay, écrans, effets, taux…) s'envoie sans repasser par le store :

```bash
npx eas-cli@latest update --channel production --message "Nouveaux effets"
```

L'app la télécharge au démarrage suivant. `runtimeVersion` suit la version de l'app : si tu ajoutes un module natif, augmente `version` dans `app.json` et refais un build store.

## Aucune carte perdue lors d'une mise à jour

La collection est stockée dans le dossier Documents de l'app. Ni les mises à jour du store, ni les mises à jour OTA ne touchent ce dossier.

```
pocketpics/
  state.json (+ state.bak.json)   réserve de tirages, registre anti-doublon, pseudo
  index.json                      cache de la liste (reconstructible)
  cards/<id>/card.json            ← source de vérité de chaque carte
  cards/<id>/image.jpg, thumb.jpg
```

- **Chaque carte est autonome.** Même si `index.json` ou `state.json` étaient corrompus, la collection est reconstruite à partir des dossiers `cards/`.
- **Écritures atomiques.** Une carte est écrite dans un dossier temporaire puis renommée, donc elle est soit complète, soit absente. Les JSON passent par un fichier temporaire, puis un renommage.
- **Pas de chemin absolu stocké.** Sur iOS, le chemin du conteneur change à chaque mise à jour.
- **Migrations versionnées** (`src/storage/model.ts`). Pour faire évoluer une carte, on ajoute une étape `CARD_MIGRATIONS[n]`. On ne supprime jamais de champ, et les champs inconnus sont conservés.
- **Ne jamais renommer ni supprimer un `id` de rareté.** Une rareté inconnue s'affiche comme Commune sans être modifiée sur le disque.
- **Ouverture d'un paquet.** Les cartes sont enregistrées avant que le tirage soit décompté. Si l'app est tuée en plein milieu, le joueur garde ses cartes et son tirage.

## Échange

**En ligne (par défaut).** Les deux joueurs peuvent être n'importe où : il suffit d'une connexion Internet. L'hôte reçoit un code à 9 caractères (ex. `K7F-4QM-2XH`, aussi en QR code `pocketpics://trade/<code>`). Les deux téléphones se retrouvent dans un « salon » sur un relais MQTT public, joint en WebSocket sécurisé (`src/trade/mqtt.ts`, `src/trade/relayCore.ts`).

- **Chiffré de bout en bout.** Le sujet du salon et la clé de chiffrement (`tweetnacl` secretbox) sont dérivés du code, qui ne quitte jamais les téléphones. Le relais ne voit passer que des octets chiffrés : ni les photos, ni les noms, ni le code.
- **Deux joueurs maximum.** Un troisième qui taperait le même code est refusé.
- **Aucun compte et aucun serveur à soi.** Mais un échange par Internet passe forcément par un intermédiaire : deux téléphones derrière des box ou la 4G ne peuvent pas se joindre directement. Les relais gratuits utilisés sont listés dans `RELAYS` (`src/trade/online.ts`) et essayés dans l'ordre. **Pour une version publiée, remplace-les par ton propre relais** (n'importe quel broker MQTT sur WebSocket : Mosquitto, EMQX, HiveMQ Cloud gratuit…). Rien d'autre à changer.

**En Wi-Fi local (secours, sans Internet).** Depuis l'écran « Héberger », on peut passer en Wi-Fi local : l'hôte ouvre un port TCP, et le code à 8 caractères (ex. `K7F-4QM-2X`) encode son IP, son port et une somme de contrôle. Les deux téléphones doivent être sur le même réseau. Le joueur qui rejoint n'a rien à choisir : la longueur du code indique le mode.

Déroulé (`src/trade/session.ts`, identique dans les deux modes) : présentation, choix des cartes (aperçu en direct), validation des deux côtés, double confirmation, envoi des cartes complètes, puis accusé de réception. **L'envoyeur ne retire ses cartes qu'après que le receveur a confirmé les avoir enregistrées.** Une coupure réseau ne peut donc pas faire perdre de carte. L'identité, le nom et la rareté de la carte voyagent avec elle.

Un futur serveur de jeu pourra aussi valider les tirages, ce qui empêche la triche par changement d'horloge, impossible à bloquer en local pur.

## Structure

```
src/app/            écrans (expo-router) : onglets, ouverture, carte 3D, combat, échange
src/battle/         stats des cartes, règles du combat, bot, mondes et niveaux de l'aventure
src/components/map/ carte de l'aventure : géométrie, décors SVG, mondes
src/components/     carte (contours par rareté), sachet, effets (halo, rayons, étincelles, flash)
src/game/           raretés, recharge des tirages, galerie, paquets, chance, pièces, rang
src/storage/        modèle + migrations, stockage disque (+ version web de démo)
src/net/            en ligne : amis et présence, combat (hôte/invité), canal fiable
src/trade/          code d'échange, protocole, relais en ligne chiffré (MQTT), transport TCP, session
assets/fx/          textures d'effets (générées par scripts/generate-assets.py)
assets/bots/        illustrations des cartes des adversaires (scripts/generate-bot-art.py)
assets/music/       une musique de combat par monde (scripts/generate-music.py)
tests/              tests de logique
```

## À vérifier sur un vrai téléphone

Le code compile (TypeScript, bundles Android/iOS/web), et le parcours complet a été testé dans la démo web : ouverture, révélations, collection, rotation 3D, renommage. L'accès à la galerie, la caméra QR, les retours haptiques et l'échange en Wi-Fi local (TCP) ne peuvent être testés que sur appareil, avec un development build. L'échange en ligne a été testé de bout en bout entre deux navigateurs via un relais local, ainsi que les combats en ligne : ajout d'ami, présence, défi accepté, combat complet jusqu'au rang mis à jour, combat par code, départ d'un joueur. Le module `react-native-tcp-socket` passe par la couche de compatibilité de React Native pour les anciens modules natifs : c'est le premier point à tester, avec deux téléphones sur le même Wi-Fi.
