# SPEC — Storyboard « Mitochondrie 3D interactive »

Ce document décrit le **contenu pédagogique et fonctionnel** de chaque scène : ce qui doit être montré, dit et manipulable. Il ne contient pas le texte final des narrations/étiquettes/quiz (qui vivent dans `content/fr.json`), ni le plan d'implémentation par phases (proposé séparément).

Les règles scientifiques non négociables citées ici sont définies une seule fois dans [CLAUDE.md](../CLAUDE.md#règles-scientifiques-non-négociables) ; ce document y renvoie plutôt que de les dupliquer.

**Direction artistique** (rappel de [CLAUDE.md](../CLAUDE.md)) : toutes les scènes adoptent un rendu procédural stylisé, volontairement **non photoréaliste** — look « planche de manuel de biologie en 3D ». Aucune scène ci-dessous ne doit viser le photoréalisme, y compris quand un `.glb` remplacera un modèle procédural.

## 0. Fil rouge et codes visuels

### Fil rouge
On suit **une seule** molécule de palmitate du cytosol jusqu'aux ATP produits. Des compteurs persistants, visibles en permanence à l'écran, s'incrémentent au fil du parcours :

| Compteur | S'incrémente dans |
|---|---|
| Acétyl-CoA | Scène 3 (β-oxydation) |
| NADH | Scène 3 (β-oxydation, y compris le cycle de Krebs en boîte noire) |
| FADH₂ | Scène 3 (β-oxydation, y compris le cycle de Krebs en boîte noire) |
| H⁺ pompés | Scène 4 (chaîne respiratoire) |
| O₂ consommé | Scène 4 (chaîne respiratoire) |
| ATP | Scène 5 (ATP synthase) |

### Légende — proposition initiale (à valider)
Code couleur + forme constant du début à la fin. La couleur seule ne porte jamais l'information : chaque élément a aussi une forme distincte. Palette de départ inspirée d'Okabe-Ito (sûre pour les daltonismes courants) :

| Élément | Couleur indicative | Forme distincte |
|---|---|---|
| e⁻ (électron) | jaune | petit éclair/étoile |
| H⁺ (proton) | vermillon | petite sphère pleine |
| NADH | bleu | capsule arrondie |
| FADH₂ | bleu-vert | capsule arrondie, bande distincte de NADH |
| ATP | pourpre | hexagone complet |
| ADP | pourpre clair, contour seul | hexagone tronqué (un « bras » en moins) |
| O₂ | bleu ciel | paire de sphères accolées |
| Acétyl-CoA | orange | losange |
| Chaîne carbonée (acyl/palmitate) | gris foncé/noir | chaîne de segments reliés |

Une légende reste accessible en permanence (panneau rappelable). **Cette palette est une proposition de départ, à ajuster avec l'enseignant·e si besoin.**

### Échelles
Barre d'échelle toujours visible. Trois paliers de zoom, chaque changement de palier étant annoncé à l'écran (ex. « ×100 ») :
1. **Organite** (~1 µm) — scènes 1 et 2.
2. **Crête** (~100 nm) — scènes 3 et 4.
3. **Moléculaire** (~10 nm) — scènes 4 (détail du trajet des électrons) et 5.

### Simplifications pédagogiques
Toute simplification (ex. cycle de Krebs en boîte noire) est signalée explicitement dans l'info-bulle concernée, jamais silencieuse.

## 1. Vue extérieure (cytosol)
- Mitochondrie en forme de haricot, orbite libre à la souris/au clavier.
- Plan de coupe activable, qui révèle progressivement : membrane externe → espace intermembranaire → membrane interne repliée en crêtes → matrice.
- Étiquettes + info-bulles sur chaque structure.
- Info-bulle : dans la cellule, les mitochondries forment souvent un réseau dynamique (fusion/fission), pas des organites isolés figés.
- **Message clé de la scène** : deux membranes, deux compartiments.

## 2. Entrée de l'acide gras (navette carnitine)
Transition de zoom vers la membrane externe ; la caméra s'attache au palmitate.

Étapes du trajet, dans l'ordre :
1. **Activation** en palmitoyl-CoA par l'acyl-CoA synthétase, côté cytosolique. Coût affiché : ATP → AMP + PPi (équivalent à 2 ATP).
2. **CPT1** (membrane externe) : palmitoyl-CoA → palmitoylcarnitine. Passage dans l'espace intermembranaire.
3. **CACT** (membrane interne) : antiport palmitoylcarnitine / carnitine.
4. **CPT2** (face matricielle de la membrane interne) : palmitoylcarnitine → palmitoyl-CoA, carnitine libérée.
- Sortie dans la matrice : plan large qui révèle les crêtes tout autour.
- **Message clé** : un acide gras à longue chaîne ne traverse pas seul la membrane interne.
- Info-bulles :
  - les acides gras à chaîne courte/moyenne entrent sans navette ;
  - CPT1 est l'étape limitante du flux, inhibée par le malonyl-CoA (signal de synthèse active des acides gras).

## 3. β-oxydation (matrice)
Hélice de Lynen. Un tour = 4 réactions, dans l'ordre :
1. **Acyl-CoA déshydrogénase** → 1 FADH₂.
2. **Énoyl-CoA hydratase** (hydratation).
3. **3-hydroxyacyl-CoA déshydrogénase** → 1 NADH.
4. **Thiolase** → libère 1 acétyl-CoA, chaîne raccourcie de 2 carbones.

Déroulé scénique :
- Les 2 premiers tours sont montrés en détail (les 4 réactions visibles, compteurs incrémentés en direct).
- Les tours suivants sont accélérés, seuls les compteurs défilent.
- **Bilan pour le palmitate (C16)** : 7 tours → 8 acétyl-CoA, 7 FADH₂, 7 NADH (le dernier tour, sur un composé en C4, libère directement 2 acétyl-CoA).
- Les acétyl-CoA entrent ensuite dans le **cycle de Krebs**, représenté en **boîte noire** (simplification signalée explicitement). Par acétyl-CoA entrant : 3 NADH, 1 FADH₂ (via le complexe II), 1 GTP, 2 CO₂ libérés.

## 4. Chaîne respiratoire (membrane des crêtes)
Vue en coupe de la membrane interne : matrice d'un côté, espace intermembranaire de l'autre.

Éléments présents à l'écran :
- Complexes I, II, III, IV, et ETF-QO.
- Pool d'ubiquinone (Q), mobile dans l'épaisseur de la membrane.
- Cytochrome c, mobile côté espace intermembranaire.

Déroulé scénique :
1. Trajet détaillé des électrons d'**un** NADH donné : I → Q → III → cyt c → IV → O₂ (voir règle de routage en [CLAUDE.md](../CLAUDE.md#règles-scientifiques-non-négociables), règle 6 ; le FADH₂ de la β-oxydation route via ETF-QO, règle 4).
2. Puis bascule en **mode flux** : beaucoup d'électrons/NADH/FADH₂ en continu, compteurs H⁺ pompés et O₂ consommé qui défilent.
- Les H⁺ pompés s'accumulent côté espace intermembranaire ; le gradient est visualisé (densité de particules H⁺ + jauge numérique).
- L'O₂ est réduit en H₂O côté matrice (réaction affichée : ½ O₂ + 2 H⁺ + 2 e⁻ → H₂O).

## 5. ATP synthase
- Les H⁺ refluent de l'espace intermembranaire vers la matrice à travers Fo (jamais transformés en ATP — ce sont des porteurs d'énergie mécanique, cf. règle 1).
- Convention visuelle : chaque H⁺ qui traverse Fo fait avancer l'anneau c d'un cran. Après 8 crans — un tour complet du rotor —, 3 ATP ont été synthétisés dans F1. C'est une corrélation de rotation, pas une conversion chimique : les H⁺ ne deviennent jamais de l'ATP (règle 1).
- Le rotor — anneau c et axe γ, un seul bloc mobile — tourne d'une seule pièce, entraîné par le reflux des H⁺ à travers Fo, à l'intérieur de la tête α₃β₃ fixe (dans la matrice). Les sous-unités β changent de conformation au passage de γ : ADP + Pi → ATP. Le stator reste fixe (ancré à la membrane et à la tête).
- Transports associés, montrés comme des portes distinctes :
  - le Pi entre dans la matrice avec un H⁺ (transporteur de phosphate) ;
  - l'ATP sort vers le cytosol via l'**ANT**, en échange d'un ADP entrant.
- Vue de synthèse : circuit fermé des protons — pompés par I, III et IV vers l'espace intermembranaire, ils reviennent à la matrice uniquement via l'ATP synthase.

## 6. Bilan et quiz final
Pour **1 palmitate**, affichage d'un récapitulatif chiffré (valeurs par défaut, convention P/O = 2,5/1,5 — voir [CLAUDE.md](../CLAUDE.md), règle 10) :
- 8 acétyl-CoA, 31 NADH, 15 FADH₂, 8 GTP ;
- 16 CO₂ libérés, 23 O₂ consommés ;
- 400 H⁺ pompés ;
- **106 ATP nets**.

Un bouton/réglage permet de basculer vers la convention « anciennes valeurs » (P/O = 3/2 → 129 ATP), sans changer la mise en scène, uniquement les nombres (config unique, voir architecture).

Quiz final : 2-3 QCM supplémentaires portant sur l'ensemble du parcours.

## Quiz (toutes scènes)
Chaque scène (1 à 6) se termine par 2-3 QCM avec correction expliquée. Le texte des questions/réponses/corrections vit dans `content/fr.json`, marqué `"needsTeacherReview": true` (« à faire valider par un enseignant »).

## Mode Labo
Panneau d'inhibiteurs activables (seuls ou combinés) + curseur « ADP disponible ». Jauges affichées en continu : flux d'électrons, consommation d'O₂, gradient de H⁺, production d'ATP, chaleur.

Modèle qualitatif (pas une simulation biophysique), mais cohérent dans toutes les combinaisons :

| Condition | Flux d'électrons | O₂ consommé | Gradient H⁺ | ATP | Chaleur |
|---|---|---|---|---|---|
| Normal | nominal | nominal | nominal | nominal | basse |
| Roténone (bloque I) | réduit (NADH bloqué ; entrée FADH₂ via ETF-QO continue) | diminue, non nul | diminue, non nul | diminue, non nul | basse |
| Antimycine A (bloque III) | nul (plus aucun flux jusqu'à l'O₂) | 0 | 0 (pompage nul) | → 0 | basse |
| Cyanure (bloque IV) | nul (plus aucun flux jusqu'à l'O₂) | 0 | 0 (pompage nul) | → 0 | basse |
| Oligomycine (bloque Fo) | ralentit (contrôle respiratoire : gradient saturé freine la chaîne) | chute | monte (maximal) | 0 | basse |
| DNP (découplant) | au maximum | au maximum | s'effondre | ≈ 0 | augmente |
| Oligomycine + DNP | remonte (le découplant contourne le blocage de Fo) | remonte | s'effondre | 0 | augmente |
| ADP faible | ralentit (ATP synthase moins sollicitée) | diminue | monte | diminue | basse |

Info-bulle sur DNP : la thermogénine (UCP1) du tissu adipeux brun réalise naturellement le même découplage (production de chaleur).

Chaque ligne de ce tableau fait l'objet d'un test Vitest sur le modèle de logique pure du mode Labo.
