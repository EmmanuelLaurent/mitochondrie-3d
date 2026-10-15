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
- `npm install` — installer les dépendances
- `npm run dev` — serveur de développement (http://localhost:5173)
- `npm run build` — typecheck + build de production (`dist/`)
- `npm run preview` — prévisualiser le build de production
- `npm run test` — tests Vitest
- Déploiement : automatique sur push vers `master` (`.github/workflows/deploy.yml` → GitHub Pages, https://emmanuellaurent.github.io/mitochondrie-3d/)

Vérification visuelle : en dev uniquement, `window.__app` expose `sceneManager`, `quality` et `journey` pour placer la caméra avant une capture (`sceneManager.activeCamera.position.set(...)` puis `sceneManager.invalidate()`). Absent du build de prod.

## Architecture
- **SceneManager** : machine à états pilotant la scène active. Chaque scène est un module implémentant un cycle de vie `enter() / update(dt) / exit()`.
- **Un module par scène** (`src/scenes/sceneX-*/`), responsable de son propre contenu 3D, de ses étiquettes/info-bulles, et de son nettoyage mémoire complet à la sortie (`exit()` libère géométries, matériaux, textures).
- **`content/fr.json`** : unique source de tous les textes pédagogiques (narration, étiquettes, info-bulles, quiz). Jamais de texte pédagogique en dur dans le code.
- **Fichier de config scientifique unique** (`src/config/science.config.ts`) : toutes les constantes scientifiques (stœchiométries, convention P/O, stœchiométrie de pompage H⁺, échelles de zoom, etc.). Aucune valeur scientifique en dur ailleurs dans le code.
- **Mode Labo** : modèle d'état qualitatif en logique pure (`src/labo/`), découplé du rendu, testé avec Vitest.
- **AssetLoader** : abstraction de chargement permettant de remplacer plus tard un modèle procédural par un `.glb` (ex. structure PDB exportée depuis ChimeraX) sans changer le code appelant. Cible : les modèles moléculaires (complexes, ATP synthase), pas l'organite.
- **Organite (vue d'ensemble)** : rendu par raymarching d'un champ de distance signée (`src/scenes/scene1-exterior/mitochondrionSdf.ts`), pas par maillages. C'est ce qui donne des crêtes continues avec la membrane interne (la lumière des crêtes communique avec l'espace intermembranaire) et une coupe « en escalier » avec de vraies faces de section. Dimensions stylisées dans `MITO` ; agencement des crêtes déterministe (PRNG à graine fixe, utile pour l'export vidéo image par image).
- **Rendu progressif** (`SceneManager` + `src/core/PostProcessing.ts`) : une scène peut implémenter `needsRender()`. Quand la vue change, une image rapide (1 échantillon/pixel) ; quand elle est immobile, accumulation de 48 images décalées d'un sous-pixel (avec éclairage stochastique : lumière surfacique, ombres de contre-jour, translucidité) moyennées en HDR, puis le GPU s'arrête. Chaîne : scène → accumulation → bloom (reflets seulement) → OutputPass (tone mapping + sRGB) → finition (vignette, grain léger, dither).
- **Régulateur de performance** (`src/core/PerformanceGovernor.ts`) : passe automatiquement en qualité basse si l'interaction tombe sous ~30 i/s.
- **Palette des compartiments** (`src/config/palette.ts`) : source unique des couleurs de compartiments pour les shaders et la légende.
- **Particules** : `InstancedMesh` pour tout élément répété en nombre (H⁺, e⁻, petites molécules).
- **Réglage de qualité** bas/haut, appliqué globalement (résolution plafonnée, pas de raymarching, ombres, échantillons accumulés).
- **Chapitres et modes** : barre de chapitres en haut ; registre des scènes dans `src/main.ts`. Exploration libre = la scène joue sa première étape puis l'élève avance ; visite guidée = lecture continue puis chapitre suivant.
- **Scènes narrées** (`src/ui/player/StepPlayer.ts`) : une timeline GSAP par scène, avec une étiquette par étape ; lecture/pause, étape par étape, vitesse, clavier (Espace, ← →, Début/Fin), `prefers-reduced-motion` = saut direct à l'état final de chaque étape.
- **Chorégraphie en fonctions pures du temps** (`src/scenes/shared/molecular/choreography.ts`, `story.ts` de chaque scène) : chaque position, conformation, nom et compteur se calcule à partir du temps de la timeline (jamais par un événement), si bien que pause, retour arrière, saut d'étape et export vidéo image par image donnent toujours la même image et des compteurs justes. Chaque étape se termine par un « arrêt » immobile (3,5 s) : un test Vitest le vérifie pour chaque scène.
- **Échelle moléculaire** (scènes 2 à 5) : boîte à outils commune dans `src/scenes/shared/molecular/` (repère et coupe `frame.ts`, membranes `membrane.ts`, milieux de Beer-Lambert analytiques `media.ts` comme l'espace intermembranaire de la scène 1, billes `beads.ts` et `proteinKit.ts`, petites molécules `molecules.ts`, studio d'éclairage `stage.ts`, organite pour les changements de palier `organelle.ts`, caméra `camera.ts`, étiquettes `labels.ts`, HUD `hud.ts`, bande libre au-dessus du panneau de narration `framing.ts`). 1 unité = 1 nm ; chaque scène n'écrit que son décor (`layout.ts`), ses protéines et son storyboard (`story.ts`). Lipides, protéines et petites molécules en billes (protéines procédurales stylisées, pas de structure PDB).

## Conventions
- **Direction artistique** : modélisation procédurale stylisée, volontairement **non photoréaliste**. Ce parti pris s'applique à toutes les scènes et reste valable même après un remplacement d'un modèle procédural par un `.glb` (voir `AssetLoader` ci-dessus), sauf décision explicite contraire. Habillage visuel (validé phase 1, voir scène 1) :
  - fond sombre/cinématique (dégradé profond, jamais blanc/crème) ;
  - éclairage 3 points (clé chaude, fill froid, contre-jour cyan), occlusion ambiante et ombres douces, tone mapping ACES Filmic, pour un look « rendu produit » plutôt que plat ;
  - coupes « en escalier » (chaque couche coupée à une profondeur différente) plutôt que tranches plates, pour que les volumes se lisent ;
  - UI en panneaux « verre dépoli » (fond sombre translucide + `backdrop-filter: blur`), coins de visée façon instrument scientifique, accent cyan/corail ;
  - **le plus beau rendu possible, mais sobre et fluide** (retour utilisateur : « pas trop abusé », et ça ramait sur une RX 7900 XTX) : pas d'effet gratuit. Proscrits en scène pédagogique : particules décoratives (seraient prises pour des H⁺/O₂/e⁻), « respiration » ou pulsation de l'organite (renforce l'idée fausse « la mitochondrie respire »), aberration chromatique (fausses franges sur un code couleur), flou de profondeur sur des structures étiquetées ; bloom réservé aux reflets.
  - **lisibilité d'abord** : l'organite doit être reconnaissable au premier coup d'œil (haricot allongé, crêtes = replis de la membrane interne, coupe qui montre le volume). Vérifier chaque scène sous plusieurs angles.
  - **scènes narrées** : chaque étape suit le rythme annonce → action → arrêt ; les déplacements vers l'enzyme suivante ouvrent l'étape suivante, pour que chaque étape se termine sur un état fixe lisible (c'est aussi là que le rendu progressif affine l'image). Une protéine n'est étiquetée que lorsqu'elle agit ; la protéine active reste éclairée, les autres passent en retrait.
  - **échelle moléculaire** : protéines d'une seule couleur neutre et mate (sauge) ; molécules brillantes, chacune avec sa silhouette (voir la légende) ; le nom de la molécule suivie change seulement quand une enzyme la transforme.
- Code, noms de variables/fonctions, commentaires : **en anglais**.
- Tout texte visible par l'utilisateur : **en français**, dans `content/fr.json`, jamais en dur.
- TypeScript strict (`"strict": true`), pas de `any` non justifié.
- **Accessibilité** :
  - palette lisible par les daltoniens ; aucune information portée par la seule couleur — toujours une forme ou un motif distinct en complément ;
  - respect de `prefers-reduced-motion` ;
  - navigation clavier complète ;
  - textes à taille lisible, contrastes suffisants.
- **Performance** :
  - l'interaction doit rester fluide partout : en mouvement, ~8 ms/image en 2560×1250 sur une GPU haut de gamme (mesuré scène 1, RX 7900 XTX) ; les machines plus faibles basculent automatiquement en qualité basse sous ~30 i/s ;
  - la qualité « offline » vient de l'accumulation à l'arrêt, pas d'images individuelles coûteuses ;
  - résolution plafonnée à 1,5× (haute) / 1× (basse) ;
  - libération explicite de la mémoire (géométries, matériaux, textures) à la sortie de chaque scène.
- **Étiquettes** : « callouts » numérotés de l'extérieur vers l'intérieur (1 membrane externe → 4 matrice), avec trait de rappel et point posé sur la structure, pour ne jamais masquer ce qu'elles nomment ; survol/focus clavier d'une étiquette = la structure ressort en 3D, le reste passe en gris.
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
