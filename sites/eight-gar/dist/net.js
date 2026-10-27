/** Transport layer: room HTTP endpoints, session storage and the socket.io connection. No game logic lives here. */
import { io } from '/socket.io/socket.io.esm.min.js';

const SESSION_PREFIX = 'gar:session:';
const REQUEST_TIMEOUT_MS = 10000;

export class NetError extends Error {
  constructor(code, message) { super(message); this.name = 'NetError'; this.code = code; }
}

async function api(path, body) {
  let response;
  try {
    response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new NetError('NETWORK', 'Could not reach the table server. Check your connection.');
  }
  let data = null;
  try { data = await response.json(); } catch { data = null; }
  if (!response.ok) {
    if (response.status === 429) throw new NetError('RATE_LIMITED', data?.message || 'Too many attempts. Wait a moment.');
    throw new NetError(data?.code || 'SERVER_ERROR', data?.message || `Request failed (${response.status}).`);
  }
  return data;
}

export const createRoom = name => api('/api/rooms', { name });
export const joinRoom = (code, name) => api(`/api/rooms/${encodeURIComponent(code)}/join`, { name });
export const roomInfo = code => api(`/api/rooms/${encodeURIComponent(code)}`);

export function saveSession(result) {
  try { localStorage.setItem(SESSION_PREFIX + result.code, JSON.stringify(result)); } catch { /* storage unavailable: session lasts for the page only */ }
}
export function loadSession(code) {
  try {
    const raw = localStorage.getItem(SESSION_PREFIX + code);
    const value = raw ? JSON.parse(raw) : null;
    return value && typeof value.token === 'string' && typeof value.playerId === 'string' ? value : null;
  } catch { return null; }
}
export function clearSession(code) {
  try { localStorage.removeItem(SESSION_PREFIX + code); } catch { /* ignore */ }
}

/** Opens the authenticated socket. Returned client exposes acked requests and typed subscriptions. */
export function connect(token) {
  const socket = io({ auth: { token }, path: '/socket.io', transports: ['websocket', 'polling'] });
  const listeners = { signals: new Set(), state: new Set(), update: new Set(), closed: new Set(), connection: new Set() };
  let offset = 0;
  const emit = (kind, ...args) => { for (const fn of listeners[kind]) { try { fn(...args); } catch (error) { console.error(error); } } };
  const noteClock = payload => { if (typeof payload?.serverNow === 'number') offset = payload.serverNow - Date.now(); };
  socket.on('room:state', payload => { noteClock(payload); emit('state', payload); });
  socket.on('game:update', payload => { noteClock(payload); emit('update', payload); });
  socket.on('game:signals', payload => emit('signals', payload));
  socket.on('room:closed', payload => emit('closed', payload));
  socket.on('connect', () => emit('connection', true, null));
  socket.on('disconnect', reason => emit('connection', false, { code: 'DISCONNECTED', message: reason }));
  socket.on('connect_error', error => emit('connection', false, { code: error?.message || 'CONNECT_ERROR', message: error?.message || 'Connection failed' }));
  return {
    request(event, payload = {}) {
      return new Promise((resolve, reject) => {
        socket.timeout(REQUEST_TIMEOUT_MS).emit(event, payload, (timeoutError, ack) => {
          if (timeoutError) return reject(new NetError('TIMEOUT', 'The table did not answer in time.'));
          if (!ack || ack.ok !== true) return reject(new NetError(ack?.code || 'SERVER_ERROR', ack?.message || 'The table rejected that.'));
          resolve(ack);
        });
      });
    },
    onSignals(fn) { listeners.signals.add(fn); return () => listeners.signals.delete(fn); },
    onState(fn) { listeners.state.add(fn); return () => listeners.state.delete(fn); },
    onUpdate(fn) { listeners.update.add(fn); return () => listeners.update.delete(fn); },
    onClosed(fn) { listeners.closed.add(fn); return () => listeners.closed.delete(fn); },
    onConnection(fn) { listeners.connection.add(fn); return () => listeners.connection.delete(fn); },
    clockOffset() { return offset; },
    serverNow() { return Date.now() + offset; },
    get connected() { return socket.connected; },
    close() { socket.removeAllListeners(); socket.disconnect(); },
  };
}
