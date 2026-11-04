// GET /api/session: is editing set up? POST /api/session: is this passcode right?
import { sessionStatus, checkPasscode } from '../../lib/monitor-api.mjs';

export const onRequestGet = ({ env }) => sessionStatus(env);
export const onRequestPost = ({ request, env }) => checkPasscode(request, env);
