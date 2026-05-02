# SonicCane — Smart Cane Obstacle Detection Attachment

**Team:** Youssef Rami, Nour Tamer, Mariam ElGhobary

**Course:** CSCE4301 Embedded Systems

---

## 1. Problem Statement

Traditional white canes allow visually impaired individuals to detect ground-level obstacles through physical contact. However, they provide no warning for obstacles at chest or head height — chairs, tables, open doors, shelves, low-hanging signs, tree branches, parked-vehicle mirrors, scaffolding, and people. This gap makes both indoor and outdoor navigation dangerous and stressful.

## 2. Proposed Solution

A compact, clip-on attachment for the upper grip of a standard white cane. The device uses three **laser time-of-flight (ToF) sensors** to continuously scan for obstacles at body height in three directions (forward, left, right) and delivers real-time feedback through two channels:

1. **On-cane directional haptic feedback** — three independent coin vibration motors mounted on the grip, one per sensor direction (forward, left, right). The user feels both _where_ the obstacle is (which motor fires) and _how close_ (pulse rate scales with proximity).
2. **Spoken alerts via paired audio** — a companion mobile app (React Native) receives distance data over Bluetooth and uses the phone's text-to-speech engine to speak directional alerts through whatever audio device the user already has paired (earbuds, bone-conduction headset, hearing aid, or phone speaker).

The device **complements** the white cane rather than replacing it — the cane still handles ground-level detection, and the attachment handles everything above.

## 3. Positioning — Why Build This?

Several smart canes already exist, and we make no claim of reinventing the category. SonicCane sits deliberately in a specific gap:

| Existing product | Category | Gap SonicCane fills |
|---|---|---|
| **WeWALK Smart Cane 2** (~$700 / ~35,000 EGP) | Premium commercial | Far too expensive for most users in Egypt. |
| **torch-it Saarthi** (~$70) | Mid-range commercial | Not sold in Egypt. |
| **Stanford Augmented Cane**, **Tom Pouce III** | Research prototypes | Not available to the public. |
| Conventional white cane | Baseline | No above-ground detection at all. |

**Our contribution:** a **sub-2000 EGP, ToF-based, open-source** clip-on attachment, fully sourceable from local suppliers in Cairo. The combination of low cost, three-direction laser ToF sensing, multi-channel feedback (directional haptic + spoken alerts via the user's own audio device), and full local sourceability is what existing options in this price range do not offer in Egypt.

> We are not inventing the smart cane. We are exploring a lower-cost, ToF-based variant as a learning exercise in embedded hardware–software co-design.

---

## 4. How It Works

1. **Three VL53L1X ToF sensors** mounted on the cane's upper grip continuously measure distance in three directions — forward, left, right — at up to 50 Hz each. Because ToF sensors use a laser pulse rather than an acoustic one, they can run **concurrently** without the crosstalk issues of ultrasonic sensors.

2. The **STM32L432KC microcontroller** reads all three sensors over a shared I²C bus, converts raw readings into distance zones, and drives feedback accordingly:

   - **Forward obstacle → forward vibration motor.** Pulse rate increases as the obstacle gets closer — slow pulses when far, faster pulses when near, continuous vibration at very close range.
   - **Left obstacle → left vibration motor.** Same behavior on the left side of the grip.
   - **Right obstacle → right vibration motor.** Same behavior on the right side of the grip.

   All three motors share a common rate-vs-distance mapping; the user identifies direction from which motor is firing and proximity from how fast it pulses.

3. A **physical button** on the grip toggles the on-cane vibration on or off:

   - **Vibration on** — directional haptic feedback active across all three motors.
   - **Vibration off (silent)** — all motors disabled. The system still senses and still streams distance data over Bluetooth, so when the companion app is paired the user continues to receive spoken TTS alerts through their own audio device. Useful when the user wants no on-cane vibration at all (e.g. meetings, prayer, mosques, libraries with noise-sensitive equipment) and is relying entirely on TTS through earbuds.

4. The **HM-10 BLE module** streams distance codes over UART to a paired phone at ~5 Hz. The phone runs a lightweight companion app (built with React Native) that converts incoming distance codes into spoken phrases ("obstacle left, one meter") using the phone's built-in text-to-speech engine. Speech is routed through whatever audio device the phone is currently paired to — wired earbuds, Bluetooth headphones, bone-conduction headset, hearing aid, or the phone's speaker.

---

## 5. System Block Diagram

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

---

## 6. Hardware Components

| Component | Qty | Role |
|---|---|---|
| NUCLEO-L432KC (STM32L432KCU6) | 1 | Main microcontroller. ARM Cortex-M4, 80 MHz, 256 KB Flash, 64 KB RAM. Programmed via STM32CubeIDE using HAL/LL libraries. |
| VL53L1X ToF sensor (TOF400C breakout) | 3 | Laser-based distance measurement (forward, left, right). Range 4–400 cm, ±5 mm accuracy, 15–27° field of view. Native 3.3 V, shared I²C bus. |
| HM-10 BLE Module | 1 | Streams distance data to companion mobile app over Bluetooth Low Energy (GATT) via UART (USART1). Native 3.3 V, iOS-compatible (BLE works with iPhones without MFi certification, unlike Classic Bluetooth SPP). |
| Coin vibration motor | 3 | Directional haptic feedback for forward, left, and right obstacles (one motor per sensor direction). Driven by PWM through NPN transistors with flyback diodes. |
| NPN transistor (2N2222) | 3 | Motor switching, one per vibration motor (GPIO cannot source enough current directly). |
| Flyback diode (1N4001) | 3 | Back-EMF protection across each vibration motor. |
| Momentary push button | 1 | Vibration on/off toggle. Interrupt-driven with pull-up resistor. |
| 18650 Li-ion cell (~3000 mAh, protected) | 1 | Main battery. ~45 g, integrated into the enclosure. |
| TP4056 charging module | 1 | USB-C input, safe charging with over-discharge protection. |
| JST-XH 2-pin pigtail cable | 1 | Mates with the JST connector pre-wired to the 18650 cell. Allows the battery to be unplugged from the circuit for safe handling, swapping, or storage without soldering. |
| MT3608 boost converter | 1 | Steps the 3.7 V cell up to a stable 5 V rail that feeds the Nucleo's VIN (see Section 9). The Nucleo's onboard LDO needs ≥ 5 V in to hold a clean 3.3 V output across the battery's 3.0–4.2 V swing; without the boost stage, the 3.3 V logic rail would sag as the cell drains. Vibration motors are powered directly from the battery rail instead. |
| Rocker switch (SPST, 2-pin) | 1 | Master on/off. Rocker style chosen over a slide switch for clearer tactile ON/OFF positions and audible click — important for a blind user operating the device by touch alone. |

---

## 7. Key Peripheral Usage (STM32L432KC)

| Peripheral | Assignment |
|---|---|
| I²C1 | Shared bus for all three VL53L1X sensors |
| 3× GPIO (XSHUT lines) | Sequential I²C address assignment at boot — each sensor is brought out of reset one at a time and given a unique address |
| TIM1 / TIM2 / TIM3 channels | PWM output for the three vibration motors (forward, left, right). TIM1_CH1 is already in use; the other two channels come from TIM2/TIM3 since TIM1_CH2/CH3 conflict with the I²C pins on this package. |
| USART1 | HM-10 BLE TX/RX |
| USART2 (VCP) | Debug serial output via ST-LINK |
| GPIO + EXTI | Vibration on/off button (edge-triggered interrupt) |

---

## 8. Feedback Behavior

Each vibration motor maps 1-to-1 to its sensor (forward / left / right) and shares the same rate-vs-distance curve. The user identifies *direction* from which motor is firing and *proximity* from how fast it pulses.

| Distance zone | Vibration (forward / left / right) | Companion app (TTS) |
|---|---|---|
| > 200 cm | Off | Silent |
| 100–200 cm | Slow pulse (~2 Hz) | "Obstacle [direction], [distance]" every ~3 s |
| 50–100 cm | Medium pulse (~5 Hz) | Repeated every ~2 s |
| 20–50 cm | Fast pulse (~10 Hz) | Repeated every ~1 s |
| < 20 cm | Continuous vibration | "Stop — obstacle [direction]" |

*Thresholds are initial estimates and will be tuned during user testing. Pulses are rate-modulated (fixed PWM duty when on, off otherwise) — the rate of the on/off pattern is what conveys distance. Multiple motors may fire simultaneously when obstacles appear in more than one direction. In "vibration off" mode all motors are suppressed and only the TTS column remains active, via the companion app.*

---

## 9. Power Subsystem

The device is mounted on a cane, so the power source has to be **small, light, and fully enclosed** — not a dangling external power bank.

### Design

```
    USB-C in
       │
       ▼
   ┌─────────┐        ┌──────────────┐
   │ TP4056  │ ─────► │ 18650 cell   │
   │ charger │        │ 3.7 V + BMS  │
   └─────────┘        └──────┬───────┘
                             │
                             ▼
                       ┌───────────┐
                       │  Master   │
                       │  rocker   │
                       │  switch   │
                       └─────┬─────┘
                             │
                Battery rail (3.0–4.2 V)
                             │
                ┌────────────┴────────────┐
                │                         │
                ▼                         ▼
         ┌────────────┐           ┌──────────────────┐
         │  MT3608    │           │ 3× Vibration     │
         │  boost     │           │ motors           │
         │  → 5 V     │           │ (3× 2N2222)      │
         └──────┬─────┘           └──────────────────┘
                │
         5 V rail
                │
                └──► Nucleo VIN
                       │
                  onboard LDO
                       │
                   3.3 V rail
                       │
                       ├──► 3× VL53L1X ToF sensors
                       ├──► HM-10 BLE module
                       └──► STM32 MCU core
```

### Why two rails

The **5 V rail** (boosted from the battery by the MT3608) feeds the Nucleo's VIN. The Nucleo's onboard LDO needs ≥ 5 V in to maintain a clean 3.3 V output across the battery's 3.0–4.2 V swing — without the boost stage, the 3.3 V logic rail would sag as the cell drains and risk dropping the MCU, ToF sensors, and HM-10 below their minimum supply voltages. The 3.3 V rail then powers the MCU core and all 3.3 V peripherals (ToF sensors, HM-10).

The **battery rail** (3.0–4.2 V, unboosted) powers the three vibration motors directly. The coin motors available from our local suppliers are rated 1.5–3.7 V and would be overdriven on a 5 V rail, shortening their life. Running them straight from the battery keeps them within their rated range, and as a small bonus avoids the conversion losses of routing motor current through the boost converter.

### Component weights

| Part | Weight |
|---|---|
| 18650 cell (~3000 mAh, protected) | ~45 g |
| TP4056 charging module | ~2 g |
| MT3608 boost converter | ~2 g |
| Rocker switch + wiring | ~3 g |
| **Total** | **~52 g** |

For comparison, a typical USB power bank is 150–250 g. **This saves roughly 150 g of weight at the grip.**

### Runtime estimate

| Load | Typical draw |
|---|---|
| STM32L432KC active | ~10 mA |
| 3× VL53L1X (continuous ranging) | ~60 mA |
| HM-10 BLE connected, streaming | ~9 mA |
| 3× vibration motors (intermittent, typically one fires at a time) | ~30 mA avg |
| **Average** | **~110 mA** |

At 3000 mAh: **~8–12 hours of continuous use per charge.** Easily a full day, rechargeable overnight via USB-C.

---

## 10. Companion Mobile App

Audio output is handled entirely by the phone, not by the cane. The HM-10 sends short **distance codes** over a BLE GATT characteristic, and the companion app converts each code into a spoken phrase using the phone's built-in text-to-speech engine.

### Architecture

```
  SonicCane                    Phone                         User
  (HM-10, BLE)                 (companion app)               (paired audio)
  ────────────                 ───────────────               ──────────────
       │                             │                             │
       │  "F:120,L:45,R:250\n"       │                             │
       │ ───────────────────────────►│                             │
       │  (BLE notify, ~5 Hz)        │                             │
       │                             │  TTS: "Obstacle left, 45cm" │
       │                             │ ───────────────────────────►│
       │                             │  (via wired or BT audio)    │
       │                             │                             │
```

### Why this design

1. **Works with any audio device** the user already owns — wired earbuds, Bluetooth headphones, bone-conduction headsets, hearing aids. The phone owns the audio routing; the cane never touches it.
2. **Meaningful phrases**, not just pulse patterns. "Obstacle left, one meter" conveys more information than a vibration rate alone, especially for finer-grained distance cues.
3. **Hands-free.** The app runs in the background; no phone interaction needed.
4. **Small periodic packets are exactly what BLE is designed for.** Distance codes at ~5 Hz are well within a single GATT notification, so the connection stays low-power and responsive.

### App functionality

The companion app has a single purpose: receive distance codes over BLE and speak them via TTS, routed through the phone's current audio output. There is no caregiver dashboard, no logging, and no remote monitoring view — the user is the only audience.

The app will be built using **React Native**, with iOS as the primary target platform (the team's own phones are all iOS) and Android as a future option. The React Native ecosystem provides `react-native-ble-plx` for the BLE GATT connection on both platforms, and `react-native-tts` for the text-to-speech engines on both platforms.

### Important: the on-cane feedback works without the phone

If the phone is missing, uncharged, or out of range, the on-cane vibration motors continue to function exactly as designed whenever vibration is enabled. The companion app is an **additional** feedback channel, not a dependency. The one exception is when the user has toggled vibration off — they have deliberately chosen to rely entirely on TTS and so do need the phone connected to receive any alerts.

---

## 11. Functional Requirements

| ID | Requirement |
|---|---|
| FR1 | Detect obstacles at 20 cm – 4 m in three directions (forward, left, right). |
| FR2 | Update feedback at least 10 times per second. |
| FR3 | Provide directional haptic feedback for forward, left, and right obstacles via three independent vibration motors, one per sensor direction. |
| FR4 | Allow the user to toggle the on-cane vibration on or off via a physical button. |
| FR5 | Continue to provide on-cane feedback when not connected to a phone, whenever vibration is enabled. |
| FR6 | When paired with the companion app, stream distance codes over Bluetooth Low Energy at ≥ 5 Hz. |
| FR7 | Provide spoken directional alerts via the companion app and phone TTS engine. |
| FR8 | Operate on a single internal battery for at least 6 hours of continuous use. |
| FR9 | Recharge via USB-C without removing the battery. |
| FR10 | Keep total added weight (electronics + battery) under 120 g. |

---

## 12. Technical Risks and Mitigations

| Risk | Mitigation |
|---|---|
| **Ambient light affects ToF range in direct sunlight** — VL53L1X uses 940 nm IR, which competes with solar IR. | The device targets **both indoor and outdoor use**. Indoors, full ~4 m range is available. In direct sunlight, range drops to ~1.5–2 m, which still covers the critical close-obstacle zone (chest/head-height hazards within roughly two paces). To improve outdoor performance we will (a) enable the VL53L1X "long distance" timing budget profile and tune the SPAD ROI to reduce solar noise, (b) recess each sensor slightly inside a short shroud in the enclosure to shade the receiver lens, and (c) treat the outdoor range reduction as a documented limitation rather than a hard restriction on use. |
| **I²C address collision** — all three VL53L1Xs boot with the same default address (0x29). | Standard XSHUT-based startup routine: hold all sensors in reset, then bring them up one at a time and reassign addresses via I²C. Well-documented in the ST API and Pololu library. |
| **Vibration motor directionality** — user must distinguish forward, left, and right vibration sources on the grip. | Distinct physical placement: the forward motor on the front face of the grip, the left and right motors on the lateral faces. Validated via blindfolded user testing early in development; if forward-vs-lateral confusion appears, distinct pulse waveforms (e.g. a short double-tap pattern on the forward motor) are a fallback. |
| **Bluetooth audio latency** — TTS alerts via phone may lag behind haptic feedback. | The on-cane vibration motors remain the **primary** feedback channel for time-critical warnings. TTS supplements, not replaces, them. |
| **Component sourcing delays** — VL53L1X is ~3× the cost of HC-SR04 and less stocked. | Order from Makers Electronics / Future Electronics Egypt / Amazon.eg in Week 1. All three vendors confirmed in stock. |
| **Mobile app scope creep** — React Native app could grow beyond the available timeline. | Define a minimum viable app early: BLE listener, distance parser, and TTS output. Additional features (settings, customization, voice tuning) are stretch goals, built only if core integration is solid. |

---

## 13. Team Division of Work

| Member | Primary responsibility |
|---|---|
| **Youssef Rami** | VL53L1X driver: I²C setup, XSHUT-based address assignment, continuous ranging, distance read loop. |
| **Nour Tamer** | Actuator drivers (PWM for the three vibration motors), distance-to-feedback mapping, vibration on/off state machine, transistor driver circuits. |
| **Mariam ElGhobary** | HM-10 UART link, BLE GATT protocol, companion mobile app (React Native, iOS-first), TTS integration. |

All three members share responsibility for:

- Physical assembly and enclosure design
- Power subsystem assembly and validation
- System-level integration and debugging
- Testing (both bench and user trials)
- Documentation and wiki maintenance
