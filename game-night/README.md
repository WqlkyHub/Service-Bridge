# La Manette d'Or

Suivi des défis d'une soirée entre potes : joueurs, défis avec catégories et
unités libres, progression au curseur, classement et statistiques par catégorie.

Une seule page, aucune dépendance, trois façons de s'en servir.

## 1. En solo sur un appareil

Ouvrir `index.html` dans un navigateur. Tout est gardé dans le navigateur
(`localStorage`), rien ne sort de l'appareil. Depuis un téléphone, « Ajouter à
l'écran d'accueil » installe l'app : elle fonctionne ensuite hors connexion
(`manifest.json` + `service-worker.js`).

## 2. À plusieurs sur le même Wi-Fi

Sur un ordinateur du réseau :

```bash
node server.js          # ou PORT=3000 node server.js
```

Le serveur affiche les adresses à ouvrir, par exemple `http://192.168.1.20:8080`.
Chacun ouvre cette adresse sur son téléphone : toute validation apparaît
instantanément sur les autres appareils (Server-Sent Events). Aucune connexion
Internet n'est nécessaire.

L'état de la soirée est écrit dans `soiree.json` à côté du serveur — copiez ce
fichier pour archiver une soirée, supprimez-le pour repartir à zéro.

Node 18 ou plus récent, aucune dépendance à installer.

## 3. Publié en Artifact sur claude.ai

La même page publiée comme Artifact utilise la base partagée de Claude : tous
ceux qui ouvrent le lien écrivent au même endroit, en direct, depuis n'importe
quel réseau.

L'app choisit son mode toute seule au démarrage — Artifact, puis serveur local,
puis stockage local — et l'indique sous le titre.

## Comment sont comptés les points

Un défi a un objectif (`20`), une unité (`km`) et des points. Deux modes :

- **Au total** — les points sont répartis au prorata de l'objectif :
  courir 8 km sur un objectif de 20 km à 100 points rapporte 40 points.
- **Par unité** — chaque unité rapporte les points indiqués :
  2 points par bière, 20 bières valent 40 points.

Les bonus et malus manuels (menu d'un joueur) s'ajoutent hors défi.

## Structure

| Fichier | Rôle |
|---|---|
| `index.html` | toute l'app (interface, données, synchro) |
| `server.js` | serveur de soirée en réseau local |
| `manifest.json`, `service-worker.js` | installation et fonctionnement hors ligne |
