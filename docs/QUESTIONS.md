# Questions ouvertes (à valider par un·e enseignant·e)

Pendant le développement, chaque doute scientifique ou pédagogique a reçu un **choix provisoire prudent** (version des manuels de licence, signalée dans l'info-bulle concernée quand c'est une simplification). Cette liste les rassemble pour validation. Pour changer un choix : les textes sont dans [`content/fr.json`](../content/fr.json), les valeurs dans [`src/config/science.config.ts`](../src/config/science.config.ts).

Légende : **Choix actuel** = ce que montre l'application aujourd'hui.

## Chapitre 2 — Entrée de l'acide gras

1. **Topologie de la CPT1.** Site actif tourné vers le cytosol (données de topologie, Fraser et al. 1997) : c'est donc la palmitoylcarnitine qui franchit la membrane externe, probablement par les porines. Lehninger laisse la question ouverte (palmitoyl-CoA ou palmitoylcarnitine).
   **Choix actuel** : site cytosolique ; l'info-bulle « Porine » signale que ce passage reste mal connu.
2. **Vocabulaire du cours.** CPT1/CPT2 ou carnitine acyltransférase I/II (CAT I/II, Lehninger) ? Acyl-CoA synthétase (ACS/ACSL) ou thiokinase ? CACT ou « translocase acylcarnitine/carnitine » ?
   **Choix actuel** : CPT1, CPT2, CACT, « acyl-CoA synthétase (ACS) » ; « thiokinase » cité dans l'info-bulle.
3. **« Un acide gras à longue chaîne ne traverse pas seul la membrane interne »** (règle 2). Un acide gras libre protoné peut pourtant traverser une bicouche (« flip-flop ») ; la raison physiologique de la navette est l'absence de transporteur d'acyl-CoA et d'activation des chaînes longues dans la matrice. Faut-il nuancer (« n'entre pas dans la matrice pour y être oxydé sans la navette ») ?
   **Choix actuel** : formulation du manuel, sans nuance.
4. **Ordre des étapes.** Le storyboard montre la CPT1 avant « La vraie barrière » (le « pourquoi » vient après le « comment »). Préférez-vous présenter la barrière d'abord ?
   **Choix actuel** : ordre du storyboard (SPEC §2).
5. **Coût d'activation au compteur.** Le compteur « ATP (bilan net) » passe à −2 d'un coup quand l'ATP est coupé en AMP + PPi. Variante : −1 à la coupure, −1 à l'hydrolyse du PPi par la pyrophosphatase.
   **Choix actuel** : −2 d'un coup (le coût = reformer l'ATP à partir de l'AMP).
6. **Intermédiaire acyl-adénylate.** Pendant l'activation, la molécule suivie est nommée « Activation… · C16 ». Faut-il afficher « palmitoyl-AMP » ?
   **Choix actuel** : non nommé à l'écran ; l'info-bulle « Acyl-CoA synthétase » décrit les deux temps de la réaction.
7. **Facteurs de zoom annoncés.** Les badges annoncent « Zoom × 100 » puis « Zoom ÷ 10 » (rapports entre paliers : organite ~1 µm, crête ~100 nm, moléculaire ~10 nm). La barre d'échelle, elle, change d'environ ×37 pendant la plongée et ÷42 à la fin (le champ final fait ~400 nm). Garder les rapports de paliers, écrire « environ », ou régler les distances de caméra ?
   **Choix actuel** : rapports de paliers ; la barre d'échelle reste une vraie règle.
8. **Passage CACT → CPT2.** Une association CACT–CPT2 est discutée. L'animation fait sortir la palmitoylcarnitine libre dans la matrice, puis l'amène à la CPT2 au début de l'étape suivante.
   **Choix actuel** : passage par la matrice (pas de canalisation directe).
9. **Largeur de l'espace intermembranaire** dessinée à ~16 nm (mesures en cryo-tomographie : ~10–20 nm).
   **Choix actuel** : signalée « approximative » dans l'info-bulle.
10. **Seuil des chaînes courtes/moyennes** (« jusqu'à environ 12 carbones », sans navette, surtout dans le foie).
    **Choix actuel** : formulation Lehninger, dans l'info-bulle « Chaînes courtes et moyennes ».

## Chapitre 3 — β-oxydation et cycle de Krebs

11. **Où compter les 8 GTP du cycle de Krebs ?** Le SPEC (§0) ne fait bouger le compteur d'ATP qu'aux chapitres 2 et 5. Compter les GTP au chapitre 3 (au moment où ils sont formés) est chronologique, et le chapitre 5 n'ajoute alors que les ATP de l'ATP synthase ; les attendre au chapitre 5 laisserait croire que l'ATP synthase les fabrique.
    **Choix actuel** : compté au chapitre 3 (bilan net −2 → +6), avec la mention « GTP du cycle de Krebs (≈ ATP) » sous le compteur. Total inchangé : 106 (ou 129).
12. **ETF à un électron.** L'ETF transporte en réalité les électrons un par un (deux ETF par FADH₂). Dessiné comme un seul trajet portant 2 e⁻.
    **Choix actuel** : simplification signalée dans l'info-bulle.
13. **Protéine trifonctionnelle** : α₂β₂ (structures récentes) ou α₄β₄ (anciens manuels).
    **Choix actuel** : aucun nombre de sous-unités affiché ; pas de canalisation de substrat revendiquée.
14. **Relais à 12 carbones** des enzymes membranaires (VLCAD, TFP) vers les enzymes solubles de la matrice (spécificités en réalité chevauchantes).
    **Choix actuel** : relais à C12, enzymes solubles nommées collectivement.
15. **Regroupement des enzymes** (CPT2, VLCAD, TFP, ETF-QO proches : « métabolon » discuté).
    **Choix actuel** : proximité présentée comme un choix de mise en page.
16. **Équation nette du cycle de Krebs** avec 2 H⁺ (Lehninger/Stryer) ; les H⁺ de la matrice ne sont jamais dessinés (les billes vermillon restent réservées aux H⁺ pompés).
17. **FAD du complexe II** lié de façon covalente : la comptabilité « 1 FADH₂ » des manuels est conservée.
18. **Palier de zoom du chapitre 3** : le SPEC le place au palier « crête » ; compter les 16 carbones demande le palier moléculaire.
    **Choix actuel** : × 10 vers le palier moléculaire, puis ÷ 10 à la fin.

## Chapitre 4 — Chaîne respiratoire

19. **NADH et FADH₂ au compteur** : ils restent à 31 et 15 (bilan de production, cohérent avec le chapitre 6) ; leur réoxydation est montrée par une jauge locale (n/31, n/15).
20. **O₂ consommé** compté en molécules entières : un O₂ toutes les 2 paires d'électrons arrivées au complexe IV (jamais de « demi-O₂ » dessiné).
21. **Complexe IV** : ordre réel respecté (2 électrons, puis fixation de l'O₂) ; étapes internes et site actif enfoui simplifiés.
22. **Force proton-motrice** : Δψ ≈ 150–180 mV, ΔpH ≈ 0,5–0,75 (Lehninger : ΔpH ≈ 0,75 ; Δψ 0,15–0,2 V). Valeurs typiques, variables.
23. **Pompage du complexe I** : mécanisme encore discuté ; dessiné comme 4 canaux dans le bras membranaire.
24. **400 billes de H⁺** accumulées dans l'espace intermembranaire, alors que les vrais H⁺ sont tamponnés et refluent en continu.
    **Choix actuel** : simplification signalée (« 1 bille = 1 H⁺ »).

## Chapitre 5 — ATP synthase

25. **Retour des H⁺.** Le SPEC dit « uniquement via l'ATP synthase », mais le Pi entre avec un H⁺ et des fuites existent (découplants, thermogénine).
    **Choix actuel** : « par l'ATP synthase et avec le Pi » ; les fuites sont citées dans une info-bulle et dans le mode Labo.
26. **« Environ 4 H⁺ par ATP »** : 8/3 ≈ 2,7 H⁺ par Fo + ~1 H⁺ pour le transport ≈ 3,7, arrondi à ~4 (P/O 2,5 et 1,5). La convention « anciennes valeurs » (P/O 3 et 2) n'a pas de rapport H⁺/ATP unique.
27. **Sens de rotation** pendant la synthèse : rappelé de mémoire, non vérifié ; gardé constant.
28. **Géométrie du dimère** (angle ~86°, levure) et position de la sous-unité a et du bras latéral : stylisées.
29. **Désaccord de symétrie 8/3** absorbé en réalité par l'élasticité du rotor : dessiné comme un rotor rigide libérant un ATP à 120°, 240° et 360°.
30. **Axe central** γ + δ + ε chez les mammifères : étiqueté « axe γ », δ et ε cités dans l'info-bulle.
31. **Transporteurs (Pi, ANT) proches de l'ATP synthase** (« synthasome » discuté) : rapprochés pour la lisibilité, signalé.

## Général

32. **Polices de caractères.** Les polices sont chargées depuis Google Fonts, ce qui transmet l'adresse IP des élèves à Google (point RGPD).
    **Prévu** : les héberger avec l'application (licence SIL OFL) en phase 8.
