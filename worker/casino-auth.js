// worker/casino-auth.js
// Sistema de autenticación DEDICADO para la Sala de PandaCoins (Casino).
// Independiente del boosting y del sistema admin. Sesiones KV con TTL 7 días.

const SESSION_TTL = 7 * 24 * 60 * 60; // 7 días en segundos
const LOGIN_RATE_LIMIT = 10;           // máx intentos login por IP
const LOGIN_RATE_WINDOW = 15 * 60;     // ventana de 15 minutos
const MAX_NAME_LEN = 24;
const MIN_NAME_LEN = 3;
const MIN_PASS_LEN = 4;

/** Hash SHA-256 de la contraseña con sal */
async function hashPassword(password, salt) {
  const data = new TextEncoder().encode(password + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hashBuffer)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Genera sal aleatoria (16 bytes hex) */
function generateSalt() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return [...arr].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Genera token de sesión aleatorio (32 bytes hex) */
function generateToken() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return [...arr].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Genera ID de usuario */
function generateUserId() {
  return 'casino_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

/** Sanitiza un nombre de aventurero (sin espacios raros, longitud controlada) */
function sanitizeName(raw) {
  return String(raw || '').trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LEN);
}

/**
 * Verifica un token de sesión del casino y devuelve el usuario o null.
 * @returns {Promise<{user_id:string,name:string}|null>}
 */
export async function verifyCasinoSession(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.substring(7).trim();
  if (!token) return null;
  try {
    const session = await env.EXILIUM_KV.get(`casino:session:${token}`, 'json');
    if (!session) return null;
    return session; // { user_id, name }
  } catch (_) { return null; }
}

/** POST /api/casino/auth/register — crear cuenta casino */
export async function handleCasinoRegister(request, env) {
  let body;
  try { body = await request.json(); } catch (_) { return { error: 'JSON inválido' }; }

  const name = sanitizeName(body.name);
  const password = (body.password || '').trim();

  if (name.length < MIN_NAME_LEN) {
    return { error: `El nombre debe tener al menos ${MIN_NAME_LEN} caracteres.` };
  }
  if (password.length < MIN_PASS_LEN) {
    return { error: `La contraseña debe tener al menos ${MIN_PASS_LEN} caracteres.` };
  }

  const nameLower = name.toLowerCase();

  // Verificar nombre único
  const existingId = await env.EXILIUM_KV.get(`casino:user:name:${nameLower}`);
  if (existingId) return { error: 'Ese nombre ya está en uso. Elige otro.' };

  // Crear usuario
  const userId = generateUserId();
  const salt = generateSalt();
  const passwordHash = await hashPassword(password, salt);

  // Saldo inicial desde config (default 1000)
  const config = await env.EXILIUM_KV.get('casino:config', 'json') || {};
  const initialBalance = Number(config.initial_balance) || 1000;

  const user = {
    id: userId,
    name,
    name_lower: nameLower,
    passwordHash,
    salt,
    balance: initialBalance,
    created_at: new Date().toISOString(),
    last_login: new Date().toISOString(),
    total_bet: 0,
    total_won: 0,
    rounds_played: 0,
  };

  await env.EXILIUM_KV.put(`casino:user:${userId}`, JSON.stringify(user));
  await env.EXILIUM_KV.put(`casino:user:name:${nameLower}`, userId);

  // Mantener índice de usuarios (para listado admin)
  try {
    const index = await env.EXILIUM_KV.get('casino:user_index', 'json') || [];
    if (!index.includes(userId)) {
      index.push(userId);
      await env.EXILIUM_KV.put('casino:user_index', JSON.stringify(index));
    }
  } catch (_) {}

  // Crear sesión
  const token = generateToken();
  const session = { user_id: userId, name };
  await env.EXILIUM_KV.put(`casino:session:${token}`, JSON.stringify(session), { expirationTtl: SESSION_TTL });

  return {
    ok: true,
    token,
    user: { id: userId, name, balance: user.balance },
  };
}

/** POST /api/casino/auth/login — iniciar sesión */
export async function handleCasinoLogin(request, env) {
  let body;
  try { body = await request.json(); } catch (_) { return { error: 'JSON inválido' }; }

  const name = sanitizeName(body.name);
  const password = (body.password || '').trim();

  if (!name || !password) return { error: 'Nombre y contraseña requeridos.' };

  // Rate limit: máx 10 intentos por IP en 15 min
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rateLimitKey = `casino:ratelimit:login:${ip}`;
  const attempts = await env.EXILIUM_KV.get(rateLimitKey, 'json') || { count: 0 };
  if (attempts.count >= LOGIN_RATE_LIMIT) {
    return { error: 'Demasiados intentos. Espera 15 minutos.' };
  }

  const nameLower = name.toLowerCase();
  const userId = await env.EXILIUM_KV.get(`casino:user:name:${nameLower}`);
  if (!userId) {
    attempts.count++;
    await env.EXILIUM_KV.put(rateLimitKey, JSON.stringify(attempts), { expirationTtl: LOGIN_RATE_WINDOW });
    return { error: 'Nombre de aventurero no encontrado. ¿Quizás quieres registrarte?' };
  }

  const user = await env.EXILIUM_KV.get(`casino:user:${userId}`, 'json');
  if (!user) return { error: 'Credenciales inválidas.' };

  const hash = await hashPassword(password, user.salt);
  if (hash !== user.passwordHash) {
    attempts.count++;
    await env.EXILIUM_KV.put(rateLimitKey, JSON.stringify(attempts), { expirationTtl: LOGIN_RATE_WINDOW });
    return { error: 'Contraseña incorrecta.' };
  }

  // Reset rate limit
  await env.EXILIUM_KV.delete(rateLimitKey);

  // Actualizar last_login
  user.last_login = new Date().toISOString();
  await env.EXILIUM_KV.put(`casino:user:${userId}`, JSON.stringify(user));

  const token = generateToken();
  const session = { user_id: userId, name: user.name };
  await env.EXILIUM_KV.put(`casino:session:${token}`, JSON.stringify(session), { expirationTtl: SESSION_TTL });

  return {
    ok: true,
    token,
    user: { id: userId, name: user.name, balance: user.balance },
  };
}

/** POST /api/casino/auth/logout — cerrar sesión */
export async function handleCasinoLogout(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try { await env.EXILIUM_KV.delete(`casino:session:${token}`); } catch (_) {}
  }
  return { ok: true };
}

/** GET /api/casino/me — datos del usuario actual */
export async function handleCasinoMe(request, env) {
  const session = await verifyCasinoSession(request, env);
  if (!session) return { error: 'No autenticado', status: 401 };

  const user = await env.EXILIUM_KV.get(`casino:user:${session.user_id}`, 'json');
  if (!user) return { error: 'Usuario no encontrado', status: 404 };

  return {
    ok: true,
    user: {
      id: user.id,
      name: user.name,
      balance: user.balance,
      created_at: user.created_at,
      total_bet: user.total_bet || 0,
      total_won: user.total_won || 0,
      rounds_played: user.rounds_played || 0,
    },
  };
}

/** Admin: GET /admin/casino/users — lista todos los usuarios */
export async function handleAdminGetCasinoUsers(env) {
  const list = await env.EXILIUM_KV.get('casino:user_index', 'json') || [];
  const users = [];
  for (const id of list) {
    const u = await env.EXILIUM_KV.get(`casino:user:${id}`, 'json');
    if (u) {
      users.push({
        id: u.id,
        name: u.name,
        balance: u.balance,
        created_at: u.created_at,
        last_login: u.last_login,
        total_bet: u.total_bet || 0,
        total_won: u.total_won || 0,
        rounds_played: u.rounds_played || 0,
      });
    }
  }
  return { ok: true, users };
}
