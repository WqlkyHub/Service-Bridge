# Feuille de route

La Sonothèque est destinée à d'autres monteurs que son auteur. L'ordre ci-dessous a été fixé en octobre 2026.

## Fait depuis la 0.2.0 (pas encore publié)

- **Mots-clés automatiques** : chaque son est écouté par un modèle de reconnaissance qui tourne sur le PC. Ce qu'il y entend (pluie, porte, pas…) devient cherchable, et un son sans aucun mot-clé (« AUDIO_0012.wav ») reçoit les siens.
- **Sons similaires** : pendant l'écoute d'un son de la bibliothèque, le bouton « Similaires » affiche ceux qui lui ressemblent à l'oreille.
- **Nouvelle source : BBC Sound Effects**, 33 000 bruitages et ambiances, en usage non commercial uniquement.
- **Découpe rapide** : le bouton ciseaux du lecteur ouvre le tracé du son ; on y choisit un passage, on l'écoute en boucle, puis on le glisse seul dans la timeline ou on l'ajoute à la bibliothèque.

## En cours : mieux trouver

- **Sons similaires en ligne**, via Freesound (demande une clé Freesound) : remis à plus tard.


## Ensuite

1. **LUTs et presets pour DaVinci Resolve et Premiere Pro** (remplace l'ancien projet « effets visuels »).
   - LUTs (`.cube`, lus par les deux logiciels) : les ranger, les prévisualiser sur une image, les installer dans le dossier du logiciel, en générer avec des curseurs. Reste à voir s'il existe une source en ligne aux licences claires.
   - Presets : les ranger et les installer. Ils sont propres à chaque logiciel et ne peuvent pas être prévisualisés par l'appli.
   - Ce qui est déjà générique dans le code : le champ `kind` de chaque élément (`src/shared/media-kinds.mjs`), la recherche, les mots-clés, les licences et le glisser-déposer.

## Avant une vraie publication

- Prévenir quand une nouvelle version existe, et l'installer sans passer par GitHub.
- Signer l'installateur, pour supprimer l'avertissement de Windows.
- Vérifier à la main : la question du premier lancement, le changement de dossier de la bibliothèque, et le glisser d'un extrait vers Premiere Pro et DaVinci Resolve.

## Idées non décidées

- **Projets de montage** : une liste de sons par vidéo, avec export des crédits en un clic.
- **« Retrouver le fichier »** quand un son est marqué introuvable.
- **Mode sombre**, pour l'usage à côté d'un logiciel de montage.
- **Plus de recettes de génération** (tonnerre, pas, feu de camp, foule…) et la possibilité d'en superposer plusieurs.
