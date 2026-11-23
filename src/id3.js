// Lecture des tags ID3 (v2.2, v2.3, v2.4 et repli v1) : titre, artiste, album, n° de piste, pochette.
// Travaille sur le Blob déjà téléchargé : aucune requête réseau en plus.

const synchsafe = (b, o) => ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f);
const be32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

function unsync(bytes) {
  const out = new Uint8Array(bytes.length);
  let n = 0;
  for (let i = 0; i < bytes.length; i++) {
    out[n++] = bytes[i];
    if (bytes[i] === 0xff && bytes[i + 1] === 0x00) i++;
  }
  return out.subarray(0, n);
}

function decode(bytes, enc) {
  let b = bytes;
  let label = 'iso-8859-1';
  if (enc === 1) {
    if (b[0] === 0xff && b[1] === 0xfe) { label = 'utf-16le'; b = b.subarray(2); }
    else if (b[0] === 0xfe && b[1] === 0xff) { label = 'utf-16be'; b = b.subarray(2); }
    else label = 'utf-16le';
  } else if (enc === 2) label = 'utf-16be';
  else if (enc === 3) label = 'utf-8';
  return new TextDecoder(label).decode(b).replace(/\0+$/g, '').replace(/\0/g, ' / ').trim();
}

// Position du terminateur (1 octet, ou 2 octets alignés pour l'UTF-16) à partir de `start`.
function findTerm(b, start, enc) {
  if (enc === 1 || enc === 2) {
    for (let i = start; i + 1 < b.length; i += 2) if (b[i] === 0 && b[i + 1] === 0) return [i, 2];
    return [b.length, 0];
  }
  const i = b.indexOf(0, start);
  return i < 0 ? [b.length, 0] : [i, 1];
}

function parsePicture(d, v22) {
  const enc = d[0];
  let o = 1;
  let mime;
  if (v22) {
    mime = 'image/' + decode(d.subarray(1, 4), 0).toLowerCase().replace('jpg', 'jpeg');
    o = 4;
  } else {
    const [end, len] = findTerm(d, 1, 0);
    mime = decode(d.subarray(1, end), 0) || 'image/jpeg';
    o = end + len;
  }
  o += 1; // type d'image
  const [dEnd, dLen] = findTerm(d, o, enc);
  const data = d.subarray(dEnd + dLen);
  if (!data.length) return null;
  if (!mime.startsWith('image/')) mime = data[0] === 0x89 ? 'image/png' : 'image/jpeg';
  return { mime, data: data.slice() };
}

function parseV2(buf) {
  const ver = buf[3];
  if (ver < 2 || ver > 4) return {};
  const flags = buf[5];
  const size = synchsafe(buf, 6);
  let body = buf.subarray(10, 10 + size);
  if (flags & 0x80 && ver < 4) body = unsync(body);
  let o = 0;
  if (flags & 0x40) o = ver === 4 ? synchsafe(body, 0) : be32(body, 0) + 4; // en-tête étendu
  const idLen = ver === 2 ? 3 : 4;
  const hdr = ver === 2 ? 6 : 10;
  const tags = {};
  while (o + hdr <= body.length && body[o] !== 0) {
    const id = String.fromCharCode(...body.subarray(o, o + idLen));
    const fsize = ver === 2 ? (body[o + 3] << 16) | (body[o + 4] << 8) | body[o + 5] : ver === 4 ? synchsafe(body, o + 4) : be32(body, o + 4);
    let data = body.subarray(o + hdr, o + hdr + fsize);
    if (ver === 4 && body[o + 9] & 0x02) data = unsync(data);
    o += hdr + fsize;
    if (!data.length || fsize < 0) continue;
    const text = () => decode(data.subarray(1), data[0]);
    switch (id) {
      case 'TIT2': case 'TT2': tags.title = text(); break;
      case 'TPE1': case 'TP1': tags.artist = text(); break;
      case 'TPE2': case 'TP2': tags.albumArtist = text(); break;
      case 'TALB': case 'TAL': tags.album = text(); break;
      case 'TRCK': case 'TRK': tags.track = text(); break;
      case 'APIC': case 'PIC': if (!tags.cover) tags.cover = parsePicture(data, id === 'PIC'); break;
      default:
    }
  }
  return tags;
}

function parseV1(b) {
  const s = (a, z) => decode(b.subarray(a, z), 0);
  const tags = { title: s(3, 33), artist: s(33, 63), album: s(63, 93) };
  if (b[125] === 0 && b[126]) tags.track = String(b[126]);
  return tags;
}

const BR = {
  1: { 1: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448], 2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384], 3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320] },
  2: { 1: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256], 2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160], 3: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160] },
};
const SR = { 1: [44100, 48000, 32000], 2: [22050, 24000, 16000], 25: [11025, 12000, 8000] };

/** Cherche la première trame MPEG et en lit débit, fréquence et nombre de canaux. */
function parseMpeg(b) {
  for (let i = 0; i + 3 < b.length; i++) {
    if (b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) continue;
    const vb = (b[i + 1] >> 3) & 3, lb = (b[i + 1] >> 1) & 3;
    const bi = (b[i + 2] >> 4) & 15, si = (b[i + 2] >> 2) & 3, ch = (b[i + 3] >> 6) & 3;
    if (vb === 1 || lb === 0 || bi === 0 || bi === 15 || si === 3) continue;
    const ver = vb === 3 ? 1 : vb === 2 ? 2 : 25;
    const kbps = BR[ver === 1 ? 1 : 2][4 - lb]?.[bi];
    if (!kbps) continue;
    return { kbps, khz: Math.round(SR[ver][si] / 1000), channels: ch === 3 ? 1 : 2 };
  }
  return null;
}

/** @returns {Promise<{title?:string,artist?:string,album?:string,track?:string,cover?:{mime:string,data:Uint8Array}}>} */
export async function readTags(blob) {
  const head = new Uint8Array(await blob.slice(0, 10).arrayBuffer());
  if (head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) { // « ID3 »
    const size = synchsafe(head, 6);
    const buf = new Uint8Array(await blob.slice(0, 10 + size).arrayBuffer());
    let tags = {};
    try { tags = clean(parseV2(buf)); } catch { /* tags illisibles : on garde le nom de fichier */ }
    const start = 10 + size + (head[5] & 0x10 ? 10 : 0);
    const audio = parseMpeg(new Uint8Array(await blob.slice(start, start + 8192).arrayBuffer()));
    if (audio) tags.audio = audio;
    return tags;
  }
  const audio = parseMpeg(new Uint8Array(await blob.slice(0, 8192).arrayBuffer()));
  if (blob.size > 128) {
    const tail = new Uint8Array(await blob.slice(blob.size - 128).arrayBuffer());
    if (tail[0] === 0x54 && tail[1] === 0x41 && tail[2] === 0x47) return { ...clean(parseV1(tail)), ...(audio ? { audio } : {}) };
  }
  return audio ? { audio } : {};
}

function clean(t) {
  for (const k of ['title', 'artist', 'album', 'track', 'albumArtist']) if (!t[k]) delete t[k];
  if (!t.artist && t.albumArtist) t.artist = t.albumArtist;
  return t;
}
