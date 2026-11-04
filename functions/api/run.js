// POST /api/run: "Check for updates" starts a collection on GitHub (team passcode).
import { startRun } from '../../lib/monitor-api.mjs';

export const onRequestPost = ({ request, env }) => startRun(request, env);
