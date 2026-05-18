import { BleManager, State, type Device, type Subscription } from 'react-native-ble-plx';

import { parseLine } from './parser';
import type { AlertEvent } from './types';
import { LineBuffer } from './lineBuffer';
import {
  CONNECT_TIMEOUT_MS,
  HM10_CHARACTERISTIC_UUID,
  HM10_SERVICE_UUID,
  RECONNECT_BACKOFF_MS,
  RECONNECT_MAX_ATTEMPTS,
  SCAN_TIMEOUT_MS,
} from './uuids';

export type BleState =
  | { kind: 'idle' }
  | { kind: 'unsupported' }
  | { kind: 'unauthorized' }
  | { kind: 'powered-off' }
  | { kind: 'scanning' }
  | { kind: 'connecting'; deviceId: string }
  | { kind: 'connected'; deviceId: string; deviceName: string }
  | { kind: 'disconnected'; reason: string }
  | { kind: 'error'; message: string };

export interface CaneManager {
  start(): Promise<void>;
  disconnect(): Promise<void>;
  destroy(): void;
  subscribeState(cb: (s: BleState) => void): () => void;
  onAlert(cb: (e: AlertEvent) => void): () => void;
}

export interface CaneManagerOptions {
  autoReconnect?: boolean;
}

const STATE_MAP: Record<string, BleState['kind']> = {
  [State.Unsupported]: 'unsupported',
  [State.Unauthorized]: 'unauthorized',
  [State.PoweredOff]: 'powered-off',
};

function decodeBase64Ascii(b64: string): string {
  return globalThis.atob(b64);
}

export function createCaneManager(opts: CaneManagerOptions = {}): CaneManager {
  const autoReconnectEnabled = opts.autoReconnect ?? true;
  const ble = new BleManager();

  const stateListeners = new Set<(s: BleState) => void>();
  const alertListeners = new Set<(e: AlertEvent) => void>();

  let currentState: BleState = { kind: 'idle' };
  let device: Device | null = null;
  let monitorSub: Subscription | null = null;
  let disconnectSub: Subscription | null = null;
  let scanTimeout: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempts = 0;
  let userDisconnect = false;
  let destroyed = false;
  const buffer = new LineBuffer();

  const setState = (next: BleState) => {
    currentState = next;
    for (const cb of stateListeners) cb(next);
  };

  const clearScanTimeout = () => {
    if (scanTimeout) {
      clearTimeout(scanTimeout);
      scanTimeout = null;
    }
  };

  const stopScan = () => {
    clearScanTimeout();
    ble.stopDeviceScan();
  };

  const teardownDevice = () => {
    monitorSub?.remove();
    monitorSub = null;
    disconnectSub?.remove();
    disconnectSub = null;
    buffer.reset();
    device = null;
  };

  const waitForPoweredOn = (): Promise<void> =>
    new Promise((resolve, reject) => {
      const sub = ble.onStateChange((s) => {
        if (s === State.PoweredOn) {
          sub.remove();
          resolve();
        } else if (s === State.Unsupported || s === State.Unauthorized) {
          sub.remove();
          reject(new Error(`bluetooth ${s.toLowerCase()}`));
        }
      }, true);
    });

  const handleNotification = (b64: string) => {
    try {
      const text = decodeBase64Ascii(b64);
      const lines = buffer.push(text);
      for (const line of lines) {
        const event = parseLine(line);
        if (event) {
          for (const cb of alertListeners) cb(event);
        }
      }
    } catch {
      // Ignore decode failures — malformed frames are non-fatal.
    }
  };

  const beginMonitor = async (target: Device): Promise<void> => {
    const connected = await target.connect({ timeout: CONNECT_TIMEOUT_MS });
    await connected.discoverAllServicesAndCharacteristics();
    device = connected;

    disconnectSub = connected.onDisconnected((_err, _disc) => {
      handleDisconnect('peer disconnected');
    });

    monitorSub = connected.monitorCharacteristicForService(
      HM10_SERVICE_UUID,
      HM10_CHARACTERISTIC_UUID,
      (err, char) => {
        if (err) {
          handleDisconnect(err.message ?? 'notification error');
          return;
        }
        if (char?.value) handleNotification(char.value);
      }
    );

    setState({
      kind: 'connected',
      deviceId: connected.id,
      deviceName: connected.name ?? connected.localName ?? 'SonicCane',
    });
    reconnectAttempts = 0;
  };

  const handleDisconnect = (reason: string) => {
    teardownDevice();
    if (userDisconnect || destroyed) {
      setState({ kind: 'idle' });
      return;
    }
    setState({ kind: 'disconnected', reason });
    if (autoReconnectEnabled && reconnectAttempts < RECONNECT_MAX_ATTEMPTS) {
      reconnectAttempts += 1;
      setTimeout(() => {
        if (!destroyed && !userDisconnect) void start();
      }, RECONNECT_BACKOFF_MS);
    } else if (reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) {
      setState({ kind: 'error', message: 'unable to reconnect' });
    }
  };

  const start = async (): Promise<void> => {
    if (destroyed) return;
    if (currentState.kind === 'scanning' || currentState.kind === 'connecting') return;

    userDisconnect = false;

    try {
      const initial = await ble.state();
      const mapped = STATE_MAP[initial];
      if (mapped && initial !== State.PoweredOn) {
        setState({ kind: mapped } as BleState);
      }
      if (initial !== State.PoweredOn) {
        await waitForPoweredOn();
      }
    } catch (e) {
      setState({ kind: 'error', message: (e as Error).message });
      return;
    }

    setState({ kind: 'scanning' });

    let resolvedTarget: Device | null = null;

    scanTimeout = setTimeout(() => {
      if (!resolvedTarget) {
        stopScan();
        setState({ kind: 'error', message: 'cane not found' });
      }
    }, SCAN_TIMEOUT_MS);

    ble.startDeviceScan([HM10_SERVICE_UUID], null, (err, found) => {
      if (err) {
        stopScan();
        setState({ kind: 'error', message: err.message });
        return;
      }
      if (!found || resolvedTarget) return;

      resolvedTarget = found;
      stopScan();
      setState({ kind: 'connecting', deviceId: found.id });

      beginMonitor(found).catch((connectErr) => {
        handleDisconnect((connectErr as Error).message ?? 'connect failed');
      });
    });
  };

  const disconnect = async (): Promise<void> => {
    userDisconnect = true;
    reconnectAttempts = RECONNECT_MAX_ATTEMPTS;
    stopScan();
    if (device) {
      try {
        await device.cancelConnection();
      } catch {
        // Already disconnected — fine.
      }
    }
    teardownDevice();
    setState({ kind: 'idle' });
  };

  const destroy = () => {
    destroyed = true;
    stopScan();
    teardownDevice();
    ble.destroy();
    stateListeners.clear();
    alertListeners.clear();
  };

  const subscribeState = (cb: (s: BleState) => void) => {
    stateListeners.add(cb);
    cb(currentState);
    return () => {
      stateListeners.delete(cb);
    };
  };

  const onAlert = (cb: (e: AlertEvent) => void) => {
    alertListeners.add(cb);
    return () => {
      alertListeners.delete(cb);
    };
  };

  return { start, disconnect, destroy, subscribeState, onAlert };
}
