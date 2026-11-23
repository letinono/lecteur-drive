# Lecteur Drive

Application web (PWA) pour écouter sur iPhone les MP3 de son Google Drive. Elle fonctionne entièrement dans le navigateur (aucun serveur) et se déploie sur GitHub Pages.

> **État : étape 1 (prototype).** Connexion Google, navigation dans le Drive, mémorisation du dossier racine, test de lecture d'un MP3. Le vrai lecteur (file d'attente, écran verrouillé, tags ID3…) vient après validation de la connexion sur ton iPhone.

## 1. Configurer Google Cloud (une seule fois)

L'écran de Google change parfois de libellés ; les noms ci-dessous sont ceux de la console actuelle.

1. Va sur <https://console.cloud.google.com> avec ton compte Google.
2. **Créer un projet** : en haut, le sélecteur de projet → *Nouveau projet* → nom `Lecteur Drive` → *Créer*. Vérifie qu'il est bien sélectionné.
3. **Activer l'API Drive** : menu ☰ → *API et services* → *Bibliothèque* → cherche `Google Drive API` → *Activer*.
4. **Écran de consentement** : menu ☰ → *Google Auth Platform* → *Commencer*.
   - Nom de l'application : `Lecteur Drive`, e-mail d'assistance : ton adresse.
   - Audience : **Externe**. E-mail de contact : ton adresse. Accepte les conditions, *Créer*.
5. **Te déclarer testeur** : *Google Auth Platform* → *Audience* → section *Utilisateurs test* → *Add users* → ajoute **ton adresse Gmail** → *Enregistrer*. L'état de publication reste **« Test »** (ne clique pas sur « Publier »).
6. **Déclarer la permission** : *Accès aux données* → *Ajouter ou supprimer des niveaux d'accès* → coche `.../auth/drive.readonly` (lecture seule) → *Mettre à jour* → *Enregistrer*.
7. **Créer l'identifiant client** : *Clients* → *Créer un client* → type **Application Web**, nom `Lecteur Drive`.
   - *Origines JavaScript autorisées* → ajoute `https://TON-PSEUDO.github.io` (sans `/` à la fin, sans le nom du dépôt).
   - *URI de redirection autorisés* → ajoute `https://TON-PSEUDO.github.io/NOM-DU-DEPOT/` (avec le `/` final ; utile seulement pour la connexion « alternative »).
   - *Créer*, puis copie l'**ID client** (il finit par `.apps.googleusercontent.com`). Il est public : tu peux le mettre dans le dépôt. Ne télécharge/colle jamais de « secret client » : l'app n'en a pas besoin.
8. Ouvre `src/config.js` et remplace `VOTRE_ID_CLIENT.apps.googleusercontent.com` par ton ID.

Bon à savoir : en mode « Test », Google demande de se reconnecter environ **tous les 7 jours** et affiche « Google n'a pas validé cette application » : touche *Paramètres avancés* → *Accéder à Lecteur Drive (non sécurisé)*. C'est normal, c'est ton application.

## 2. Déployer sur GitHub Pages

1. Sur GitHub : *New repository*, nom `lecteur-drive` (ou autre), sans README ni licence.
2. Envoie-y le code de ce dossier (`git remote add origin …` puis `git push -u origin main`).
3. Dans le dépôt : *Settings* → *Pages* → *Build and deployment* → **Source : GitHub Actions**.
4. L'onglet *Actions* montre le déploiement (1 à 2 min). L'adresse finale est `https://TON-PSEUDO.github.io/NOM-DU-DEPOT/`.
5. Chaque `git push` sur `main` redéploie automatiquement.

Si tu changes le nom du dépôt, mets à jour l'URI de redirection (étape 1.7).

## 3. Installer sur l'iPhone

1. Ouvre l'adresse GitHub Pages **dans Safari** (pas dans un autre navigateur).
2. Touche le bouton *Partager* (carré avec flèche) → *Sur l'écran d'accueil* → *Ajouter*.
3. Lance l'app depuis l'icône ; elle s'ouvre en plein écran.

## 4. À vérifier sur ton iPhone (prototype)

Ouvre l'app **depuis l'icône de l'écran d'accueil** (c'est le cas le plus délicat) :

1. [ ] Le diagnostic indique « Mode app : oui ».
2. [ ] *Se connecter avec Google* ouvre bien la fenêtre Google et on revient dans l'app, connecté. Note ce qui se passe exactement (pop-up bloquée ? retour dans Safari ?).
3. [ ] Si l'étape 2 échoue, essaie *Connexion alternative* et note le résultat.
4. [ ] Ton Drive s'affiche, on peut entrer dans un dossier, remonter, et « Choisir comme racine » ; après fermeture complète de l'app, elle rouvre sur ce dossier.
5. [ ] Toucher un MP3 le télécharge et le lit (le message indique taille et durée de téléchargement).
6. [ ] Pendant la lecture, verrouille l'iPhone : le son continue-t-il ?
7. [ ] *Tester le renouvellement* réussit (sans fenêtre, ou avec une fenêtre qui se ferme seule).
8. [ ] Laisse l'app ouverte > 1 h : le compteur « Jeton expire dans » se renouvelle-t-il tout seul ?

## Développement

```bash
npm install
npm run dev      # serveur local, http://localhost:5173
npm test         # tests (Chromium avec profil iPhone, Google simulé)
npm run build    # génère dist/ (et le service worker)
```

Le service worker (`src/sw-template.js`) ne met en cache que l'interface de l'app ; il ignore Google et les fichiers audio.

## Hors ligne (prévu, pas encore implémenté)

Piste retenue : stocker les MP3 téléchargés comme *Blob* dans **IndexedDB** (clé = identifiant du fichier Drive). La couche `src/storage/` est faite pour ça : un `CacheSource` interrogé avant Drive, et la lecture continue de passer par `getBlob()`. IndexedDB est préférée à la Cache API car elle gère simplement les blobs, la suppression par album et l'inventaire.
Limites iOS à garder en tête : quota de stockage variable selon l'espace libre de l'iPhone, possibilité d'éviction du stockage sous pression, `navigator.storage.persist()` à demander ; l'éviction après 7 jours d'inactivité concerne Safari, pas une app installée sur l'écran d'accueil.
