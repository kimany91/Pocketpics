// Vocabulaire de reconnaissance (labels CLIP en anglais) et noms français des cartes.

export type CategoryId =
  | 'animal'
  | 'plant'
  | 'landscape'
  | 'building'
  | 'person'
  | 'vehicle'
  | 'food'
  | 'object';

// Un label que le modèle sait scorer, avec son nom français.
export interface VocabLabel {
  en: string;
  fr: string;
  category: CategoryId;
}

// Noms proposés pour une carte d'une catégorie donnée.
export interface CategoryNames {
  card: string[];
  classic: string[];
  special: string[];
}

export const VOCAB: VocabLabel[] = [
  // Animaux
  { en: 'dog', fr: 'Chien', category: 'animal' },
  { en: 'cat', fr: 'Chat', category: 'animal' },
  { en: 'bird', fr: 'Oiseau', category: 'animal' },
  { en: 'horse', fr: 'Cheval', category: 'animal' },
  { en: 'fish', fr: 'Poisson', category: 'animal' },
  { en: 'cow', fr: 'Vache', category: 'animal' },
  { en: 'sheep', fr: 'Mouton', category: 'animal' },
  { en: 'insect', fr: 'Insecte', category: 'animal' },
  { en: 'butterfly', fr: 'Papillon', category: 'animal' },
  { en: 'duck', fr: 'Canard', category: 'animal' },
  { en: 'rabbit', fr: 'Lapin', category: 'animal' },
  { en: 'lion', fr: 'Lion', category: 'animal' },
  { en: 'elephant', fr: 'Éléphant', category: 'animal' },
  { en: 'tiger', fr: 'Tigre', category: 'animal' },
  { en: 'bear', fr: 'Ours', category: 'animal' },
  { en: 'wolf', fr: 'Loup', category: 'animal' },
  { en: 'fox', fr: 'Renard', category: 'animal' },
  { en: 'monkey', fr: 'Singe', category: 'animal' },
  { en: 'penguin', fr: 'Pingouin', category: 'animal' },
  { en: 'owl', fr: 'Hibou', category: 'animal' },
  { en: 'eagle', fr: 'Aigle', category: 'animal' },
  { en: 'snake', fr: 'Serpent', category: 'animal' },
  { en: 'frog', fr: 'Grenouille', category: 'animal' },
  { en: 'turtle', fr: 'Tortue', category: 'animal' },
  { en: 'pig', fr: 'Cochon', category: 'animal' },
  { en: 'goat', fr: 'Chèvre', category: 'animal' },
  { en: 'deer', fr: 'Cerf', category: 'animal' },
  { en: 'dolphin', fr: 'Dauphin', category: 'animal' },

  // Plantes
  { en: 'tree', fr: 'Arbre', category: 'plant' },
  { en: 'flower', fr: 'Fleur', category: 'plant' },
  { en: 'grass', fr: 'Herbe', category: 'plant' },
  { en: 'bush', fr: 'Buisson', category: 'plant' },
  { en: 'cactus', fr: 'Cactus', category: 'plant' },
  { en: 'leaves', fr: 'Feuillage', category: 'plant' },
  { en: 'palm tree', fr: 'Palmier', category: 'plant' },
  { en: 'forest', fr: 'Forêt', category: 'plant' },
  { en: 'mushroom', fr: 'Champignon', category: 'plant' },
  { en: 'rose', fr: 'Rose', category: 'plant' },
  { en: 'moss', fr: 'Mousse', category: 'plant' },
  { en: 'pine tree', fr: 'Pin', category: 'plant' },
  { en: 'bamboo', fr: 'Bambou', category: 'plant' },
  { en: 'vine', fr: 'Liane', category: 'plant' },
  { en: 'sunflower', fr: 'Tournesol', category: 'plant' },
  { en: 'fern', fr: 'Fougère', category: 'plant' },
  { en: 'orchid', fr: 'Orchidée', category: 'plant' },

  // Paysages
  { en: 'mountain', fr: 'Montagne', category: 'landscape' },
  { en: 'beach', fr: 'Plage', category: 'landscape' },
  { en: 'sea', fr: 'Mer', category: 'landscape' },
  { en: 'lake', fr: 'Lac', category: 'landscape' },
  { en: 'river', fr: 'Rivière', category: 'landscape' },
  { en: 'desert', fr: 'Désert', category: 'landscape' },
  { en: 'sky', fr: 'Ciel', category: 'landscape' },
  { en: 'sunset', fr: 'Coucher de soleil', category: 'landscape' },
  { en: 'snow', fr: 'Neige', category: 'landscape' },
  { en: 'waterfall', fr: 'Cascade', category: 'landscape' },
  { en: 'field', fr: 'Champ', category: 'landscape' },
  { en: 'volcano', fr: 'Volcan', category: 'landscape' },
  { en: 'city street', fr: 'Rue de la ville', category: 'landscape' },
  { en: 'night sky', fr: 'Ciel nocturne', category: 'landscape' },
  { en: 'island', fr: 'Île', category: 'landscape' },
  { en: 'cliff', fr: 'Falaise', category: 'landscape' },
  { en: 'valley', fr: 'Vallée', category: 'landscape' },
  { en: 'hill', fr: 'Colline', category: 'landscape' },
  { en: 'glacier', fr: 'Glacier', category: 'landscape' },
  { en: 'meadow', fr: 'Prairie', category: 'landscape' },
  { en: 'rainbow', fr: 'Arc-en-ciel', category: 'landscape' },
  { en: 'storm clouds', fr: 'Nuages orageux', category: 'landscape' },
  { en: 'canyon', fr: 'Canyon', category: 'landscape' },
  { en: 'rocky coast', fr: 'Côte rocheuse', category: 'landscape' },
  { en: 'sand dunes', fr: 'Dunes', category: 'landscape' },
  { en: 'aurora', fr: 'Aurore boréale', category: 'landscape' },
  { en: 'ocean waves', fr: 'Vagues', category: 'landscape' },

  // Bâtiments
  { en: 'tower', fr: 'Tour', category: 'building' },
  { en: 'castle', fr: 'Château', category: 'building' },
  { en: 'house', fr: 'Maison', category: 'building' },
  { en: 'church', fr: 'Église', category: 'building' },
  { en: 'bridge', fr: 'Pont', category: 'building' },
  { en: 'skyscraper', fr: 'Gratte-ciel', category: 'building' },
  { en: 'monument', fr: 'Monument', category: 'building' },
  { en: 'ruins', fr: 'Ruines', category: 'building' },
  { en: 'stadium', fr: 'Stade', category: 'building' },
  { en: 'temple', fr: 'Temple', category: 'building' },
  { en: 'lighthouse', fr: 'Phare', category: 'building' },
  { en: 'barn', fr: 'Grange', category: 'building' },
  { en: 'windmill', fr: 'Moulin', category: 'building' },
  { en: 'mosque', fr: 'Mosquée', category: 'building' },
  { en: 'pyramid', fr: 'Pyramide', category: 'building' },
  { en: 'palace', fr: 'Palais', category: 'building' },
  { en: 'factory', fr: 'Usine', category: 'building' },
  { en: 'school', fr: 'École', category: 'building' },
  { en: 'train station', fr: 'Gare', category: 'building' },
  { en: 'dam', fr: 'Barrage', category: 'building' },
  { en: 'pagoda', fr: 'Pagode', category: 'building' },
  { en: 'arch', fr: 'Arc', category: 'building' },
  { en: 'cabin', fr: 'Cabane', category: 'building' },
  { en: 'apartment building', fr: 'Immeuble', category: 'building' },
  { en: 'city hall', fr: 'Mairie', category: 'building' },
  { en: 'library', fr: 'Bibliothèque', category: 'building' },

  // Personnes
  { en: 'person', fr: 'Personne', category: 'person' },
  { en: 'man', fr: 'Homme', category: 'person' },
  { en: 'woman', fr: 'Femme', category: 'person' },
  { en: 'child', fr: 'Enfant', category: 'person' },
  { en: 'crowd', fr: 'Foule', category: 'person' },
  { en: 'face', fr: 'Visage', category: 'person' },
  { en: 'baby', fr: 'Bébé', category: 'person' },
  { en: 'dancer', fr: 'Danseur', category: 'person' },
  { en: 'athlete', fr: 'Athlète', category: 'person' },

  // Véhicules
  { en: 'car', fr: 'Voiture', category: 'vehicle' },
  { en: 'bicycle', fr: 'Vélo', category: 'vehicle' },
  { en: 'boat', fr: 'Bateau', category: 'vehicle' },
  { en: 'airplane', fr: 'Avion', category: 'vehicle' },
  { en: 'train', fr: 'Train', category: 'vehicle' },
  { en: 'motorcycle', fr: 'Moto', category: 'vehicle' },
  { en: 'bus', fr: 'Bus', category: 'vehicle' },
  { en: 'truck', fr: 'Camion', category: 'vehicle' },
  { en: 'sailboat', fr: 'Voilier', category: 'vehicle' },
  { en: 'helicopter', fr: 'Hélicoptère', category: 'vehicle' },
  { en: 'tractor', fr: 'Tracteur', category: 'vehicle' },
  { en: 'scooter', fr: 'Trottinette', category: 'vehicle' },
  { en: 'tram', fr: 'Tramway', category: 'vehicle' },

  // Nourriture
  { en: 'pizza', fr: 'Pizza', category: 'food' },
  { en: 'cake', fr: 'Gâteau', category: 'food' },
  { en: 'fruit', fr: 'Fruit', category: 'food' },
  { en: 'bread', fr: 'Pain', category: 'food' },
  { en: 'coffee cup', fr: 'Tasse de café', category: 'food' },
  { en: 'sushi', fr: 'Sushi', category: 'food' },
  { en: 'burger', fr: 'Hamburger', category: 'food' },
  { en: 'vegetables', fr: 'Légumes', category: 'food' },
  { en: 'apple', fr: 'Pomme', category: 'food' },
  { en: 'banana', fr: 'Banane', category: 'food' },
  { en: 'ice cream', fr: 'Glace', category: 'food' },
  { en: 'chocolate', fr: 'Chocolat', category: 'food' },
  { en: 'cheese', fr: 'Fromage', category: 'food' },
  { en: 'egg', fr: 'Œuf', category: 'food' },
  { en: 'salad', fr: 'Salade', category: 'food' },
  { en: 'pancakes', fr: 'Crêpes', category: 'food' },
  { en: 'noodles', fr: 'Nouilles', category: 'food' },
  { en: 'soup', fr: 'Soupe', category: 'food' },
  { en: 'croissant', fr: 'Croissant', category: 'food' },
  { en: 'strawberry', fr: 'Fraise', category: 'food' },

  // Objets
  { en: 'book', fr: 'Livre', category: 'object' },
  { en: 'phone', fr: 'Téléphone', category: 'object' },
  { en: 'chair', fr: 'Chaise', category: 'object' },
  { en: 'guitar', fr: 'Guitare', category: 'object' },
  { en: 'clock', fr: 'Horloge', category: 'object' },
  { en: 'lamp', fr: 'Lampe', category: 'object' },
  { en: 'shoe', fr: 'Chaussure', category: 'object' },
  { en: 'ball', fr: 'Ballon', category: 'object' },
  { en: 'computer', fr: 'Ordinateur', category: 'object' },
  { en: 'bottle', fr: 'Bouteille', category: 'object' },
  { en: 'flower pot', fr: 'Pot de fleurs', category: 'object' },
  { en: 'umbrella', fr: 'Parapluie', category: 'object' },
  { en: 'backpack', fr: 'Sac à dos', category: 'object' },
  { en: 'hat', fr: 'Chapeau', category: 'object' },
  { en: 'camera', fr: 'Appareil photo', category: 'object' },
  { en: 'keyboard', fr: 'Clavier', category: 'object' },
  { en: 'toy', fr: 'Jouet', category: 'object' },
  { en: 'table', fr: 'Table', category: 'object' },
  { en: 'cup', fr: 'Tasse', category: 'object' },
  { en: 'eyeglasses', fr: 'Lunettes', category: 'object' },
  { en: 'key', fr: 'Clé', category: 'object' },
  { en: 'scissors', fr: 'Ciseaux', category: 'object' },
  { en: 'pen', fr: 'Stylo', category: 'object' },
  { en: 'teddy bear', fr: 'Ours en peluche', category: 'object' },
  { en: 'sofa', fr: 'Canapé', category: 'object' },
  { en: 'bed', fr: 'Lit', category: 'object' },
  { en: 'pillow', fr: 'Oreiller', category: 'object' },
  { en: 'mirror', fr: 'Miroir', category: 'object' },
  { en: 'candle', fr: 'Bougie', category: 'object' },
  { en: 'paintbrush', fr: 'Pinceau', category: 'object' },
  { en: 'violin', fr: 'Violon', category: 'object' },
  { en: 'drum', fr: 'Tambour', category: 'object' },
  { en: 'headphones', fr: 'Casque audio', category: 'object' },
  { en: 'suitcase', fr: 'Valise', category: 'object' },
  { en: 'kite', fr: 'Cerf-volant', category: 'object' },
  { en: 'skateboard', fr: 'Skateboard', category: 'object' },
  { en: 'wine glass', fr: 'Verre', category: 'object' },
  { en: 'bucket', fr: 'Seau', category: 'object' },
];

// Noms français par catégorie : carte, attaque classique, attaque spéciale.
export const CATEGORY_NAMES: Record<CategoryId, CategoryNames> = {
  animal: {
    card: ['Compagnon', 'Créature', 'Bête sauvage', 'Esprit animal'],
    classic: ['Coup de croc', 'Coup de patte', 'Coup de bec', 'Morsure', 'Coup de queue', 'Griffure', 'Coup de corne'],
    special: ['Rugissement', 'Charge sauvage', 'Cri perçant', 'Fureur animale', 'Ruée féroce', 'Hurlement', 'Envol sauvage'],
  },
  plant: {
    card: ['Pousse', 'Végétal', 'Floraison', 'Jardin vivant'],
    classic: ['Coup de branche', 'Fouet de lianes', 'Coup de feuille', 'Pollen piquant', 'Coup épineux', 'Racine tordue', 'Coup de sève'],
    special: ['Floraison soudaine', 'Tempête de pétales', 'Racines géantes', 'Pluie de pollen', 'Éruption florale', 'Forêt vivante', 'Croissance éclair'],
  },
  landscape: {
    card: ['Horizon', 'Paysage', 'Panorama', 'Contrée'],
    classic: ['Coup de vent', 'Rafale', 'Averse', 'Ressac', 'Coup de grêle', 'Éboulis', 'Coup de brume'],
    special: ['Tempête', 'Raz-de-marée', 'Avalanche', 'Éruption', 'Tremblement', 'Ouragan', 'Déluge'],
  },
  building: {
    card: ['Bâtisse', 'Forteresse', 'Monument', 'Édifice'],
    classic: ['Coup de pierre', 'Coup de brique', 'Éboulement', 'Coup de bélier', 'Coup de poutre', 'Pierre lancée', 'Coup de mortier'],
    special: ['Effondrement', 'Mur de pierre', 'Rempart', 'Chute de tour', 'Tir de catapulte', 'Siège', 'Fortification'],
  },
  person: {
    card: ['Héros', 'Aventurier', 'Champion', 'Ami', 'Légende'],
    classic: ['Coup de poing', 'Coup de pied', 'Direct du droit', 'Coup de coude', 'Coup de genou', 'Coup de tête', 'Balayage'],
    special: ['Concentration', 'Furie du héros', 'Élan final', 'Cri de guerre', 'Danse victorieuse', 'Appel à la foule', 'Inspiration'],
  },
  vehicle: {
    card: ['Machine', 'Bolide', 'Engin', 'Véhicule'],
    classic: ['Coup de klaxon', 'Coup de frein', 'Tacle', 'Coup de roue', 'Coup de pare-chocs', 'Embardée', 'Choc frontal'],
    special: ['Turbo', 'Vitesse max', 'Décollage', 'Course folle', 'Nitro', 'Démarrage en trombe', 'Dérapage'],
  },
  food: {
    card: ['Délice', 'Gourmand', 'Régal', 'Mets'],
    classic: ['Coup de fourchette', 'Morsure gourmande', 'Coup de cuillère', 'Éclaboussure', 'Miette volante', 'Coup de louche', 'Pépin lancé'],
    special: ['Festin', 'Banquet', 'Explosion de saveurs', 'Plat du chef', 'Sauce brûlante', 'Pluie sucrée', 'Repas royal'],
  },
  object: {
    card: ['Trésor', 'Artefact', 'Gadget', 'Bibelot', 'Accessoire'],
    classic: ['Coup sec', 'Choc', 'Coup de coin', 'Projectile', 'Chute', 'Coup de manche', 'Pichenette'],
    special: ['Éclair magique', 'Surcharge', 'Explosion', 'Rayon mystique', 'Fusion', 'Vibration', 'Brillance'],
  },
};
