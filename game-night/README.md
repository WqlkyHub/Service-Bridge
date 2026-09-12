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

**C'est le mode à utiliser pour jouer à plusieurs : il ne demande aucun compte.**

Sur un ordinateur du réseau, dans ce dossier :

```bash
cp soiree-depart.json soiree.json   # facultatif : démarre avec les joueurs et les 24 défis
node server.js                      # ou PORT=3000 node server.js
```

Le serveur affiche les adresses à ouvrir, par exemple `http://192.168.1.20:8080`.
Chacun ouvre cette adresse sur son téléphone : toute validation apparaît
instantanément sur les autres appareils (Server-Sent Events). Aucune connexion
Internet n'est nécessaire.

L'état de la soirée est écrit dans `soiree.json` à côté du serveur — copiez ce
fichier pour archiver une soirée, supprimez-le pour repartir à zéro. Le journal
est plafonné aux 2000 dernières actions.

Node 18 ou plus récent, aucune dépendance à installer.

> **Pas d'authentification, c'est voulu.** Toute personne qui atteint l'adresse
> du serveur peut valider un défi ou modifier la soirée. À garder pour un
> réseau de confiance (le Wi-Fi de l'appartement) — ne l'exposez pas sur
> Internet tel quel.

## 3. Publié en Artifact sur claude.ai

La même page publiée comme Artifact utilise la base partagée de Claude : tous
ceux qui ouvrent le lien écrivent au même endroit, en direct, depuis n'importe
quel réseau.

**Limite à connaître :** une page qui déclare la capacité `db` est réservée à
l'organisation de son propriétaire. Le lien fonctionne pour les personnes du
même espace de travail Claude, pas pour un ami sur son compte personnel — pour
eux, c'est le serveur local ci-dessus.

L'app choisit son mode toute seule au démarrage — Artifact, puis serveur local,
puis stockage local — et l'indique sous le titre.

## Comment sont comptés les points

**Aucun barème n'est imposé.** Les défis des packs arrivent sans valeur (`—`) :
c'est à vous de décider ce que vaut chaque défi. Le filtre « À chiffrer » liste
ceux qu'il reste à évaluer.

Les points d'une action sont recalculés depuis le défi, donc fixer ou changer un
barème met à jour tout l'historique : une progression enregistrée avant que vous
ayez décidé de sa valeur est comptée dès que vous la renseignez.

Un défi a un objectif (`20`), une unité (`km`) et des points. Deux modes :

- **Au total** — les points sont répartis au prorata de l'objectif :
  courir 8 km sur un objectif de 20 km à 100 points rapporte 40 points.
- **Par unité** — chaque unité rapporte les points indiqués :
  2 points par bière, 20 bières valent 40 points.

Les bonus et malus manuels (menu d'un joueur) s'ajoutent hors défi.

## Détails utiles

- **Un défi n'appartient à personne.** Tout le monde peut contribuer au même défi,
  avant comme après que l'objectif soit atteint : la feuille d'ajout rappelle qui a
  déjà marqué et combien, et chacun est payé au prorata de ce qu'il a fait.
- **Plusieurs participants d'un coup.** Sélectionnez qui a participé, puis choisissez
  la répartition : *à parts égales* (la quantité saisie est celle du groupe, divisée
  entre les sélectionnés — un 3v3 gagné ensemble se valide une fois et crédite les
  trois) ou *détail par joueur* (la part de chacun, au pas de l'unité). Une action à
  plusieurs s'annule d'un seul geste.
- Un défi sans valeur se valide quand même : la progression est gardée, les points suivront.
- Au-delà de dix défis, un champ de recherche apparaît ; il ignore les accents.
- Les écritures partent en lot : charger un pack de vingt défis, ou supprimer un
  joueur et toutes ses actions, ne fait qu'un appel réseau et un seul rendu.
- Seul l'onglet visible est reconstruit, et au plus une fois par image.
- Tout ce qui est saisi est échappé avant affichage, sur les trois modes.

## Structure

| Fichier | Rôle |
|---|---|
| `index.html` | toute l'app (interface, données, synchro) |
| `server.js` | serveur de soirée en réseau local |
| `manifest.json`, `service-worker.js`, `icon.svg` | installation et fonctionnement hors ligne |
