// Which way this deploy talks to Vercel Blob. A store connected the older way
// sets BLOB_READ_WRITE_TOKEN ("token"). A newer store sets BLOB_STORE_ID and
// BLOB_WEBHOOK_PUBLIC_KEY and signs in with Vercel's automatic OIDC token
// ("presigned"). Server-side reads and writes work either way (the SDK picks
// the credentials); only the browser upload step differs.

export type BlobMode = "token" | "presigned" | "none";

export function blobMode(): BlobMode {
  if (process.env.BLOB_READ_WRITE_TOKEN) return "token";
  if (process.env.BLOB_STORE_ID) return "presigned";
  return "none";
}
