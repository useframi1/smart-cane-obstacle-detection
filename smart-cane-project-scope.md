# Smart Cane Obstacle Detection Attachment

## Problem Statement

Traditional white canes allow visually impaired individuals to detect ground-level obstacles through physical contact. However, they provide no warning for obstacles at chest or head height — chairs, tables, open doors, shelves, and people. This gap makes indoor navigation dangerous and stressful.

## Proposed Solution

A compact, clip-on attachment for the upper grip of a standard white cane. The device uses three ultrasonic sensors to continuously scan for obstacles at body height in three directions (forward, left, right) and delivers real-time haptic and audio feedback to warn the user. A Bluetooth link streams live obstacle data to a caregiver's phone for supervised use or rehabilitation sessions.

The device complements the white cane rather than replacing it — the cane handles ground-level detection, the attachment handles everything above.

## How It Works

1. Three ultrasonic sensors, mounted on the cane's upper section, fire in a staggered sequence to avoid acoustic interference. Each sensor measures the distance to the nearest obstacle in its direction (forward, left, right).

2. The microcontroller processes the three distance readings and maps them to feedback intensity:
   - **Forward obstacle → Buzzer**: Beep frequency increases as the obstacle gets closer. Continuous tone at very close range.
   - **Left obstacle → Left vibration motor**: Pulse rate and intensity increase with proximity.
   - **Right obstacle → Right vibration motor**: Same behavior, opposite side.

3. A physical button on the grip cycles through three feedback modes:
   - **Buzzer only** — for outdoor use where vibration may be missed.
   - **Vibration only** — for quiet indoor environments (libraries, offices).
   - **Combined** — both channels active simultaneously.

4. The HC-05 Bluetooth module transmits distance readings over UART to a paired Android phone, where they can be viewed in a serial terminal app (e.g., Serial Bluetooth Terminal). This enables a caregiver to monitor obstacle proximity in real time during rehabilitation or training.

## System Block Diagram

```
    SENSING                 PROCESSING                FEEDBACK
 ┌──────────────┐      ┌──────────────────┐      ┌──────────────┐
 │ Ultrasonic   │      │                  │      │   Buzzer     │
 │  Forward     ├─────►│                  ├─────►│  Audio alert  │
 ├──────────────┤      │                  │      ├──────────────┤
 │ Ultrasonic   │      │  Microcontroller ├─────►│ Vibration L  │
 │  Left        ├─────►│  STM32L432KC     │      │  Left haptic │
 ├──────────────┤      │                  ├─────►├──────────────┤
 │ Ultrasonic   │      │  Measure dist.   │      │ Vibration R  │
 │  Right       ├─────►│  Map to feedback │      │  Right haptic│
 └──────────────┘      │  Manage modes    │      ├──────────────┤
                       │                  ├─────►│  Bluetooth   │
 ┌──────────────┐      │                  │      │  → Phone app │
 │ Mode button  ├─────►│                  │      └──────────────┘
 └──────────────┘      └────────┬─────────┘
                                │
                    ┌───────────┴───────────┐
                    │     Power supply      │
                    │  USB bank · 5V / 3.3V │
                    └───────────────────────┘
```

## Hardware Components

| Component | Quantity | Role |
|---|---|---|
| NUCLEO-L432KC (STM32L432KCU6) | 1 | Main microcontroller. ARM Cortex-M4, 80 MHz, 256 KB Flash, 64 KB RAM. Programmed via STM32CubeIDE using HAL/LL libraries. |
| HC-SR04 Ultrasonic Sensor | 3 | Distance measurement (forward, left, right). Range: 2–400 cm. Requires 5 V supply; echo pins connect directly to 5 V-tolerant GPIOs. |
| HC-05 Bluetooth Module | 1 | Streams distance data to an Android phone over classic Bluetooth SPP via UART (USART1). |
| Passive Piezo Buzzer | 1 | Audio feedback for forward obstacles. Driven by PWM through an NPN transistor. Passive type allows frequency control. |
| Coin Vibration Motor | 2 | Haptic feedback for left/right obstacles. Driven by PWM through NPN transistors with flyback diodes. |
| NPN Transistor (2N2222) | 3 | Switching for buzzer and motors (GPIO cannot source enough current directly). |
| Flyback Diode (1N4001) | 2 | Back-EMF protection across each vibration motor. |
| Momentary Push Button | 1 | Mode selection (buzzer / vibration / combined). Interrupt-driven with pull-up resistor. |
| 5 V Power Source | 1 | Powers HC-SR04 sensors. USB power bank or regulated supply. |

## Key Peripheral Usage (STM32L432KC)

| Peripheral | Assignment |
|---|---|
| TIM2 (32-bit, 4 channels) | Input capture for 3× HC-SR04 echo pulse measurement |
| TIM1 (advanced, channels) | PWM output for buzzer and vibration motors |
| USART1 | HC-05 Bluetooth TX/RX |
| USART2 (VCP) | Debug serial output via ST-LINK |
| GPIO + EXTI | Mode button (edge-triggered interrupt), HC-SR04 trigger pins |

## Feedback Behavior

| Distance Zone | Forward (Buzzer) | Left/Right (Vibration) |
|---|---|---|
| > 200 cm | Silent | Off |
| 100–200 cm | Slow beep (~2 Hz) | Gentle pulse |
| 50–100 cm | Medium beep (~5 Hz) | Moderate pulse |
| 20–50 cm | Fast beep (~10 Hz) | Strong, rapid pulse |
| < 20 cm | Continuous tone | Continuous vibration |

*Thresholds are initial estimates and will be tuned during testing.*

## Technical Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Ultrasonic crosstalk — three sensors firing simultaneously produce false echoes | Staggered timer-based polling: sensors fire sequentially with a short delay between each, a well-documented and reliable fix. |
| HC-SR04 requires 5 V but the STM32L432KC operates at 3.3 V | Most L432KC GPIO pins are 5 V-tolerant for input. Trigger pins output 3.3 V, which is above the HC-SR04's logic-high threshold. Alternatively, use HC-SR04+ (3.3 V native) if available. |
| Vibration motor directionality — user must distinguish left from right | Symmetric physical placement on the cane grip, validated with blindfolded user testing early in development. |
| Limited GPIO count on the 32-pin package | Pin map planned in STM32CubeMX before any hardware wiring. 12 pins needed; ~25 available. Comfortable margin. |

## Team Division of Work

| Member | Responsibility |
|---|---|
| Member A | HC-SR04 sensor driver: timer input-capture configuration, staggered polling logic, distance calculation from echo pulse width. |
| Member B | Actuator drivers: PWM configuration for buzzer and vibration motors, distance-to-feedback mapping, transistor driver circuits. |
| Member C | Bluetooth communication (USART1 + HC-05), mode state machine (button interrupt + mode cycling logic), system integration and main loop. |

All three members share responsibility for physical assembly, testing, and documentation.
