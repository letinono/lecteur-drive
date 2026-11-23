// Couche de stockage : seul point d'accès aux fichiers pour le reste de l'app.
// Aujourd'hui : Drive. Plus tard (hors ligne) : un cache IndexedDB consulté avant Drive.
//
// Interface attendue d'une source :
//   listChildren(folderId) -> { folders: [{id,name}], tracks: [{id,name,size}] }
//   getMeta(id)            -> { id, name, mimeType, size }
//   getBlob(id, {signal})  -> Blob
import { driveSource } from './drive.js';

export const storage = driveSource;
