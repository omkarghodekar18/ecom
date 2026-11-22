// Media publicId → URL resolution for the catalog module.
//
// The dedicated media service (uploads, variants, CDN signing) is built in a
// later phase; until then publicIds resolve against the local adapter route
// `/media/{publicId}`. Keep every publicId→URL mapping in THIS file so the
// real MediaUrlBuilder can be swapped in at a single point. Do NOT import the
// media service here — this module must stay buildable before it exists.

/** publicId → URL (null passes through as null). */
export function mediaUrl(publicId: string | null): string | null {
  return publicId === null || publicId === '' ? null : `/media/${publicId}`;
}

/** Category icon URLs (navigation tree, category tiles). */
export function iconUrl(publicId: string | null): string | null {
  return mediaUrl(publicId);
}
