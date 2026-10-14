# PocketPics

PocketPics est un jeu de cartes à collectionner fait à partir de ta galerie photo. Toutes les 12 h tu gagnes un tirage (3 au maximum en réserve). Chaque paquet prend des photos au hasard dans ta galerie et donne à chacune une rareté. Tu peux ensuite échanger tes cartes en face à face avec tes amis.

- **Android et iOS** : Expo (React Native) + TypeScript, publiable sur le Play Store et l'App Store.
- **Mises à jour en ligne** : EAS Update (expo-updates est déjà configuré).
- **Multijoueur** : l'échange passe par une couche de transport interchangeable, prête pour un futur mode en ligne.

## Le jeu

| Onglet | Contenu |
| --- | --- |
| **Tirage** | Paquet animé, réserve de tirages (3 max), compte à rebours jusqu'au prochain, taux d'obtention |
| **Collection** | Grille de cartes, filtres par rareté, tri récentes/rareté. On touche une carte pour l'agrandir |
| **Échange** | Héberger (QR code + code) ou rejoindre (scan QR ou saisie du code), puis échange classique |

**Ouverture d'un paquet**

1. On déchire le sachet au doigt le long des pointillés : une étincelle suit le doigt et un retour haptique se fait sentir à chaque cran.
2. Les cartes arrivent face cachée. Le halo derrière chaque carte trahit déjà sa rareté.
3. On touche la carte pour la retourner. Pour les cartes rares, il y a d'abord un temps de suspense : la carte se soulève et tremble.
4. La révélation dépend de la rareté : ondes de choc, gerbe d'étincelles, tremblement de l'écran, flash, rayons qui tournent, bannière et vibrations de plus en plus fortes.
5. On glisse la carte pour passer à la suivante. Les cartes sont rangées de la moins rare à la plus rare, donc la meilleure arrive en dernier.

**Carte agrandie** : on la fait tourner au doigt en semi-3D, avec de l'inertie, et un reflet holographique suit l'angle. Un double-tap retourne la carte, et son dos affiche ses infos. On peut aussi la renommer. Le nom s'affiche sur la carte et la suit lors d'un échange.

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

Démo dans le navigateur, avec des photos générées et sans échange : `npm run web`.

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

## Échange pair-à-pair

L'hôte ouvre un port TCP sur le Wi-Fi local. Le code à 8 caractères (ex. `K7F4-QM2X`) encode son IP, son port et une somme de contrôle qui détecte les fautes de frappe. Le QR code contient `pocketpics://trade/<code>`. Aucun serveur n'est nécessaire, mais les deux téléphones doivent être sur le même réseau (ou l'un sur le partage de connexion de l'autre).

Déroulé (`src/trade/session.ts`) : présentation, choix des cartes (aperçu en direct), validation des deux côtés, double confirmation, envoi des cartes complètes, puis accusé de réception. **L'envoyeur ne retire ses cartes qu'après que le receveur a confirmé les avoir enregistrées.** Une coupure réseau ne peut donc pas faire perdre de carte. L'identité, le nom et la rareté de la carte voyagent avec elle.

**Multijoueur en ligne plus tard** : `src/trade/transport.ts` expose une interface `TradeLink` (`send` / `onMessage` / `onClose`). Pour un mode en ligne, il suffira d'en fournir une seconde implémentation, par exemple un WebSocket vers un serveur relais. La logique d'échange ne change pas. Un serveur permettra aussi de valider les tirages côté serveur, ce qui empêche la triche par changement d'horloge, impossible à bloquer en local pur.

## Structure

```
src/app/            écrans (expo-router) : onglets, ouverture, carte 3D, échange
src/components/     carte (contours par rareté), sachet, effets (halo, rayons, étincelles, flash)
src/game/           raretés, recharge des tirages, galerie, génération des paquets
src/storage/        modèle + migrations, stockage disque (+ version web de démo)
src/trade/          code d'échange, protocole, transport TCP, session
assets/fx/          textures d'effets (générées par scripts/generate-assets.py)
tests/              tests de logique
```

## À vérifier sur un vrai téléphone

Le code compile (TypeScript, bundles Android/iOS/web), et le parcours complet a été testé dans la démo web : ouverture, révélations, collection, rotation 3D, renommage. L'accès à la galerie, la caméra QR, les retours haptiques et l'échange TCP ne peuvent être testés que sur appareil, avec un development build. Le module `react-native-tcp-socket` passe par la couche de compatibilité de React Native pour les anciens modules natifs : c'est le premier point à tester, avec deux téléphones sur le même Wi-Fi.
