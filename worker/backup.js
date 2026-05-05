// worker/backup.js
// Sistema de backup y restore completo del KV store

const BACKUP_KEY = 'meta:last_backup';

export async function createBackup(request, env) {
  const allKeys = [];
  let cursor = null;

  // Paginar todas las keys del KV
  do {
    const list = await env.EXILIUM_KV.list({ cursor, limit: 1000 });
    allKeys.push(...list.keys);
    cursor = list.list_complete ? null : list.cursor;
  } while (cursor);

  // Leer todos los valores
  const backup = {};
  for (const key of allKeys) {
    try {
      backup[key.name] = await env.EXILIUM_KV.get(key.name);
    } catch (_) {
      backup[key.name] = null;
    }
  }

  const backupData = {
    created_at: new Date().toISOString(),
    total_keys: allKeys.length,
    data: backup,
  };

  // Guardar metadata del último backup
  await env.EXILIUM_KV.put(BACKUP_KEY, JSON.stringify({
    created_at: backupData.created_at,
    total_keys: allKeys.length,
  }));

  return backupData;
}

export async function restoreBackup(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (_) {
    return { success: false, message: 'JSON de backup inválido.' };
  }

  if (!body.data || typeof body.data !== 'object') {
    return { success: false, message: 'Formato de backup incorrecto. Se espera { data: { key: value, ... } }' };
  }

  const entries = Object.entries(body.data);
  if (entries.length === 0) {
    return { success: false, message: 'El backup está vacío.' };
  }

  let restored = 0;
  let errors = 0;

  for (const [key, value] of entries) {
    try {
      if (value === null) continue;
      await env.EXILIUM_KV.put(key, value);
      restored++;
    } catch (_) {
      errors++;
    }
  }

  return {
    success: true,
    message: `Restore completado: ${restored} keys restauradas, ${errors} errores.`,
    restored,
    errors,
    total: entries.length,
  };
}

export async function getBackupInfo(request, env) {
  const info = await env.EXILIUM_KV.get(BACKUP_KEY, 'json');

  // Contar keys actuales
  let totalKeys = 0;
  let cursor = null;
  do {
    const list = await env.EXILIUM_KV.list({ cursor, limit: 1000 });
    totalKeys += list.keys.length;
    cursor = list.list_complete ? null : list.cursor;
  } while (cursor);

  return {
    last_backup: info || null,
    current_keys: totalKeys,
  };
}
