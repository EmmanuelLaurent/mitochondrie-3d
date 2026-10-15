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
| ATP (bilan net) | Scène 2 (activation : −2, une seule fois, au moment où l'ATP est coupé en AMP + PPi), puis scène 5 (ATP synthase) |

### Légende — proposition initiale (à valider)
Code couleur + forme constant du début à la fin. La couleur seule ne porte jamais l'information : chaque élément a aussi une forme distincte. Palette de départ inspirée d'Okabe-Ito (sûre pour les daltonismes courants) :

| Élément | Couleur indicative | Forme distincte |
|---|---|---|
| e⁻ (électron) | jaune | petit éclair/étoile |
| H⁺ (proton) | vermillon | petite sphère pleine |
| NADH | bleu | capsule arrondie |
| FADH₂ | bleu-vert | capsule arrondie, bande distincte de NADH |
| ATP | pourpre | hexagone plein + 3 tétraèdres ivoire (un par phosphate) |
| ADP | pourpre clair | hexagone évidé (contour) + 2 tétraèdres |
| AMP | pourpre très clair | hexagone évidé + 1 tétraèdre |
| PPi / Pi | ivoire | 2 tétraèdres liés / 1 tétraèdre (jamais des sphères, réservées à H⁺ et O₂) |
| O₂ | bleu ciel | paire de sphères accolées |
| Acétyl-CoA | orange | losange |
| Chaîne carbonée (acyl/palmitate) | graphite (#707884, éclairci pour rester lisible sur le fond sombre) | chaîne de 16 billes reliées en zigzag |
| Coenzyme A (CoA) | sable doré | « clé » : tête ronde, long bras, extrémité –SH ocre (jamais le losange de l'acétyl-CoA) |
| Carnitine | violet pervenche | petite tête en trèfle (triméthylammonium) |
| Protéines (enzymes, transporteurs, canaux) | sauge neutre, mat | formes propres à chacune + étiquette ; la couleur reste aux molécules |

Une légende reste accessible en permanence (panneau rappelable). **Cette palette est une proposition de départ, à ajuster avec l'enseignant·e si besoin.**

### Échelles
Barre d'échelle toujours visible. Trois paliers de zoom, chaque changement de palier étant annoncé à l'écran (ex. « ×100 ») :
1. **Organite** (~1 µm) — scène 1 ; début de la scène 2 (plongée « × 100 » vers la membrane externe).
2. **Crête** (~100 nm) — fin de la scène 2 (« ÷ 10 » : le palmitoyl-CoA entre les crêtes, en coupe) ; scènes 3 et 4.
3. **Moléculaire** (~10 nm) — scène 2 (navette carnitine) ; scènes 4 (détail du trajet des électrons) et 5.

### Simplifications pédagogiques
Toute simplification (ex. cycle de Krebs en boîte noire) est signalée explicitement dans l'info-bulle concernée, jamais silencieuse.

## 1. Vue extérieure (cytosol)
- Mitochondrie en forme de haricot légèrement arqué, environ 3 fois plus longue que large ; orbite libre à la souris/au clavier.
- Membranes et espace intermembranaire fins autour d'une grande matrice ; crêtes = replis de la membrane interne qui s'enfoncent dans la matrice (en coupe : doigts en U dont la lumière communique avec l'espace intermembranaire).
- Plan de coupe activable (curseur), qui révèle progressivement : membrane externe → espace intermembranaire → membrane interne repliée en crêtes → matrice. Coupe « en quart » et « en escalier » : chaque couche est coupée à une profondeur légèrement différente (la matrice en retrait, les crêtes en saillie), pour que le volume intérieur se lise.
- À l'arrivée, la coupe s'ouvre seule en ~2 s pour montrer immédiatement les crêtes (directement ouverte, sans animation, si `prefers-reduced-motion`). L'élève peut ensuite la refermer ou l'ouvrir avec le curseur.
- Étiquettes en « callouts » numérotés de l'extérieur vers l'intérieur (1 membrane externe, 2 espace intermembranaire, 3 membrane interne et crêtes, 4 matrice), pastille colorée comme le compartiment, trait de rappel et point posé sur la structure ; les étiquettes des structures internes n'apparaissent qu'une fois la coupe suffisamment ouverte. Clic = info-bulle.
- Survol ou focus clavier d'une étiquette : la structure correspondante ressort, le reste passe en gris. En particulier, survoler « Espace intermembranaire » montre d'un coup que c'est un seul compartiment qui se prolonge dans chaque crête.
- Compartiments codés couleur **et** texture (bicouche en coupe pour les membranes, liquide translucide pour l'espace intermembranaire, granules pour la matrice), repris dans la légende (groupe « Compartiments »). Les couleurs sont conventionnelles et signalées comme telles.
- Barre d'échelle : une vraie règle qui suit le zoom (ex. « 500 nm »), calibrée sur un diamètre d'organite d'environ 1 µm (à valider par l'enseignant·e).
- Info-bulle : dans la cellule, les mitochondries forment souvent un réseau dynamique (fusion/fission), pas des organites isolés figés.
- Simplifications signalées dans les info-bulles : épaisseurs des membranes très exagérées, crêtes régularisées, granules de la matrice stylisés.
- **Message clé de la scène** : deux membranes, deux compartiments.

## 2. Entrée de l'acide gras (navette carnitine)
Plongée continue « × 100 » depuis la vue de la scène 1 : l'organite se fond dans un décor moléculaire au même endroit (bord de la coupe). Décor en coupe, à peu près à l'échelle (bicouches ~5 nm, espace intermembranaire ~16 nm, protéines 5–7 nm) : cytosol en haut, membrane externe, espace intermembranaire, membrane interne, matrice en bas ; la porine et la CACT sont tranchées par la coupe pour qu'on voie la molécule les traverser. La caméra suit le palmitate (viseur cyan + nom qui change à chaque enzyme) ; l'élève peut tourner autour à tout moment.

Huit étapes, chacune en trois temps (annonce, action, arrêt sur un état fixe lisible) :
1. **Changement d'échelle** (× 100) : couches nommées sur la coupe.
2. **Notre palmitate** (C16, tête carboxylate) : « Peut-il entrer seul dans la matrice ? ».
3. **Activation (côté cytosol)** par l'acyl-CoA synthétase : ATP → AMP + PPi (le PPi part, puis le CoA remplace l'AMP), PPi → 2 Pi par la pyrophosphatase. Compteur ATP : −2 en une fois, au moment de la coupure.
4. **CPT1 (membrane externe)** : palmitoyl-CoA → palmitoylcarnitine ; le CoA reste dans le cytosol ; passage dans l'espace intermembranaire par une porine (simplification signalée : voie exacte discutée).
5. **La vraie barrière** : la membrane interne (tout le reste en retrait) ; encart « Ce qui n'arrive pas ».
6. **CACT : l'échange** (antiport, accès alterné, une molécule à la fois) : la palmitoylcarnitine entre, une carnitine libre sort.
7. **CPT2 (face matricielle)** : un CoA de la matrice remplace la carnitine ; la carnitine libérée repart vers la CACT.
8. **Dans la matrice** (« ÷ 10 ») : le palmitoyl-CoA entre les crêtes, vues en coupe ; carte « À retenir » (trajet, boucle de la carnitine, deux réserves de CoA).
- **Message clé** : un acide gras à longue chaîne ne traverse pas seul la membrane interne.
- Info-bulles : acides gras courts/moyens sans navette ; CPT1 étape limitante, inhibée par le malonyl-CoA ; coût de 2 ATP expliqué ; deux réserves de CoA ; carnitine recyclée ; simplifications (formes stylisées, trajets lissés, proportions approximatives).

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
