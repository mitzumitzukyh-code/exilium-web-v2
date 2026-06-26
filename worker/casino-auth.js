// worker/casino-auth.js
// Sistema de autenticación DEDICADO para la Sala de PandaCoins (Casino).
// Independiente del boosting y del sistema admin. Sesiones KV con TTL 7 días.

const SESSION_TTL = 7 * 24 * 60 * 60; // 7 días en segundos
const LOGIN_RATE_LIMIT = 10;           // máx intentos login por IP
const LOGIN_RATE_WINDOW = 15 * 60;     // ventana de 15 minutos
const MAX_NAME_LEN = 24;
const MIN_NAME_LEN = 3;
const MIN_PASS_LEN = 4;

// C4 — Rate-limit de REGISTRO para evitar creación masiva de cuentas
// (farming de saldo inicial). Límite conservador: 5 cuentas por IP y hora.
const REGISTER_RATE_LIMIT = 5;
const REGISTER_RATE_WINDOW = 60 * 60;  // 1 hora

// A1 — Parámetros de PBKDF2 (key stretching). 100k iteraciones es un balance
// razonable para un Worker (CPU limitado) y ya hace inviable el brute-force
// offline si KV se filtra. SHA-256 como PRF, 32 bytes de salida.
const PBKDF2_ITERATIONS = 100_000;

/**
 * Hash de contraseña con PBKDF2 (key stretching). Formato de almacenamiento:
 *   "pbkdf2$<iteraciones>$<saltHex>$<hashHex>"
 * Sustituye al SHA-256 simple anterior, que era vulnerable a brute-force.
 */
async function hashPassword(password, saltHex) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const saltBytes = hexToBytes(saltHex);
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256 // 32 bytes
  );
  const hashHex = [...new Uint8Array(derived)].map(b => b.toString(16).padStart(2, '0')).join('');
  return `pbkdf2$${PBKDF2_ITERATIONS}$${saltHex}$${hashHex}`;
}

/** Convierte string hex a Uint8Array */
function hexToBytes(hex) {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return arr;
}

/**
 * Verifica una contraseña contra un hash PBKDF2 almacenado. Devuelve
 * { ok, needsRehash }. Los hashes legacy (SHA-256 sin prefijo) NO se verifican
 * aquí — se cubren en handleCasinoLogin donde se dispone de user.salt original.
 */
async function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return { ok: false, needsRehash: false };

  if (stored.startsWith('pbkdf2$')) {
    const parts = stored.split('$'); // ["pbkdf2", iter, saltHex, hashHex]
    if (parts.length !== 4) return { ok: false, needsRehash: false };
    const iter = parseInt(parts[1], 10);
    const saltHex = parts[2];
    const expectedHash = parts[3];
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
    );
    const derived = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: hexToBytes(saltHex), iterations: iter, hash: 'SHA-256' },
      keyMaterial, 256
    );
    const computed = [...new Uint8Array(derived)].map(b => b.toString(16).padStart(2, '0')).join('');
    const ok = timingSafeEqualHex(computed, expectedHash);
    // needsRehash si las iteraciones son menores que las actuales (migración)
    return { ok, needsRehash: ok && iter < PBKDF2_ITERATIONS };
  }

  // Legacy (SHA-256 sin prefijo): delegar a handleCasinoLogin (necesita user.salt)
  return { ok: false, needsRehash: false };
}

/** Comparación de strings hex en tiempo constante (anti timing attack) */
function timingSafeEqualHex(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
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
    // Verificar que el usuario no haya sido eliminado
    const deleted = await env.EXILIUM_KV.get(`casino:user:deleted:${session.user_id}`);
    if (deleted) {
      // Limpiar sesión huérfana
      await env.EXILIUM_KV.delete(`casino:session:${token}`);
      return null;
    }
    return session; // { user_id, name }
  } catch (_) { return null; }
}

/** POST /api/casino/auth/register — crear cuenta casino */
export async function handleCasinoRegister(request, env) {
  let body;
  try { body = await request.json(); } catch (_) { return { error: 'JSON inválido' }; }

  // C4 — Rate-limit por IP: bloquear creación masiva de cuentas (farm de saldo)
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rlKey = `casino:ratelimit:register:${ip}`;
  const attempts = await env.EXILIUM_KV.get(rlKey, 'json') || { count: 0 };
  if (attempts.count >= REGISTER_RATE_LIMIT) {
    return {
      error: 'Demasiadas cuentas creadas desde esta red. Espera una hora.',
      status: 429,
    };
  }

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
    avatar_url: null,
    discord_id: null,
    discord_username: null,
    ip_registered: ip, // C4 — trazabilidad por IP (auditoría anti-farm)
  };

  await env.EXILIUM_KV.put(`casino:user:${userId}`, JSON.stringify(user));
  await env.EXILIUM_KV.put(`casino:user:name:${nameLower}`, userId);

  // C4 — Incrementar contador de rate-limit para esta IP (cuenta el registro exitoso)
  attempts.count = (attempts.count || 0) + 1;
  await env.EXILIUM_KV.put(rlKey, JSON.stringify(attempts), { expirationTtl: REGISTER_RATE_WINDOW });

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
  if (!user || !user.passwordHash) return { error: 'Credenciales inválidas.' };

  // A1 — Verificar contraseña con soporte legacy + rehash automático a PBKDF2.
  const verified = await verifyPassword(password, user.passwordHash);
  let passwordOk = verified.ok;

  // Rama legacy: hash SHA-256(password + user.salt) sin prefijo "pbkdf2$".
  // Si el hash almacenado no empieza por "pbkdf2$", era formato antiguo y debe
  // verificarse con su salt original (user.salt).
  if (!passwordOk && !user.passwordHash.startsWith('pbkdf2$') && user.salt) {
    const data = new TextEncoder().encode(password + user.salt);
    const legacyBuf = await crypto.subtle.digest('SHA-256', data);
    const legacyHex = [...new Uint8Array(legacyBuf)].map(b => b.toString(16).padStart(2, '0')).join('');
    passwordOk = timingSafeEqualHex(legacyHex, user.passwordHash);
    verified.needsRehash = passwordOk; // migrar a PBKDF2 en este login
  }

  if (!passwordOk) {
    attempts.count++;
    await env.EXILIUM_KV.put(rateLimitKey, JSON.stringify(attempts), { expirationTtl: LOGIN_RATE_WINDOW });
    return { error: 'Contraseña incorrecta.' };
  }

  // Reset rate limit
  await env.EXILIUM_KV.delete(rateLimitKey);

  // A1 — Migración transparente: si el hash es legacy o usa pocas iteraciones,
  // regenerar con PBKDF2 para usuarios existentes sin forzar reseteo de password.
  if (verified.needsRehash || !user.passwordHash.startsWith('pbkdf2$')) {
    try {
      const newSalt = generateSalt();
      user.passwordHash = await hashPassword(password, newSalt);
      user.salt = newSalt;
    } catch (e) {
      console.error('[CASINO-AUTH] Rehash falló (no bloqueante):', e);
    }
  }

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
      avatar_url: user.avatar_url || null,
      discord_username: user.discord_username || null,
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

/** Admin: POST /admin/casino/users/:userId/delete — eliminar usuario */
export async function handleAdminDeleteCasinoUser(env, userId) {
  const user = await env.EXILIUM_KV.get(`casino:user:${userId}`, 'json');
  if (!user) return { error: 'Usuario no encontrado', status: 404 };

  // Eliminar todas las referencias: datos, nombre, discord, transacciones
  const deletions = [
    env.EXILIUM_KV.delete(`casino:user:${userId}`),
    env.EXILIUM_KV.delete(`casino:transactions:${userId}`),
  ];

  // Eliminar por nombre (name_lower index)
  if (user.name_lower) {
    deletions.push(env.EXILIUM_KV.delete(`casino:user:name:${user.name_lower}`));
  }

  // Eliminar por Discord ID
  if (user.discord_id) {
    deletions.push(env.EXILIUM_KV.delete(`casino:user:discord:${user.discord_id}`));
  }

  // Eliminar sesiones activas (buscar en todas las sesiones - KV scan es costoso,
  // así que marcamos al usuario como deleted para que verifyCasinoSession lo rechace)
  await env.EXILIUM_KV.put(`casino:user:deleted:${userId}`, '1', { expirationTtl: 7 * 24 * 60 * 60 }); // 7 días

  await Promise.all(deletions);

  // Eliminar del índice
  try {
    const index = await env.EXILIUM_KV.get('casino:user_index', 'json') || [];
    const filtered = index.filter(id => id !== userId);
    await env.EXILIUM_KV.put('casino:user_index', JSON.stringify(filtered));
  } catch (_) {}

  return { ok: true, deleted: userId };
}
