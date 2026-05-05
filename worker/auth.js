// worker/auth.js

const FAILED_ATTEMPTS_KEY = 'auth:failed_attempts';
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60;
const TOKEN_TTL = 8 * 60 * 60;
const TOKEN_TTL_MS = TOKEN_TTL * 1000;

/** Genera un token HMAC stateless: "timestamp.hex_signature" */
async function generateHmacToken(secret) {
  const ts = Date.now().toString();
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ts));
  const hex = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
  return `hmac.${ts}.${hex}`;
}

/** Verifica un token HMAC stateless (formato "hmac.timestamp.hex_signature") */
async function verifyHmacToken(token, secret) {
  if (!token || !token.startsWith('hmac.')) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [, ts, hex] = parts;
  const elapsed = Date.now() - Number(ts);
  if (isNaN(elapsed) || elapsed < 0 || elapsed > TOKEN_TTL_MS) return false;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ts));
  const expected = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
  return hex === expected;
}

export async function handleAdminLogin(request, env) {
  try {
    let failedAttempts = null;
    try { failedAttempts = await env.EXILIUM_KV.get(FAILED_ATTEMPTS_KEY, 'json'); } catch (_) {}

    if (failedAttempts && failedAttempts.count >= MAX_FAILED_ATTEMPTS) {
      return { error: 'Demasiados intentos fallidos. Inténtalo más tarde.' };
    }

    const body = await request.json();
    const password = body?.password;
    if (!password) {
      return { error: 'Falta la contraseña.' };
    }

    if (password === env.ADMIN_KEY) {
      try { await env.EXILIUM_KV.delete(FAILED_ATTEMPTS_KEY); } catch (_) {}
      // Intentar token KV; si falla, generar token HMAC stateless
      try {
        const token = crypto.randomUUID();
        const tokenKey = `auth:token:${token}`;
        await env.EXILIUM_KV.put(
          tokenKey,
          JSON.stringify({ user: 'admin', created: Date.now() }),
          { expirationTtl: TOKEN_TTL }
        );
        return { token };
      } catch (_kvErr) {
        const hmacToken = await generateHmacToken(env.ADMIN_KEY);
        return { token: hmacToken };
      }
    } else {
      try {
        const newAttempts = { count: (failedAttempts?.count || 0) + 1 };
        await env.EXILIUM_KV.put(
          FAILED_ATTEMPTS_KEY,
          JSON.stringify(newAttempts),
          { expirationTtl: LOCKOUT_DURATION }
        );
      } catch (_) {}
      return { error: 'Credenciales inválidas.' };
    }
  } catch (err) {
    return { error: 'Error en login: ' + err.message };
  }
}

export async function handleAdminAuth(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  const token = authHeader.substring(7);
  if (!token) {
    return false;
  }
  // Token HMAC stateless (fallback cuando KV put() no disponible)
  if (token.startsWith('hmac.')) {
    return verifyHmacToken(token, env.ADMIN_KEY);
  }
  // Token KV normal
  try {
    const tokenKey = `auth:token:${token}`;
    const session = await env.EXILIUM_KV.get(tokenKey);
    return session !== null;
  } catch (_) {
    return false;
  }
}

export function handlePublicAuth(request, env) {
  const token = request.headers.get('X-API-Token');
  if (!token || token !== env.API_RATINGS_TOKEN) {
    return false;
  }
  return true;
}
