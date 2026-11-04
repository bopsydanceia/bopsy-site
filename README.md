# Bopsy, pages publiques (GitHub Pages)

Pages exigées par Apple et liées dans l'app (07, 13, 17, 21) : `privacy/`, `terms/`, `support/`, `delete-data/`, plus `legal/` (mentions légales, éditeur français) et une page d'accueil. HTML statique, sans build.

## À remplir avant de publier

Chercher `[` dans les fichiers (les trous sont surlignés en jaune dans les pages) :

- `[COMPANY LEGAL NAME]`, `[ADDRESS]`, `[LEGAL FORM, SHARE CAPITAL]`, `[REGISTERED ADDRESS]`, `[RCS / SIREN NUMBER]`, `[NAME]` (directeur de la publication)
- `[SUPPORT EMAIL]` (aussi dans les liens `mailto:`)
- `[AI VIDEO PROVIDER]` et `[MODERATION PROVIDER]` une fois choisis (HUMAN-TODO 3 et 8), puis la mention `[TO CONFIRM IN WRITING WITH EACH PROVIDER]` une fois l'engagement « pas d'entraînement sur vos photos » obtenu par écrit
- `[GOVERNING LAW ...]` dans les Terms

Faire relire Privacy et Terms par un conseil avant la soumission (HUMAN-TODO 18).

## Publier

Le dépôt de l'app restera privé ; GitHub Pages n'est gratuit que pour un dépôt public, d'où ce dépôt à part.

```bash
gh repo create bopsy-site --public --source . --push
gh api -X POST repos/{owner}/bopsy-site/pages -f "source[branch]=main" -f "source[path]=/"
```

Ou dans GitHub : Settings > Pages > Deploy from a branch > `main` / `(root)`.

Adresses obtenues (remplacer `<user>` par le compte GitHub) :

- `https://<user>.github.io/bopsy-site/terms/`
- `https://<user>.github.io/bopsy-site/privacy/`
- `https://<user>.github.io/bopsy-site/support/`

Elles vont dans le build de l'app (`--dart-define=TERMS_URL=…`, `PRIVACY_URL=…`, `SUPPORT_URL=…`), dans App Store Connect (Privacy Policy URL, Support URL) et dans la description. Un domaine à soi peut s'ajouter plus tard (fichier `CNAME`, Settings > Pages > Custom domain) : changer alors les trois valeurs.
