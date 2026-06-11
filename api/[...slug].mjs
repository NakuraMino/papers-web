// Vercel serverless entry. Vercel routes every /api/* request to this catch-all
// function, and an Express app is itself a (req, res) handler, so we just mount
// it. The papers corpus (data/**) is bundled into the function via vercel.json's
// includeFiles so db.mjs can read it at runtime.
import app from '../server/app.mjs';

export default app;
