# SonicCane

A low-cost, clip-on attachment for the standard white cane that detects obstacles at chest and head height — chairs, low signs, branches, open doors, parked-vehicle mirrors, scaffolding — and warns the user through directional vibration on the cane and spoken alerts via a paired phone.

> CSCE4301 Embedded Systems · Spring 2026 · The American University in Cairo

## Team

- **Youssef Rami** — sensor subsystem (VL53L1X driver, I²C, ranging loop)
- **Nour Tamer** — actuators, feedback mapping, mode state machine
- **Mariam ElGhobary** — Bluetooth link and React Native companion app

## The problem

Traditional white canes detect ground-level obstacles through physical contact, but provide no warning for anything at chest or head height. SonicCane closes that gap **without replacing the cane** — the cane still handles the ground, and the attachment handles everything above.

## The solution

A clip-on module for the cane's upper grip, built around an STM32L432KC microcontroller and three VL53L1X laser time-of-flight sensors aimed forward, left, and right. Distance readings drive two feedback channels:

- **Vibration motors** — three independent coin motors mounted on the grip, one per sensor direction (forward, left, right). Pulse rate scales with proximity, so the user feels both _where_ the obstacle is and _how close_.
- **Spoken alerts** — a paired iOS app receives distance codes over BLE and speaks them ("obstacle left, 45 cm") through whatever audio device the user is already using — earbuds, bone-conduction headset, or hearing aid.

A momentary push button on the grip toggles the on-cane vibration on or off. The BLE link to the phone is always available when paired, so the user can silence the cane entirely (e.g. in meetings or libraries) and still receive spoken alerts through their own audio device.

The on-cane feedback works **without** the phone whenever vibration is enabled.

## System architecture

```
     SENSING                      PROCESSING                    FEEDBACK
 ┌───────────────┐           ┌───────────────────┐         ┌────────────────┐
 │ VL53L1X ToF   │           │                   │         │ Vibration F    │
 │  Forward      │◄─I²C─────►│                   ├─PWM────►│ (fwd haptic)   │
 ├───────────────┤           │                   │         ├────────────────┤
 │ VL53L1X ToF   │           │  STM32L432KC      │         │ Vibration L    │
 │  Left         │◄─I²C─────►│  Cortex-M4, 80MHz ├─PWM────►│ (left haptic)  │
 ├───────────────┤           │                   │         ├────────────────┤
 │ VL53L1X ToF   │           │  - Sensor polling │         │ Vibration R    │
 │  Right        │◄─I²C─────►│  - Feedback map   ├─PWM────►│ (right haptic) │
 └───────────────┘           │  - On/off toggle  │         ├────────────────┤
                             │  - BT streaming   │         │ HM-10 BLE      │
 ┌───────────────┐           │                   ├─UART───►│ ──► Phone app  │
 │ Mode button   ├──EXTI────►│                   │         │   └─ TTS alerts│
 └───────────────┘           └─────────┬─────────┘         └────────────────┘
                                       │
                         ┌─────────────┴──────────────┐
                         │      POWER SUBSYSTEM       │
                         │  18650 cell ── TP4056 ──   │
                         │  MT3608 boost → 5V / 3.3V  │
                         └────────────────────────────┘
```

Full design rationale, pin assignments, and tradeoffs are in [the project scope document](soniccane-project-scope.md).

## Hardware

| Component                                           | Qty    | Role                              |
| --------------------------------------------------- | ------ | --------------------------------- |
| NUCLEO-L432KC (STM32L432KCU6)                       | 1      | Cortex-M4 microcontroller, 80 MHz |
| VL53L1X ToF sensor (TOF400C)                        | 3      | Laser distance, 4–400 cm, ±5 mm   |
| HM-10 BLE module                                    | 1      | UART-to-BLE bridge to phone       |
| Coin vibration motor                                | 3      | Forward / left / right haptic feedback |
| 2N2222 NPN transistor                               | 3      | Motor switching (one per motor)   |
| 1N4001 diode                                        | 3      | Motor flyback protection          |
| Momentary push button                               | 1      | Mode selection                    |
| 18650 Li-ion cell + TP4056 + MT3608 + rocker switch | 1 each | Power subsystem                   |

Target BOM: **under 2000 EGP**, fully sourced from suppliers in Cairo.
Target weight: **under 120 g** added to the cane.
Target runtime: **8–12 hours** per charge, USB-C rechargeable.

## Software

- **Firmware** — C, written against STM32 HAL/LL libraries in STM32CubeIDE. Sensor driver based on the ST/Pololu VL53L1X library.
- **Companion app** — React Native, iOS-first. Uses `react-native-ble-plx` for the BLE GATT connection and `react-native-tts` for speech. Single purpose: receive distance codes and speak them.

Source code will be added to this repository as it is written.

## Repository structure

```
.
├── README.md                       this file
├── project-description.md          course project brief (from the instructor)
├── soniccane-project-scope.md      approved team proposal — full system design
└── project-slides.pdf              proposal presentation deck
```

## Documents

- [Project scope and design rationale](soniccane-project-scope.md)
- [Course project brief](project-description.md)
- [Proposal slides](project-slides.pdf)
