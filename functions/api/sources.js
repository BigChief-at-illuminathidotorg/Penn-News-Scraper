// POST /api/sources: add, edit or remove a source in sites.js (team passcode).
import { changeSources } from '../../lib/monitor-api.mjs';

export const onRequestPost = ({ request, env }) => changeSources(request, env);
