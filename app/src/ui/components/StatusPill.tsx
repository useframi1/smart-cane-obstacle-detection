import type { BleState } from '../../ble/manager';
import { palette } from '../../theme/tokens';
import { Pill } from './Pill';

export interface StatusPillProps {
  state: BleState;
}

interface StatusDescriptor {
  label: string;
  tint: string;
  background: string;
  border: string;
  dot: boolean;
}

function describe(state: BleState): StatusDescriptor {
  switch (state.kind) {
    case 'connected':
      return {
        label: `Linked · ${state.deviceName}`,
        tint: palette.ok,
        background: palette.okSoft,
        border: palette.okBorder,
        dot: true,
      };
    case 'scanning':
      return {
        label: 'Scanning…',
        tint: palette.accent,
        background: palette.accentSoft,
        border: palette.accentBorder,
        dot: true,
      };
    case 'connecting':
      return {
        label: 'Connecting',
        tint: palette.accent,
        background: palette.accentSoft,
        border: palette.accentBorder,
        dot: true,
      };
    case 'disconnected':
      return {
        label: `Offline · ${state.reason}`,
        tint: palette.zone.MED,
        background: palette.zoneSoft.MED,
        border: '#FCD34D',
        dot: true,
      };
    case 'error':
      return {
        label: state.message,
        tint: palette.danger,
        background: palette.dangerSoft,
        border: palette.dangerBorder,
        dot: true,
      };
    case 'unsupported':
      return {
        label: 'Bluetooth unsupported',
        tint: palette.danger,
        background: palette.dangerSoft,
        border: palette.dangerBorder,
        dot: false,
      };
    case 'unauthorized':
      return {
        label: 'Permission required',
        tint: palette.danger,
        background: palette.dangerSoft,
        border: palette.dangerBorder,
        dot: false,
      };
    case 'powered-off':
      return {
        label: 'Bluetooth off',
        tint: palette.zone.MED,
        background: palette.zoneSoft.MED,
        border: '#FCD34D',
        dot: false,
      };
    default:
      return {
        label: 'Standby',
        tint: palette.textLow,
        background: palette.surface,
        border: palette.border,
        dot: false,
      };
  }
}

export function StatusPill({ state }: StatusPillProps) {
  const d = describe(state);
  return (
    <Pill
      label={d.label}
      tint={d.tint}
      background={d.background}
      border={d.border}
      dot={d.dot}
    />
  );
}
