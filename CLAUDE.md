# Service-Bridge — notes pour Claude

## Mémoire

### Stack pour lancer un SaaS gratuitement (2026)

Source : TikTok de Vincent Le Serpent (@vincentleserpent_), « Quelle stack pour lancer un SaaS gratuitement en 2026 ? Ma stack complète après 10 sites ».
https://vm.tiktok.com/ZGdC2aPuM/ (vidéo 7677658701515246881, ~3 min). Sauvegardé le 2026-10-07 à partir de la description de la vidéo ; la narration n'a pas encore été transcrite.

**Principe :** un projet sans utilisateurs doit coûter **0 €/mois**.

La stack, dans l'ordre :

1. **Next.js** : front et back dans un seul framework.
2. **Vercel** : déploiement, gratuit au démarrage.
3. **Neon** : Postgres « scale-to-zero ». La base s'endort quand personne ne l'utilise, donc on ne paie rien.
4. **BetterAuth** : authentification open source, qui vit dans notre propre code (pas de service d'auth externe payant).
5. **Cloudflare** : le site vitrine en statique, gratuit.

À réutiliser quand on fera évoluer Service-Bridge (aujourd'hui un site statique `index.html` + PWA) vers un vrai SaaS.
