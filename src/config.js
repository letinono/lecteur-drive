// Configuration publique (aucun secret ici).
// L'identifiant client OAuth Google est public : il est fait pour être visible dans le navigateur.
// Voir le README, étape 1, pour l'obtenir.
export const CLIENT_ID = 'VOTRE_ID_CLIENT.apps.googleusercontent.com';

// Lecture seule. drive.readonly est le plus restreint qui permette de parcourir des dossiers existants
// (drive.file obligerait à sélectionner chaque fichier à la main).
export const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
