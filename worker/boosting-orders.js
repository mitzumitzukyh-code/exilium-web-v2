// worker/boosting-orders.js
// Gestión de pedidos del portal de boosting

const ORDER_STATUSES = ['pending', 'claimed', 'in_progress', 'completed', 'cancelled'];

/** POST /api/boost/orders — crear nuevo pedido */
export async function handleCreateOrder(request, env, session) {
  if (!session || session.role !== 'client') return { error: 'Solo los clientes pueden crear pedidos.', status: 403 };

  let body;
  try { body = await request.json(); } catch (_) { return { error: 'JSON inválido' }; }

  const serviceKey = (body.service_key || '').trim();
  const serviceName = (body.service_name || '').trim().slice(0, 100);
  const priceUsd = (body.price_usd || '').trim().slice(0, 30);
  const priceGold = (body.price_gold || '').trim().slice(0, 30);
  const paymentMethod = (body.payment_method || 'gold').trim(); // 'gold' | 'usd'
  const charName = (body.char_name || '').trim().slice(0, 50);
  const charRealm = (body.char_realm || '').trim().slice(0, 50);
  const notes = (body.notes || '').trim().slice(0, 300);

  if (!serviceKey || !serviceName || !charName) {
    return { error: 'Servicio, nombre de personaje requeridos.' };
  }

  const orderId = 'order_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const order = {
    id: orderId,
    client_id: session.userId,
    client_username: session.username,
    service_key: serviceKey,
    service_name: serviceName,
    price_usd: priceUsd,
    price_gold: priceGold,
    payment_method: paymentMethod,
    char_name: charName,
    char_realm: charRealm,
    notes,
    status: 'pending',
    booster_id: null,
    booster_username: null,
    created_at: new Date().toISOString(),
    claimed_at: null,
    started_at: null,
    completed_at: null,
    progress_notes: [],
  };

  // Guardar pedido individual
  await env.EXILIUM_KV.put(`boost:order:${orderId}`, JSON.stringify(order));

  // Añadir a lista global de pedidos (para boosters)
  const allOrders = await env.EXILIUM_KV.get('boost:orders:all', 'json') || [];
  allOrders.unshift({
    id: orderId,
    service_name: serviceName,
    service_key: serviceKey,
    price_usd: priceUsd,
    price_gold: priceGold,
    payment_method: paymentMethod,
    char_name: charName,
    char_realm: charRealm,
    status: 'pending',
    created_at: order.created_at,
    booster_username: null,
  });
  await env.EXILIUM_KV.put('boost:orders:all', JSON.stringify(allOrders.slice(0, 500)));

  // Añadir a la lista de pedidos del cliente
  const user = await env.EXILIUM_KV.get(`boost:user:${session.userId}`, 'json');
  if (user) {
    user.orders = user.orders || [];
    user.orders.unshift(orderId);
    await env.EXILIUM_KV.put(`boost:user:${session.userId}`, JSON.stringify(user));
  }

  return { ok: true, order };
}

/** GET /api/boost/orders — pedidos del cliente actual */
export async function handleGetClientOrders(request, env, session) {
  if (!session) return { error: 'No autenticado', status: 401 };

  const user = await env.EXILIUM_KV.get(`boost:user:${session.userId}`, 'json');
  if (!user) return { error: 'Usuario no encontrado', status: 404 };

  const orderIds = user.orders || [];
  const orders = [];
  for (const oid of orderIds.slice(0, 50)) {
    const o = await env.EXILIUM_KV.get(`boost:order:${oid}`, 'json');
    if (o) orders.push(o);
  }

  return { ok: true, orders };
}

/** GET /api/boost/orders/:orderId — detalle de un pedido */
export async function handleGetOrder(orderId, env, session) {
  if (!session) return { error: 'No autenticado', status: 401 };

  const order = await env.EXILIUM_KV.get(`boost:order:${orderId}`, 'json');
  if (!order) return { error: 'Pedido no encontrado', status: 404 };

  // Solo el cliente dueño, el booster asignado o el admin pueden ver el pedido
  const isOwner = order.client_id === session.userId;
  const isBooster = order.booster_id === session.userId;
  const isAdmin = session.role === 'admin';
  if (!isOwner && !isBooster && !isAdmin) return { error: 'Sin permiso', status: 403 };

  return { ok: true, order };
}

/** GET /api/boost/orders/available — pedidos disponibles para boosters */
export async function handleGetAvailableOrders(env, session) {
  if (!session || !['booster', 'admin'].includes(session.role)) {
    return { error: 'Solo boosters pueden ver pedidos disponibles.', status: 403 };
  }

  const allOrders = await env.EXILIUM_KV.get('boost:orders:all', 'json') || [];
  const available = allOrders.filter(o => o.status === 'pending');
  return { ok: true, orders: available };
}

/** POST /api/boost/orders/:orderId/claim — booster reclama un pedido */
export async function handleClaimOrder(orderId, env, session) {
  if (!session || !['booster', 'admin'].includes(session.role)) {
    return { error: 'Solo boosters pueden reclamar pedidos.', status: 403 };
  }

  const order = await env.EXILIUM_KV.get(`boost:order:${orderId}`, 'json');
  if (!order) return { error: 'Pedido no encontrado', status: 404 };
  if (order.status !== 'pending') return { error: 'Este pedido ya no está disponible.' };

  order.status = 'claimed';
  order.booster_id = session.userId;
  order.booster_username = session.username;
  order.claimed_at = new Date().toISOString();
  order.progress_notes.push({ ts: order.claimed_at, note: `Pedido reclamado por ${session.username}.` });

  await env.EXILIUM_KV.put(`boost:order:${orderId}`, JSON.stringify(order));

  // Actualizar en lista global
  await _updateOrderInList(env, orderId, { status: 'claimed', booster_username: session.username });

  // Añadir a active_orders del booster
  const booster = await env.EXILIUM_KV.get(`boost:user:${session.userId}`, 'json');
  if (booster) {
    booster.active_orders = booster.active_orders || [];
    if (!booster.active_orders.includes(orderId)) booster.active_orders.push(orderId);
    await env.EXILIUM_KV.put(`boost:user:${session.userId}`, JSON.stringify(booster));
  }

  // Notificar al cliente
  await _addNotification(env, order.client_id, {
    type: 'order_claimed',
    message: `Tu carry "${order.service_name}" ha sido reclamado por ${session.username}. ¡Pronto comenzará!`,
    order_id: orderId,
  });

  return { ok: true, order };
}

/** POST /api/boost/orders/:orderId/start — booster inicia el carry */
export async function handleStartOrder(orderId, env, session) {
  if (!session || !['booster', 'admin'].includes(session.role)) {
    return { error: 'Solo boosters pueden iniciar pedidos.', status: 403 };
  }

  const order = await env.EXILIUM_KV.get(`boost:order:${orderId}`, 'json');
  if (!order) return { error: 'Pedido no encontrado', status: 404 };
  if (order.booster_id !== session.userId && session.role !== 'admin') return { error: 'No es tu pedido.', status: 403 };
  if (!['claimed'].includes(order.status)) return { error: 'El pedido debe estar en estado "claimed" para iniciarlo.' };

  const now = new Date().toISOString();
  order.status = 'in_progress';
  order.started_at = now;
  order.progress_notes.push({ ts: now, note: `Carry en progreso. Booster: ${session.username}.` });

  await env.EXILIUM_KV.put(`boost:order:${orderId}`, JSON.stringify(order));
  await _updateOrderInList(env, orderId, { status: 'in_progress' });

  await _addNotification(env, order.client_id, {
    type: 'order_started',
    message: `Tu carry "${order.service_name}" ha comenzado. ¡Prepárate!`,
    order_id: orderId,
  });

  return { ok: true, order };
}

/** POST /api/boost/orders/:orderId/complete — booster completa el carry */
export async function handleCompleteOrder(orderId, env, session) {
  if (!session || !['booster', 'admin'].includes(session.role)) {
    return { error: 'Solo boosters pueden completar pedidos.', status: 403 };
  }

  const order = await env.EXILIUM_KV.get(`boost:order:${orderId}`, 'json');
  if (!order) return { error: 'Pedido no encontrado', status: 404 };
  if (order.booster_id !== session.userId && session.role !== 'admin') return { error: 'No es tu pedido.', status: 403 };
  if (!['in_progress', 'claimed'].includes(order.status)) return { error: 'El pedido no puede completarse desde su estado actual.' };

  const now = new Date().toISOString();
  order.status = 'completed';
  order.completed_at = now;
  order.progress_notes.push({ ts: now, note: `Carry completado por ${session.username}. ¡Servicio finalizado!` });

  await env.EXILIUM_KV.put(`boost:order:${orderId}`, JSON.stringify(order));
  await _updateOrderInList(env, orderId, { status: 'completed' });

  // Actualizar stats del booster
  const booster = await env.EXILIUM_KV.get(`boost:user:${session.userId}`, 'json');
  if (booster) {
    booster.active_orders = (booster.active_orders || []).filter(id => id !== orderId);
    booster.completed_orders = (booster.completed_orders || 0) + 1;
    // Registrar ganancia en el historial
    booster.completed_order_ids = booster.completed_order_ids || [];
    booster.completed_order_ids.unshift(orderId);
    await env.EXILIUM_KV.put(`boost:user:${session.userId}`, JSON.stringify(booster));
  }

  await _addNotification(env, order.client_id, {
    type: 'order_completed',
    message: `¡Tu carry "${order.service_name}" ha sido completado! Verifica en tu personaje que todo está correcto.`,
    order_id: orderId,
  });

  return { ok: true, order };
}

/** POST /api/boost/orders/:orderId/cancel — cancelar pedido */
export async function handleCancelOrder(orderId, env, session) {
  if (!session) return { error: 'No autenticado', status: 401 };

  const order = await env.EXILIUM_KV.get(`boost:order:${orderId}`, 'json');
  if (!order) return { error: 'Pedido no encontrado', status: 404 };

  const isOwner = order.client_id === session.userId;
  const isAdmin = session.role === 'admin';
  if (!isOwner && !isAdmin) return { error: 'Sin permiso.', status: 403 };
  if (order.status === 'completed') return { error: 'No se puede cancelar un pedido completado.' };

  const now = new Date().toISOString();
  order.status = 'cancelled';
  order.progress_notes.push({ ts: now, note: `Pedido cancelado por ${session.username || 'admin'}.` });

  await env.EXILIUM_KV.put(`boost:order:${orderId}`, JSON.stringify(order));
  await _updateOrderInList(env, orderId, { status: 'cancelled' });

  if (order.booster_id) {
    const booster = await env.EXILIUM_KV.get(`boost:user:${order.booster_id}`, 'json');
    if (booster) {
      booster.active_orders = (booster.active_orders || []).filter(id => id !== orderId);
      await env.EXILIUM_KV.put(`boost:user:${order.booster_id}`, JSON.stringify(booster));
    }
    await _addNotification(env, order.booster_id, {
      type: 'order_cancelled',
      message: `El pedido "${order.service_name}" ha sido cancelado.`,
      order_id: orderId,
    });
  }

  return { ok: true, order };
}

/** POST /api/boost/orders/:orderId/note — booster añade nota de progreso */
export async function handleAddProgressNote(orderId, request, env, session) {
  if (!session || !['booster', 'admin'].includes(session.role)) {
    return { error: 'Sin permiso.', status: 403 };
  }

  let body;
  try { body = await request.json(); } catch (_) { return { error: 'JSON inválido' }; }
  const note = (body.note || '').trim().slice(0, 200);
  if (!note) return { error: 'Nota requerida.' };

  const order = await env.EXILIUM_KV.get(`boost:order:${orderId}`, 'json');
  if (!order) return { error: 'Pedido no encontrado', status: 404 };
  if (order.booster_id !== session.userId && session.role !== 'admin') return { error: 'Sin permiso.', status: 403 };

  order.progress_notes.push({ ts: new Date().toISOString(), note: `[${session.username}] ${note}` });
  await env.EXILIUM_KV.put(`boost:order:${orderId}`, JSON.stringify(order));

  await _addNotification(env, order.client_id, {
    type: 'progress_update',
    message: `Actualización en tu carry "${order.service_name}": ${note}`,
    order_id: orderId,
  });

  return { ok: true };
}

/** GET /api/boost/notifications — notificaciones del usuario */
export async function handleGetNotifications(env, session) {
  if (!session) return { error: 'No autenticado', status: 401 };

  const user = await env.EXILIUM_KV.get(`boost:user:${session.userId}`, 'json');
  if (!user) return { error: 'Usuario no encontrado', status: 404 };

  return { ok: true, notifications: (user.notifications || []).slice(0, 30) };
}

/** POST /api/boost/notifications/read — marcar notificaciones como leídas */
export async function handleMarkNotificationsRead(env, session) {
  if (!session) return { error: 'No autenticado', status: 401 };

  const user = await env.EXILIUM_KV.get(`boost:user:${session.userId}`, 'json');
  if (!user) return { error: 'Usuario no encontrado', status: 404 };

  user.notifications = (user.notifications || []).map(n => ({ ...n, read: true }));
  await env.EXILIUM_KV.put(`boost:user:${session.userId}`, JSON.stringify(user));

  return { ok: true };
}

/** Admin: GET /admin/boost/orders — todos los pedidos */
export async function handleAdminGetAllOrders(env) {
  const allOrders = await env.EXILIUM_KV.get('boost:orders:all', 'json') || [];
  return { ok: true, orders: allOrders };
}

/** Admin: GET /admin/boost/boosters — lista de boosters aprobados */
export async function handleAdminGetBoosters(env) {
  const apps = await env.EXILIUM_KV.get('boost:booster_applications', 'json') || [];
  const approved = apps.filter(a => a.status === 'approved');
  const result = [];
  for (const app of approved.slice(0, 50)) {
    const user = await env.EXILIUM_KV.get(`boost:user:${app.userId}`, 'json');
    if (user) {
      const { passwordHash, salt, ...safe } = user;
      result.push(safe);
    }
  }
  return { ok: true, boosters: result };
}

// ── Helpers internos ──

async function _updateOrderInList(env, orderId, updates) {
  try {
    const allOrders = await env.EXILIUM_KV.get('boost:orders:all', 'json') || [];
    const idx = allOrders.findIndex(o => o.id === orderId);
    if (idx !== -1) {
      allOrders[idx] = { ...allOrders[idx], ...updates };
      await env.EXILIUM_KV.put('boost:orders:all', JSON.stringify(allOrders));
    }
  } catch (_) {}
}

async function _addNotification(env, userId, notification) {
  try {
    const user = await env.EXILIUM_KV.get(`boost:user:${userId}`, 'json');
    if (!user) return;
    user.notifications = user.notifications || [];
    user.notifications.unshift({
      id: Date.now(),
      ...notification,
      read: false,
      ts: new Date().toISOString(),
    });
    user.notifications = user.notifications.slice(0, 50);
    await env.EXILIUM_KV.put(`boost:user:${userId}`, JSON.stringify(user));
  } catch (_) {}
}
