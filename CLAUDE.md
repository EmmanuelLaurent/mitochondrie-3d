# CLAUDE.md

## Résumé du projet
Application web 3D interactive qui fait vivre à un·e étudiant·e le trajet d'une molécule de **palmitate** (acide gras à longue chaîne, C16) : de l'extérieur de la mitochondrie jusqu'aux ATP produits. L'étudiant·e voit la mitochondrie de l'extérieur, entre « dans la peau » de l'acide gras, assiste à la β-oxydation dans la matrice, suit la chaîne respiratoire dans la membrane interne, voit la circulation des H⁺ dans l'espace intermembranaire, puis la synthèse d'ATP par l'ATP synthase.

- **Public** : étudiant·e·s de licence (biologie, santé) — niveau exact à confirmer, voir questions ouvertes.
- **Langue** : interface et contenus pédagogiques en **français** (tous dans `content/fr.json`) ; code, identifiants et commentaires en **anglais**.
- **Trois modes** : Visite guidée (timeline narrée, ~10 min, lecture/pause/vitesse/chapitres), Exploration libre (orbite/zoom/clic), Labo (inhibiteurs + curseur ADP disponible).
- **Livrable** : SPA statique sans backend, déployable sur GitHub Pages, intégrable en iframe (Moodle) avec bouton plein écran. README expliquant lancement local, déploiement, modification des textes. Dernière phase : export vidéo MP4 de la visite guidée.
- Aucun cookie, aucun traceur (usage scolaire, RGPD).

Storyboard complet : voir [docs/SPEC.md](docs/SPEC.md).

## Stack
- Vite + TypeScript strict + Three.js
- GSAP pour les trajectoires de caméra et les timelines
- CSS2DRenderer pour les étiquettes
- InstancedMesh pour les particules (H⁺, e⁻, molécules)
- HTML/CSS simple pour l'UI — pas de framework lourd (pas de React/Vue/etc.)
- Vitest pour les tests de logique pure (mode Labo, calculs de bilan)
- Puppeteer + ffmpeg pour l'export vidéo (phase finale), capture image par image déterministe
- **Aucune dépendance supplémentaire sans validation préalable**

## Commandes
À affiner lors du scaffolding (phase 1) ; cibles actuelles :
- `npm install` — installer les dépendances
- `npm run dev` — serveur de développement
- `npm run build` — build de production (`dist/`)
- `npm run preview` — prévisualiser le build de production
- `npm run test` — tests Vitest
- `npm run deploy` — publier `dist/` sur GitHub Pages (mécanisme à définir en phase 1)

## Architecture
- **SceneManager** : machine à états pilotant la scène active. Chaque scène est un module implémentant un cycle de vie `enter() / update(dt) / exit()`.
- **Un module par scène** (`src/scenes/sceneX-*/`), responsable de son propre contenu 3D, de ses étiquettes/info-bulles, et de son nettoyage mémoire complet à la sortie (`exit()` libère géométries, matériaux, textures).
- **`content/fr.json`** : unique source de tous les textes pédagogiques (narration, étiquettes, info-bulles, quiz). Jamais de texte pédagogique en dur dans le code.
- **Fichier de config scientifique unique** (`src/config/science.config.ts`) : toutes les constantes scientifiques (stœchiométries, convention P/O, stœchiométrie de pompage H⁺, échelles de zoom, etc.). Aucune valeur scientifique en dur ailleurs dans le code.
- **Mode Labo** : modèle d'état qualitatif en logique pure (`src/labo/`), découplé du rendu, testé avec Vitest.
- **AssetLoader** : abstraction de chargement permettant de remplacer plus tard un modèle procédural par un `.glb` (ex. structure PDB exportée depuis ChimeraX) sans changer le code appelant.
- **Particules** : `InstancedMesh` pour tout élément répété en nombre (H⁺, e⁻, petites molécules).
- **Réglage de qualité** bas/haut, appliqué globalement (nombre de particules, résolution, post-processing).

## Conventions
- **Direction artistique** : modélisation procédurale stylisée, volontairement **non photoréaliste**. Ce parti pris s'applique à toutes les scènes et reste valable même après un remplacement d'un modèle procédural par un `.glb` (voir `AssetLoader` ci-dessus), sauf décision explicite contraire. Habillage visuel (validé phase 1, voir scène 1) :
  - fond sombre/cinématique (dégradé profond, jamais blanc/crème) ;
  - matériaux avec environment map (reflets doux) + tone mapping ACES Filmic, éclairage 3 points (clé chaude, fill froid, contre-jour cyan) pour un look « rendu produit » plutôt que plat ;
  - UI en panneaux « verre dépoli » (fond sombre translucide + `backdrop-filter: blur`), coins de visée façon instrument scientifique, accent cyan/corail ;
  - priorité donnée au rendu visuel sur la fluidité mobile/tablette bas de gamme (demande explicite) — le réglage qualité bas/haut existe toujours, mais le défaut est haut et on n'optimise pas au détriment du rendu.
- Code, noms de variables/fonctions, commentaires : **en anglais**.
- Tout texte visible par l'utilisateur : **en français**, dans `content/fr.json`, jamais en dur.
- TypeScript strict (`"strict": true`), pas de `any` non justifié.
- **Accessibilité** :
  - palette lisible par les daltoniens ; aucune information portée par la seule couleur — toujours une forme ou un motif distinct en complément ;
  - respect de `prefers-reduced-motion` ;
  - navigation clavier complète ;
  - textes à taille lisible, contrastes suffisants.
- **Performance** :
  - cible 60 fps sur portable milieu de gamme ; la fluidité sur mobile/tablette bas de gamme n'est plus un objectif (demande explicite) — le réglage qualité bas/haut reste l'échappatoire pour qui en a besoin, mais le rendu visuel passe avant ;
  - réglage de qualité bas/haut exposé à l'utilisateur ;
  - libération explicite de la mémoire (géométries, matériaux, textures) à la sortie de chaque scène.
- Aucun cookie, aucun traceur.
- Tout asset externe (modèle, texture, police, son) doit avoir une licence compatible avec un usage pédagogique/redistribution, créditée dans le README.
- Toute simplification pédagogique doit être signalée explicitement dans l'info-bulle concernée (ex. boîte noire du cycle de Krebs).
- Le mode Labo et les calculs de bilan sont de la logique pure, séparée du rendu, testée avec Vitest — un comportement de labo = un test.
- Barre d'échelle toujours visible ; chaque changement de palier de zoom (organite ~1 µm → crête ~100 nm → moléculaire ~10 nm) est annoncé à l'écran (ex. « ×100 »).
- On suit **une seule** molécule de palmitate du début à la fin ; compteurs persistants à l'écran : acétyl-CoA, NADH, FADH₂, H⁺ pompés, O₂ consommé, ATP.

## Méthode de travail / Définition de « terminé »
Le projet avance par phases (plan détaillé proposé séparément, hors de ce fichier, et validé avant chaque démarrage). Une phase n'est considérée terminée que si :
1. zéro erreur dans la console navigateur ;
2. tests Vitest verts ;
3. vérification visuelle effectuée (captures d'écran si un outil de navigateur est disponible, sinon indications précises pour une vérification manuelle par l'utilisateur) ;
4. relecture du contenu produit contre les règles scientifiques ci-dessous ;
5. commit + résumé court ;
6. puis **attente du feu vert** avant de continuer.

En cas de doute scientifique : ne rien inventer, poser la question.

## Règles scientifiques (non négociables)
1. Les H⁺ ne sont JAMAIS transformés en ATP. Leur reflux à travers Fo fait tourner le rotor, et c'est cette énergie qui permet ADP + Pi → ATP dans F1. Les H⁺ ressortent dans la matrice.
2. Un acide gras à longue chaîne n'entre dans la matrice que par activation en acyl-CoA, puis par la navette carnitine (CPT1 → CACT → CPT2).
3. La β-oxydation a lieu dans la matrice. Chaque tour produit 1 FADH₂, 1 NADH et 1 acétyl-CoA, et raccourcit la chaîne de 2 C.
4. Les électrons du FADH₂ de la β-oxydation passent par l'ETF puis l'ETF-QO jusqu'à l'ubiquinone, jamais par le complexe II. Le complexe II (succinate déshydrogénase) traite le FADH₂ du cycle de Krebs.
5. Pompage vers l'espace intermembranaire, pour 2 e⁻ : I = 4 H⁺, III = 4 H⁺, IV = 2 H⁺ ; II et ETF-QO = 0. Soit 10 H⁺ par NADH et 6 par FADH₂.
6. Les électrons passent toujours de transporteur en transporteur : (I | II | ETF-QO) → Q → III → cyt c → IV → O₂. Réaction finale côté matrice : ½ O₂ + 2 H⁺ + 2 e⁻ → H₂O.
7. L'ubiquinone diffuse dans la membrane interne ; le cytochrome c se déplace côté espace intermembranaire.
8. ATP synthase : Fo dans la membrane interne, tête F1 dans la matrice. Le rotor (anneau c à 8 sous-unités chez les mammifères + axe γ) est mobile, le stator est fixe. L'ATP est exporté par l'ANT en échange d'ADP.
9. La force proton-motrice combine un gradient de pH (matrice plus basique) et un potentiel électrique (matrice négative), ce dernier étant majoritaire. Elle s'exerce de part et d'autre de la membrane INTERNE.
10. Les bilans sont paramétrables dans la config.
    - Par défaut : P/O = 2,5 (NADH) et 1,5 (FADH₂), soit environ 4 H⁺ par ATP transport compris. Palmitate = 106 ATP nets.
    - Option « anciennes valeurs » : P/O = 3 et 2. Palmitate = 129 ATP.
11. En cas de doute scientifique : ne rien inventer, me poser la question.
