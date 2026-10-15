# Mitochondrie 3D interactive

Application web 3D qui fait suivre à un·e étudiant·e le trajet d'une molécule de palmitate, de l'entrée dans la mitochondrie jusqu'à la production d'ATP. Statique, sans backend, sans cookie ni traceur.

Trois modes : **Visite guidée** (timeline narrée), **Exploration libre** (orbite/zoom/clic), **Labo** (inhibiteurs).

Le contexte scientifique complet, les règles non négociables et le storyboard sont dans [CLAUDE.md](CLAUDE.md) et [docs/SPEC.md](docs/SPEC.md).

## Démarrage local

Prérequis : Node.js 20+.

```bash
npm install
npm run dev
```

Ouvre l'URL affichée (par défaut http://localhost:5173).

## Scripts

| Commande | Effet |
|---|---|
| `npm run dev` | serveur de développement avec rechargement à chaud |
| `npm run build` | build de production dans `dist/` (typecheck + bundle) |
| `npm run preview` | sert `dist/` localement pour vérifier le build |
| `npm run test` | tests Vitest (logique pure : bilan énergétique, mode Labo) |
| `npm run test:watch` | tests en mode watch |
| `npm run export:video` | export MP4 de la visite guidée (voir plus bas) |
| `node scripts/snapshots.mjs` | captures fixes d'un chapitre à des instants donnés, et comparaison avant/après (contrôle visuel) |

## Export vidéo (MP4)

```bash
npm run build
npm run export:video -- --chapters scene1,scene2 --fps 30 --samples 6 --width 1920 --height 1080 --out export/visite-guidee.mp4
```

Le script sert `dist/`, ouvre Chrome (installé sur la machine, avec sa carte graphique) en mode export (`?export`), puis fixe le temps de chaque image, rend quelques échantillons accumulés (anticrénelage, ombres douces), capture la page et l'envoie à ffmpeg (`ffmpeg-static`). Le rendu est déterministe : mêmes images à chaque export. Options : `--chapters` (par défaut tous), `--fps`, `--samples` (qualité par image), `--width`/`--height`, `--out`. Si Chrome n'est pas trouvé, définir `CHROME_PATH`. La fenêtre de capture s'affiche pendant l'export : ne pas la réduire.

## Captures de contrôle

```bash
npm run dev   # dans un autre terminal
node scripts/snapshots.mjs --chapter scene2 --times 0,20,58 --out snapshots/scene2
node scripts/snapshots.mjs --compare snapshots/avant snapshots/apres   # SSIM par image (1 = identique)
```

## Déploiement (GitHub Pages)

Un push sur `master` déclenche [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) : il installe, teste, build, puis publie `dist/` sur GitHub Pages.

À faire une fois, côté GitHub : **Settings → Pages → Source : GitHub Actions**.

Le `base: './'` de [`vite.config.ts`](vite.config.ts) utilise des chemins relatifs : le build fonctionne tel quel aussi bien en page de projet GitHub Pages (`compte.github.io/repo/`) qu'en page utilisateur, et en iframe à n'importe quel chemin de montage (voir plus bas).

## Intégration dans Moodle (iframe)

```html
<iframe
  src="https://<compte>.github.io/<repo>/"
  width="100%"
  height="700"
  style="border:0"
  allow="fullscreen"
  allowfullscreen
></iframe>
```

Le bouton « Plein écran » de l'application fonctionne aussi depuis l'iframe (`allowfullscreen` requis sur la balise).

## Modifier les textes

Tout le texte pédagogique visible par l'utilisateur (narration, étiquettes, info-bulles, quiz) vit dans [`content/fr.json`](content/fr.json) — jamais en dur dans le code. Modifie ce fichier puis relance `npm run build` (ou laisse `npm run dev` recharger automatiquement).

Les constantes scientifiques (stœchiométries, convention P/O, bilan énergétique) vivent séparément dans [`src/config/science.config.ts`](src/config/science.config.ts), avec les tests qui les vérifient dans le fichier `.test.ts` associé.

## Architecture

- `src/core/` — `SceneManager` (machine à états), interface `Scene` (`enter/update/exit`), `AssetLoader` (procédural ↔ `.glb`), compteurs persistants (`JourneyState`).
- `src/scenes/sceneX-*/` — un module par scène du parcours.
- `src/ui/` — mode switcher, légende, barre d'échelle, compteurs, info-bulles.
- `content/fr.json` — tous les textes. `src/config/science.config.ts` — toutes les constantes scientifiques.

Détails complets : [CLAUDE.md](CLAUDE.md).

## État d'avancement

- [x] **Phase 1** — squelette, `SceneManager`, UI des modes, scène 1 (vue extérieure avec plan de coupe), déploiement GitHub Pages.
- [x] **Phase 2** — entrée de l'acide gras (navette carnitine) : plongée × 100, décor moléculaire en coupe, 8 étapes narrées (lecteur d'étapes, chapitres), sortie ÷ 10 entre les crêtes ; quiz de fin de chapitre ; narration de la scène 1 ; logique du mode Labo (testée) ; export vidéo.
- [ ] Phase 3 — β-oxydation
- [ ] Phase 4 — chaîne respiratoire et particules
- [ ] Phase 5 — ATP synthase
- [ ] Phase 6 — bilan et quiz
- [ ] Phase 7 — mode Labo et tests
- [ ] Phase 8 — finitions, performance, accessibilité, export vidéo

## Questions ouvertes

Les points scientifiques ou pédagogiques à faire valider par un·e enseignant·e sont listés dans [docs/QUESTIONS.md](docs/QUESTIONS.md), avec le choix provisoire retenu dans l'application.

## Accessibilité

Chaque élément de la légende a une couleur **et** une forme distinctes (aucune information portée par la seule couleur). Navigation clavier complète (étiquettes et contrôles sont de vrais boutons/inputs). `prefers-reduced-motion` respecté. Aucun cookie, aucun traceur.

## Licence et crédits

Code sous licence [MIT](LICENSE). Tous les modèles 3D sont procéduraux (générés par code, aucun asset externe) ; les protéines de la scène 2 sont des formes stylisées, pas des structures PDB. Tout modèle `.glb` ajouté plus tard (ex. structure PDB exportée depuis ChimeraX) sera crédité ici avec sa licence.
