# Mettre le jeu en ligne pour tout le monde (gratuit)

Le jeu sera sur une **adresse fixe** (du genre `https://hospital-patient-zero.onrender.com`),
accessible **à toute heure, même PC éteint**. Il faut créer 3 comptes gratuits : compte
3 fois 2 minutes. Aucune carte bancaire n'est demandée.

> ⏳ Hébergement gratuit = il **s'endort après 15 min sans joueur**. Le premier qui arrive
> attend environ 1 minute (écran « réveil »), ensuite c'est normal pour tout le monde.
> Les comptes, pièces, succès et le classement sont gardés dans Upstash : rien ne se perd.

---

## 1. GitHub : déposer le jeu

1. Crée un compte sur **https://github.com** (bouton *Sign up*).
2. En haut à droite : **+** → **New repository**.
   - *Repository name* : `hospital-patient-zero`
   - Coche **Private** (personne ne voit le code) → **Create repository**.
3. Sur la page qui s'ouvre, clique sur le lien **« uploading an existing file »**.
4. Ouvre le dossier **`Téléchargements\patient-zero-a-envoyer`**, sélectionne **tout son
   contenu** (Ctrl+A) et **glisse-le** dans la page GitHub. Attends la fin du chargement.
5. En bas : **Commit changes**.

## 2. Upstash : la sauvegarde des comptes

1. Va sur **https://upstash.com** → *Sign up* (tu peux utiliser ton compte GitHub).
2. **Create Database** → type **Redis** → nom `patient-zero` → région **eu-west** (Europe)
   → offre **Free** → *Create*.
3. Sur la page de la base, cherche la partie **REST API** et garde ouvertes les deux valeurs :
   - `UPSTASH_REDIS_REST_URL` (commence par `https://`)
   - `UPSTASH_REDIS_REST_TOKEN` (une longue suite de caractères — **ne la partage avec personne**)

## 3. Render : allumer le jeu

1. Va sur **https://render.com** → *Get Started* → **Sign up with GitHub**.
2. **New +** → **Blueprint** → choisis ton dépôt `hospital-patient-zero`
   (si Render ne le voit pas : *Configure account* et autorise ce dépôt).
3. Render lit le fichier `render.yaml` et te demande 2 valeurs : colle
   `UPSTASH_REDIS_REST_URL` et `UPSTASH_REDIS_REST_TOKEN` de l'étape 2 → **Apply**.
4. Attends 3 à 6 minutes (construction). Quand c'est **Live**, l'adresse du jeu est en haut
   de la page du service : c'est **le lien à envoyer à tout le monde**.

## 4. (Facultatif) Garder les comptes déjà créés sur ce PC

Dans un terminal, dans le dossier du jeu (`Téléchargements\hospital-—-patient-zero`) :

```
set UPSTASH_REDIS_REST_URL=colle-ici-l-url
set UPSTASH_REDIS_REST_TOKEN=colle-ici-le-token
npx tsx server/copier-comptes-vers-upstash.ts
```

Fais-le **avant** que des joueurs créent des comptes sur la version en ligne
(sinon il refuse d'écraser ; `--forcer` à la fin pour remplacer quand même).
Ensuite, sur Render : *Manual Deploy* → *Restart service* pour qu'il recharge les comptes.

## 5. Installer le jeu (comme une vraie appli)

- **PC (Chrome / Edge)** : ouvre le lien → bouton **📲 Installer le jeu** dans le menu
  (ou l'icône d'installation dans la barre d'adresse). Il apparaît dans le menu Démarrer.
- **Android (Chrome)** : bouton **📲 Installer le jeu**, ou menu ⋮ → *Installer l'application*.
- **iPhone / iPad (Safari)** : bouton Partager → **Sur l'écran d'accueil**.

Une fois installé, le **mode solo marche même sans Internet**. Les comptes, la boutique,
le classement et le multijoueur ont besoin d'Internet.

## Mettre à jour le jeu plus tard

Quand le jeu change, renvoie les fichiers modifiés sur GitHub (*Add file → Upload files*,
même dossier) : Render reconstruit et remet le jeu en ligne tout seul en quelques minutes.
