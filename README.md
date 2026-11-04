# Bopsy, site public et web app (GitHub Pages)

Pages exigées par Apple et liées dans l'app (07, 13, 17, 21) : `privacy/`, `terms/`, `support/`, `delete-data/`, plus `legal/` (mentions légales, éditeur français), une page d'accueil (landing) et la web app `app/` (D117, D118). Les pages sont en HTML statique sans build ; seule la web app se construit (Vite).

## Page d'accueil (landing, W4)

`index.html` : démo avant/après (photos de la maquette en attendant les vrais clips), « Make my photo dance » vers la web app. L'adresse de la web app se met à un seul endroit, la balise `<meta name="bopsy-app-url" content="app/">` en haut du fichier ; vide, le bouton affiche « Coming soon ». Le bouton transmet les paramètres de pub de la page (utm_*, ttclid, fbclid) à la web app. Remplacer la démo par une vraie vidéo courte (MP4 H.264, muet, moins de 1 Mo, avec une image d'affiche) quand les clips existent.

## Web app (`app/`)

Vite 8, TypeScript strict, Preact 11, sans autre framework. Parcours le plus court (D113) : danse → photo (conseils, appareil photo ou galerie) → case de consentement décochée et mention IA, rien n'est envoyé avant la coche (D50) → contrôle de la photo → aperçu gratuit de 2 s avec filigrane → « Unlock full video » : email et code à 6 chiffres → paywall (plans, ou packs pour un abonné) → paiement dans la page → génération (progression, « Taking a bit longer ») → résultat (lecture, Download, Share, signalement, Make another). Plus « My videos », « My account » (pièces, plan, gestion de l'abonnement, suppression des photos et vidéos, déconnexion).

```bash
cd app
npm ci
npm run dev        # http://localhost:5173, mode démo sans variables
npm test           # Vitest : flux, faux serveur, code, paywall, prix, consentement
npm run build      # vérifie les types (tsc), puis vite build dans app/dist
npm run preview    # sert app/dist sur http://localhost:4173
npm run smoke      # parcours démo complet, Playwright sur le Chrome installé (channel 'chrome'), contre npm run preview
npm run smoke:live # adaptateurs réels (src/live) contre un faux Supabase local (e2e-live/mock-supabase.mjs), RevenueCat coupé
npm run size       # poids gzip du build, échoue au-delà de 60 Ko pour le premier écran
```

Structure : `src/core` (types, interfaces `Backend`, `AuthPort`, `Billing`, logique pure du parcours, du code, du paywall, des prix, de la progression, routeur par hash), `src/demo` (faux serveur), `src/live` (Supabase et RevenueCat), `src/ui` (écrans). Textes repris de `lib/l10n/app_en.arb` de l'app (clé en commentaire dans `src/copy.ts`), textes web nouveaux marqués NEW.

### Mode démo et mode réel

Décidé au build (`vite.config.ts`) :

- sans les trois variables, **mode démo** (D118) : faux serveur en mémoire (gardé dans `sessionStorage`) qui reprend les règles du serveur. Badge « Demo » à l'écran. Photo jugée par son nom de fichier : `group`, `friends` → plusieurs sujets ; `face`, `selfie` → corps non visible ; `kid`, `child` → enfant ; `nsfw` → contenu interdit ; `empty`, `landscape` → aucun sujet ; `horse`, `bird` → sujet non pris en charge ; `offline` → envoi échoué ; `fail` → vidéo échouée et pièces rendues ; `slow` → rendu plus long que l'estimation. Code de connexion affiché à l'écran, paiement simulé (deux plans, offre de lancement, deux packs), webhook simulé 1,5 s après le paiement, vidéos d'exemple dans `public/demo` (refaites par `bash scripts/make-demo-assets.sh`).
- avec `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (clé anon ou publishable) et `VITE_REVENUECAT_WEB_KEY` (clé publique Web Billing, `rcb_...`), **mode réel** : mêmes écrans, adaptateurs `src/live`. Un build ne contient que l'un des deux backends. Le build refuse une clé secrète (service role, `sb_secret_`, `sk_`).

En local, un fichier `app/.env.local` (ignoré par git) :

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<clé anon ou publishable>
VITE_REVENUECAT_WEB_KEY=rcb_<...>
```

Chargement : premier écran (catalogue) dans un chunk de 20 Ko gzip, CSS en ligne ; supabase-js (56 Ko gzip) chargé au premier envoi de photo ou pour une session déjà ouverte ; purchases-js (250 Ko gzip) chargé au paywall seulement.

### Ce que le serveur doit faire avant le mode réel

Rien n'a été changé dans le dépôt de l'app. À faire côté serveur (dépôt `bopsy`) :

1. **Catalogue sans session** : le premier écran lit `dances` par PostgREST avec la clé anon, sans session. Les migrations n'ouvrent rien au rôle `anon`. Migration à ajouter (même règle que les autres : droits explicites) :
   ```sql
   grant select (id, slug, name, family, preview_url, cost, duration_seconds, is_new, is_hot, sort, active) on public.dances to anon;
   create policy "visitors read active dances" on public.dances for select to anon using (active);
   ```
   Affiches (`preview_url`) en URL https publiques (bucket public ou CDN) : avant la session, aucune URL signée n'est possible.
2. **Session invitée** (voir décision « compte web ») : connexion anonyme activée (déjà nécessaire pour l'iOS), idéalement avec un CAPTCHA (Turnstile) sur la connexion anonyme et l'envoi de code (le site ne l'envoie pas encore) ; tâche qui supprime les comptes anonymes sans achat après 30 jours.
3. **Emails** : SMTP à soi (le SMTP par défaut de Supabase n'envoie qu'aux membres de l'équipe, quelques messages par heure) ; modèles « Magic Link » et « Change Email Address » avec `{{ .Token }}` (code à 6 chiffres) et le lien ; l'adresse de la web app dans Auth > URL Configuration > Redirect URLs.
4. **CORS** : `ALLOWED_ORIGINS` des Edge Functions = origine du site (`https://<user>.github.io` ou le domaine).
5. **Aperçu web** : `free_preview_enabled` à vrai pour le web (il est faux au lancement iOS, C1) ou un drapeau propre au web ; 2 s en 480p pour le web (reconnu par l'en-tête `Origin`, jamais par un champ du client) ; un par compte (index existant), par navigateur (le site envoie un jeton aléatoire de `localStorage` comme `device_token`) et **par IP** (à écrire : hachage de l'IP vue par la passerelle, fenêtre de quelques jours, seuil adapté aux IP partagées des opérateurs mobiles).
6. **Limites de débit** (D114), aucune n'existe en dehors de C7 : générations par compte et par heure ; `check-photo` par compte et par heure (la modération coûte) ; aperçus par IP ; signalements par compte.
7. **Filigrane de l'aperçu** incrusté côté serveur : aujourd'hui c'est une surcouche du lecteur, le MP4 de l'aperçu reste propre.
8. **Stripe Radar** actif sur le compte Stripe relié à RevenueCat.

### Comptes réels à créer

- **Supabase** : projet de dev (migrations et Edge Functions de `step3/functions`, webhook RevenueCat de `step3/purchases`), réglages ci-dessus ; clé anon ou publishable pour `VITE_SUPABASE_ANON_KEY`.
- **RevenueCat Web Billing** relié à un compte **Stripe** : produits web aux mêmes identifiants (`bopsy_weekly` avec la période d'introduction 7,99 $ pendant 2 semaines, `bopsy_yearly`, `bopsy_coins_600`, `bopsy_coins_1500`), entitlement `pro`, offering courante avec les deux plans (les packs dans la même offering ou une autre), clé publique Web Billing ; le webhook existant crédite `store = RC_BILLING`. Taxes (Stripe Tax), pays de vente (D115).
- **Apple Pay et Google Pay** : le paiement s'affiche dans notre page ; Apple Pay demande d'enregistrer le domaine (fichier `/.well-known/apple-developer-merchantid-domain-association` à la racine du domaine, procédure Stripe ou RevenueCat à confirmer). Sur `https://<user>.github.io/bopsy-site/`, la racine appartient au dépôt `<user>.github.io` : prévoir un domaine à soi.

### Mesures (Lighthouse 13.6, mobile, 4G simulée, `vite build` + `vite preview`, mode démo)

| Version | Score | FCP | LCP | TBT | Transféré |
| --- | --- | --- | --- | --- | --- |
| Images et police non préparées (JPEG 800 × 1000, TTF variable 400 Ko) | 79 | 1,08 s | 5,64 s | 0 ms | 995 Ko |
| Premier build (WebP 360 × 450, woff2 latin 17 Ko, JS 28 Ko gzip) | 100 | 0,76 s | 1,82 s | 0 ms | 146 Ko |
| Après (CSS en ligne, affiches préchargées, écrans séparés, JS 21 Ko gzip) | 100 | 0,61 s | 1,46 s | 0 ms | 138 Ko |

Commande : `npx lighthouse http://localhost:4173/ --preset=perf --form-factor=mobile --throttling-method=simulate --chrome-flags="--headless=new" --output=json --output-path=lighthouse/after.json`, résumé par `node scripts/lighthouse-summary.mjs lighthouse/after.json`. En mode réel s'ajoute la requête du catalogue (préconnexion à Supabase dans `index.html`) et le poids des vraies affiches.

## À remplir avant de publier

Chercher `[` dans les fichiers (les trous sont surlignés en jaune dans les pages) :

- `[COMPANY LEGAL NAME]`, `[ADDRESS]`, `[LEGAL FORM, SHARE CAPITAL]`, `[REGISTERED ADDRESS]`, `[RCS / SIREN NUMBER]`, `[NAME]` (directeur de la publication)
- `[SUPPORT EMAIL]` (aussi dans les liens `mailto:`)
- `[AI VIDEO PROVIDER]` et `[MODERATION PROVIDER]` une fois choisis (HUMAN-TODO 3 et 8), puis la mention `[TO CONFIRM IN WRITING WITH EACH PROVIDER]` une fois l'engagement « pas d'entraînement sur vos photos » obtenu par écrit
- `[GOVERNING LAW ...]` dans les Terms

Faire relire Privacy et Terms par un conseil avant la soumission (HUMAN-TODO 18), en particulier la section 5 des Terms (achats web, renonciation au droit de rétractation) et les sous-traitants du paiement web (RevenueCat, Stripe) dans Privacy.

## Publier (GitHub Pages par une action)

Le dépôt de l'app restera privé ; GitHub Pages n'est gratuit que pour un dépôt public, d'où ce dépôt à part. L'action `.github/workflows/pages.yml` construit `app/` (tests unitaires, build, budget de poids) puis publie la landing, les pages légales et `app/dist` sous `app/`. Rien n'a été poussé.

1. Créer le dépôt public et pousser : `gh repo create bopsy-site --public --source . --push`.
2. Settings > Pages > Build and deployment > Source : **GitHub Actions** (et non plus « Deploy from a branch », qui publierait les sources de `app/` au lieu du build).
3. Mode réel : Settings > Secrets and variables > Actions > **Variables** : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_REVENUECAT_WEB_KEY` (clés publiques, donc des variables et non des secrets). Sans elles, le site publié est en mode démo.
4. Relancer l'action (Actions > Pages > Run workflow) après chaque changement de variable.

Adresses obtenues (remplacer `<user>` par le compte GitHub) :

- `https://<user>.github.io/bopsy-site/` (landing) et `https://<user>.github.io/bopsy-site/app/` (web app)
- `https://<user>.github.io/bopsy-site/terms/`, `.../privacy/`, `.../support/`

Elles vont dans le build de l'app iOS (`--dart-define=TERMS_URL=…`, `PRIVACY_URL=…`, `SUPPORT_URL=…`), dans App Store Connect (Privacy Policy URL, Support URL) et dans la description. Un domaine à soi peut s'ajouter plus tard (Settings > Pages > Custom domain) : changer alors les trois valeurs, `ALLOWED_ORIGINS` et les Redirect URLs de Supabase.
