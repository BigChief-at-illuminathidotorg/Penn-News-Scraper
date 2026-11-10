// Verify Cloudflare Access signatures, audience and lifetime; never trust an email header.
const decoder = new TextDecoder();
const bytes = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
let cached;
export async function identity(request, env, fetcher = fetch) {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || !env.ADMIN_EMAIL || !env.STAFF_DB) throw Object.assign(Error('Staff sign-in is awaiting Cloudflare setup.'), {status:503});
  const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`;
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN)) throw Object.assign(Error('Invalid sign-in configuration.'), {status:503});
  const token = request.headers.get('Cf-Access-Jwt-Assertion') || request.headers.get('Cookie')?.match(/(?:^|;\s*)CF_Authorization=([^;]+)/)?.[1];
  try {
    if (!token || token.length > 16000) throw Error();
    const parts = token.split('.'); if(parts.length!==3) throw Error();
    const head = JSON.parse(decoder.decode(bytes(parts[0]))), claim = JSON.parse(decoder.decode(bytes(parts[1])));
    const now = Date.now()/1000;
    if (head.alg!=='RS256' || claim.iss!==issuer || !Array.isArray(claim.aud) || !claim.aud.includes(env.ACCESS_AUD) || typeof claim.exp!=='number' || claim.exp<=now || (claim.nbf && claim.nbf>now+30) || typeof claim.email!=='string' || !claim.email.includes('@')) throw Error();
    if (!cached || cached.issuer!==issuer || cached.until<Date.now() || !cached.keys.some(k=>k.kid===head.kid)) {
      const r=await fetcher(`${issuer}/cdn-cgi/access/certs`); if(!r.ok)throw Error();
      cached={issuer,keys:(await r.json()).keys,until:Date.now()+300000};
    }
    const jwk=cached.keys.find(k=>k.kid===head.kid); if(!jwk)throw Error();
    const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,bytes(parts[2]),new TextEncoder().encode(parts.slice(0,2).join('.')))) throw Error();
    return claim.email.trim().toLowerCase();
  } catch { throw Object.assign(Error('Sign in with your email to continue.'),{status:401}); }
}
export function sameOrigin(request) {
  if (request.method==='GET') return;
  if (request.headers.get('Origin')!==new URL(request.url).origin || !request.headers.get('Content-Type')?.startsWith('application/json')) throw Object.assign(Error('Please submit this request from the monitor.'),{status:403});
}
