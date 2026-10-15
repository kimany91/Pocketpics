# PocketPics

PocketPics est un jeu de cartes à collectionner fait à partir de ta galerie photo. Toutes les 12 h tu gagnes un tirage (3 au maximum en réserve). Chaque paquet prend des photos au hasard dans ta galerie et donne à chacune une rareté. Tu peux ensuite échanger tes cartes avec tes amis, en ligne ou en face à face.

- **Android et iOS** : Expo (React Native) + TypeScript, publiable sur le Play Store et l'App Store.
- **Mises à jour en ligne** : EAS Update (expo-updates est déjà configuré).
- **Multijoueur** : échange en ligne chiffré de bout en bout (ou en Wi-Fi local), via une couche de transport interchangeable.

## Le jeu

| Onglet | Contenu |
| --- | --- |
| **Tirage** | Paquet animé, réserve de tirages (3 max), compte à rebours jusqu'au prochain, taux d'obtention |
| **Collection** | Grille de cartes, filtres par rareté, tri récentes/rareté. On touche une carte pour l'agrandir |
| **Combat** | 10 arènes solo contre des bots, de plus en plus dures. Multijoueur à venir |
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
| Divine | foil chromatique et or à double bande croisée, paillettes intenses, forme ornementée (couronne, filigranes, gemmes) | espace : étoiles, nébuleuses, étoiles filantes |

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
| Esquive | Pas de coup, 60 % d'éviter chaque attaque pendant 3 tours adverses | 2 | Super Rare | La carte se décale et se tourne, son ombre reste en place |
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

**Précision (façon Undertale).** On choisit une attaque, puis une barre apparaît : on touche pour lancer le curseur, et on retouche quand il passe sur la cible au centre. Au centre, c'est un critique (× 1,5). Au bord, le coup ne fait que × 0,4, et s'il n'y a pas de deuxième toucher, l'attaque est ratée. La double frappe enchaîne deux passages.

**Voir une carte.** En plein combat, on touche sa carte ou celle de l'adversaire pour la voir en 3D, comme dans la collection (rotation au doigt, zoom, dos), avec ses PV actuels, ses attaques et les utilisations de spéciale restantes. Quand on touche une remplaçante, trois boutons apparaissent : Annuler, Info (la même vue) et Envoyer. Le combat est en pause pendant qu'on regarde.

**Musique.** Une boucle de combat (`assets/music/battle.wav`, générée par `scripts/generate-music.py`) démarre en fondu au début du combat et s'arrête en fondu à la fin. Son volume se règle à part (45 % par défaut, enregistré dans la sauvegarde) dans la fenêtre « Son », ouverte depuis l'icône 🔊 de l'accueil ou depuis l'icône ♪ en combat.

**Déroulé.** Avant le combat, on choisit 4 cartes (la première commence ; « Auto » prend les plus fortes). L'adversaire en a 4 aussi. On voit sa carte active et ses remplaçantes. Changer de carte est possible à tout moment, mais ça utilise le tour. Une carte K.O. est remplacée sans perdre de tour. Le camp qui n'a plus de carte debout perd.

**Arènes solo** (`src/battle/arenas.ts`). Il y en a 10, du Parc (Communes, bot maladroit) au Cosmos (Ultra Légendaire, Divine…). Le bot vise de mieux en mieux, garde ses spéciales pour le bon moment et met à l'abri ses cartes en danger (`src/battle/bot.ts`). Gagner une arène débloque la suivante, et la progression est enregistrée dans la sauvegarde. Les illustrations des adversaires sont générées par `scripts/generate-bot-art.py`, et les sons de combat par `python3 scripts/generate-sounds.py combat`.

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

Version navigateur de test (l'échange en ligne y fonctionne aussi, sauf dans une fenêtre qui bloque les WebSockets) : `npm run web`, ou `node scripts/build-web-demo.mjs` pour obtenir un seul fichier `dist-demo/pocketpics.html` à héberger n'importe où.
- **Fenêtre d'import** : à chaque arrivée sur la version navigateur, une fenêtre propose d'ajouter tes photos. Sur ordinateur (Chrome, Edge, Safari, Firefox), on importe un dossier entier, sous-dossiers compris, sans choisir les photos une par une. Sur téléphone, le navigateur ne donne pas accès à la galerie entière : on sélectionne les photos avec le sélecteur. « Rouvrir la fenêtre d'import » sur l'accueil la fait revenir.
- **Limite** : une page web ne peut pas lire la galerie seule. La version navigateur reste donc un test ; le jeu complet sur téléphone (`expo run`, ou build de développement EAS) lit toute la galerie automatiquement, sans choix.
- **Galerie** : un navigateur ne laisse aucun site lire la galerie tout seul. « Ouvrir ma galerie » ouvre le sélecteur de photos de l'appareil, où l'on peut tout sélectionner. Sur ordinateur, « Importer un dossier » ajoute un dossier entier. Des photos de démo générées sont aussi disponibles. Si le sélecteur est bloqué (fenêtre intégrée, webview), on peut aussi coller des photos (Ctrl+V) ou les glisser sur la page.
- **Sauvegarde** : les photos importées, la collection et les tirages restent dans le navigateur (IndexedDB) d'une visite à l'autre. L'écran des taux d'obtention permet de tout effacer.
- **Tests** : un lien « Recharger les tirages (test) » évite d'attendre 12 h.

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
src/battle/         stats des cartes, règles du combat, bot, arènes
src/components/     carte (contours par rareté), sachet, effets (halo, rayons, étincelles, flash)
src/game/           raretés, recharge des tirages, galerie, génération des paquets
src/storage/        modèle + migrations, stockage disque (+ version web de démo)
src/trade/          code d'échange, protocole, relais en ligne chiffré, transport TCP, session
assets/fx/          textures d'effets (générées par scripts/generate-assets.py)
assets/bots/        illustrations des cartes des adversaires (scripts/generate-bot-art.py)
assets/music/       musique de combat (scripts/generate-music.py)
tests/              tests de logique
```

## À vérifier sur un vrai téléphone

Le code compile (TypeScript, bundles Android/iOS/web), et le parcours complet a été testé dans la démo web : ouverture, révélations, collection, rotation 3D, renommage. L'accès à la galerie, la caméra QR, les retours haptiques et l'échange en Wi-Fi local (TCP) ne peuvent être testés que sur appareil, avec un development build. L'échange en ligne a été testé de bout en bout entre deux navigateurs via un relais local. Le module `react-native-tcp-socket` passe par la couche de compatibilité de React Native pour les anciens modules natifs : c'est le premier point à tester, avec deux téléphones sur le même Wi-Fi.
