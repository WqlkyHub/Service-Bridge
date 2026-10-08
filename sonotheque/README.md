# Sonothèque

Ta banque de sons perso pour le montage vidéo : bruitages, ambiances, musiques.

- **Tu stockes tes sons en local** dans un dossier de ton PC, rangés par catégorie.
- **Tu les retrouves en 1 à 3 mots-clés**, en français ou en anglais : « pluie » trouve aussi un son tagué « rain ».
- **Tu les écoutes directement** : forme d'onde, boucle, et lecture automatique en naviguant avec ↑ ↓.
- **Tu les glisses dans ta timeline** Premiere Pro ou DaVinci Resolve : il suffit de glisser la ligne.
- **Tu cherches de nouveaux sons sur internet** dans 4 sources à la fois (Freesound, Openverse, Jamendo, Internet Archive). Tu les écoutes avant de les télécharger et tu les ajoutes en un clic, avec 1 à 3 mots-clés.
- **La source et la licence sont toujours visibles** sur chaque son, et une fiche complète s'affiche au survol : auteur, page d'origine, ce que la licence autorise.
- **Filtre « Usage commercial »** pour tes vidéos monétisées ou tes clients. Le bouton « Copier les crédits » prépare le texte à coller dans la description de la vidéo.

![Ma bibliothèque](docs/bibliotheque.png)
![Recherche en ligne : source et licence au survol](docs/recherche-en-ligne.png)

---

## Installer et lancer (Windows)

### Option A : le plus simple

1. Installe **Node.js** (version « LTS ») depuis https://nodejs.org : suivant, suivant, terminer.
2. Télécharge ce dossier `sonotheque` sur ton PC.
3. Double-clique sur **`Lancer-Sonotheque.bat`**.
   - Le premier lancement télécharge ce dont l'appli a besoin (environ 2 minutes, une seule fois).
   - Les lancements suivants sont immédiats.

### Option B : créer un vrai installateur `.exe`

Dans le dossier `sonotheque`, ouvre un terminal (clic droit → « Ouvrir dans le terminal ») :

```
npm install
npm run dist
```

Tu obtiens dans `dist/` un installateur (`Sonotheque-…-nsis.exe`) et une version portable sans installation (`Sonotheque-…-portable.exe`). L'appli apparaît ensuite dans le menu Démarrer comme n'importe quel logiciel.

> Quand la Sonothèque aura son propre dépôt GitHub, le fichier `.github/workflows/build-windows.yml` fabriquera cet `.exe` automatiquement à chaque nouvelle version : tu n'auras plus qu'à le télécharger.

---

## Premiers pas

1. **Importer tes sons existants** : glisse tes fichiers ou dossiers dans la fenêtre (ou bouton « ＋ Importer » / « 📁 Dossier »).
   - L'appli propose des mots-clés à partir des noms de fichiers et de dossiers (`DoorSlam_Heavy_01.wav` → door, slam, heavy). Tu corriges si besoin.
   - Le champ « Mots-clés pour tous » ajoute les mêmes mots à tout un lot.
   - Par défaut, les fichiers sont **copiés** dans la bibliothèque : tes originaux ne bougent pas.
   - Les doublons sont détectés.
2. **Chercher** : tape 1 à 3 mots, les résultats s'affichent pendant que tu tapes. ↑ ↓ pour écouter, Entrée pour rejouer.
3. **Utiliser un son** : glisse la ligne dans Premiere Pro ou DaVinci Resolve. Avec Ctrl+clic ou Maj+clic, tu peux en glisser plusieurs d'un coup.
4. **Trouver en ligne** : onglet « 🌐 Chercher en ligne ». Ta recherche est traduite en anglais automatiquement (« porte qui grince » → « door creak »).
   - ▶ pour écouter l'aperçu.
   - « + Ajouter » : tu choisis 1 à 3 mots-clés, Entrée, et c'est téléchargé.
   - Maj + clic sur « + Ajouter » : ajout direct avec les mots-clés proposés.

Raccourcis : bouton ⌨ en haut à droite.

| Import avec mots-clés proposés | Ajout d'un son trouvé en ligne |
|---|---|
| ![Import](docs/import.png) | ![Ajout](docs/ajout.png) |

---

## Clés gratuites (Freesound et Jamendo)

Openverse et Internet Archive marchent sans rien faire. Pour avoir beaucoup plus de bruitages (Freesound) et des musiques complètes (Jamendo), crée deux clés gratuites, puis colle-les dans ⚙ Réglages :

| Source | Où | Quoi copier |
|---|---|---|
| **Freesound** | Crée un compte sur freesound.org, puis https://freesound.org/apiv2/apply | « Client secret/Api key » et « Client id » |
| **Jamendo** | https://devportal.jamendo.com → créer une application | « Client ID » |

**Freesound, qualité originale :** sans connexion, Freesound fournit un aperçu MP3 de bonne qualité. Dans les Réglages, clique « Connecter mon compte Freesound » pour télécharger les fichiers **originaux** (WAV/FLAC). La connexion se fait dans une petite fenêtre Freesound.

Tes clés sont chiffrées sur ton PC (coffre de Windows) et ne sont envoyées qu'à la source concernée.

---

## Licences : ce que veulent dire les couleurs

| Pastille | Signification |
|---|---|
| 🟢 **CC0 / Domaine public** | Utilisable partout, même en vidéo monétisée, sans créditer. |
| 🟡 **CC BY / CC BY-SA** | Usage commercial OK, **à condition de créditer l'auteur** (description de la vidéo). |
| 🟠 **CC BY-ND** | Usage commercial OK en créditant, mais **sans modifier** le son. |
| 🔴 **NC (non commercial)** | **Interdit** en vidéo monétisée ou pour un client. Usage perso uniquement. |
| ⚪ **Inconnue** | Licence non précisée : vérifie sur la page d'origine avant usage. |
| 🔵 **Perso** | Fichier importé depuis ton PC : tu connais ses droits. |

Le bouton **Usage commercial** (en haut) masque les 🔴 et les ⚪. Pour les 🟡, sélectionne les sons utilisés puis « 📋 Copier les crédits » (bibliothèque) : le texte est prêt à coller.

> L'appli t'aide, mais la licence affichée est celle déclarée par la source. Pour un projet client important, un clic sur « Page d'origine » permet de vérifier.

---

## Où sont mes fichiers ?

Par défaut dans `Musique\Sonotheque` (modifiable dans les Réglages) :

```
Sonotheque\
  Sons\Bruitage\…      Sons\Ambiance\…      Sons\Musique\…      Sons\Voix\…
  sonotheque-bibliotheque.json     ← mots-clés, sources, licences
  .sauvegardes\                    ← copie de l'index chaque jour (7 jours)
```

Tu peux déplacer tout le dossier (disque externe, autre PC) : rien ne casse, il suffit de le rechoisir dans les Réglages.

---

## Pour les développeurs

- Stack : **Electron** (Windows, macOS, Linux) et JavaScript sans framework ni étape de build. La seule dépendance d'exécution est `music-metadata` (lecture des durées et des tags audio).
- `npm start` lance l'appli. `npm test` lance les tests (bibliothèque, import, téléchargement, sources, recherche, licences).
- Structure :
  ```
  src/main/       processus principal : disque, réseau, sources en ligne, téléchargements
  src/main/sources/   une source = un fichier (freesound, openverse, jamendo, archive)
  src/preload/    pont sécurisé entre l'interface et le processus principal
  src/renderer/   interface (HTML/CSS/JS)
  src/shared/     code commun : mots-clés, dictionnaire FR↔EN, licences, recherche, types de médias
  ```
- **Ajouter une source** : un fichier dans `src/main/sources/` qui exporte `{ id, label, kinds, search, download }`, puis une ligne dans `sources/index.mjs`.
- **Enrichir le dictionnaire FR → EN** : `src/shared/synonyms.mjs`, une entrée par mot.
- **Effets visuels (plus tard)** : voir [ROADMAP.md](ROADMAP.md).
- Sécurité : `contextIsolation` et `sandbox` activés, CSP stricte, aucun `innerHTML` avec des données venant d'internet. Les téléchargements se font uniquement en HTTPS, sont limités à 1 Go et vérifiés comme vrais fichiers audio. Les clés sont chiffrées avec `safeStorage`.
