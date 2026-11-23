# Lecteur Drive

Application web (PWA) pour écouter sur iPhone les MP3 du dossier **« Musique »** de ton Google Drive. Elle fonctionne entièrement dans le navigateur (aucun serveur) et est hébergée sur GitHub Pages.

Fonctions : connexion Google (lecture seule), navigation par dossiers/albums triés par nom, lecture/pause, précédent/suivant, barre de progression, file d'attente, lecture aléatoire, répétition (off / tout / une piste), lecture d'un dossier entier (sous-dossiers compris), lecture en arrière-plan et commandes sur l'écran verrouillé, titre/artiste/album/pochette lus dans les tags ID3, mode sombre automatique, reprise de la dernière piste et de la position.

## 1. Configurer Google Cloud (une seule fois)

L'écran de Google change parfois de libellés ; les noms ci-dessous sont ceux de la console actuelle.

1. Va sur <https://console.cloud.google.com> avec ton compte Google.
2. **Créer un projet** : sélecteur de projet en haut → *Nouveau projet* → nom `Lecteur Drive` → *Créer*. Vérifie qu'il est bien sélectionné.
3. **Activer l'API Drive** : menu ☰ → *API et services* → *Bibliothèque* → `Google Drive API` → *Activer*.
4. **Écran de consentement** : menu ☰ → *Google Auth Platform* → *Commencer*. Nom `Lecteur Drive`, e-mail d'assistance : ton adresse. Audience : **Externe**. E-mail de contact : ton adresse. *Créer*.
5. **Te déclarer testeur** : *Audience* → *Utilisateurs test* → *Add users* → ton adresse Gmail → *Enregistrer*. L'état de publication reste **« Test »** (ne publie pas l'application).
6. **Déclarer la permission** : *Accès aux données* → *Ajouter ou supprimer des niveaux d'accès* → coche `.../auth/drive.readonly` → *Mettre à jour* → *Enregistrer*.
7. **Identifiant client** : *Clients* → *Créer un client* → **Application Web**.
   - *Origines JavaScript autorisées* : `https://TON-PSEUDO.github.io` (sans `/` final, sans nom de dépôt).
   - *URI de redirection autorisés* : `https://TON-PSEUDO.github.io/NOM-DU-DEPOT/` (avec le `/` final ; sert à la connexion « alternative »).
   - Copie l'**ID client** (`…apps.googleusercontent.com`) dans `src/config.js`. Il est public. Il n'y a **aucun secret** dans cette app : ne colle jamais de « secret client ».

En mode « Test », Google redemande une connexion environ **tous les 7 jours** et affiche « Google n'a pas validé cette application » : *Paramètres avancés* → *Accéder à Lecteur Drive (non sécurisé)*. C'est normal, c'est ton application.

## 2. Déployer sur GitHub Pages

1. Dépôt GitHub **public** (Pages gratuit l'exige ; le dépôt ne contient aucun secret ni aucune donnée de ton Drive).
2. *Settings* → *Pages* → *Build and deployment* → **Source : GitHub Actions**.
3. Chaque `git push` sur `main` construit et déploie l'app (onglet *Actions*, 1 à 2 min). Adresse : `https://TON-PSEUDO.github.io/NOM-DU-DEPOT/`.
4. Si besoin, relance à la main : *Actions* → *Déploiement sur GitHub Pages* → *Run workflow*.

## 3. Installer sur l'iPhone

1. Ouvre l'adresse **dans Safari**.
2. *Partager* (carré avec flèche) → *Sur l'écran d'accueil* → *Ajouter*.
3. Lance l'app depuis l'icône. Pour mettre à jour l'app, ferme-la complètement et rouvre-la (la nouvelle version est prise au lancement suivant).

## 4. Utilisation

- Crée dans « Mon Drive » (à la racine) un dossier nommé exactement **`Musique`** et organise-y tes MP3 en sous-dossiers (un par album, par exemple). Le nom se change dans `src/config.js` (`ROOT_FOLDER_NAME`).
- **L'app ne montre et ne lit que ce dossier.** Précision honnête : Google ne sait pas limiter une autorisation à un seul dossier ; le jeton garde donc la permission « lecture seule du Drive » et la restriction est appliquée par l'app (le code est public et vérifiable).
- Touche une piste : la file d'attente est le dossier affiché, à partir de cette piste. « ▶ Lire le dossier » lit le dossier et ses sous-dossiers ; « 🔀 Aléatoire » fait pareil dans le désordre.
- Touche le mini-lecteur en bas pour ouvrir le lecteur plein écran (progression, file d'attente, aléatoire, répétition).
- Le roue dentée ouvre les réglages : diagnostic, actualisation des dossiers, déconnexion.

## 5. À vérifier sur ton iPhone (ce que les tests ne peuvent pas couvrir)

Les tests automatiques tournent sur Chromium avec un profil d'iPhone et un faux Google. Ce n'est **pas** un vrai Safari iOS. À contrôler toi-même, depuis l'icône de l'écran d'accueil :

1. [ ] Connexion Google en mode app, et après fermeture/réouverture de l'app (reconnexion discrète ou bandeau « Reconnecter »).
2. [ ] Le dossier « Musique » s'affiche ; navigation dans les albums ; tri correct (01, 02… 10).
3. [ ] Une piste démarre en 1 à 3 s sur Wi-Fi/4G ; la barre de progression se déplace au doigt.
4. [ ] **Écran verrouillé** : le son continue ; titre, artiste, album et pochette s'affichent ; pause/lecture, précédent/suivant et la barre de position fonctionnent depuis l'écran verrouillé et le centre de contrôle.
5. [ ] **Enchaînement écran verrouillé** : laisse une piste se terminer iPhone verrouillé : la suivante démarre sans blanc audible (c'est le test le plus important du préchargement).
6. [ ] Application en arrière-plan (retour à l'écran d'accueil) : la lecture continue.
7. [ ] Appel téléphonique ou casque/Bluetooth débranché : la lecture se met en pause et reprend proprement.
8. [ ] Aléatoire, répétition (tout / une piste), « Lire le dossier » avec sous-dossiers.
9. [ ] Fermer complètement l'app puis la rouvrir : dernière piste et position retrouvées (lecture à la demande).
10. [ ] Après plus d'1 h d'usage : le jeton se renouvelle seul, ou le bandeau « Reconnecter » apparaît sans couper la piste en cours.
11. [ ] Mode sombre (Réglages iOS → Affichage) : l'interface suit automatiquement.
12. [ ] Fichiers de plus de 30 Mo (le plus gros connu : 29 Mo) : démarrage acceptable en 4G.

## Comment ça marche (choix techniques)

- **Lecture** : chaque MP3 est téléchargé en entier avec l'en-tête `Authorization` (une balise `<audio>` ne peut pas en envoyer), puis lu via une URL `blob:` locale. Safari iOS gère bien les blobs (déplacement dans la piste compris) ; une fois le fichier reçu, l'expiration du jeton ne coupe plus rien ; la même mécanique servira au hors ligne. Les pistes suivantes (2 d'avance) sont préchargées pendant la lecture ; seules précédente, courante et 3 suivantes sont gardées en mémoire, le reste est libéré. Cela convient à des MP3 de 10 à 30 Mo ; des fichiers de plusieurs centaines de Mo ne seraient pas adaptés.
- **Un seul élément `<audio>`** est réutilisé et « activé » par le premier tap : sur iOS, c'est ce qui autorise la suite de la lecture (changement de piste, écran verrouillé).
- **Connexion** : Google Identity Services (modèle « jeton », sans serveur) ; repli par redirection OAuth dans la même fenêtre si le pop-up est bloqué. Le jeton (1 h) est renouvelé 5 min avant son expiration ; en cas d'échec, un bandeau propose de se reconnecter et la piste en cours continue.
- **Service worker** : ne met en cache que l'interface (HTML/CSS/JS/icônes). Il ignore Google et l'audio.
- **Couche de stockage** (`src/storage/`) : seul point d'accès aux fichiers (`listChildren`, `getMeta`, `getBlob`). Aujourd'hui Drive ; plus tard un cache local peut être placé devant.

## Hors ligne (prévu, pas encore implémenté)

Piste retenue : stocker les MP3 téléchargés comme *Blob* dans **IndexedDB** (clé = identifiant du fichier Drive). Un `CacheSource` serait interrogé avant Drive et le lecteur continuerait de passer par `getBlob()`. IndexedDB est préférée à la Cache API : elle gère simplement les blobs, la suppression par album et l'inventaire.
Limites iOS à garder en tête : quota de stockage variable selon l'espace libre de l'iPhone ; le système peut évincer des données sous pression de stockage (demander `navigator.storage.persist()`) ; l'éviction après 7 jours d'inactivité concerne Safari, pas une app installée sur l'écran d'accueil ; il faudra afficher l'espace utilisé et permettre de supprimer un album.

## Développement

```bash
npm install
npm run dev      # serveur local, http://localhost:5173
npm test         # tests (Chromium profil iPhone, Google simulé)
npm run build    # génère dist/ (et le service worker)
```
