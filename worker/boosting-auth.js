// worker/boosting-auth.js
// Sistema de autenticación para el portal de boosting (Clientes + Boosters)

const SESSION_TTL = 7 * 24 * 60 * 60; // 7 días en segundos

/** Hash SHA-256 de la contraseña con sal */
async function hashPassword(password, salt) {
  const data = new TextEncoder().encode(password + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hashBuffer)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Genera sal aleatoria */
function generateSalt() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return [...arr].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Genera token de sesión aleatorio */
function generateToken() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return [...arr].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Verifica un token de sesión de boosting y devuelve el usuario o null */
export async function verifyBoostingSession(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.substring(7);
  if (!token) return null;
  try {
    const session = await env.EXILIUM_KV.get(`boost:session:${token}`, 'json');
    if (!session) return null;
    return session; // { userId, email, role, username }
  } catch (_) { return null; }
}

/** POST /api/boost/register — registro de nuevo cliente */
export async function handleBoostRegister(request, env) {
  let body;
  try { body = await request.json(); } catch (_) { return { error: 'JSON inválido' }; }

  const email = (body.email || '').trim().toLowerCase();
  const password = (body.password || '').trim();
  const username = (body.username || '').trim().slice(0, 30);
  const battleTag = (body.battle_tag || '').trim().slice(0, 30);

  if (!email || !password || !username) return { error: 'Email, contraseña y nombre de usuario son requeridos.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Email inválido.' };
  if (password.length < 6) return { error: 'La contraseña debe tener al menos 6 caracteres.' };
  if (username.length < 3) return { error: 'El nombre debe tener al menos 3 caracteres.' };

  // Verificar si el email ya existe
  const existing = await env.EXILIUM_KV.get(`boost:user:email:${email}`);
  if (existing) return { error: 'Ya existe una cuenta con ese email.' };

  const userId = 'client_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const salt = generateSalt();
  const passwordHash = await hashPassword(password, salt);

  const user = {
    id: userId,
    email,
    username,
    battle_tag: battleTag,
    role: 'client',
    passwordHash,
    salt,
    created_at: new Date().toISOString(),
    orders: [],
    notifications: [],
  };

  await env.EXILIUM_KV.put(`boost:user:${userId}`, JSON.stringify(user));
  await env.EXILIUM_KV.put(`boost:user:email:${email}`, userId);

  // Crear sesión
  const token = generateToken();
  const session = { userId, email, role: 'client', username };
  await env.EXILIUM_KV.put(`boost:session:${token}`, JSON.stringify(session), { expirationTtl: SESSION_TTL });

  return { ok: true, token, user: { id: userId, email, username, role: 'client', battle_tag: battleTag } };
}

/** POST /api/boost/login — login de cliente o booster */
export async function handleBoostLogin(request, env) {
  let body;
  try { body = await request.json(); } catch (_) { return { error: 'JSON inválido' }; }

  const email = (body.email || '').trim().toLowerCase();
  const password = (body.password || '').trim();

  if (!email || !password) return { error: 'Email y contraseña requeridos.' };

  // Rate limit: max 10 intentos por IP en 15 min
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rateLimitKey = `boost:ratelimit:login:${ip}`;
  const attempts = await env.EXILIUM_KV.get(rateLimitKey, 'json') || { count: 0 };
  if (attempts.count >= 10) return { error: 'Demasiados intentos. Espera 15 minutos.' };

  const userId = await env.EXILIUM_KV.get(`boost:user:email:${email}`);
  if (!userId) {
    attempts.count++;
    await env.EXILIUM_KV.put(rateLimitKey, JSON.stringify(attempts), { expirationTtl: 15 * 60 });
    return { error: 'Credenciales inválidas.' };
  }

  const user = await env.EXILIUM_KV.get(`boost:user:${userId}`, 'json');
  if (!user) return { error: 'Credenciales inválidas.' };

  const hash = await hashPassword(password, user.salt);
  if (hash !== user.passwordHash) {
    attempts.count++;
    await env.EXILIUM_KV.put(rateLimitKey, JSON.stringify(attempts), { expirationTtl: 15 * 60 });
    return { error: 'Credenciales inválidas.' };
  }

  // Reset rate limit on success
  await env.EXILIUM_KV.delete(rateLimitKey);

  const token = generateToken();
  const session = { userId: user.id, email: user.email, role: user.role, username: user.username };
  await env.EXILIUM_KV.put(`boost:session:${token}`, JSON.stringify(session), { expirationTtl: SESSION_TTL });

  return {
    ok: true,
    token,
    user: { id: user.id, email: user.email, username: user.username, role: user.role, battle_tag: user.battle_tag },
  };
}

/** POST /api/boost/logout — cerrar sesión */
export async function handleBoostLogout(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try { await env.EXILIUM_KV.delete(`boost:session:${token}`); } catch (_) {}
  }
  return { ok: true };
}

/** GET /api/boost/me — obtener datos del usuario actual */
export async function handleBoostMe(request, env) {
  const session = await verifyBoostingSession(request, env);
  if (!session) return { error: 'No autenticado', status: 401 };

  const user = await env.EXILIUM_KV.get(`boost:user:${session.userId}`, 'json');
  if (!user) return { error: 'Usuario no encontrado', status: 404 };

  const { passwordHash, salt, ...safeUser } = user;
  return { ok: true, user: safeUser };
}

/** POST /api/boost/booster/apply — aplicar para ser booster */
export async function handleBoosterApply(request, env) {
  let body;
  try { body = await request.json(); } catch (_) { return { error: 'JSON inválido' }; }

  const email = (body.email || '').trim().toLowerCase();
  const password = (body.password || '').trim();
  const username = (body.username || '').trim().slice(0, 30);
  const battleTag = (body.battle_tag || '').trim().slice(0, 30);
  const mainChar = (body.main_char || '').trim().slice(0, 50);
  const mainSpec = (body.main_spec || '').trim().slice(0, 50);
  const rating2v2 = parseInt(body.rating_2v2 || 0, 10);
  const rating3v3 = parseInt(body.rating_3v3 || 0, 10);
  const ratingShuffle = parseInt(body.rating_shuffle || 0, 10);
  const ratingRbg = parseInt(body.rating_rbg || 0, 10);
  const screenshot = (body.screenshot_url || '').trim().slice(0, 500);
  const discordTag = (body.discord_tag || '').trim().slice(0, 50);
  const experience = (body.experience || '').trim().slice(0, 500);

  if (!email || !password || !username || !battleTag || !mainChar) {
    return { error: 'Faltan campos requeridos: email, contraseña, usuario, Battle Tag y personaje principal.' };
  }
  if (password.length < 6) return { error: 'La contraseña debe tener al menos 6 caracteres.' };

  const maxRating = Math.max(rating2v2, rating3v3, ratingShuffle, ratingRbg);
  if (maxRating < 1400) return { error: 'Se requiere al menos 1400 de rating en cualquier bracket para aplicar.' };

  // Verificar si el email ya existe
  const existing = await env.EXILIUM_KV.get(`boost:user:email:${email}`);
  if (existing) return { error: 'Ya existe una cuenta con ese email. Si ya tienes cuenta de cliente, contacta a un admin.' };

  const userId = 'booster_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const salt = generateSalt();
  const passwordHash = await hashPassword(password, salt);

  const user = {
    id: userId,
    email,
    username,
    battle_tag: battleTag,
    role: 'booster_pending', // pendiente de aprobación por admin
    passwordHash,
    salt,
    main_char: mainChar,
    main_spec: mainSpec,
    ratings: { '2v2': rating2v2, '3v3': rating3v3, shuffle: ratingShuffle, rbg: ratingRbg },
    screenshot_url: screenshot,
    discord_tag: discordTag,
    experience,
    created_at: new Date().toISOString(),
    approved_at: null,
    active_orders: [],
    completed_orders: 0,
    earnings_gold: 0,
    earnings_usd: 0,
  };

  await env.EXILIUM_KV.put(`boost:user:${userId}`, JSON.stringify(user));
  await env.EXILIUM_KV.put(`boost:user:email:${email}`, userId);

  // Añadir a lista de aplicaciones pendientes para el admin
  const pendingList = await env.EXILIUM_KV.get('boost:booster_applications', 'json') || [];
  pendingList.unshift({
    userId,
    username,
    email,
    battle_tag: battleTag,
    main_char: mainChar,
    main_spec: mainSpec,
    ratings: user.ratings,
    discord_tag: discordTag,
    applied_at: user.created_at,
    status: 'pending',
  });
  await env.EXILIUM_KV.put('boost:booster_applications', JSON.stringify(pendingList.slice(0, 200)));

  return {
    ok: true,
    message: 'Tu aplicación ha sido enviada. Un administrador revisará tu solicitud pronto.',
    userId,
  };
}

/** Admin: GET /admin/boost/applications — ver aplicaciones de boosters */
export async function handleGetBoosterApplications(request, env) {
  const list = await env.EXILIUM_KV.get('boost:booster_applications', 'json') || [];
  return { ok: true, applications: list };
}

/** Admin: POST /admin/boost/applications/:userId/approve — aprobar booster */
export async function handleApproveBooster(userId, env) {
  const user = await env.EXILIUM_KV.get(`boost:user:${userId}`, 'json');
  if (!user) return { error: 'Usuario no encontrado' };

  user.role = 'booster';
  user.approved_at = new Date().toISOString();
  await env.EXILIUM_KV.put(`boost:user:${userId}`, JSON.stringify(user));

  // Actualizar lista de aplicaciones
  const list = await env.EXILIUM_KV.get('boost:booster_applications', 'json') || [];
  const idx = list.findIndex(a => a.userId === userId);
  if (idx !== -1) { list[idx].status = 'approved'; }
  await env.EXILIUM_KV.put('boost:booster_applications', JSON.stringify(list));

  return { ok: true, message: 'Booster aprobado correctamente.' };
}

/** Admin: POST /admin/boost/applications/:userId/reject — rechazar booster */
export async function handleRejectBooster(userId, env) {
  const user = await env.EXILIUM_KV.get(`boost:user:${userId}`, 'json');
  if (!user) return { error: 'Usuario no encontrado' };

  user.role = 'booster_rejected';
  await env.EXILIUM_KV.put(`boost:user:${userId}`, JSON.stringify(user));

  const list = await env.EXILIUM_KV.get('boost:booster_applications', 'json') || [];
  const idx = list.findIndex(a => a.userId === userId);
  if (idx !== -1) { list[idx].status = 'rejected'; }
  await env.EXILIUM_KV.put('boost:booster_applications', JSON.stringify(list));

  return { ok: true, message: 'Aplicación rechazada.' };
}
