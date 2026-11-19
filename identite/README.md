# Logo GreenCampus HdF

Fichiers du logo, prêts à l'emploi. Les règles d'usage (couleurs, tailles, ce qu'il ne faut pas
faire) sont dans la charte graphique : en ligne ([lien](https://claude.ai/artifact/8TXAdKZXBFRKRc94AGTESE))
ou en PDF A4 dans ce dossier, `charte-graphique.pdf` (à préférer pour l'imprimer ou l'envoyer :
imprimer la page en ligne depuis claude.ai la découpe mal).

**Privilégier le SVG** : il ne pixélise jamais, quelle que soit la taille (affiche A0, banderole…). Le
texte y est déjà converti en formes, donc aucune police n'est nécessaire pour l'ouvrir. Canva,
Illustrator, Inkscape, Word, PowerPoint et les imprimeurs l'acceptent. Les PNG ne servent que là où le
SVG est refusé (Instagram, certains formulaires en ligne).

## Quel fichier pour quel usage

| Usage | Fichier |
|---|---|
| **Photo de profil Instagram** (et autres réseaux) | `logo/instagram-1080.png` : carré plein, feuille réduite pour rester entière quand le réseau découpe l'image en cercle |
| **Affiche, flyer, kakémono** sur fond clair | `logo/logo-horizontal.svg` (en ligne) ou `logo/logo-vertical.svg` (empilé) |
| **Affiche sur fond sombre ou photo** | `logo/logo-horizontal-blanc.svg` ou `logo/logo-vertical-blanc.svg` |
| **Icône seule** (coin d'affiche, slide, badge) | `logo/logo-icone.svg` |
| **Icône seule, carré sans coins arrondis** | `logo/logo-icone-carre.svg` |
| **Icône découpée en cercle** (avatar, sticker rond) | `logo/logo-rond.svg` |
| **Feuille seule**, en motif ou filigrane | `logo/feuille-verte.svg` (fond transparent) ou `logo/feuille-blanche.svg` (pour fond foncé) |
| Outil qui refuse le SVG | les PNG haute définition : `logo/logo-icone-1024.png`, `logo/logo-horizontal-2000.png`, `logo/logo-horizontal-blanc-2000.png`, `logo/logo-vertical-2000.png`, `logo/logo-vertical-blanc-2000.png` (fonds transparents) |

À l'impression, laisser autour du logo une marge libre au moins égale à la moitié de la hauteur de
l'icône. Ne pas le faire pivoter, le déformer, le retourner ni en changer les couleurs.

## Où le logo est utilisé dans le site

- `frontend/public/favicon.svg` : icône de l'onglet, et icône affichée dans l'en-tête et sur la page de connexion.
- `frontend/public/icone-192.png`, `icone-512.png` : application installée (`manifest.webmanifest`).
- `frontend/public/icone-maskable-512.png` : application installée sur Android quand l'icône est découpée en cercle.
- `frontend/public/apple-touch-icon.png` : écran d'accueil d'un iPhone.
- `frontend/public/badge-96.png` : petite icône des notifications dans la barre d'état Android.
- `backend/admin/logo.svg` : en-tête de l'administration.

## Régénérer les fichiers

Tous les SVG viennent d'une seule géométrie, calculée par `outils/generer-logo.mjs` (feuille courbée
vers la gauche, nervure effilée, dégradé `#2FA47F` vers `#0F4D3B`). Pour la modifier :

```bash
# dans un dossier de travail hors du projet
npm init -y && npm install opentype.js@1.3.4
node <projet>/identite/outils/generer-logo.mjs \
  <projet>/frontend/node_modules/@fontsource/unbounded/files/unbounded-latin-700-normal.woff \
  <projet>/identite/logo
```

Puis refaire les PNG (rendu des SVG à la taille voulue, fond transparent) et recopier
`logo/logo-icone.svg` vers `frontend/public/favicon.svg` et `backend/admin/logo.svg`.

`charte-graphique.pdf` est généré depuis la page de la charte avec un navigateur sans interface
(Playwright, `page.pdf()` en média « print », `printBackground: true`) : la page contient ses
propres règles d'impression (A4, fond conservé, aucun bloc coupé).

La police Unbounded est sous licence SIL Open Font License : la vectoriser dans un logo est autorisé.
