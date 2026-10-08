# Feuille de route

## Prochaines améliorations possibles (audio)

- **Plus de sources** : par exemple BBC Sound Effects (usage non commercial uniquement) ou Sonniss GDC (packs gratuits à importer).
- **Mots-clés par IA (option)** : analyser un son pour proposer des mots-clés quand le nom du fichier n'en contient aucun (`AUDIO_0012.wav`).
- **Collections / projets** : regrouper les sons d'un montage, puis exporter les crédits du projet en un clic.
- **Découpe rapide** : choisir un passage sur la forme d'onde et ne glisser que ce morceau dans la timeline.
- **Recherche par similarité** : « des sons qui ressemblent à celui-ci » (l'API Freesound le permet déjà).

## Effets visuels : ce qui est déjà prêt

L'application a été pensée pour accueillir plus tard des **éléments visuels** : overlays, transitions, textures, fonds animés, LUTs. Ce qui est déjà générique :

| Brique | Où | État |
|---|---|---|
| Types de médias | `src/shared/media-kinds.mjs` | Un type `visual` existe déjà (désactivé), avec ses catégories : Overlay, Transition, Texture. |
| Bibliothèque | `src/main/library.mjs` | Chaque élément a un champ `kind` ; les fichiers visuels seront rangés dans `Visuels/<catégorie>/`. |
| Recherche, mots-clés, favoris | `src/shared/search.mjs`, `keywords.mjs` | Indépendants du type de média. |
| Licences et crédits | `src/shared/licenses.mjs` | Identiques pour les images et les vidéos (Creative Commons). |
| Sources en ligne | `src/main/sources/` | Chaque source déclare `kinds: ['audio']` ; une source visuelle déclarera `kinds: ['visual']`. |
| Glisser vers Premiere / DaVinci | `lib:startDrag` dans `main.mjs` | Fonctionne pour n'importe quel fichier. |

### Étapes pour activer les visuels

1. Dans `media-kinds.mjs`, passer `visual.enabled` à `true`.
2. **Import** : lire la durée et la taille des vidéos (`ffprobe`, via le paquet `ffprobe-static`) et générer une vignette (une image extraite de la vidéo).
3. **Aperçu** : dans l'interface, un lecteur `<video>` à la place de la forme d'onde quand `kind === 'visual'`, et une vignette à la place de la mini forme d'onde.
4. **Sources en ligne visuelles**, gratuites avec clé :
   - **Pexels** (vidéos et photos, licence Pexels : usage commercial OK, sans crédit obligatoire) ;
   - **Pixabay** (vidéos et images, licence Pixabay) ;
   - **Openverse** (images Creative Commons, via le même service que pour l'audio, endpoint `/v1/images/`).
   Il faudra ajouter les licences « Pexels » et « Pixabay » dans `licenses.mjs`.
5. **Onglets** : un sélecteur « Audio / Visuels » au-dessus de la recherche, qui filtre sur `kind`.
