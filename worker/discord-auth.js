// worker/discord-auth.js
// Discord OAuth2 para la Sala de PandaCoins (Casino).
// Reutiliza el keyspace KV de casino-auth.js.

import { verifyCasinoSession } from './casino-auth.js';

const SESSION_TTL = 7 * 24 * 60 * 60; // 7 días

/** Genera ID de usuario (prefijo discord_) */
function generateUserId(discordId) {
  return `discord_${discordId}`;
}

/** Genera token de sesión */
function generateToken() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return [...arr].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Construye URL del avatar de Discord */
function buildAvatarUrl(userId, avatarHash) {
  if (!avatarHash) return null;
  const ext = avatarHash.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${ext}`;
}

/**
 * GET /api/casino/auth/discord
 * Redirige al usuario a Discord OAuth authorize, o directamente
 * al callback con mock code si no hay secrets configurados.
 */
export async function handleCasinoDiscordAuth(request, env) {
  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/casino/auth/discord/callback`;

  // Determinar URL del frontend: Referer header, ?redirect=, o FRONTEND_URL env
  const referer = request.headers.get('Referer') || '';
  const queryRedirect = new URL(request.url).searchParams.get('redirect') || '';
  const frontendBase = env.FRONTEND_URL || queryRedirect || referer.replace(/\/?$/, '') || origin;

  // Modo desarrollo sin Discord configurado
  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET) {
    return Response.redirect(`${redirectUri}?code=mock_dev_code&state=${encodeURIComponent(frontendBase)}`, 302);
  }

  const authUrl = new URL('https://discord.com/oauth2/authorize');
  authUrl.searchParams.set('client_id', env.DISCORD_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'identify guilds');
  authUrl.searchParams.set('state', frontendBase);

  return Response.redirect(authUrl.toString(), 302);
}

/**
 * Verifica que un usuario de Discord es miembro del servidor Exilium.
 * Si EXILIUM_GUILD_ID no está configurado, omite la verificación (dev).
 * @returns {object} { ok: true } o { ok: false, error: string }
 */
async function verifyGuildMembership(accessToken, discordId, env) {
  const guildId = env.EXILIUM_GUILD_ID;
  if (!guildId) return { ok: true }; // Modo dev: sin restricción

  try {
    const res = await fetch('https://discord.com/api/users/@me/guilds', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!res.ok) return { ok: false, error: 'Error al verificar tu membresía de Discord.' };

    const guilds = await res.json();
    const isMember = guilds.some(g => g.id === guildId);

    if (!isMember) {
      return { ok: false, error: 'Debes ser miembro del servidor de Discord de Exilium para acceder al casino. ¡Únete primero!' };
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: 'Error al conectar con Discord.' };
  }
}

/**
 * GET /api/casino/auth/discord/callback
 * Discord redirige aquí con ?code=xxx. Intercambia el code,
 * crea sesión y redirige al frontend con el token.
 */
export async function handleCasinoDiscordCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const origin = url.origin;
  const state = url.searchParams.get('state') || '';

  // Determinar URL del frontend base de forma segura
  const frontendBase = state || env.FRONTEND_URL || origin;
  let frontendPage;
  try {
    const parsed = new URL(frontendBase);
    if (parsed.pathname === '/' || parsed.pathname === '') {
      parsed.pathname = '/sala-pandacoins-standalone.html';
    } else if (!parsed.pathname.includes('sala-pandacoins-standalone')) {
      parsed.pathname = '/sala-pandacoins-standalone.html';
    } else {
      if (!parsed.pathname.endsWith('.html')) {
        parsed.pathname += '.html';
      }
    }
    frontendPage = parsed.toString();
  } catch (_) {
    frontendPage = frontendBase.replace(/\/?$/, '') + '/sala-pandacoins-standalone.html';
  }

  if (!code) {
    return Response.redirect(`${frontendPage}?error=missing_code`, 302);
  }

  // Intercambio del code por access_token
  let accessToken;
  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.DISCORD_CLIENT_ID || 'mock',
        client_secret: env.DISCORD_CLIENT_SECRET || 'mock',
        code,
        grant_type: 'authorization_code',
        redirect_uri: `${origin}/api/casino/auth/discord/callback`,
        scope: 'identify guilds',
      }),
    });

    if (!tokenRes.ok && !(code === 'mock_dev_code' && !env.DISCORD_CLIENT_ID)) {
      console.error('[DISCORD] Token exchange failed:', await tokenRes.text());
      return Response.redirect(`${frontendPage}?error=token_exchange_failed`, 302);
    }

    const tokenData = await tokenRes.json();
    accessToken = tokenData.access_token;
  } catch (e) {
    // En modo dev, simular
    if (code === 'mock_dev_code' && !env.DISCORD_CLIENT_ID) {
      accessToken = 'mock_access_token';
    } else {
      console.error('[DISCORD] Token exchange error:', e);
      return Response.redirect(`${frontendPage}?error=token_exchange_error`, 302);
    }
  }

  // Fetch user info de Discord
  let discordUser;
  try {
    if (accessToken === 'mock_access_token') {
      // Modo desarrollo: datos mock
      discordUser = {
        id: '123456789012345678',
        username: 'Aventurero',
        global_name: 'Aventurero Exilium',
        avatar: null,
        discriminator: '0000',
      };
    } else {
      const userRes = await fetch('https://discord.com/api/users/@me', {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      if (!userRes.ok) {
        return Response.redirect(`${frontendPage}?error=fetch_user_failed`, 302);
      }
      discordUser = await userRes.json();
    }

    // Verificar membresía al servidor Exilium (callback)
    if (accessToken !== 'mock_access_token') {
      const guildCheck = await verifyGuildMembership(accessToken, discordUser.id, env);
      if (!guildCheck.ok) {
        const errMsg = encodeURIComponent(guildCheck.error);
        return Response.redirect(`${frontendPage}?error=${errMsg}`, 302);
      }
    }
  } catch (e) {
    console.error('[DISCORD] User fetch error:', e);
    return Response.redirect(`${frontendPage}?error=fetch_user_error`, 302);
  }

  // Crear o actualizar usuario en KV + crear sesión.
  // KV-FIX: si las escrituras de KV están agotadas (free tier: 1.000/día), estos `put`
  // lanzan. Antes la excepción salía SIN capturar del handler → el catch-all del worker
  // respondía un 500 crudo ("Error interno del servidor") en plena pantalla del callback,
  // bloqueando el login. Ahora capturamos y redirigimos al frontend con un error legible.
  try {
  // Crear o actualizar usuario en KV
  const discordId = discordUser.id;
  const userId = generateUserId(discordId);
  const avatarUrl = buildAvatarUrl(discordId, discordUser.avatar);
  const displayName = discordUser.global_name || discordUser.username;

  let user = await env.EXILIUM_KV.get(`casino:user:${userId}`, 'json');

  if (user) {
    // Usuario existente — actualizar datos de Discord
    user.discord_username = discordUser.username;
    user.discord_global_name = discordUser.global_name || null;
    user.avatar_url = avatarUrl;
    user.last_login = new Date().toISOString();
    await env.EXILIUM_KV.put(`casino:user:${userId}`, JSON.stringify(user));
  } else {
    // Nuevo usuario — crear desde Discord
    const config = await env.EXILIUM_KV.get('casino:config', 'json') || {};
    const initialBalance = Number(config.initial_balance) || 1000;

    user = {
      id: userId,
      name: displayName,
      name_lower: displayName.toLowerCase(),
      discord_id: discordId,
      discord_username: discordUser.username,
      discord_global_name: discordUser.global_name || null,
      avatar_url: avatarUrl,
      balance: initialBalance,
      created_at: new Date().toISOString(),
      last_login: new Date().toISOString(),
      total_bet: 0,
      total_won: 0,
      rounds_played: 0,
      // Sin password_hash ni salt — es cuenta de Discord
    };

    await env.EXILIUM_KV.put(`casino:user:${userId}`, JSON.stringify(user));
    await env.EXILIUM_KV.put(`casino:user:discord:${discordId}`, userId);

    // Mantener índice de usuarios
    try {
      const index = await env.EXILIUM_KV.get('casino:user_index', 'json') || [];
      if (!index.includes(userId)) {
        index.push(userId);
        await env.EXILIUM_KV.put('casino:user_index', JSON.stringify(index));
      }
    } catch (_) {}
  }

  // Crear sesión
  const token = generateToken();
  const session = { user_id: userId, name: user.name };
  await env.EXILIUM_KV.put(`casino:session:${token}`, JSON.stringify(session), { expirationTtl: SESSION_TTL });

  const frontendUrl = `${frontendPage}?token=${encodeURIComponent(token)}&name=${encodeURIComponent(user.name)}&avatar=${avatarUrl ? encodeURIComponent(avatarUrl) : ''}`;
  return Response.redirect(frontendUrl, 302);
  } catch (e) {
    console.error('[DISCORD] KV upsert/session error (¿escrituras KV agotadas?):', e);
    const msg = encodeURIComponent('El casino está temporalmente saturado (límite de KV). Intenta de nuevo más tarde.');
    return Response.redirect(`${frontendPage}?error=${msg}`, 302);
  }
}

/**
 * POST /api/casino/auth/discord/exchange
 * Alternativa: el frontend envía el code y recibe {token, user} en JSON.
 * Útil si el frontend quiere manejar el callback sin redirect.
 */
export async function handleCasinoDiscordExchange(request, env) {
  let body;
  try { body = await request.json(); } catch (_) {
    return { error: 'JSON inválido', status: 400 };
  }

  const { code } = body;
  if (!code) return { error: 'Código requerido', status: 400 };

  const origin = env.FRONTEND_URL || new URL(request.url).origin;

  // Intercambio del code
  let accessToken;
  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.DISCORD_CLIENT_ID || 'mock',
        client_secret: env.DISCORD_CLIENT_SECRET || 'mock',
        code,
        grant_type: 'authorization_code',
        redirect_uri: `${origin}/api/casino/auth/discord/callback`,
        scope: 'identify guilds',
      }),
    });

    if (!tokenRes.ok && !(code === 'mock_dev_code' && !env.DISCORD_CLIENT_ID)) {
      return { error: 'Error al intercambiar código de Discord', status: 400 };
    }

    const tokenData = await tokenRes.json();
    accessToken = tokenData.access_token;

    // También podríamos obtener refresh_token aquí si quisiéramos
  } catch (e) {
    if (code === 'mock_dev_code' && !env.DISCORD_CLIENT_ID) {
      accessToken = 'mock_access_token';
    } else {
      return { error: 'Error en intercambio con Discord', status: 500 };
    }
  }

  // Fetch user info
  let discordUser;
  try {
    if (accessToken === 'mock_access_token') {
      discordUser = {
        id: '123456789012345678',
        username: 'Aventurero',
        global_name: 'Aventurero Exilium',
        avatar: null,
        discriminator: '0000',
      };
    } else {
      const userRes = await fetch('https://discord.com/api/users/@me', {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      if (!userRes.ok) return { error: 'Error al obtener datos de Discord', status: 400 };
      discordUser = await userRes.json();
    }

    // Verificar membresía al servidor Exilium (exchange)
    if (accessToken !== 'mock_access_token') {
      const guildCheck = await verifyGuildMembership(accessToken, discordUser.id, env);
      if (!guildCheck.ok) return { error: guildCheck.error, status: 403 };
    }
  } catch (e) {
    return { error: 'Error al conectar con Discord', status: 500 };
  }

  // Crear/actualizar usuario
  const discordId = discordUser.id;
  const userId = `discord_${discordId}`;
  const avatarUrl = buildAvatarUrl(discordId, discordUser.avatar);
  const displayName = discordUser.global_name || discordUser.username;

  let user = await env.EXILIUM_KV.get(`casino:user:${userId}`, 'json');

  if (user) {
    user.discord_username = discordUser.username;
    user.discord_global_name = discordUser.global_name || null;
    user.avatar_url = avatarUrl;
    user.last_login = new Date().toISOString();
    await env.EXILIUM_KV.put(`casino:user:${userId}`, JSON.stringify(user));
  } else {
    const config = await env.EXILIUM_KV.get('casino:config', 'json') || {};
    const initialBalance = Number(config.initial_balance) || 1000;

    user = {
      id: userId,
      name: displayName,
      name_lower: displayName.toLowerCase(),
      discord_id: discordId,
      discord_username: discordUser.username,
      discord_global_name: discordUser.global_name || null,
      avatar_url: avatarUrl,
      balance: initialBalance,
      created_at: new Date().toISOString(),
      last_login: new Date().toISOString(),
      total_bet: 0,
      total_won: 0,
      rounds_played: 0,
    };

    await env.EXILIUM_KV.put(`casino:user:${userId}`, JSON.stringify(user));
    await env.EXILIUM_KV.put(`casino:user:discord:${discordId}`, userId);

    try {
      const index = await env.EXILIUM_KV.get('casino:user_index', 'json') || [];
      if (!index.includes(userId)) {
        index.push(userId);
        await env.EXILIUM_KV.put('casino:user_index', JSON.stringify(index));
      }
    } catch (_) {}
  }

  // Crear sesión
  const token = generateToken();
  const session = { user_id: userId, name: user.name };
  await env.EXILIUM_KV.put(`casino:session:${token}`, JSON.stringify(session), { expirationTtl: SESSION_TTL });

  return {
    ok: true,
    token,
    user: {
      id: user.id,
      name: user.name,
      balance: user.balance,
      avatar_url: user.avatar_url,
      discord_username: user.discord_username,
    },
  };
}
