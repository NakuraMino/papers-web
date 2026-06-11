// Vercel serverless entry. An explicit rewrite in vercel.json sends every
// /api/* request (any depth) to this function, and an Express app is itself a
// (req, res) handler, so we just mount it. (We avoid a [...slug] catch-all file
// because Vercel was matching it only one segment deep, 404-ing /api/:conf/:x.)
// The papers corpus (data/**) is bundled into the function via vercel.json's
// includeFiles so db.mjs can read it at runtime.
import app from '../server/app.mjs';

export default app;
