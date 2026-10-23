// Vocabulaire des mèmes et images numériques (labels CLIP en, noms français drôles).
// Données uniquement, aucune logique. Pas de marques ni de noms de personnages.

export interface MemeLabel {
  /** 2 à 4 prompts anglais concrets pour CLIP. Pas de doublons dans le fichier. */
  en: string[];
  /** 3 à 5 noms français drôles sur ce sujet (≤ 28 caractères). Jamais « Mème », « Illustration », « Image », « Dessin ». */
  names: string[];
  /** 4 attaques basiques que ce sujet ferait (≤ 20 caractères). */
  classic: string[];
  /** 4 attaques spéciales fortes pour ce sujet (≤ 20 caractères). */
  special: string[];
}

export const MEME_LABELS: MemeLabel[] = [
  // Créatures
  {
    en: ['a fat green ogre-like creature holding a soda cup', 'a creepy green humanoid with a big belly and a huge smile', 'a green ogre sitting on a messy couch'],
    names: ['Ogre du canapé', 'Monstre au soda', 'Ogre qui ne sort plus', 'Le troll du salon'],
    classic: ['Rot sonore', 'Coup de canette', 'Ronflement hostile', 'Grimace gluante'],
    special: ['Éructation cosmique', 'Burp de la mort', 'Sieste explosive', 'Pizza-tornade'],
  },
  {
    en: ['a small mischievous green goblin with pointy ears', 'a goblin grinning and rubbing its hands together'],
    names: ['Gobelin en mission', 'Petit gredin vert', 'Gobelin qui complote', 'Lutin de la cuisine'],
    classic: ['Vol de chaussette', 'Coup de griffe', 'Rire narquois', 'Chapardage'],
    special: ['Pluie de cailloux', 'Grand complot', 'Bêtise ultime', 'Sabotage royal'],
  },
  {
    en: ['an ugly grumpy troll with warts holding a club', 'a troll sitting under a stone bridge'],
    names: ['Troll du pont', 'Grincheux des ponts', 'Troll qui râle', 'Péage obligatoire'],
    classic: ['Coup de massue molle', 'Péage salé', 'Grognement', 'Verrue en vue'],
    special: ['Gros coup de gourdin', 'Pont effondré', 'Rot de troll', 'Crue de la rivière'],
  },
  {
    en: ['a grey alien with huge black eyes', 'a small green alien waving a tiny hand', 'an alien standing next to a flying saucer'],
    names: ['Extraterrestre gêné', 'Visiteur des étoiles', 'Petit alien perdu', 'Alien qui fait signe'],
    classic: ['Rayon tiédasse', 'Signe de la main', 'Sonde curieuse', 'Regard vide'],
    special: ['Soucoupe volante', 'Invasion du frigo', 'Abduction express', 'Rayon maladroit'],
  },
  {
    en: ['a clumsy retro robot with a square head and antennas', 'a boxy robot with a sad face on a screen'],
    names: ['Robot en panne', 'Boîte de conserve', 'Machine bancale', 'Robot à batterie faible'],
    classic: ['Bip bip hostile', 'Bug d’écran', 'Clic-clac', 'Surchauffe'],
    special: ['Court-circuit', 'Mode turbo raté', 'Mise à jour fatale', 'Bug géant'],
  },
  {
    en: ['a green zombie with a sleepy face and a torn shirt', 'a zombie walking slowly with its arms stretched forward'],
    names: ['Zombie en retard', 'Mort-vivant affamé', 'Zombie du dimanche', 'Zombie qui veut un café'],
    classic: ['Morsure timide', 'Râle lent', 'Bras tendus', 'Bâillement'],
    special: ['Horde du lundi', 'Cri de tombe', 'Festin de pizza', 'Démarche de sieste'],
  },
  {
    en: ['a cartoon white ghost with a wavy bottom', 'a sheet ghost with two black eyes and a surprised mouth'],
    names: ['Fantôme de la lessive', 'Esprit en drap', 'Fantôme maladroit', 'Bouh timide'],
    classic: ['Frisson froid', 'Bouh !', 'Passe-muraille', 'Drap volant'],
    special: ['Hantise générale', 'Cri fantomatique', 'Disparition express', 'Chaîne rouillée'],
  },
  {
    en: ['a cartoon vampire with a black cape and a pale face', 'a vampire with big fangs and slicked back hair'],
    names: ['Vampire du frigo', 'Comte trop poli', 'Suceur de jus', 'Vampire sans soleil'],
    classic: ['Coup de cape', 'Crocs apparents', 'Teint pâle', 'Chauve-souris'],
    special: ['Jus de tomate !', 'Cape magique', 'Chauves-souris !', 'Métamorphose ratée'],
  },
  {
    en: ['an old wizard with a long beard and a pointy hat', 'a wizard holding a glowing wooden staff'],
    names: ['Sorcier hors service', 'Magicien de la barbe', 'Mage en pantoufles', 'Grand sorcier flou'],
    classic: ['Sortilège timide', 'Baguette qui tremble', 'Éternuement magique', 'Lévitation ratée'],
    special: ['Boule de feu tiède', 'Météore retardé', 'Incantation géante', 'Sortilège en vrac'],
  },
  {
    en: ['a medieval knight in shiny armor with a dented helmet', 'a knight sitting on a tiny pony'],
    names: ['Chevalier en retard', 'Armure de carton', 'Chevalier du dimanche', 'Chevalier de la cuisine'],
    classic: ['Coup d’épée mou', 'Bouclier en bois', 'Cri de guerre', 'Visière coincée'],
    special: ['Charge du poney', 'Grand tournoi raté', 'Épée de fromage', 'Charge ridicule'],
  },
  {
    en: ['a caricature of a pirate with a huge nose and many rings', 'a pirate writing a treasure map by candlelight', 'a pirate with a big nose and gold earrings'],
    names: ['Pirate au gros pif', 'Capitaine bijoux', 'Pirate du dimanche', 'Cartographe du trésor'],
    classic: ['Coup de crochet', 'Pif en alerte', 'Rouleau de carte', 'Grosse bague'],
    special: ['Trésor maudit', 'Tempête de bijoux', 'Carte au trésor', 'Naufrage du nez'],
  },
  {
    en: ['a ninja dressed in black with only the eyes visible', 'a ninja sneaking behind a tree'],
    names: ['Ninja discret', 'Ninja qui se cache mal', 'Ninja du placard', 'Ombre en pyjama'],
    classic: ['Pas de velours', 'Shuriken en mousse', 'Disparition', 'Clin d’œil'],
    special: ['Grand saut ninja', 'Fumée de poche', 'Coup de pied géant', 'Mode furtif total'],
  },
  {
    en: ['a cowboy with a big hat and a revolver in the desert', 'a cartoon cowboy riding a stick horse'],
    names: ['Cowboy du dimanche', 'Shérif en plastique', 'Cowboy de la sieste', 'Duel au soleil'],
    classic: ['Tir de bouchon', 'Chapeau volant', 'Petit duel', 'Poussière'],
    special: ['Duel à midi', 'Ruée vers le frigo', 'Lasso du voisin', 'Boule de foin'],
  },
  {
    en: ['a cartoon king with a golden crown and a tiny beard', 'a grumpy king sitting on a throne'],
    names: ['Roi du canapé', 'Monarque en pyjama', 'Roi qui s’ennuie', 'Sa Majesté la sieste'],
    classic: ['Sceptre en mousse', 'Ordre royal', 'Coup de couronne', 'Décret absurde'],
    special: ['Décret du goûter', 'Cri royal', 'Couronne lancée', 'Pluie de pièces'],
  },
  {
    en: ['an elegant queen with a huge crown and a serious face', 'a queen waving from a palace balcony'],
    names: ['Reine qui pose', 'Majesté au balcon', 'Reine du selfie', 'Impératrice du goûter'],
    classic: ['Salut de la main', 'Regard glacial', 'Petit sceptre', 'Tiare qui tombe'],
    special: ['Décret de la reine', 'Mode royale', 'Procession du thé', 'Chapeau géant'],
  },
  {
    en: ['an astronaut floating in space with a tiny helmet', 'an astronaut in a white spacesuit standing on the moon'],
    names: ['Astronaute en apesanteur', 'Cosmonaute perdu', 'Touriste de la Lune', 'Casque trop grand'],
    classic: ['Flottement', 'Drapeau planté', 'Bouteille d’air', 'Pas de lune'],
    special: ['Atterrissage raté', 'Sortie spatiale', 'Pizza en orbite', 'Panne d’air'],
  },
  {
    en: ['a cartoon dinosaur with tiny arms and a big smile', 'a green dinosaur chewing a leaf'],
    names: ['Dino en peluche', 'T-rex en vacances', 'Dinosaure timide', 'Lézard préhistorique'],
    classic: ['Bras trop courts', 'Coup de queue', 'Rugissement doux', 'Tapé du pied'],
    special: ['Météorite du lundi', 'Rugissement géant', 'Charge préhistorique', 'Fossile raté'],
  },
  {
    en: ['a cartoon dragon breathing a tiny flame', 'a dragon curled around a pile of gold coins'],
    names: ['Dragon frileux', 'Dragon à rhume', 'Gardien du goûter', 'Dragon sans flamme'],
    classic: ['Petit crachat', 'Fumée tiède', 'Coup de queue', 'Éternuement'],
    special: ['Souffle retardé', 'Grand feu de camp', 'Flamme micro-ondes', 'Pizza-feu'],
  },
  {
    en: ['a unicorn with a rainbow mane and a sparkly horn', 'a cartoon unicorn looking tired in a field'],
    names: ['Licorne fatiguée', 'Licorne sans paillettes', 'Licorne en retard', 'Poney à corne'],
    classic: ['Paillettes', 'Coup de corne', 'Arc-en-ciel', 'Hennissement'],
    special: ['Boum arc-en-ciel', 'Tornade scintillante', 'Galop magique', 'Crinière au vent'],
  },
  {
    en: ['a bearded viking with a horned helmet and a big axe', 'a cartoon viking holding a drinking horn'],
    names: ['Viking du dimanche', 'Casque à cornes trop grand', 'Viking en retard', 'Barbe de guerrier'],
    classic: ['Coup de hache', 'Corne à boire', 'Cri de Viking', 'Casque qui glisse'],
    special: ['Hache de la fête', 'Tempête nordique', 'Festin viking', 'Pagaie géante'],
  },
  {
    en: ['a samurai with a topknot holding a sword dramatically', 'a cartoon samurai striking a dramatic pose'],
    names: ['Samouraï en peignoir', 'Sabre du goûter', 'Samouraï en retard', 'Chignon de combat'],
    classic: ['Coup de sabre', 'Pose dramatique', 'Éternuement de sabre', 'Chignon volant'],
    special: ['Coupe du lundi', 'Duel de légende', 'Vent du sabre', 'Éclair de sabre'],
  },
  {
    en: ['a green-faced witch stirring a bubbling cauldron', 'a cartoon witch on a broomstick that wobbles'],
    names: ['Sorcière du potage', 'Balai qui vole mal', 'Sorcière en retard', 'Chaudron trop chaud'],
    classic: ['Coup de balai', 'Potion douteuse', 'Chapeau pointu', 'Rire sorcier'],
    special: ['Potion explosive', 'Vol en balai', 'Chaudron géant', 'Sort de chat'],
  },
  {
    en: ['a cartoon skeleton dancing with a funny pose', 'a skeleton sitting in a chair with a cheeky grin'],
    names: ['Squelette dansant', 'Os trop relax', 'Squelette en pause', 'Tibia rigolo'],
    classic: ['Claquement d’os', 'Danse macabre', 'Crâne qui roule', 'Saut d’os'],
    special: ['Danse finale', 'Squelette volant', 'Tremblement d’os', 'Cri d’outre-tombe'],
  },
  {
    en: ['a mermaid with a fish tail sitting on a rock', 'a mermaid combing her hair next to a seashell'],
    names: ['Sirène des bouchons', 'Sirène déçue', 'Queue de poisson', 'Sirène en vacances'],
    classic: ['Coup de queue', 'Chant bizarre', 'Éclaboussure', 'Peigne magique'],
    special: ['Chant désastreux', 'Vague à sirène', 'Tsunami scintillant', 'Plongeon royal'],
  },
  {
    en: ['a hairy yeti standing in the snow with a surprised look', 'a big shaggy creature in snowy mountains'],
    names: ['Yéti en vacances', 'Monstre des neiges', 'Yéti pas photogénique', 'Grand velu des cimes'],
    classic: ['Coup de poing gelé', 'Hurlement', 'Neige dans la barbe', 'Pas lourds'],
    special: ['Avalanche', 'Grand rugissement', 'Pas de géant', 'Boule de neige'],
  },
  {
    en: ['a cartoon villain in a black cape with an evil laugh', 'a villain with a thin moustache twirling it'],
    names: ['Méchant en cape', 'Vilain à moustache', 'Ricaneur en cape', 'Plan machiavélique'],
    classic: ['Rire maléfique', 'Cape qui claque', 'Moustache qui tourne', 'Plan foireux'],
    special: ['Plan du mal', 'Rayon mortel doux', 'Dévoilement du plan', 'Grand méchant'],
  },

  // Caricatures
  {
    en: ['a caricature painting of two scientists with huge heads and wild white hair', 'two cartoon scientists with enormous heads floating in space'],
    names: ['Génies décoiffés', 'Cerveaux cosmiques', 'Savants en apesanteur', 'Professeurs en vrac'],
    classic: ['Éclair capillaire', 'Équation fumante', 'Gros cerveau', 'Tableau noirci'],
    special: ['Théorème explosif', 'Cerveau géant', 'Expérience ratée', 'Big bang capillaire'],
  },
  {
    en: ['a caricature of an old man with a very long white beard', 'an old bearded man on a park bench with a grumpy face'],
    names: ['Papi barbu', 'Sage du banc', 'Grand-père de la barbe', 'Sage à la barbe longue'],
    classic: ['Coup de canne', 'Soupir de sage', 'Barbe au vent', 'Grognement de papi'],
    special: ['Sagesse ancestrale', 'Conte d’antan', 'Barbe volante', 'Sieste du sage'],
  },
  {
    en: ['a cartoon bodybuilder flexing huge biceps in a gym', 'a caricature of a very muscular man posing proudly'],
    names: ['Muscle en carton', 'Biceps en mousse', 'Champion de la salle', 'Bras de démonstration'],
    classic: ['Flexion', 'Haltère volant', 'Clin d’œil musclé', 'Shake protéiné'],
    special: ['Soulevé de canapé', 'Biceps atomique', 'Haltère de bois', 'Pompe géante'],
  },
  {
    en: ['a baby with a serious adult face wearing a tiny suit', 'a newborn baby giving a stern look like a boss'],
    names: ['Bébé d’affaires', 'Petit patron', 'Bébé trop sérieux', 'Mini comptable'],
    classic: ['Biberon sérieux', 'Regard de patron', 'Rot de bébé', 'Hochement de tête'],
    special: ['Réunion de bébé', 'Couche en stock', 'Gazouillis menaçant', 'Pleurs en série'],
  },
  {
    en: ['a cartoon man with enormous curly hair exploding in all directions', 'a cartoon face with wild hair standing straight up'],
    names: ['Cheveux en colère', 'Perruque en orbite', 'Coiffure en vadrouille', 'Tignasse explosive'],
    classic: ['Coup de peigne', 'Touffe volante', 'Éternuement', 'Mèche rebelle'],
    special: ['Tornade capillaire', 'Coiffure orbitale', 'Shampoing géant', 'Boum de cheveux'],
  },
  {
    en: ['a cartoon man with a huge pointy nose and round glasses', 'a caricature face with an enormous nose'],
    names: ['Le grand pif', 'Nez en vacances', 'Pif d’honneur', 'Nez qui sent tout'],
    classic: ['Reniflement', 'Coup de nez', 'Éternuement', 'Mouchoir géant'],
    special: ['Sniff ultime', 'Nez-tornade', 'Pif téléguidé', 'Éternuement sismique'],
  },

  // Animaux
  {
    en: ['a cat with huge round eyes and an open mouth looking shocked', 'a surprised cartoon cat with wide eyes'],
    names: ['Chat sous le choc', 'Minou stupéfait', 'Chat qui a tout vu', 'Félin en état de choc'],
    classic: ['Miaou choqué', 'Poil hérissé', 'Saut en arrière', 'Regard figé'],
    special: ['Bond de la peur', 'Cri strident', 'Chute en arrière', 'Ronron en panne'],
  },
  {
    en: ['a cat sitting at a dinner table with a fork', 'a cat in a chair at a dining table eating'],
    names: ['Chat à table', 'Minou gourmet', 'Chat qui dîne', 'Convive poilu'],
    classic: ['Coup de fourchette', 'Ronron gourmand', 'Miam sonore', 'Serviette au cou'],
    special: ['Festin félin', 'Vol de steak', 'Banquet à moustaches', 'Dîner en vrac'],
  },
  {
    en: ['a smug cat with half-closed eyes and a self-satisfied smirk', 'a cat looking very proud of itself'],
    names: ['Chat sûr de lui', 'Minou trop content', 'Chat qui a gagné', 'Sourire de chat'],
    classic: ['Clin d’œil', 'Regard hautain', 'Queue relevée', 'Petit sourire'],
    special: ['Victoire féline', 'Air supérieur', 'Triomphe du chat', 'Ronron victorieux'],
  },
  {
    en: ['a grumpy cat face with a flat frown', 'a cat with a permanently unhappy face'],
    names: ['Chat pas content', 'Minou de mauvaise humeur', 'Grincheux à poils', 'Tête de lundi'],
    classic: ['Regard noir', 'Soupir félin', 'Griffe sortie', 'Non merci'],
    special: ['Colère de chat', 'Boudeur en chef', 'Grognement de lundi', 'Bouderie totale'],
  },
  {
    en: ['a shiba inu dog with a funny expression and a wide open mouth', 'a fluffy shiba dog making a weird face'],
    names: ['Shiba qui réfléchit', 'Chien bizarre', 'Chien qui fait la tête', 'Shiba du doute'],
    classic: ['Aboiement doux', 'Oreille pointue', 'Regard malin', 'Bond de joie'],
    special: ['Zoomies ultimes', 'Super aboi', 'Pattes en l’air', 'Frisson canin'],
  },
  {
    en: ['a sad dog with droopy ears and watery eyes', 'a dog looking sadly at the camera'],
    names: ['Chien triste', 'Toutou qui boude', 'Oreilles tombantes', 'Regard de chiot'],
    classic: ['Pleurnichement', 'Oreille tombante', 'Regard humide', 'Gros soupir'],
    special: ['Pleurs canins', 'Câlin contre rien', 'Chagrin du bol', 'Yeux de chiot'],
  },
  {
    en: ['a dog tilting its head with a confused expression', 'a puzzled dog with its head tilted to one side'],
    names: ['Chien perplexe', 'Toutou qui comprend rien', 'Tête penchée', 'Question à quatre pattes'],
    classic: ['Tête penchée', 'Aboi hésitant', 'Oreille dressée', 'Regard vide'],
    special: ['Gros doute', 'Chien qui calcule', 'Tilt canin', 'Question ouverte'],
  },
  {
    en: ['a cartoon green frog with big eyes sitting on a lily pad', 'a frog with a wide smile on a mossy log'],
    names: ['Grenouille du marais', 'Crapaud rigolo', 'Grenouille du bassin', 'Batracien bavard'],
    classic: ['Coassement', 'Langue collante', 'Saut de feuille', 'Bulle de marais'],
    special: ['Déluge coassant', 'Saut parfait', 'Langue géante', 'Grand plouf'],
  },
  {
    en: ['a cartoon duck with a flat orange beak and a sleepy look', 'a duck waddling with a surprised face'],
    names: ['Canard en pyjama', 'Palmipède bizarre', 'Canard du bassin', 'Coin-coin fatigué'],
    classic: ['Coin-coin', 'Bec de travers', 'Dandinement', 'Plouf'],
    special: ['Bataille de pain', 'Plongeon géant', 'Cri de canard', 'Canard en colère'],
  },
  {
    en: ['a goose with its neck stretched out honking aggressively', 'an angry goose with its wings spread wide'],
    names: ['Oie pas commode', 'Oie en colère', 'Honk du dimanche', 'Gardienne du bassin'],
    classic: ['Coup de bec', 'Honk !', 'Course à pied', 'Ailes ouvertes'],
    special: ['Cri d’oie géant', 'Charge de l’oie', 'Honk sismique', 'Poursuite générale'],
  },
  {
    en: ['a close-up of a grey pigeon staring with its head tilted', 'a pigeon face in extreme close-up'],
    names: ['Pigeon du balcon', 'Oiseau de la place', 'Pigeon en gros plan', 'Roucoulade sérieuse'],
    classic: ['Roucoulement', 'Regard fixe', 'Miette volée', 'Hochement de tête'],
    special: ['Invasion de pigeons', 'Vol de frites', 'Roucoulade géante', 'Atterrissage crânien'],
  },
  {
    en: ['a grey seal with whiskers and big wet eyes lying on a rock', 'a seal making a funny face on the beach'],
    names: ['Phoque en pleine forme', 'Otarie du rocher', 'Phoque qui boude', 'Phoque sur la plage'],
    classic: ['Clapotis', 'Moustache humide', 'Roulé-boulé', 'Bâillement'],
    special: ['Plongeon de phoque', 'Vague géante', 'Cri de phoque', 'Ballon sur le nez'],
  },
  {
    en: ['a capybara relaxing in a hot spring with a calm face', 'a big brown capybara sitting peacefully in water'],
    names: ['Capybara zen', 'Rongeur en vacances', 'Capybara de l’étang', 'Capybara en spa'],
    classic: ['Regard zen', 'Ronron d’eau', 'Pas de stress', 'Sieste lente'],
    special: ['Méditation totale', 'Bain bouillant', 'Calme absolu', 'Sieste mondiale'],
  },
  {
    en: ['an owl staring with huge round eyes from a branch', 'a brown owl with an intense stare'],
    names: ['Hibou qui fixe', 'Chouette trop attentive', 'Hibou du jugement', 'Regard de hibou'],
    classic: ['Tête à 360°', 'Regard perçant', 'Hou hou !', 'Plume ébouriffée'],
    special: ['Regard hypnotique', 'Vol silencieux', 'Hululement', 'Rotation de tête'],
  },
  {
    en: ['a close-up of a horse face with a funny expression', 'a horse with its mouth open showing big teeth'],
    names: ['Cheval qui sourit', 'Tête de cheval', 'Cheval en gros plan', 'Hennissement douteux'],
    classic: ['Hennissement', 'Naseaux géants', 'Coup de sabot', 'Crinière au vent'],
    special: ['Galop furieux', 'Grand hennissement', 'Charge chevaline', 'Ruée au foin'],
  },
  {
    en: ['a monkey making a funny face with its teeth showing', 'a close-up of a monkey with wide startled eyes'],
    names: ['Singe qui grimace', 'Singe trop malin', 'Singe de la jungle', 'Grimace de singe'],
    classic: ['Grimace', 'Saut de liane', 'Cri de singe', 'Banane volée'],
    special: ['Boum de bananes', 'Tornade de singes', 'Acrobatie de liane', 'Bataille de bananes'],
  },
  {
    en: ['a raccoon with a black mask and a sneaky look', 'a raccoon digging through a trash can at night'],
    names: ['Raton trop curieux', 'Raton des poubelles', 'Masque de bandit', 'Raton fouineur'],
    classic: ['Fouille', 'Regard de voleur', 'Pattes agiles', 'Chapardage'],
    special: ['Vol de pizza', 'Fouille générale', 'Raton géant', 'Poubelle ouverte'],
  },
  {
    en: ['a panda sitting in bamboo eating with a bored face', 'a panda slumped on the grass looking unimpressed'],
    names: ['Panda en vacances', 'Panda qui s’ennuie', 'Ours en bambou', 'Panda gourmand'],
    classic: ['Coup de bambou', 'Mastication lente', 'Regard blasé', 'Roulade'],
    special: ['Festival de bambou', 'Sieste de panda', 'Mega-bâillement', 'Panda en furie'],
  },
  {
    en: ['a hamster with puffed cheeks holding a seed', 'a tiny hamster running in a wheel very fast'],
    names: ['Hamster joues gonflées', 'Petit rongeur gourmand', 'Hamster stressé', 'Boule de poils'],
    classic: ['Joues pleines', 'Grignotage', 'Roulade', 'Course de roue'],
    special: ['Stock de graines', 'Mega-joues', 'Course folle', 'Sprint de roue'],
  },
  {
    en: ['a penguin standing with a serious face and a bow tie', 'a penguin waddling and sliding on the ice'],
    names: ['Pingouin en costume', 'Manchot pressé', 'Pingouin qui glisse', 'Pingouin de la banquise'],
    classic: ['Glissade ventrale', 'Dandinement', 'Nageoire', 'Regard sérieux'],
    special: ['Plongeon glacé', 'Toboggan géant', 'Pingouin en course', 'Avalanche manchote'],
  },
  {
    en: ['a chicken running in panic with feathers flying', 'a chicken staring at the camera with a dumb look'],
    names: ['Poule en panique', 'Coq trop fier', 'Poule qui fixe', 'Poulet de la cour'],
    classic: ['Coup de bec', 'Gloussement', 'Course affolée', 'Plumes en vrac'],
    special: ['Panique générale', 'Cocorico géant', 'Ponte surprise', 'Ruée de poules'],
  },
  {
    en: ['an elephant in a bathtub with a tiny rubber duck', 'a surprised elephant spraying water with its trunk'],
    names: ['Éléphant dans la baignoire', 'Canard de la discorde', 'Pachyderme en mousse', 'Trompe en vrac'],
    classic: ['Coup de trompe', 'Jet d’eau', 'Pas lourd', 'Canard volant'],
    special: ['Douche géante', 'Barrissement', 'Tsunami de mousse', 'Mega-trompe'],
  },
  {
    en: ['a slow turtle with a wise smile on its shell', 'a tortoise moving very slowly across a path'],
    names: ['Tortue zen', 'Tortue qui traîne', 'Carapace sage', 'Tortue du jardin'],
    classic: ['Coup de carapace', 'Lenteur', 'Rétraction', 'Bâillement lent'],
    special: ['Vitesse ultime', 'Sieste en carapace', 'Bouclier de tortue', 'Fuite lente'],
  },
  {
    en: ['a grumpy bear sitting in the forest holding a honey pot', 'a worn teddy bear with a stitched smile'],
    names: ['Ours de la bêtise', 'Peluche pas contente', 'Ours qui réclame du miel', 'Nounours en colère'],
    classic: ['Câlin brutal', 'Griffe en peluche', 'Miel volé', 'Grognement'],
    special: ['Câlin géant', 'Grosse colère', 'Ruée au miel', 'Peluche explosive'],
  },
  {
    en: ['a fluffy llama with a grumpy face and a funny expression', 'a llama standing with its neck up and an unimpressed look'],
    names: ['Lama pas content', 'Alpaga bizarre', 'Lama en pyjama', 'Lama de mauvais poil'],
    classic: ['Crachotis', 'Pose de lama', 'Pelage au vent', 'Regard dédaigneux'],
    special: ['Crachat géant', 'Tornade de laine', 'Dédain total', 'Galop bizarre'],
  },
  {
    en: ['a fluffy sheep with a strange haircut in a field', 'a sheep staring with its mouth open and a goofy look'],
    names: ['Mouton au brushing', 'Coiffure de mouton', 'Bêê bizarre', 'Mouton en vadrouille'],
    classic: ['Bêêê !', 'Tonte soudaine', 'Laine volante', 'Tête baissée'],
    special: ['Troupeau fou', 'Nuage de laine', 'Bêlement géant', 'Charge du mouton'],
  },
  {
    en: ['a cow staring at the camera with a dumb expression', 'a cow chewing grass with a blank look'],
    names: ['Vache qui regarde', 'Meuh pas convaincue', 'Vache du champ', 'Vache en plein fixe'],
    classic: ['Meuh', 'Regard vide', 'Mastication', 'Pas de côté'],
    special: ['Meuglement sismique', 'Ruée de vaches', 'Troupeau en vrac', 'Vache en orbite'],
  },
  {
    en: ['a tiger with a goofy grin and a lazy pose', 'a tiger lying on a sofa with a goofy look'],
    names: ['Tigre de salon', 'Félin trop sûr', 'Tigre de la cuisine', 'Rayures en vrac'],
    classic: ['Griffe molle', 'Rugissement doux', 'Bond maladroit', 'Ronron rayé'],
    special: ['Rugissement géant', 'Bond de tigre', 'Griffes en furie', 'Chasse au frigo'],
  },
  {
    en: ['a snail with a sleepy face on a green leaf', 'a snail with a shell crawling very slowly'],
    names: ['Escargot en pause', 'Coquille fatiguée', 'Bolide escargot', 'Escargot du jardin'],
    classic: ['Bave tranquille', 'Coup de coquille', 'Lenteur', 'Pas pressé'],
    special: ['Sprint d’escargot', 'Bave géante', 'Course immobile', 'Coquille blindée'],
  },
  {
    en: ['a sloth hanging from a branch with a calm face', 'a sloth hanging upside down and smiling slowly'],
    names: ['Paresseux suspendu', 'Paresseux au ralenti', 'Câlin d’arbre', 'Paresseux sans pression'],
    classic: ['Accroche lente', 'Bâillement', 'Regard zen', 'Branche glissante'],
    special: ['Sieste de l’arbre', 'Ralenti absolu', 'Léthargie géante', 'Pause perpétuelle'],
  },
  {
    en: ['a goldfish with a surprised round mouth in a fish bowl', 'a fish with a human-like face swimming in a tank'],
    names: ['Poisson en colère', 'Poisson de bocal', 'Poisson qui réfléchit', 'Nageur en bocal'],
    classic: ['Bulle', 'Frétillement', 'Bouche en O', 'Tour de bocal'],
    special: ['Tsunami de bocal', 'Saut hors de l’eau', 'Fuite d’eau', 'Saut hors du bocal'],
  },
  {
    en: ['a cartoon octopus with a grumpy face and eight arms', 'a purple octopus wearing a tiny hat'],
    names: ['Poulpe mécontent', 'Pieuvre à huit bras', 'Poulpe au chapeau', 'Calamar bavard'],
    classic: ['Coup de tentacule', 'Encre noire', 'Huit bras', 'Glissade'],
    special: ['Tempête tentaculaire', 'Nuage d’encre', 'Étreinte du poulpe', 'Vague géante'],
  },

  // Réactions et visages
  {
    en: ['a distorted face stretched sideways with a long chin', 'a face stretched like soft dough in a funny way'],
    names: ['Visage étiré', 'Tête en élastique', 'Visage en pâte à modeler', 'Mine tordue'],
    classic: ['Étirement', 'Grimace molle', 'Menton qui tombe', 'Yeux qui glissent'],
    special: ['Visage élastique', 'Tête qui s’étire', 'Déformation totale', 'Effet ressort'],
  },
  {
    en: ['a face with enormous round eyes staring at the camera', 'a close-up face with giant eyes and a tiny mouth'],
    names: ['Grands yeux', 'Regard de dix mètres', 'Yeux en soucoupes', 'Choc visuel'],
    classic: ['Clignement lent', 'Regard fixe', 'Œil géant', 'Sursaut'],
    special: ['Regard laser', 'Méga-yeux', 'Vision totale', 'Fixation hypnotique'],
  },
  {
    en: ['a crying face with big tears and a wobbly mouth', 'a cartoon face sobbing with streams of tears'],
    names: ['Sanglots en série', 'Gros chagrin', 'Visage en larmes', 'Fontaine à larmes'],
    classic: ['Reniflement', 'Larme qui tombe', 'Hoquet triste', 'Mouchoir mouillé'],
    special: ['Déluge de larmes', 'Crue du mouchoir', 'Sanglot sismique', 'Pluie de larmes'],
  },
  {
    en: ['a face laughing so hard that tears of joy fly out', 'a cartoon face roaring with laughter'],
    names: ['Fou rire total', 'Rire en boucle', 'Hilarité générale', 'Gros rire'],
    classic: ['Hahaha !', 'Tape sur la cuisse', 'Rire en cascade', 'Larme de joie'],
    special: ['Rire contagieux', 'Crise de fou rire', 'Hilarité sismique', 'Éclat de rire'],
  },
  {
    en: ['a screaming face with a wide open mouth and hair standing up', 'a terrified face screaming in a dark corridor'],
    names: ['Visage qui hurle', 'Cri du couloir', 'Frayeur en direct', 'Hurleur professionnel'],
    classic: ['Hurlement', 'Cheveux dressés', 'Bond en arrière', 'Bouche béante'],
    special: ['Cri strident', 'Cri sismique', 'Frayeur contagieuse', 'Hurlement cosmique'],
  },
  {
    en: ['a confused face with question marks floating around the head', 'a puzzled cartoon face surrounded by question marks'],
    names: ['Confusion totale', 'Visage en question', 'Ça veut dire quoi ?', 'Cerveau en pause'],
    classic: ['Gros doute', 'Regard vide', 'Grattage de tête', 'Hein ?'],
    special: ['Bug de cerveau', 'Question géante', 'Brouillard mental', 'Crash de logique'],
  },
  {
    en: ['a face smirking with one eyebrow raised', 'a cartoon face with a sly smirk and narrow eyes'],
    names: ['Sourire en coin', 'Air malin', 'Regard de complice', 'Mine de coupable'],
    classic: ['Sourcil levé', 'Clin d’œil', 'Ricanement', 'Pas dupe'],
    special: ['Sourire diabolique', 'Malice totale', 'Sourire du plan', 'Air de chef'],
  },
  {
    en: ['a deep-fried image with oversaturated neon colors and noisy pixels', 'a photo with blown-out colors and heavy jpeg artifacts'],
    names: ['Friture numérique', 'Trop de couleurs', 'Photo frite', 'Saturation maximale'],
    classic: ['Flash cramé', 'Pixel grillé', 'Bruit de jpeg', 'Couleurs qui crient'],
    special: ['Mega-friture', 'Pixels en fusion', 'Néons en furie', 'Compression fatale'],
  },
  {
    en: ['a face with red laser beams shooting from the eyes', 'a cartoon character with glowing red eyes firing lasers'],
    names: ['Yeux laser', 'Regard qui brûle', 'Mode rayon rouge', 'Lasers aux yeux'],
    classic: ['Rayon rouge', 'Clignement laser', 'Regard brûlant', 'Zap !'],
    special: ['Méga-rayon', 'Laser total', 'Rayon sieste', 'Surchauffe oculaire'],
  },
  {
    en: ['a cartoon face wearing cool black sunglasses with a confident smirk', 'a person in sunglasses with a self-assured look'],
    names: ['Lunettes de la fin', 'Classe absolue', 'Mode lunettes', 'Lunettes de soleil fatales'],
    classic: ['Coup de lunettes', 'Lunettes glissantes', 'Sourire froid', 'Clac de lunettes'],
    special: ['Fin du débat', 'Ça, c’est réglé', 'Coucher de soleil', 'Lâcher de micro'],
  },
  {
    en: ['a clown face with a red nose and white make-up', 'a cartoon clown grinning with curly orange hair'],
    names: ['Clown pas drôle', 'Nez rouge', 'Pitre du dimanche', 'Clown du goûter'],
    classic: ['Klaxon de nez', 'Ballon éclaté', 'Pirouette', 'Gros fard'],
    special: ['Spectacle désastreux', 'Numéro de cirque', 'Feu de confettis', 'Tour de magie raté'],
  },
  {
    en: ['a person making a duck face in a selfie', 'a selfie with a pouting face and puckered lips'],
    names: ['Selfie en canard', 'Moue de selfie', 'Bisou au miroir', 'Pose de la honte'],
    classic: ['Moue', 'Flash', 'Pose', 'Bisou au miroir'],
    special: ['Selfie fatal', 'Filtre géant', 'Pose maximale', 'Flash en rafale'],
  },

  // Dessins grossiers (style MS Paint)
  {
    en: ['a crude black-line stick figure on a white background', 'a simple stick figure with a round head and thin arms'],
    names: ['Bonhomme bâton', 'Pictogramme raté', 'Petit bonhomme en traits', 'Bâtons vivants'],
    classic: ['Coup de bâton', 'Bras en ligne', 'Saut de traits', 'Tête ronde'],
    special: ['Stickman en furie', 'Ligne géante', 'Fusion de bâtons', 'Pose de bâton'],
  },
  {
    en: ['a badly drawn superhero in a red costume with a web pattern and a goofy mouth', 'a crude digital doodle of a pear-shaped superhero'],
    names: ['Super-héros raté', 'Héros en pyjama', 'Justicier en carton', 'Champion du crayon'],
    classic: ['Coup de poire', 'Toile bancale', 'Saut raté', 'Cri héroïque'],
    special: ['Rayon de crayon', 'Super-pouvoir flou', 'Pouvoir confus', 'Cape qui tombe'],
  },

  // Personnages de jeux et dessins animés (peinture réaliste)
  {
    en: ['a realistic painting of a round black angry bird with a burning fuse on its head', 'a round cartoon bird with a lit fuse on its head'],
    names: ['Oiseau-bombe', 'Volatile explosif', 'Oiseau à mèche', 'Boule de colère'],
    classic: ['Coup de bec', 'Cri de rage', 'Plongeon fou', 'Mèche qui brûle'],
    special: ['Explosion volante', 'Boom aérien', 'Bombe à plumes', 'Compte à rebours'],
  },
  {
    en: ['a realistic painting of an angry green bird with a huge orange beak', 'a furious green bird with a big orange beak'],
    names: ['Oiseau vénère', 'Piaf en colère', 'Volatile pas content', 'Bec de la discorde'],
    classic: ['Coup de bec', 'Cri de rage', 'Plumes hérissées', 'Piqué fou'],
    special: ['Bec dévastateur', 'Tornade de plumes', 'Attaque du bec', 'Cri de guerre'],
  },
  {
    en: ['a hyper-realistic painting of a round green pig head with a moustache and bruised eyes', 'a round green pig creature with a bushy moustache'],
    names: ['Cochon bagarreur', 'Porc en mauvaise forme', 'Cochon trop costaud', 'Groin de combat'],
    classic: ['Coup de groin', 'Charge de cochon', 'Œil au beurre noir', 'Moustache en colère'],
    special: ['Charge bagarreuse', 'Tornade de boue', 'Groin dévastateur', 'Bagarre de la ferme'],
  },
  {
    en: ['a cartoon plumber with a red cap and a big moustache', 'a stocky cartoon plumber in blue overalls jumping'],
    names: ['Plombier moustachu', 'Plombier en salopette', 'Réparateur de tuyaux', 'Plombier sautillant'],
    classic: ['Saut de plombier', 'Coup de clé', 'Moustache volante', 'Tuyau tordu'],
    special: ['Super-saut', 'Champignon magique', 'Tuyau géant', 'Fuite générale'],
  },
  {
    en: ['a small yellow electric creature with red cheeks and a zigzag tail', 'a yellow rodent-like creature with a lightning bolt tail'],
    names: ['Bête qui fait zap', 'Souris électrique', 'Petit jaune qui pique', 'Rongeur à éclairs'],
    classic: ['Petit zap', 'Coup de queue', 'Joues rouges', 'Bisou électrique'],
    special: ['Tonnerre de poche', 'Super-éclair', 'Tempête de volts', 'Orage miniature'],
  },
  {
    en: ['a blue spiky hedgehog-like cartoon character in red shoes', 'a blue spiky creature running at top speed'],
    names: ['Hérisson bleu fou', 'Pic-bleu en baskets', 'Hérisson pressé', 'Boule bleue à pics'],
    classic: ['Coup de pic', 'Course folle', 'Pirouette en boule', 'Clin d’œil bleu'],
    special: ['Turbo hérisson', 'Boule de vitesse', 'Super sprint', 'Ouragan bleu'],
  },

  // Art fantastique et cosmique
  {
    en: ['a cosmic galaxy portrait of a person made of stars and nebulae', 'a face made of a swirling galaxy in deep space'],
    names: ['Portrait galactique', 'Visage de nébuleuse', 'Tête de galaxie', 'Coiffure de nébuleuse'],
    classic: ['Étoile filante', 'Tourbillon', 'Poussière d’étoiles', 'Rayon cosmique'],
    special: ['Big bang capillaire', 'Trou noir', 'Supernova', 'Pluie de météorites'],
  },
  {
    en: ['a neon cyberpunk city at night with flying cars', 'a futuristic dark city full of neon signs and rain'],
    names: ['Ville néon 2099', 'Paysage pluvieux', 'Métropole fluo', 'Panneaux qui clignotent'],
    classic: ['Coup de néon', 'Voiture volante', 'Averse de néons', 'Bip urbain'],
    special: ['Hack total', 'Ville qui clignote', 'Overdrive urbain', 'Crash de la mégapole'],
  },
  {
    en: ['a vaporwave statue with pink and teal colors', 'a pastel vaporwave marble bust on a grid background'],
    names: ['Statue vaporeuse', 'Buste rose fluo', 'Marbre des années 80', 'Sculpture néon'],
    classic: ['Reflet rose', 'Coup de marbre', 'Glitch', 'Soupir pastel'],
    special: ['Vague de nostalgie', 'Mode rétro infini', 'Boucle lo-fi', 'Pixels roses'],
  },
  {
    en: ['a Greek marble statue with a serious face and missing arms', 'a classical marble bust of a man with a blank stare'],
    names: ['Statue grecque en retard', 'Marbre qui pense', 'Penseur sans bras', 'Buste antique'],
    classic: ['Pose héroïque', 'Coup de marbre', 'Regard antique', 'Chute du socle'],
    special: ['Oracle en pierre', 'Colonne en fureur', 'Olympe en vrac', 'Séance de pose'],
  },

  // Nourriture avec des visages
  {
    en: ['a slice of toast with a face and sad eyes', 'a piece of bread with a cartoon face and a frown'],
    names: ['Tartine qui pleure', 'Pain qui a une tête', 'Toast en colère', 'Tartine sérieuse'],
    classic: ['Miette volante', 'Coup de croûte', 'Beurre fondu', 'Grille-pain !'],
    special: ['Toast surchauffé', 'Tartine géante', 'Tornade de miettes', 'Confiture fatale'],
  },
  {
    en: ['a pizza slice with a cartoon face and a big smile', 'a smiling pizza with eyes and a tongue sticking out'],
    names: ['Pizza qui sourit', 'Part de pizza bavarde', 'Pizza trop contente', 'Tranche sympa'],
    classic: ['Coup de fromage', 'Petit clin d’œil', 'Pepperoni furieux', 'Bâillement pizza'],
    special: ['Fromage géant', 'Pizza-tornade', 'Festin de fromage', 'Mega-part'],
  },
  {
    en: ['a banana with a face and a worried expression', 'a banana character with wide panicked eyes'],
    names: ['Banane inquiète', 'Fruit qui s’inquiète', 'Banane en panique', 'Banane au regard vide'],
    classic: ['Glissade', 'Épluchage', 'Coup de peau', 'Grand sourire'],
    special: ['Glissade fatale', 'Banane-bombe', 'Trombe de potassium', 'Saut de peau'],
  },
  {
    en: ['a lumpy potato with a grumpy face and googly eyes', 'a potato with a face and an angry frown'],
    names: ['Patate grincheuse', 'Pomme de terre sérieuse', 'Patate qui râle', 'Tubercule en colère'],
    classic: ['Coup de patate', 'Éplucheur menaçant', 'Roulé-boulé', 'Germe de colère'],
    special: ['Purée explosive', 'Patate-bombe', 'Chips volantes', 'Frites en furie'],
  },
  {
    en: ['an egg with a face wearing sunglasses', 'a cartoon egg with a nervous face and sweaty brow'],
    names: ['Œuf qui stresse', 'Œuf à lunettes', 'Tête d’œuf', 'Coquille nerveuse'],
    classic: ['Tapotement', 'Coquille fendue', 'Roulé en omelette', 'Œil jaune'],
    special: ['Omelette géante', 'Œuf cosmique', 'Coquille blindée', 'Choc de coque'],
  },
  {
    en: ['a hamburger with a big smile and sesame seeds', 'a cartoon burger with googly eyes and a wide grin'],
    names: ['Burger bavard', 'Hamburger trop content', 'Bouchée qui parle', 'Burger au grand sourire'],
    classic: ['Coup de sésame', 'Ketchup volant', 'Salade en tempête', 'Vol de frites'],
    special: ['Triple étage', 'Burger en orbite', 'Sauce tornade', 'Festin de fast-food'],
  },
  {
    en: ['a cartoon hot dog wearing sunglasses and dancing', 'a smiling hot dog with a cool expression'],
    names: ['Saucisse dansante', 'Hot-dog en lunettes', 'Hot-dog qui danse', 'Saucisse trop cool'],
    classic: ['Coup de moutarde', 'Pas de danse', 'Ketchup volant', 'Clin d’œil'],
    special: ['Danse de saucisse', 'Moutarde fatale', 'Boum du pain', 'Soirée saucisse'],
  },

  // Objets avec des visages
  {
    en: ['a kitchen fridge with a face and big grumpy eyes', 'a fridge with a face looking annoyed in a kitchen'],
    names: ['Frigo qui parle', 'Réfrigérateur grognon', 'Frigo en vadrouille', 'Gardien du beurre'],
    classic: ['Porte qui claque', 'Bourdonnement', 'Givre en colère', 'Tiroir coincé'],
    special: ['Glaçon géant', 'Fermeture éclair', 'Panne de frigo', 'Vidage total'],
  },
  {
    en: ['a cartoon armchair with eyes and a huge smile', 'a sofa with a face and a sleepy expression'],
    names: ['Fauteuil souriant', 'Chaise qui parle', 'Canapé vivant', 'Siège expressif'],
    classic: ['Coussin volant', 'Grincement', 'Pied bancal', 'Ressort rebelle'],
    special: ['Sieste géante', 'Vague de coussins', 'Berceuse fatale', 'Tapissier furieux'],
  },
  {
    en: ['a desk lamp with a face and a cheeky look', 'a lamp with eyes and a mischievous smile'],
    names: ['Lampe malicieuse', 'Ampoule qui réfléchit', 'Lampe farceuse', 'Idée lumineuse'],
    classic: ['Clignotement', 'Allumage brutal', 'Fil emmêlé', 'Idée géniale'],
    special: ['Éclat de génie', 'Court-circuit géant', 'Super lumière', 'Éclair d’idée'],
  },
  {
    en: ['a cartoon car with big eyes and a grin on its front', 'an old car with a face on its front grille'],
    names: ['Voiture qui sourit', 'Bagnole bavarde', 'Vieille caisse', 'Voiture en panne'],
    classic: ['Klaxon', 'Dérapage', 'Pare-choc', 'Phares clignotants'],
    special: ['Turbo de caisse', 'Drift fatal', 'Coup de frein', 'Vroum géant'],
  },
  {
    en: ['a smartphone with a cracked screen and a sad face', 'a cracked phone screen with a grumpy face'],
    names: ['Téléphone fissuré', 'Smartphone têtu', 'Écran en pleurs', 'Batterie à 1 %'],
    classic: ['Notification', 'Écran fissuré', 'Chute de téléphone', 'Mode avion'],
    special: ['Mise à jour fatale', 'Plantage géant', 'Batterie critique', 'Vibration brutale'],
  },
  {
    en: ['a cat sitting on a laptop keyboard', 'a cat walking across a keyboard and typing randomly'],
    names: ['Chat sur le clavier', 'Minou qui tape', 'Assistant félin', 'Bug de ronron'],
    classic: ['Frappe au hasard', 'Écran noir', 'Pattes en vrac', 'Ronron bloquant'],
    special: ['Mail par erreur', 'Mode chaos', 'Supprimer tout', 'Plantage félin'],
  },

  // Personnes et mises en scène
  {
    en: ['a fake stock photo of smiling office workers giving a thumbs up', 'a stiff stock photo of a team laughing at a laptop'],
    names: ['Sourire de catalogue', 'Équipe trop contente', 'Photo de bureau', 'Réunion de carton'],
    classic: ['Poignée de main', 'Sourire figé', 'Pouce levé', 'Réunion inutile'],
    special: ['Séance photo', 'Sourire de 9 h', 'Brainstorming géant', 'Fausse joie'],
  },
];
