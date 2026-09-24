// Keep the existing `npm start` command working while the backend implementation lives
// in its own directory for deployment to Render, Railway, Fly.io, or a VPS.
require('./backend/server');
