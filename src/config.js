// Configuration publique (aucun secret ici).
// L'identifiant client OAuth Google est public : il est fait pour être visible dans le navigateur.
export const CLIENT_ID = '945758668440-gg9b4hmrguu2476i6m8u9lgqgdumjdt4.apps.googleusercontent.com';

// Lecture seule. drive.readonly est le plus restreint qui permette de parcourir des dossiers existants
// (drive.file obligerait à sélectionner chaque fichier à la main).
export const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

// L'app ne montre et ne lit que le contenu de ce dossier, situé à la racine de « Mon Drive ».
// (Google ne permet pas de limiter le jeton à un seul dossier : la restriction est dans l'app.)
export const ROOT_FOLDER_NAME = 'Musique';
