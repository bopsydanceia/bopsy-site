# Bopsy, site public et web app (GitHub Pages)

Pages exigées par Apple et liées dans l'app (07, 13, 17, 21) : `privacy/`, `terms/`, `support/`, `delete-data/`, plus `legal/` (mentions légales, éditeur français), une page d'accueil (landing) et la web app `app/` (D117, D118). Les pages sont en HTML statique sans build ; seule la web app se construit (Vite).

## Page d'accueil (landing, W4)

`index.html` : démo avant/après (photos de la maquette en attendant les vrais clips), « Make my photo dance » vers la web app. L'adresse de la web app se met à un seul endroit, la balise `<meta name="bopsy-app-url" content="app/">` en haut du fichier ; vide, le bouton affiche « Coming soon ». Le bouton transmet les paramètres de pub de la page (utm_*, ttclid, fbclid) à la web app. Remplacer la démo par une vraie vidéo courte (MP4 H.264, muet, moins de 1 Mo, avec une image d'affiche) quand les clips existent.

## Web app (`app/`)

Vite 8, TypeScript strict, Preact 11, sans autre framework. Parcours le plus court (D113) : danse → photo (conseils, appareil photo ou galerie) → case de consentement décochée et mention IA, rien n'est envoyé avant la coche (D50) → contrôle de la photo → aperçu gratuit de 2 s avec filigrane → « Unlock full video » : email et code à 6 chiffres → paywall (plans, ou packs pour un abonné) → paiement dans la page → génération (progression, « Taking a bit longer ») → résultat (lecture, Download, Share, signalement, Make another). Plus « My videos », « My account » (pièces, plan, gestion de l'abonnement, suppression des photos et vidéos, déconnexion).

En mode réel s'ajoutent les règles du serveur (D130 à D133) : CAPTCHA Turnstile invisible pour la plupart des visiteurs (session invitée à la coche, envoi du code, aperçu), limites de débit affichées avec leur attente (contrôles de photo, envois de photo par jour, aperçus par IP, générations par heure, signalements par jour), aperçu lu par une URL signée de 2 min renouvelée en cours de lecture, jamais téléchargeable.

```bash
cd app
npm ci
npm run dev        # http://localhost:5173, mode démo sans variables
npm test           # Vitest : flux, faux serveur, code, paywall, prix, consentement, adaptateurs réels (429, CAPTCHA, preview-url, refus du bucket)
npm run build      # vérifie les types (tsc), puis vite build dans app/dist
npm run preview    # sert app/dist sur http://localhost:4173
npm run smoke      # parcours démo complet, Playwright sur le Chrome installé (channel 'chrome'), contre npm run preview
npm run smoke:live # adaptateurs réels (src/live) contre un faux Supabase local (e2e-live/mock-supabase.mjs) qui suit le contrat du serveur, Turnstile servi en local, RevenueCat coupé
npm run size       # poids gzip du build, échoue au-delà de 60 Ko pour le premier écran
```

Structure : `src/core` (types, interfaces `Backend`, `AuthPort`, `Billing`, logique pure du parcours, du code, du paywall, des prix, de la progression, des limites `limits.ts`, du lien d'aperçu `preview-link.ts`, routeur par hash), `src/demo` (faux serveur, simulations `sim.ts`), `src/live` (Supabase, réponses du serveur `errors.ts`, Turnstile `turnstile.ts`, RevenueCat), `src/ui` (écrans). Textes repris de `lib/l10n/app_en.arb` de l'app (clé en commentaire dans `src/copy.ts`), textes web nouveaux marqués NEW.

### Mode démo et mode réel

Décidé au build (`vite.config.ts`) :

- sans aucune des quatre variables, **mode démo** (D118) : faux serveur en mémoire (gardé dans `sessionStorage`) qui reprend les règles du serveur. Badge « Demo » à l'écran. Photo jugée par son nom de fichier : `group`, `friends` → plusieurs sujets ; `face`, `selfie` → corps non visible ; `kid`, `child` → enfant ; `nsfw` → contenu interdit ; `empty`, `landscape` → aucun sujet ; `horse`, `bird` → sujet non pris en charge ; `offline` → envoi échoué ; `toolarge` → plus de 10 Mo ; `badtype` → type refusé ; `dailycap` → 30 photos par jour atteintes ; `checklimit` → trop de contrôles (une fois, Try again passe sans nouvel envoi) ; `fail` → vidéo échouée et pièces rendues ; `slow` → rendu plus long que l'estimation. Code de connexion affiché à l'écran, paiement simulé (deux plans, offre de lancement, deux packs), webhook simulé 1,5 s après le paiement, vidéos d'exemple dans `public/demo` (refaites par `bash scripts/make-demo-assets.sh`).
- avec `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (clé anon ou publishable), `VITE_REVENUECAT_WEB_KEY` (clé publique Web Billing, `rcb_...`) et `VITE_TURNSTILE_SITE_KEY` (clé de site Cloudflare Turnstile, `0x4AAAAAAA...`), **mode réel** : mêmes écrans, adaptateurs `src/live`. Un build ne contient que l'un des deux backends. Le build refuse une clé secrète (service role, `sb_secret_`, `sk_`, clé secrète Turnstile) et échoue si une partie seulement des quatre variables est posée (il ne retombe plus en démo en silence).

Simulations du mode démo, pour cliquer les états du serveur (parcours normal inchangé sans elles) : `?sim=` dans l'adresse, plusieurs séparées par des virgules, par exemple `app/?sim=preview-limit,report-limit#/` : `check-limit` (429 de check-photo une fois), `upload-cap`, `too-large`, `bad-type` (refus du bucket photos), `captcha-photo`, `captcha-code` (CAPTCHA refusé une fois à la coche ou à Send code), `captcha-preview` (jeton refusé deux fois sur l'aperçu, une fois), `preview-limit` (aperçus par IP), `preview-off` (aperçus coupés), `generation-limit` (vidéos par heure), `report-limit` (signalements par jour). Liste dans `src/demo/sim.ts`.

En local, un fichier `app/.env.local` (ignoré par git) :

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<clé anon ou publishable>
VITE_REVENUECAT_WEB_KEY=rcb_<...>
VITE_TURNSTILE_SITE_KEY=0x4AAAAAAA<...>
```

Clés de test de Cloudflare pour un essai local : `1x00000000000000000000AA` (toujours accepté), `2x00000000000000000000AB` (toujours refusé), `3x00000000000000000000FF` (demande un geste) ; à associer à la clé secrète de test correspondante côté Supabase.

Chargement : premier écran (catalogue) dans un chunk de 21 Ko gzip, CSS en ligne, ni supabase-js ni Turnstile ; le contrôleur du parcours (`core/flow.ts`, 3 Ko gzip) arrive avec les écrans suivants, au premier toucher ou 3 s après (son état est restauré dès le départ, `core/draft.ts`) ; supabase-js (54 Ko gzip) chargé au premier envoi de photo ou pour une session déjà ouverte ; Turnstile (`live/turnstile.ts`, 1 Ko gzip, puis `api.js` de Cloudflare) chargé à la première demande de jeton : coche du consentement (session invitée), Send code (compte email existant), aperçu ; purchases-js (242 Ko gzip) chargé au paywall seulement.

### Serveur (fait, dépôt de l'app)

La liste de ce que le serveur devait faire pour le site est faite et fusionnée dans le dépôt de l'app (`bopsy`, privé) : décisions D128 à D135 de `docs/DECISIONS.md`, contrat des Edge Functions dans `supabase/functions/README.md` (fonctions, corps, codes de réponse, variables), base et réglages dans `supabase/README.md`. Ce que le site en suit :

- **Catalogue sans session** (D129) : `anon` lit les danses actives, colonnes du premier écran seulement ; affiches en URL https publiques (bucket `posters`).
- **Session invitée** (D127, D133) : connexion anonyme avec CAPTCHA à la coche ; les invités marqués par le site, sans achat ni activité depuis **7 jours** (`guest_retention_days`), sont effacés par `guest-cleanup` chaque jour (et non plus après 30 jours).
- **CAPTCHA** (D132) : celui de Supabase Auth (Turnstile) sur `signInAnonymously` et `signInWithOtp` (le site envoie `captchaToken`, un jeton neuf à chaque appel ; `updateUser` et `verifyOtp` n'en demandent pas), plus un jeton Turnstile vérifié par `start-preview` (`captcha_token`, à usage unique : un nouvel essai prend un nouveau jeton).
- **Aperçu web** (D130) : `start-preview` reçoit `platform: "web"`, n'accepte `web` que depuis une origine de `ALLOWED_WEB_ORIGINS` (sinon 403 `origin_not_allowed`) ; 2 s en 480p ; un par compte, par navigateur (`device_token`) et 3 par IP et par jour ; coupé (503 `preview_unavailable`, 403 `origin_not_allowed`) : le site passe à Unlock. Fichier dans le bucket privé `previews`, lu par `preview-url` (URL signée de 120 s, que le site redemande avant expiration et quand le lecteur échoue) ; aucun téléchargement.
- **Limites de débit** (D131) : 429 `{"error":"rate_limited","action","retry_after"}` et `Retry-After`, lus par un seul analyseur (`core/limits.ts`) ; 10 générations par heure (la relance de 45 s après achat s'arrête), 20 contrôles de photo par heure (le même fichier est recontrôlé sans nouvel envoi), 3 aperçus par IP et par jour, 10 signalements par jour (PostgREST 429, `PT429`).
- **Bucket photos** (D131) : JPEG, PNG, WebP, HEIC de 10 Mo au plus, 30 envois par compte et par jour ; le site envoie un JPEG de 2048 px (réencodé plus bas si besoin pour rester sous 10 Mo) et affiche le refus (taille, type, plafond du jour jusqu'à minuit UTC).

Reste à faire côté serveur et tableau de bord (rien de cela n'est dans ce dépôt) : `ALLOWED_ORIGINS` des Edge Functions = origine du site (`https://<user>.github.io` ou le domaine), `TURNSTILE_SECRET_KEY` et `IP_HASH_SECRET` en secrets des fonctions (sans eux, aucun aperçu web : 503) ; CAPTCHA activé dans Authentication > Attack Protection avec la clé secrète Turnstile ; SMTP à soi et modèles « Magic Link » et « Change Email Address » avec `{{ .Token }}` ; adresse de la web app dans Auth > URL Configuration > Redirect URLs ; vérifier l'IP cliente vue par les fonctions (`CLIENT_IP_HEADER`) ; filigrane incrusté côté serveur (options dans `supabase/functions/README.md`) ; Stripe Radar actif sur le compte Stripe relié à RevenueCat.

### Comptes réels à créer

- **Supabase** : projet de dev (migrations et Edge Functions de la branche `main` du dépôt de l'app, déploiement décrit dans `supabase/functions/README.md`), réglages ci-dessus ; clé anon ou publishable pour `VITE_SUPABASE_ANON_KEY`.
- **RevenueCat Web Billing** relié à un compte **Stripe** : produits web aux mêmes identifiants (`bopsy_weekly` avec la période d'introduction 7,99 $ pendant 2 semaines, `bopsy_yearly`, `bopsy_coins_600`, `bopsy_coins_1500`), entitlement `pro`, offering courante avec les deux plans (les packs dans la même offering ou une autre), clé publique Web Billing ; le webhook existant crédite `store = RC_BILLING`. Taxes (Stripe Tax), pays de vente (D115).
- **Cloudflare Turnstile** (gratuit) : un widget en mode « Managed » (ou « Invisible »), noms d'hôte = domaine du site (`<user>.github.io` puis le domaine à soi ; `localhost` pour un essai local). Sa clé de site va dans `VITE_TURNSTILE_SITE_KEY` ; sa clé secrète dans Supabase (Authentication > Attack Protection, CAPTCHA Turnstile) et dans le secret `TURNSTILE_SECRET_KEY` des Edge Functions (le même widget peut servir aux deux, D132). Jamais la clé secrète dans ce dépôt ni dans une variable `VITE_`.
- **Apple Pay et Google Pay** : le paiement s'affiche dans notre page ; Apple Pay demande d'enregistrer le domaine (fichier `/.well-known/apple-developer-merchantid-domain-association` à la racine du domaine, procédure Stripe ou RevenueCat à confirmer). Le site est sur `bopsyia.com` : le fichier se dépose dans `.well-known/` à la racine de ce dépôt, le workflow le publie.

### Mesures (Lighthouse 13.6, mobile, 4G simulée, `vite build` + `vite preview`, mode démo)

| Version | Score | FCP | LCP | TBT | Transféré |
| --- | --- | --- | --- | --- | --- |
| Images et police non préparées (JPEG 800 × 1000, TTF variable 400 Ko) | 79 | 1,08 s | 5,64 s | 0 ms | 995 Ko |
| Premier build (WebP 360 × 450, woff2 latin 17 Ko, JS 28 Ko gzip) | 100 | 0,76 s | 1,82 s | 0 ms | 146 Ko |
| Après (CSS en ligne, affiches préchargées, écrans séparés, JS 21 Ko gzip) | 100 | 0,61 s | 1,46 s | 0 ms | 138 Ko |
| Règles du serveur (limites, CAPTCHA, aperçu privé, ?sim=), tout dans le premier chunk (JS 22,6 Ko transférés) | 100 | 0,61 s | 1,54 s | 0 ms | 140 Ko |
| Idem, contrôleur du parcours chargé avec les écrans suivants (JS 20,5 Ko transférés) | 100 | 0,62 s | 1,46 s | 0 ms | 138 Ko |

Commande : `npx lighthouse http://localhost:4173/ --preset=perf --form-factor=mobile --throttling-method=simulate --chrome-flags="--headless=new" --output=json --output-path=lighthouse/after.json`, résumé par `node scripts/lighthouse-summary.mjs lighthouse/after.json`. Trois passages par version, écarts de moins de 5 ms. Sous Windows, `C:\Windows\System32` doit être dans le PATH (à la fin, pour garder le `timeout` de Git Bash) : sans `taskkill`, Lighthouse écrit son rapport puis attend Chrome plusieurs minutes. En mode réel s'ajoute la requête du catalogue (préconnexion à Supabase dans `index.html`) et le poids des vraies affiches ; Turnstile n'est jamais chargé sur le catalogue.

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
3. Mode réel : Settings > Secrets and variables > Actions > **Variables** (onglet Variables, pas Secrets : ce sont des clés publiques) : `VITE_SUPABASE_URL` (`https://<ref>.supabase.co`), `VITE_SUPABASE_ANON_KEY` (clé anon ou publishable), `VITE_REVENUECAT_WEB_KEY` (`rcb_...`), `VITE_TURNSTILE_SITE_KEY` (clé de site Turnstile, `0x4AAAAAAA...`). L'action les passe toutes les quatre au build. Sans aucune, le site publié est en mode démo ; avec une partie seulement, le build échoue et rien n'est publié.
4. Relancer l'action (Actions > Pages > Run workflow) après chaque changement de variable.

Adresses obtenues (remplacer `<user>` par le compte GitHub) :

- `https://bopsyia.com/` (landing) et `https://bopsyia.com/app/` (web app), domaine à soi branché sur GitHub Pages (fichier `CNAME`)
- `https://bopsyia.com/terms/`, `.../privacy/`, `.../support/`

Elles vont dans le build de l'app iOS (`--dart-define=TERMS_URL=…`, `PRIVACY_URL=…`, `SUPPORT_URL=…`), dans App Store Connect (Privacy Policy URL, Support URL) et dans la description. Un domaine à soi peut s'ajouter plus tard (Settings > Pages > Custom domain) : changer alors les trois valeurs, `ALLOWED_ORIGINS` (et `ALLOWED_WEB_ORIGINS` s'il est posé), les Redirect URLs de Supabase et les noms d'hôte du widget Turnstile.
