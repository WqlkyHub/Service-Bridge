# Service-Bridge — notes pour Claude

## Mémoire

### Stack pour lancer un SaaS gratuitement (2026)

Source : TikTok de Vincent Le Serpent (@vincentleserpent_), data engineer depuis 10 ans qui crée des SaaS en solo depuis 3 ans. Titre : « Quelle stack pour lancer un SaaS gratuitement en 2026 ? Ma stack complète après 10 sites ».
https://vm.tiktok.com/ZGdC2aPuM/ (vidéo 7677658701515246881, 3 min). Sauvegardé le 2026-10-07 à partir de la description et de la transcription de la vidéo.

**Principe :** un site avec 0 utilisateur doit coûter **0 €/mois**. Ni 5 €, ni 10 €. Sur 10 idées, 8 ne marcheront pas, et si chaque essai coûte un abonnement, on finit par arrêter d'essayer. On ne paie que quand ça commence à marcher. Lui fait tourner une dizaine de sites (SaaS, blogs, outils) pour 0 €/mois d'hébergement.

La stack, dans l'ordre :

1. **Next.js** : front, API et logique dans un seul projet et un seul langage. Gros bonus : c'est le framework que l'IA connaît le mieux, ce qui aide beaucoup quand on code avec l'IA sans être développeur web.
2. **Vercel** : on pousse le code et c'est déployé. Pas de serveur à gérer. Gratuit tant que le trafic reste faible, ce qui est exactement le cas au démarrage.
3. **Neon** : Postgres serverless, qui ne se réveille que quand on l'utilise. Zéro trafic, donc zéro coût. Jusqu'à 100 bases sur l'offre gratuite.
   - Pourquoi pas **Supabase** : il l'a utilisé au début, mais c'est plus dur à sécuriser, limité à 2 projets gratuits, et le projet se met en pause tout seul après une semaine sans visite.
4. **BetterAuth** : comptes, mots de passe et connexion Google. Open source, vit dans notre propre code, indépendant du framework. C'est ce qui remplace l'auth de Supabase.
5. **Cloudflare** (pour plus tard) : au début on met tout sur Vercel. Quand le trafic arrive, on sépare :
   - l'**application** full stack reste sur Vercel ;
   - le **site vitrine** marketing, statique, part sur Cloudflare, dont les limites sur le statique sont énormes et qui reste gratuit.
   Les visiteurs venus de Google arrivent sur la vitrine. Vercel ne reçoit donc que le trafic des gens qui utilisent vraiment l'app. Il a migré tous ses sites vitrines sur Cloudflare.

**L'erreur à éviter (son conseil principal) :** changer d'outils à chaque projet pour tester les nouveautés (Vue.js, etc.). À chaque fois il repartait de zéro. La solution n'est pas d'avoir la stack parfaite, c'est de **toujours garder la même stack** et de la connaître par cœur. On peut alors réutiliser des morceaux d'un projet à l'autre, et l'IA sait d'avance comment chaque site est construit (site vitrine Next.js sur Cloudflare, app sur Vercel). Il a migré tous ses anciens sites sur cette stack avec l'IA et s'est fait un template qui lui permet de lancer un site en une journée.

**À retenir :** choisir une stack et arrêter d'en changer. À réutiliser quand on fera évoluer Service-Bridge (aujourd'hui un site statique `index.html` + PWA) vers un vrai SaaS.

### Checklist sécurité avant de mettre un SaaS en ligne

Source : TikTok de The Saas Daddy (@thesaasdaddy), « Les 20 trucs à verrouiller avant de mettre ton SaaS en ligne (en 45 secondes) ».
https://vm.tiktok.com/ZGdC2GC6u/ (vidéo 7675005181599223073, 44 s). Sauvegardé le 2026-10-07 à partir de la transcription et de la liste affichée à l'écran.

À vérifier avant tout lancement (et à faire relire par Claude sur le code) :

1. **Clés API dans un `.env`**, jamais en dur dans le code.
2. **`.env` dans le `.gitignore`.**
3. **Rate limiting sur la page de connexion.**
4. **RLS (Row Level Security) activée** sur la base de données.
5. **Mots de passe hachés**, jamais lisibles.
6. **Droits vérifiés côté serveur**, pas dans le navigateur.
7. **Seulement la clé publique côté client**, jamais la clé secrète.
8. **HTTPS partout.**
9. **Sessions qui expirent.**
10. **Inputs validés** : tout ce que l'utilisateur tape est vérifié avant d'aller en base.
11. **Taille maximum sur les fichiers uploadés.**
12. **Type de fichier vérifié** sur les uploads.
13. **CORS configuré.**
14. **Messages d'erreur détaillés coupés en production.**
15. **`console.log` propres**, rien de verbeux en production.
16. **Un seul message d'erreur pour l'email et le mot de passe** (ne pas révéler lequel est faux).
17. **Webhooks protégés par une signature.**
18. **Dépendances à jour.**
19. **Email confirmé à l'inscription.**
20. **Sauvegarde automatique de la base de données.**

Avec la stack ci-dessus : la RLS concerne Postgres sur Neon ; BetterAuth gère le hachage des mots de passe, les sessions et la confirmation d'email, mais il faut l'activer et le configurer.
