// worker/announcement.js

const ANNOUNCEMENT_KEY = 'announcement:current';

export async function getAnnouncement(request, env) {
  return await env.EXILIUM_KV.get(ANNOUNCEMENT_KEY, 'json') || {};
}

export async function setAnnouncement(request, env) {
  const data = await request.json();
  if (!data.message || !data.type) {
    return { error: 'El anuncio debe tener un mensaje y un tipo.', status: 400 };
  }
  await env.EXILIUM_KV.put(ANNOUNCEMENT_KEY, JSON.stringify(data));
  return { success: true, announcement: data };
}

export async function deleteAnnouncement(request, env) {
  await env.EXILIUM_KV.delete(ANNOUNCEMENT_KEY);
  return { success: true, message: 'Anuncio eliminado.' };
}
