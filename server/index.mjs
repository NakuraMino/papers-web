// Local server entry point: `npm start` (or `npm run dev`).
// Builds nothing new — just hosts the Express app from app.mjs on a port.
// On Vercel the same app is mounted by api/[...slug].mjs instead (no listen).
import app from './app.mjs';

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`[server] http://localhost:${PORT}`));
