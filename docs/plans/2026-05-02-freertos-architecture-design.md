# SonicCane — FreeRTOS architecture design

**Date:** 2026-05-02
**Status:** approved design, pre-implementation
**Scope:** full final system (3 ToF sensors, 3 vibration motors, HM-10 BLE, mode button)

## Why FreeRTOS

The professor mandates FreeRTOS for M2 onward. M1's super-loop is exempt.

The design goal is to keep the system **as simple as a super-loop while gaining**:

- Independent timing for each subsystem (sensor poll rate ≠ motor toggle rate ≠ BLE rate).
- Clean separation between team members' code (one task per subsystem).
- ISR safety — interrupts stay tiny; debounce and other waits live in task context.

We are **not** using FreeRTOS for parallelism (the M4 has one core), or for dynamic memory (we avoid it), or for any feature beyond tasks, queues, and notifications.

## Task list

Five tasks, each with one responsibility.

| Task           | Job                                                       | Trigger          | Period         | Priority |
| -------------- | --------------------------------------------------------- | ---------------- | -------------- | -------- |
| `SensorTask`   | Read 3× VL53L1X over I²C1, publish distances              | periodic         | 33 ms (30 Hz)  | **4**    |
| `FeedbackTask` | Consume distances, drive 3 motor PWM rates, emit alerts   | event + periodic | 20 ms (50 Hz)  | **3**    |
| `CommsTask`    | Send/receive on HM-10 (BLE → phone TTS)                   | event-driven     | —              | **2**    |
| `ButtonTask`   | Debounce mode button, toggle vibration enable             | event-driven     | —              | **2**    |
| `DebugTask`    | UART2 telemetry to ST-LINK VCP                            | periodic         | 500 ms         | **1**    |

### Priority rationale

- **`SensorTask` highest:** the VL53L1X is configured with a 33 ms timing budget. Starving it produces stale or `out of range` reads.
- **`FeedbackTask` just below:** it must react to fresh data quickly and owns the rate-modulated motor toggling. A 10 Hz pulse needs a tick faster than 100 ms.
- **`CommsTask` and `ButtonTask` mid-priority:** user-perceptible but not real-time.
- **`DebugTask` lowest:** dev-only, must never disturb anything else.

### Ownership map

| Task           | Team member       |
| -------------- | ----------------- |
| `SensorTask`   | Youssef Rami      |
| `FeedbackTask` | Nour Tamer        |
| `CommsTask`    | Mariam ElGhobary  |
| `ButtonTask`   | shared            |
| `DebugTask`    | shared            |

## Architecture diagram

```
                        ┌─────────────────────────────────────┐
                        │   STM32L432KC  •  FreeRTOS kernel   │
                        └─────────────────────────────────────┘

HARDWARE                          TASKS                          HARDWARE
────────                          ─────                          ────────

┌──────────┐                ┌────────────────┐
│ VL53L1X  │◀─── I²C1 ─────▶│  SensorTask    │
│  ×3      │   (PA9/PA10)   │   prio 4       │
└──────────┘                │   30 Hz        │
                            └────────┬───────┘
                                     │
                                     │ xDistanceQueue
                                     │ {d_fwd, d_left, d_right, t}
                                     ▼
                            ┌────────────────┐
                            │  FeedbackTask  │──── PWM ───▶  ┌──────────┐
                            │   prio 3       │  (TIM1/TIMx)  │ 3× motor │
                            │   50 Hz        │               └──────────┘
                            └────┬───────────┘
                                 │           ▲
                          xAlertQueue        │ xModeNotify
                                 │           │
                                 ▼           │
                            ┌────────────────┴───┐
                            │   CommsTask        │
                            │   prio 2           │◀── USART1 ──▶ ┌────────┐
                            │   event-driven     │   (PB6/PB7)   │ HM-10  │
                            └────────────────────┘               └────────┘
                                                                     │
                                                                     ▼
                                                                iPhone (TTS)

                            ┌────────────────┐
 Button (PB0) ──EXTI──ISR──▶│  ButtonTask    │
                            │   prio 2       │
                            │   debounce     │
                            └────────┬───────┘
                                     │ xModeNotify
                                     └──────▶ FeedbackTask

                            ┌────────────────┐
                            │  DebugTask     │──── USART2 ──▶ ST-LINK VCP
                            │   prio 1       │   (PA2/PA3)
                            │   2 Hz         │
                            └────────────────┘
```

The shape is a pipeline: **sensors → feedback → motors**, with BLE and the button hanging off the side. Data flows one direction through the main pipe.

## IPC primitives

Every cross-task interaction uses one of three FreeRTOS primitives — no shared globals.

### `xDistanceQueue` — Sensor → Feedback

- **Length:** 2 (small — feedback should always have room; backups indicate a bug).
- **Payload:**

```c
typedef struct {
    uint16_t d_fwd;     // mm, 0 = out of range
    uint16_t d_left;
    uint16_t d_right;
    uint32_t t_ms;      // HAL_GetTick at sample time
} DistanceMsg_t;
```

- **Why a queue:** decouples sensor timing from feedback timing.

### `xAlertQueue` — Feedback → Comms

- **Length:** 4 (BLE is slow; bursts can buffer briefly).
- **Payload:** small enum + distance — e.g. `{ALERT_CLOSE_FWD, 80}`. Comms task formats it into a BLE packet.
- **Why event-based, not raw distances:** BLE is ~10× slower than the sensor loop. Sending only zone transitions keeps bandwidth sane and lets the phone app decide TTS phrasing.

### `xModeNotify` — Button → Feedback (task notification)

- **No payload** — just a "mode toggled" signal.
- **Why a notification, not a queue:** task notifications are ~45× faster than queues for binary signals. Perfect for "something happened, no data."

### What we don't need

- **No I²C mutex** — only `SensorTask` touches I²C1. Single owner.
- **No UART mutex** — `CommsTask` owns USART1, `DebugTask` owns USART2. Disjoint.
- **No shared globals with mutex** — all data flows through queues.

## Stack sizing

Stack sizes are in **words** (4 bytes on Cortex-M4). Numbers below have ~50% headroom — measure with `uxTaskGetStackHighWaterMark()` and tighten later.

| Task                   | Stack (words) | Stack (bytes) | Why                          |
| ---------------------- | ------------- | ------------- | ---------------------------- |
| `SensorTask`           | 384           | 1.5 KB        | ULD calls + I²C buffers      |
| `FeedbackTask`         | 256           | 1 KB          | small math, PWM register I/O |
| `CommsTask`            | 384           | 1.5 KB        | UART buffers + `snprintf`    |
| `ButtonTask`           | 128           | 512 B         | barely does anything         |
| `DebugTask`            | 256           | 1 KB          | `snprintf` for telemetry     |
| Idle + Timer (FreeRTOS) | 256 + 256    | 2 KB          | kernel internals             |

**Total task RAM ≈ 7.5 KB** of 64 KB. Heap (`configTOTAL_HEAP_SIZE`) gets another 8 KB for queues and TCBs. Comfortable.

## Scheduling behavior

FreeRTOS runs in **preemptive** mode. The kernel always runs the highest-priority ready task. A higher-priority task becoming ready preempts a running lower-priority task immediately.

A representative 100 ms slice:

```
   t (ms): 0    20   33   40   53   60   66   80   99
           │    │    │    │    │    │    │    │    │
SensorTask ███       ███       ███       ███       (every 33ms, ~5ms)
FeedbackT     ██  ██     ██  ██     ██  ██     ██  (on queue or every 20ms)
CommsTask     ░          ░                    ░    (on alerts only)
ButtonTask                                          (on press only)
DebugTask                                          (every 500ms)
IDLE      ░░░ ░░ ░░ ░░░░ ░░ ░░ ░░░ ░░ ░░░░ ░░ ░░  (the rest)
```

CPU spends most of its time in IDLE — embedded apps are I/O-bound. That's healthy.

## Two patterns that matter most

### Pattern 1: periodic task with `vTaskDelayUntil`

For periodic tasks, anchor to absolute time, not "delay N ticks after my work." This eliminates jitter from variable work duration.

```c
void vSensorTask(void *pvParameters) {
    TickType_t xLastWakeTime = xTaskGetTickCount();
    const TickType_t xPeriod = pdMS_TO_TICKS(33);
    DistanceMsg_t msg;

    for (;;) {
        msg.t_ms    = HAL_GetTick();
        msg.d_fwd   = read_sensor(SENSOR_FWD);
        msg.d_left  = read_sensor(SENSOR_LEFT);
        msg.d_right = read_sensor(SENSOR_RIGHT);

        xQueueSend(xDistanceQueue, &msg, 0);   // 0 timeout = drop on full

        vTaskDelayUntil(&xLastWakeTime, xPeriod);
    }
}
```

`xQueueSend` with timeout `0` is deliberate — if the queue is full, the *new* reading is more useful than blocking the sensor loop.

### Pattern 2: ISR → task notification (button)

ISR stays sub-microsecond. Real work happens in `ButtonTask`, where blocking calls and debounce waits are safe.

```c
// In EXTI ISR — runs in interrupt context, must be tiny
void HAL_GPIO_EXTI_Callback(uint16_t GPIO_Pin) {
    if (GPIO_Pin == BUTTON_Pin) {
        BaseType_t xWoken = pdFALSE;
        vTaskNotifyGiveFromISR(buttonTaskHandle, &xWoken);
        portYIELD_FROM_ISR(xWoken);
    }
}

// In ButtonTask — runs in task context, can block freely
void vButtonTask(void *pvParameters) {
    for (;;) {
        ulTaskNotifyTake(pdTRUE, portMAX_DELAY);   // blocks until ISR signals
        vTaskDelay(pdMS_TO_TICKS(20));             // settle bouncing
        if (HAL_GPIO_ReadPin(BUTTON_Port, BUTTON_Pin) == GPIO_PIN_RESET) {
            xTaskNotifyGive(feedbackTaskHandle);   // tell feedback to toggle
        }
    }
}
```

Same logic as the M1 ISR debounce, but the 20 ms wait happens in a task that can sleep instead of holding up the ISR.

## `FreeRTOSConfig.h` essentials

```c
#define configUSE_PREEMPTION              1
#define configUSE_TIME_SLICING            1
#define configTICK_RATE_HZ                1000
#define configMAX_PRIORITIES              5
#define configMINIMAL_STACK_SIZE          128
#define configTOTAL_HEAP_SIZE             8192

// Catch bugs during development:
#define configCHECK_FOR_STACK_OVERFLOW    2
#define configUSE_MALLOC_FAILED_HOOK      1
#define configUSE_TASK_NOTIFICATIONS      1
```

## CubeMX choice: native FreeRTOS API, not CMSIS-RTOS v2

When FreeRTOS is enabled in CubeMX, the default interface is **CMSIS-RTOS v2** (`osThreadNew`, `osMessageQueueNew`). The native FreeRTOS API (`xTaskCreate`, `xQueueCreate`) is:

- More widely documented (every FreeRTOS book and tutorial uses it).
- Portable across non-ST FreeRTOS projects.
- One layer thinner.

Switch under *Middleware → FREERTOS → Interface = CMSIS_V1* → change to `Disabled`, then call FreeRTOS APIs directly. (Exact CubeMX steps depend on the version; verify at implementation time.)

## File layout when growing past `main.c`

```
Core/Src/
├── main.c                     ← only init + vTaskStartScheduler
├── tasks/
│   ├── sensor_task.c          ← Youssef
│   ├── feedback_task.c        ← Nour
│   ├── comms_task.c           ← Mariam
│   ├── button_task.c
│   └── debug_task.c
└── ipc/
    └── ipc.c                  ← queue + notification handle definitions
```

`main.c` shrinks to peripheral init + task creation + `vTaskStartScheduler()`. Each task lives in its own `.c` file owned by one team member. `ipc.c` is the single place where queue and task handles are declared `extern`.

## One-line recap

**5 tasks, 2 queues, 2 notifications, 0 mutexes.** Sensor publishes distances → Feedback drives motors and emits alerts → Comms talks BLE. Button is an ISR that wakes a tiny task. Debug prints telemetry at low priority. The kernel handles everything else.
