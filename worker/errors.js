// worker/errors.js

const ERROR_LOG_KEY = 'meta:error_log';
const MAX_LOG_ENTRIES = 50;

function truncate(value, max = 1024) {
  const text = String(value || '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function shortPath(pathOrUrl) {
  if (!pathOrUrl) return null;
  try {
    const u = new URL(pathOrUrl);
    return u.pathname + (u.search || '');
  } catch (_) {
    return String(pathOrUrl).slice(0, 200);
  }
}

async function notifyDiscord(entry, env) {
  const webhookUrl = env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;
  try {
    const severity = entry.status >= 500 ? '🔴' : '🟡';
    const fields = [
      { name: 'Mensaje', value: truncate(entry.message || 'Sin mensaje'), inline: false },
      { name: 'Status', value: String(entry.status), inline: true },
      { name: 'Módulo', value: entry.module || 'unknown', inline: true },
      { name: 'Hora (UTC)', value: entry.timestamp, inline: true },
    ];
    if (entry.path) {
      fields.push({ name: 'Path', value: truncate(shortPath(entry.path) || entry.path, 512), inline: false });
    }
    if (entry.method) {
      fields.push({ name: 'Método', value: String(entry.method), inline: true });
    }
    const embed = {
      title: `${severity} Error en ${entry.module}`,
      color: entry.status >= 500 ? 0xff3333 : 0xf0a500,
      fields,
      footer: { text: 'Exilium Error Monitor' },
    };
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });
  } catch (_) { /* no propagar fallos del webhook */ }
}

export async function logError(err, module, env, details = {}) {
  try {
    const errorLog = await env.EXILIUM_KV.get(ERROR_LOG_KEY, { type: 'json' }) || [];
    const newErrorEntry = {
      timestamp: new Date().toISOString(),
      module,
      message: err && err.message ? err.message : String(err),
      status: (err && err.status) || 500,
      ...details,
    };

    errorLog.unshift(newErrorEntry);
    if (errorLog.length > MAX_LOG_ENTRIES) {
      errorLog.length = MAX_LOG_ENTRIES;
    }

    await env.EXILIUM_KV.put(ERROR_LOG_KEY, JSON.stringify(errorLog));

    // Notificar a Discord en tiempo real
    await notifyDiscord(newErrorEntry, env);
  } catch (loggingError) {
    console.error('FATAL: Fallo al escribir en el log de errores de KV.', loggingError);
    console.error('Error original:', err);
  }
}

export async function getErrorLog(request, env) {
  return await env.EXILIUM_KV.get(ERROR_LOG_KEY, { type: 'json' }) || [];
}

export async function clearErrorLog(request, env) {
  await env.EXILIUM_KV.delete(ERROR_LOG_KEY);
  return { success: true, message: 'Log de errores limpiado.' };
}
