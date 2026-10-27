import { errorText } from './locale-mn.js';
import { mountTeamSignals } from './team-signals.js';
import { signalsForPlayer } from './rules/signals.js';
import { displaySeat } from './scene.js';

/** Receives authoritative private updates without restarting the table's presentation or timers. */
export function createOnlineSignalControls({ container, onError, mount = mountTeamSignals }) {
  let client = null, view = null, signals = [], version = -1, busy = false, epoch = 0;
  let unsubscribe = [];
  const controls = mount({ container, onToggle: async (size, enabled) => {
    if (!client?.connected || !view || busy) return;
    const connection = client, requestEpoch = epoch;
    busy = true; render();
    try {
      await connection.request('game:signal', { size, enabled, expectedRevision: view.revision });
    } catch (error) {
      if (epoch !== requestEpoch) return;
      onError(errorText(error));
      if (error.code === 'STALE_ACTION') void connection.request('room:sync').catch(() => {});
    } finally {
      if (epoch === requestEpoch) { busy = false; render(); }
    }
  } });
  function render() {
    const me = view?.player ?? 0;
    controls.render({
      seat: 0, phase: view?.phase, hand: view?.hand ?? [], busy: busy || !client?.connected,
      signals: signalsForPlayer(signals, me).map(signal => ({ seat: displaySeat(signal.seat, me), size: signal.size })),
    });
  }
  function accept(nextVersion, nextView, nextSignals) {
    if (nextVersion < version) return;
    version = nextVersion; view = nextView; signals = nextSignals ?? []; render();
  }
  function connect(nextClient) {
    epoch++; unsubscribe.forEach(fn => fn()); unsubscribe = [];
    client = nextClient; view = null; signals = []; version = -1; busy = false;
    if (client) {
      unsubscribe.push(client.onState(room => accept(room.version, room.game?.view ?? null, room.game?.signals)));
      unsubscribe.push(client.onUpdate(update => accept(update.version, update.view, update.signals)));
      unsubscribe.push(client.onSignals(update => {
        if (!view || update.version < version || update.revision !== view.revision) return;
        version = update.version; signals = update.signals; render();
      }));
      unsubscribe.push(client.onConnection(() => render()));
      // Also supports attaching to an already-connected room.
      if (client.connected) void client.request('room:sync').catch(() => {});
    }
    render();
  }
  return { connect, render, close: () => connect(null) };
}
