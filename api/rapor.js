// GET /rapor (rewritten here, see vercel.json). Own function so the ~1 MB
// report HTML is not bundled into api/route.js and does not slow its cold starts.
import { raporPage } from './_rapor.js';

export default function handler(req, res) {
  return raporPage(req, res);
}
