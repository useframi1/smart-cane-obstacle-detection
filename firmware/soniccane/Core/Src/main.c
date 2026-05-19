/* USER CODE BEGIN Header */
/**
 ******************************************************************************
 * @file           : main.c
 * @brief          : Main program body
 ******************************************************************************
 * @attention
 *
 * Copyright (c) 2026 STMicroelectronics.
 * All rights reserved.
 *
 * This software is licensed under terms that can be found in the LICENSE file
 * in the root directory of this software component.
 * If no LICENSE file comes with this software, it is provided AS-IS.
 *
 ******************************************************************************
 */
/* USER CODE END Header */
/* Includes ------------------------------------------------------------------*/
#include "main.h"
#include "cmsis_os.h"

/* Private includes ----------------------------------------------------------*/
/* USER CODE BEGIN Includes */
#include <stdio.h>
#include "FreeRTOS.h"
#include "queue.h"
#include "semphr.h"
#include "VL53L1X_api.h"
#include "vl53l1_platform.h"
/* USER CODE END Includes */

/* Private typedef -----------------------------------------------------------*/
/* USER CODE BEGIN PTD */
typedef struct
{
  uint16_t d_fwd;
  uint16_t d_left;
  uint16_t d_right;
  uint32_t t_ms;
} DistanceMsg_t;

typedef struct
{
  DistanceMsg_t dist;
  uint8_t motor_enabled;
  uint32_t err_count[3];
  uint32_t bus_recover_count;
} TelemetrySnapshot_t;

typedef struct
{
  VL53L1_Dev_t dev;
  GPIO_TypeDef *xshut_port;
  uint16_t xshut_pin;
  uint16_t last_dist;
  TIM_HandleTypeDef *htim;
  uint32_t tim_channel;
} channel_t;

typedef enum
{
  ALERT_OFF = 0,   /* > 2 m or invalid                */
  ALERT_FAR,       /* 1.0�2.0 m                       */
  ALERT_MEDIUM,    /* 0.5�1.0 m                       */
  ALERT_CLOSE,     /* 0.2�0.5 m                       */
  ALERT_IMMEDIATE, /* < 0.2 m                          */
} AlertZone_t;

typedef struct
{
  uint8_t dir; /* IDX_FWD / IDX_LEFT / IDX_RIGHT  */
  AlertZone_t zone;
  uint16_t dist_mm;
} AlertMsg_t;

typedef struct
{
  uint16_t buf[5];
  uint8_t idx;
  uint8_t count;
} median_filter_t;
/* USER CODE END PTD */

/* Private define ------------------------------------------------------------*/
/* USER CODE BEGIN PD */
#define N_CH 3
#define IDX_FWD 0
#define IDX_LEFT 1
#define IDX_RIGHT 2

#define PWM_ARR 999u
#define PWM_FULL_ON 1000u /* > ARR ? output stays HIGH */
#define PWM_HALF_DUTY 500u

#define PSC_1_5HZ 53332u
#define PSC_3HZ 26665u
#define PSC_6HZ 13332u

#define FILTER_N 5u
/* USER CODE END PD */

/* Private macro -------------------------------------------------------------*/
/* USER CODE BEGIN PM */

/* USER CODE END PM */

/* Private variables ---------------------------------------------------------*/
I2C_HandleTypeDef hi2c1;

TIM_HandleTypeDef htim1;
TIM_HandleTypeDef htim2;
TIM_HandleTypeDef htim16;

UART_HandleTypeDef huart1;
UART_HandleTypeDef huart2;

/* Definitions for defaultTask */
osThreadId_t defaultTaskHandle;
const osThreadAttr_t defaultTask_attributes = {
    .name = "defaultTask",
    .stack_size = 128 * 4,
    .priority = (osPriority_t)osPriorityNormal,
};
/* Definitions for Sensor */
osThreadId_t SensorHandle;
const osThreadAttr_t Sensor_attributes = {
    .name = "Sensor",
    .stack_size = 384 * 4,
    .priority = (osPriority_t)osPriorityHigh,
};
/* Definitions for Feedback */
osThreadId_t FeedbackHandle;
const osThreadAttr_t Feedback_attributes = {
    .name = "Feedback",
    .stack_size = 256 * 4,
    .priority = (osPriority_t)osPriorityAboveNormal,
};
/* Definitions for Button */
osThreadId_t ButtonHandle;
const osThreadAttr_t Button_attributes = {
    .name = "Button",
    .stack_size = 128 * 4,
    .priority = (osPriority_t)osPriorityAboveNormal,
};
/* Definitions for Debug */
osThreadId_t DebugHandle;
const osThreadAttr_t Debug_attributes = {
    .name = "Debug",
    .stack_size = 256 * 4,
    .priority = (osPriority_t)osPriorityLow,
};
/* Definitions for Comms */
osThreadId_t CommsHandle;
const osThreadAttr_t Comms_attributes = {
    .name = "Comms",
    .stack_size = 384 * 4,
    .priority = (osPriority_t)osPriorityNormal,
};
/* Definitions for BinSemMode */
osSemaphoreId_t BinSemModeHandle;
const osSemaphoreAttr_t BinSemMode_attributes = {
    .name = "BinSemMode"};
/* USER CODE BEGIN PV */
static channel_t ch[N_CH] = {
    [IDX_FWD] = {
        .dev = {.I2cHandle = &hi2c1},
        .xshut_port = XSHUT_F_GPIO_Port,
        .xshut_pin = XSHUT_F_Pin,
        .htim = &htim2,
        .tim_channel = TIM_CHANNEL_1,
    },
    [IDX_LEFT] = {
        .dev = {.I2cHandle = &hi2c1},
        .xshut_port = XSHUT_L_GPIO_Port,
        .xshut_pin = XSHUT_L_Pin,
        .htim = &htim1,
        .tim_channel = TIM_CHANNEL_1,
    },
    [IDX_RIGHT] = {
        .dev = {.I2cHandle = &hi2c1},
        .xshut_port = XSHUT_R_GPIO_Port,
        .xshut_pin = XSHUT_R_Pin,
        .htim = &htim16,
        .tim_channel = TIM_CHANNEL_1,
    },
};

static const uint8_t SENSOR_ADDRS[N_CH] = {0x54, 0x56, 0x58};

static volatile uint32_t err_count[N_CH] = {0};
static volatile uint32_t bus_recover_count = 0;

static median_filter_t mf[N_CH] = {0};

static volatile uint8_t motor_enabled = 0;

osMessageQueueId_t distanceQueueHandle;
osMessageQueueId_t telemetryQueueHandle;
osMessageQueueId_t alertQueueHandle;
/* USER CODE END PV */

/* Private function prototypes -----------------------------------------------*/
void SystemClock_Config(void);
static void MX_GPIO_Init(void);
static void MX_I2C1_Init(void);
static void MX_USART2_UART_Init(void);
static void MX_TIM2_Init(void);
static void MX_TIM1_Init(void);
static void MX_TIM16_Init(void);
static void MX_USART1_UART_Init(void);
void StartDefaultTask(void *argument);
void StartSensorTask(void *argument);
void StartFeedbackTask(void *argument);
void StartButtonTask(void *argument);
void StartDebugTask(void *argument);
void StartCommsTask(void *argument);

/* USER CODE BEGIN PFP */
static void uart_say(const char *s, int n);
static void i2c_bus_recover(void);
static int sensor_bringup(int i);
static void sensor_bringup_all(void);
static uint16_t read_one(int i);
static uint16_t filter_push(int i, uint16_t raw);
static void apply_bucket(int i, uint16_t dist);
static void silence_all(void);
static void publish_telemetry(const DistanceMsg_t *msg);
static AlertZone_t dist_to_zone(uint16_t dist);
/* USER CODE END PFP */

/* Private user code ---------------------------------------------------------*/
/* USER CODE BEGIN 0 */
static void uart_say(const char *s, int n)
{
  HAL_UART_Transmit(&huart2, (const uint8_t *)s, n, HAL_MAX_DELAY);
}

static void i2c_bus_recover(void)
{
  HAL_I2C_DeInit(&hi2c1);
  HAL_Delay(2);
  MX_I2C1_Init();
  bus_recover_count++;
}

static int sensor_bringup(int i)
{
  char m[40];
  int n;
  int8_t rc;

  HAL_GPIO_WritePin(ch[i].xshut_port, ch[i].xshut_pin, GPIO_PIN_SET);
  HAL_Delay(2);
  ch[i].dev.I2cDevAddr = 0x52;

  uint8_t booted = 0;
  uint32_t boot_start = HAL_GetTick();
  while (!booted)
  {
    rc = VL53L1X_BootState(ch[i].dev, &booted);
    if (rc != 0)
    {
      n = snprintf(m, sizeof(m), "S%d boot rc=%d ec=0x%lX\r\n",
                   i, rc, (unsigned long)hi2c1.ErrorCode);
      uart_say(m, n);
      return 1;
    }
    if (HAL_GetTick() - boot_start > 100)
    {
      n = snprintf(m, sizeof(m), "S%d boot timeout\r\n", i);
      uart_say(m, n);
      return 2;
    }
    HAL_Delay(2);
  }

  rc = VL53L1X_SetI2CAddress(ch[i].dev, SENSOR_ADDRS[i]);
  if (rc)
  {
    n = snprintf(m, sizeof(m), "S%d setaddr rc=%d\r\n", i, rc);
    uart_say(m, n);
    return 3;
  }
  ch[i].dev.I2cDevAddr = SENSOR_ADDRS[i];

  rc = VL53L1X_SensorInit(ch[i].dev);
  if (rc)
  {
    n = snprintf(m, sizeof(m), "S%d sensorinit rc=%d\r\n", i, rc);
    uart_say(m, n);
    return 4;
  }

  rc = VL53L1X_SetDistanceMode(ch[i].dev, 1);
  if (rc)
  {
    n = snprintf(m, sizeof(m), "S%d distmode rc=%d\r\n", i, rc);
    uart_say(m, n);
    return 5;
  }

  rc = VL53L1X_SetTimingBudgetInMs(ch[i].dev, 50);
  if (rc)
  {
    n = snprintf(m, sizeof(m), "S%d tb rc=%d\r\n", i, rc);
    uart_say(m, n);
    return 6;
  }

  rc = VL53L1X_SetInterMeasurementInMs(ch[i].dev, 50);
  if (rc)
  {
    n = snprintf(m, sizeof(m), "S%d imp rc=%d\r\n", i, rc);
    uart_say(m, n);
    return 7;
  }

  rc = VL53L1X_StartRanging(ch[i].dev);
  if (rc)
  {
    n = snprintf(m, sizeof(m), "S%d start rc=%d\r\n", i, rc);
    uart_say(m, n);
    return 8;
  }

  uint32_t check_start = HAL_GetTick();
  uint8_t ready = 0;
  while (HAL_GetTick() - check_start < 200)
  {
    rc = VL53L1X_CheckForDataReady(ch[i].dev, &ready);
    if (rc == 0 && ready)
      break;
    HAL_Delay(5);
  }
  if (!ready)
  {
    n = snprintf(m, sizeof(m), "S%d no data after init\r\n", i);
    uart_say(m, n);
    return 9;
  }
  VL53L1X_ClearInterrupt(ch[i].dev);

  n = snprintf(m, sizeof(m), "S%d ok @ 0x%02X\r\n", i, SENSOR_ADDRS[i]);
  uart_say(m, n);
  return 0;
}

static void sensor_bringup_all(void)
{
  for (int i = 0; i < N_CH; i++)
    HAL_GPIO_WritePin(ch[i].xshut_port, ch[i].xshut_pin, GPIO_PIN_RESET);
  HAL_Delay(10);

  for (int i = 0; i < N_CH; i++)
  {
    int attempts = 0;
    while (sensor_bringup(i) != 0)
    {
      if (++attempts >= 3)
      {
        char m[24];
        int n = snprintf(m, sizeof(m), "S%d FAIL\r\n", i);
        uart_say(m, n);
        break;
      }
      i2c_bus_recover();
      HAL_GPIO_WritePin(ch[i].xshut_port, ch[i].xshut_pin, GPIO_PIN_RESET);
      HAL_Delay(5);
    }
  }
}

static uint16_t read_one(int i)
{
  uint8_t ready = 0;
  int8_t rc = VL53L1X_CheckForDataReady(ch[i].dev, &ready);
  if (rc != 0)
  {
    err_count[i]++;
    i2c_bus_recover();
    return ch[i].last_dist;
  }
  if (!ready)
    return ch[i].last_dist;

  uint16_t dist = 0;
  rc = VL53L1X_GetDistance(ch[i].dev, &dist);
  if (rc != 0)
  {
    err_count[i]++;
    i2c_bus_recover();
    return ch[i].last_dist;
  }
  VL53L1X_ClearInterrupt(ch[i].dev);
  ch[i].last_dist = dist;
  return dist;
}

static uint16_t filter_push(int i, uint16_t raw)
{
  median_filter_t *f = &mf[i];
  f->buf[f->idx] = raw;
  f->idx = (uint8_t)((f->idx + 1u) % FILTER_N);
  if (f->count < FILTER_N)
    f->count++;

  uint16_t sorted[FILTER_N];
  for (uint8_t k = 0; k < f->count; k++)
    sorted[k] = f->buf[k];
  for (uint8_t k = 1; k < f->count; k++)
  {
    uint16_t v = sorted[k];
    int j = (int)k - 1;
    while (j >= 0 && sorted[j] > v)
    {
      sorted[j + 1] = sorted[j];
      j--;
    }
    sorted[j + 1] = v;
  }
  return sorted[f->count / 2u];
}

static void apply_bucket(int i, uint16_t dist)
{
  TIM_HandleTypeDef *t = ch[i].htim;
  uint32_t chx = ch[i].tim_channel;

  if (dist == 0 || dist > 2000)
  {
    __HAL_TIM_SET_COMPARE(t, chx, 0);
  }
  else if (dist < 200)
  {
    __HAL_TIM_SET_COMPARE(t, chx, PWM_FULL_ON);
  }
  else if (dist <= 500)
  {
    __HAL_TIM_SET_PRESCALER(t, PSC_6HZ);
    __HAL_TIM_SET_COMPARE(t, chx, PWM_HALF_DUTY);
  }
  else if (dist <= 1000)
  {
    __HAL_TIM_SET_PRESCALER(t, PSC_3HZ);
    __HAL_TIM_SET_COMPARE(t, chx, PWM_HALF_DUTY);
  }
  else
  {
    __HAL_TIM_SET_PRESCALER(t, PSC_1_5HZ);
    __HAL_TIM_SET_COMPARE(t, chx, PWM_HALF_DUTY);
  }
}

static void silence_all(void)
{
  for (int i = 0; i < N_CH; i++)
    __HAL_TIM_SET_COMPARE(ch[i].htim, ch[i].tim_channel, 0);
}

static void publish_telemetry(const DistanceMsg_t *msg)
{
  TelemetrySnapshot_t snap;
  snap.dist = *msg;

  taskENTER_CRITICAL();
  snap.motor_enabled = motor_enabled;
  for (int i = 0; i < N_CH; i++)
    snap.err_count[i] = err_count[i];
  snap.bus_recover_count = bus_recover_count;
  taskEXIT_CRITICAL();

  xQueueSendToBack((QueueHandle_t)telemetryQueueHandle, &snap, 0);
}

static AlertZone_t dist_to_zone(uint16_t dist)
{
  if (dist == 0 || dist > 2000)
    return ALERT_OFF;
  if (dist < 200)
    return ALERT_IMMEDIATE;
  if (dist <= 500)
    return ALERT_CLOSE;
  if (dist <= 1000)
    return ALERT_MEDIUM;
  return ALERT_FAR;
}
/* USER CODE END 0 */

/**
 * @brief  The application entry point.
 * @retval int
 */
int main(void)
{
  /* USER CODE BEGIN 1 */

  /* USER CODE END 1 */

  /* MCU Configuration--------------------------------------------------------*/

  /* Reset of all peripherals, Initializes the Flash interface and the Systick. */
  HAL_Init();

  /* USER CODE BEGIN Init */

  /* USER CODE END Init */

  /* Configure the system clock */
  SystemClock_Config();

  /* USER CODE BEGIN SysInit */

  /* USER CODE END SysInit */

  /* Initialize all configured peripherals */
  MX_GPIO_Init();
  MX_I2C1_Init();
  MX_USART2_UART_Init();
  MX_TIM2_Init();
  MX_TIM1_Init();
  MX_TIM16_Init();
  MX_USART1_UART_Init();
  /* USER CODE BEGIN 2 */
  sensor_bringup_all();
  HAL_TIM_PWM_Start(&htim2, TIM_CHANNEL_1);
  HAL_TIM_PWM_Start(&htim1, TIM_CHANNEL_1);
  HAL_TIM_PWM_Start(&htim16, TIM_CHANNEL_1);
  /* USER CODE END 2 */

  /* Init scheduler */
  osKernelInitialize();

  /* USER CODE BEGIN RTOS_MUTEX */
  /* add mutexes, ... */
  /* USER CODE END RTOS_MUTEX */

  /* Create the semaphores(s) */
  /* creation of BinSemMode */
  BinSemModeHandle = osSemaphoreNew(1, 1, &BinSemMode_attributes);

  /* USER CODE BEGIN RTOS_SEMAPHORES */
  /* add semaphores, ... */
  /* USER CODE END RTOS_SEMAPHORES */

  /* USER CODE BEGIN RTOS_TIMERS */
  /* start timers, add new ones, ... */
  /* USER CODE END RTOS_TIMERS */

  /* USER CODE BEGIN RTOS_QUEUES */
  /* add queues, ... */
  distanceQueueHandle = osMessageQueueNew(2, sizeof(DistanceMsg_t), NULL);
  telemetryQueueHandle = osMessageQueueNew(1, sizeof(TelemetrySnapshot_t), NULL);
  alertQueueHandle = osMessageQueueNew(4, sizeof(AlertMsg_t), NULL);
  /* USER CODE END RTOS_QUEUES */

  /* Create the thread(s) */
  /* creation of defaultTask */
  defaultTaskHandle = osThreadNew(StartDefaultTask, NULL, &defaultTask_attributes);

  /* creation of Sensor */
  SensorHandle = osThreadNew(StartSensorTask, NULL, &Sensor_attributes);

  /* creation of Feedback */
  FeedbackHandle = osThreadNew(StartFeedbackTask, NULL, &Feedback_attributes);

  /* creation of Button */
  ButtonHandle = osThreadNew(StartButtonTask, NULL, &Button_attributes);

  /* creation of Debug */
  DebugHandle = osThreadNew(StartDebugTask, NULL, &Debug_attributes);

  /* creation of Comms */
  CommsHandle = osThreadNew(StartCommsTask, NULL, &Comms_attributes);

  /* USER CODE BEGIN RTOS_THREADS */
  /* add threads, ... */
  /* USER CODE END RTOS_THREADS */

  /* USER CODE BEGIN RTOS_EVENTS */
  /* add events, ... */
  /* USER CODE END RTOS_EVENTS */

  /* Start scheduler */
  osKernelStart();
  /* We should never get here as control is now taken by the scheduler */
  /* Infinite loop */
  /* USER CODE BEGIN WHILE */
  while (1)
  {
    /* USER CODE END WHILE */

    /* USER CODE BEGIN 3 */
  }
  /* USER CODE END 3 */
}

/**
 * @brief System Clock Configuration
 * @retval None
 */
void SystemClock_Config(void)
{
  RCC_OscInitTypeDef RCC_OscInitStruct = {0};
  RCC_ClkInitTypeDef RCC_ClkInitStruct = {0};

  /** Configure the main internal regulator output voltage
   */
  if (HAL_PWREx_ControlVoltageScaling(PWR_REGULATOR_VOLTAGE_SCALE1) != HAL_OK)
  {
    Error_Handler();
  }

  /** Configure LSE Drive Capability
   */
  HAL_PWR_EnableBkUpAccess();
  __HAL_RCC_LSEDRIVE_CONFIG(RCC_LSEDRIVE_LOW);

  /** Initializes the RCC Oscillators according to the specified parameters
   * in the RCC_OscInitTypeDef structure.
   */
  RCC_OscInitStruct.OscillatorType = RCC_OSCILLATORTYPE_LSE | RCC_OSCILLATORTYPE_MSI;
  RCC_OscInitStruct.LSEState = RCC_LSE_ON;
  RCC_OscInitStruct.MSIState = RCC_MSI_ON;
  RCC_OscInitStruct.MSICalibrationValue = 0;
  RCC_OscInitStruct.MSIClockRange = RCC_MSIRANGE_6;
  RCC_OscInitStruct.PLL.PLLState = RCC_PLL_ON;
  RCC_OscInitStruct.PLL.PLLSource = RCC_PLLSOURCE_MSI;
  RCC_OscInitStruct.PLL.PLLM = 1;
  RCC_OscInitStruct.PLL.PLLN = 40;
  RCC_OscInitStruct.PLL.PLLP = RCC_PLLP_DIV7;
  RCC_OscInitStruct.PLL.PLLQ = RCC_PLLQ_DIV2;
  RCC_OscInitStruct.PLL.PLLR = RCC_PLLR_DIV2;
  if (HAL_RCC_OscConfig(&RCC_OscInitStruct) != HAL_OK)
  {
    Error_Handler();
  }

  /** Initializes the CPU, AHB and APB buses clocks
   */
  RCC_ClkInitStruct.ClockType = RCC_CLOCKTYPE_HCLK | RCC_CLOCKTYPE_SYSCLK | RCC_CLOCKTYPE_PCLK1 | RCC_CLOCKTYPE_PCLK2;
  RCC_ClkInitStruct.SYSCLKSource = RCC_SYSCLKSOURCE_PLLCLK;
  RCC_ClkInitStruct.AHBCLKDivider = RCC_SYSCLK_DIV1;
  RCC_ClkInitStruct.APB1CLKDivider = RCC_HCLK_DIV1;
  RCC_ClkInitStruct.APB2CLKDivider = RCC_HCLK_DIV1;

  if (HAL_RCC_ClockConfig(&RCC_ClkInitStruct, FLASH_LATENCY_4) != HAL_OK)
  {
    Error_Handler();
  }

  /** Enable MSI Auto calibration
   */
  HAL_RCCEx_EnableMSIPLLMode();
}

/**
 * @brief I2C1 Initialization Function
 * @param None
 * @retval None
 */
static void MX_I2C1_Init(void)
{

  /* USER CODE BEGIN I2C1_Init 0 */

  /* USER CODE END I2C1_Init 0 */

  /* USER CODE BEGIN I2C1_Init 1 */

  /* USER CODE END I2C1_Init 1 */
  hi2c1.Instance = I2C1;
  hi2c1.Init.Timing = 0x00702991;
  hi2c1.Init.OwnAddress1 = 0;
  hi2c1.Init.AddressingMode = I2C_ADDRESSINGMODE_7BIT;
  hi2c1.Init.DualAddressMode = I2C_DUALADDRESS_DISABLE;
  hi2c1.Init.OwnAddress2 = 0;
  hi2c1.Init.OwnAddress2Masks = I2C_OA2_NOMASK;
  hi2c1.Init.GeneralCallMode = I2C_GENERALCALL_DISABLE;
  hi2c1.Init.NoStretchMode = I2C_NOSTRETCH_DISABLE;
  if (HAL_I2C_Init(&hi2c1) != HAL_OK)
  {
    Error_Handler();
  }

  /** Configure Analogue filter
   */
  if (HAL_I2CEx_ConfigAnalogFilter(&hi2c1, I2C_ANALOGFILTER_ENABLE) != HAL_OK)
  {
    Error_Handler();
  }

  /** Configure Digital filter
   */
  if (HAL_I2CEx_ConfigDigitalFilter(&hi2c1, 0) != HAL_OK)
  {
    Error_Handler();
  }
  /* USER CODE BEGIN I2C1_Init 2 */

  /* USER CODE END I2C1_Init 2 */
}

/**
 * @brief TIM1 Initialization Function
 * @param None
 * @retval None
 */
static void MX_TIM1_Init(void)
{

  /* USER CODE BEGIN TIM1_Init 0 */

  /* USER CODE END TIM1_Init 0 */

  TIM_ClockConfigTypeDef sClockSourceConfig = {0};
  TIM_MasterConfigTypeDef sMasterConfig = {0};
  TIM_OC_InitTypeDef sConfigOC = {0};
  TIM_BreakDeadTimeConfigTypeDef sBreakDeadTimeConfig = {0};

  /* USER CODE BEGIN TIM1_Init 1 */

  /* USER CODE END TIM1_Init 1 */
  htim1.Instance = TIM1;
  htim1.Init.Prescaler = 15999;
  htim1.Init.CounterMode = TIM_COUNTERMODE_UP;
  htim1.Init.Period = 999;
  htim1.Init.ClockDivision = TIM_CLOCKDIVISION_DIV1;
  htim1.Init.RepetitionCounter = 0;
  htim1.Init.AutoReloadPreload = TIM_AUTORELOAD_PRELOAD_ENABLE;
  if (HAL_TIM_Base_Init(&htim1) != HAL_OK)
  {
    Error_Handler();
  }
  sClockSourceConfig.ClockSource = TIM_CLOCKSOURCE_INTERNAL;
  if (HAL_TIM_ConfigClockSource(&htim1, &sClockSourceConfig) != HAL_OK)
  {
    Error_Handler();
  }
  if (HAL_TIM_PWM_Init(&htim1) != HAL_OK)
  {
    Error_Handler();
  }
  sMasterConfig.MasterOutputTrigger = TIM_TRGO_RESET;
  sMasterConfig.MasterOutputTrigger2 = TIM_TRGO2_RESET;
  sMasterConfig.MasterSlaveMode = TIM_MASTERSLAVEMODE_DISABLE;
  if (HAL_TIMEx_MasterConfigSynchronization(&htim1, &sMasterConfig) != HAL_OK)
  {
    Error_Handler();
  }
  sConfigOC.OCMode = TIM_OCMODE_PWM1;
  sConfigOC.Pulse = 0;
  sConfigOC.OCPolarity = TIM_OCPOLARITY_HIGH;
  sConfigOC.OCNPolarity = TIM_OCNPOLARITY_HIGH;
  sConfigOC.OCFastMode = TIM_OCFAST_DISABLE;
  sConfigOC.OCIdleState = TIM_OCIDLESTATE_RESET;
  sConfigOC.OCNIdleState = TIM_OCNIDLESTATE_RESET;
  if (HAL_TIM_PWM_ConfigChannel(&htim1, &sConfigOC, TIM_CHANNEL_1) != HAL_OK)
  {
    Error_Handler();
  }
  sBreakDeadTimeConfig.OffStateRunMode = TIM_OSSR_DISABLE;
  sBreakDeadTimeConfig.OffStateIDLEMode = TIM_OSSI_DISABLE;
  sBreakDeadTimeConfig.LockLevel = TIM_LOCKLEVEL_OFF;
  sBreakDeadTimeConfig.DeadTime = 0;
  sBreakDeadTimeConfig.BreakState = TIM_BREAK_DISABLE;
  sBreakDeadTimeConfig.BreakPolarity = TIM_BREAKPOLARITY_HIGH;
  sBreakDeadTimeConfig.BreakFilter = 0;
  sBreakDeadTimeConfig.Break2State = TIM_BREAK2_DISABLE;
  sBreakDeadTimeConfig.Break2Polarity = TIM_BREAK2POLARITY_HIGH;
  sBreakDeadTimeConfig.Break2Filter = 0;
  sBreakDeadTimeConfig.AutomaticOutput = TIM_AUTOMATICOUTPUT_DISABLE;
  if (HAL_TIMEx_ConfigBreakDeadTime(&htim1, &sBreakDeadTimeConfig) != HAL_OK)
  {
    Error_Handler();
  }
  /* USER CODE BEGIN TIM1_Init 2 */

  /* USER CODE END TIM1_Init 2 */
  HAL_TIM_MspPostInit(&htim1);
}

/**
 * @brief TIM2 Initialization Function
 * @param None
 * @retval None
 */
static void MX_TIM2_Init(void)
{

  /* USER CODE BEGIN TIM2_Init 0 */

  /* USER CODE END TIM2_Init 0 */

  TIM_ClockConfigTypeDef sClockSourceConfig = {0};
  TIM_MasterConfigTypeDef sMasterConfig = {0};
  TIM_OC_InitTypeDef sConfigOC = {0};

  /* USER CODE BEGIN TIM2_Init 1 */

  /* USER CODE END TIM2_Init 1 */
  htim2.Instance = TIM2;
  htim2.Init.Prescaler = 15999;
  htim2.Init.CounterMode = TIM_COUNTERMODE_UP;
  htim2.Init.Period = 999;
  htim2.Init.ClockDivision = TIM_CLOCKDIVISION_DIV1;
  htim2.Init.AutoReloadPreload = TIM_AUTORELOAD_PRELOAD_ENABLE;
  if (HAL_TIM_Base_Init(&htim2) != HAL_OK)
  {
    Error_Handler();
  }
  sClockSourceConfig.ClockSource = TIM_CLOCKSOURCE_INTERNAL;
  if (HAL_TIM_ConfigClockSource(&htim2, &sClockSourceConfig) != HAL_OK)
  {
    Error_Handler();
  }
  if (HAL_TIM_PWM_Init(&htim2) != HAL_OK)
  {
    Error_Handler();
  }
  sMasterConfig.MasterOutputTrigger = TIM_TRGO_RESET;
  sMasterConfig.MasterSlaveMode = TIM_MASTERSLAVEMODE_DISABLE;
  if (HAL_TIMEx_MasterConfigSynchronization(&htim2, &sMasterConfig) != HAL_OK)
  {
    Error_Handler();
  }
  sConfigOC.OCMode = TIM_OCMODE_PWM1;
  sConfigOC.Pulse = 0;
  sConfigOC.OCPolarity = TIM_OCPOLARITY_HIGH;
  sConfigOC.OCFastMode = TIM_OCFAST_DISABLE;
  if (HAL_TIM_PWM_ConfigChannel(&htim2, &sConfigOC, TIM_CHANNEL_1) != HAL_OK)
  {
    Error_Handler();
  }
  /* USER CODE BEGIN TIM2_Init 2 */

  /* USER CODE END TIM2_Init 2 */
  HAL_TIM_MspPostInit(&htim2);
}

/**
 * @brief TIM16 Initialization Function
 * @param None
 * @retval None
 */
static void MX_TIM16_Init(void)
{

  /* USER CODE BEGIN TIM16_Init 0 */

  /* USER CODE END TIM16_Init 0 */

  TIM_OC_InitTypeDef sConfigOC = {0};
  TIM_BreakDeadTimeConfigTypeDef sBreakDeadTimeConfig = {0};

  /* USER CODE BEGIN TIM16_Init 1 */

  /* USER CODE END TIM16_Init 1 */
  htim16.Instance = TIM16;
  htim16.Init.Prescaler = 15999;
  htim16.Init.CounterMode = TIM_COUNTERMODE_UP;
  htim16.Init.Period = 999;
  htim16.Init.ClockDivision = TIM_CLOCKDIVISION_DIV1;
  htim16.Init.RepetitionCounter = 0;
  htim16.Init.AutoReloadPreload = TIM_AUTORELOAD_PRELOAD_ENABLE;
  if (HAL_TIM_Base_Init(&htim16) != HAL_OK)
  {
    Error_Handler();
  }
  if (HAL_TIM_PWM_Init(&htim16) != HAL_OK)
  {
    Error_Handler();
  }
  sConfigOC.OCMode = TIM_OCMODE_PWM1;
  sConfigOC.Pulse = 0;
  sConfigOC.OCPolarity = TIM_OCPOLARITY_HIGH;
  sConfigOC.OCNPolarity = TIM_OCNPOLARITY_HIGH;
  sConfigOC.OCFastMode = TIM_OCFAST_DISABLE;
  sConfigOC.OCIdleState = TIM_OCIDLESTATE_RESET;
  sConfigOC.OCNIdleState = TIM_OCNIDLESTATE_RESET;
  if (HAL_TIM_PWM_ConfigChannel(&htim16, &sConfigOC, TIM_CHANNEL_1) != HAL_OK)
  {
    Error_Handler();
  }
  sBreakDeadTimeConfig.OffStateRunMode = TIM_OSSR_DISABLE;
  sBreakDeadTimeConfig.OffStateIDLEMode = TIM_OSSI_DISABLE;
  sBreakDeadTimeConfig.LockLevel = TIM_LOCKLEVEL_OFF;
  sBreakDeadTimeConfig.DeadTime = 0;
  sBreakDeadTimeConfig.BreakState = TIM_BREAK_DISABLE;
  sBreakDeadTimeConfig.BreakPolarity = TIM_BREAKPOLARITY_HIGH;
  sBreakDeadTimeConfig.AutomaticOutput = TIM_AUTOMATICOUTPUT_DISABLE;
  if (HAL_TIMEx_ConfigBreakDeadTime(&htim16, &sBreakDeadTimeConfig) != HAL_OK)
  {
    Error_Handler();
  }
  /* USER CODE BEGIN TIM16_Init 2 */

  /* USER CODE END TIM16_Init 2 */
  HAL_TIM_MspPostInit(&htim16);
}

/**
 * @brief USART1 Initialization Function
 * @param None
 * @retval None
 */
static void MX_USART1_UART_Init(void)
{

  /* USER CODE BEGIN USART1_Init 0 */

  /* USER CODE END USART1_Init 0 */

  /* USER CODE BEGIN USART1_Init 1 */

  /* USER CODE END USART1_Init 1 */
  huart1.Instance = USART1;
  huart1.Init.BaudRate = 9600;
  huart1.Init.WordLength = UART_WORDLENGTH_8B;
  huart1.Init.StopBits = UART_STOPBITS_1;
  huart1.Init.Parity = UART_PARITY_NONE;
  huart1.Init.Mode = UART_MODE_TX_RX;
  huart1.Init.HwFlowCtl = UART_HWCONTROL_NONE;
  huart1.Init.OverSampling = UART_OVERSAMPLING_16;
  huart1.Init.OneBitSampling = UART_ONE_BIT_SAMPLE_DISABLE;
  huart1.AdvancedInit.AdvFeatureInit = UART_ADVFEATURE_NO_INIT;
  if (HAL_UART_Init(&huart1) != HAL_OK)
  {
    Error_Handler();
  }
  /* USER CODE BEGIN USART1_Init 2 */

  /* USER CODE END USART1_Init 2 */
}

/**
 * @brief USART2 Initialization Function
 * @param None
 * @retval None
 */
static void MX_USART2_UART_Init(void)
{

  /* USER CODE BEGIN USART2_Init 0 */

  /* USER CODE END USART2_Init 0 */

  /* USER CODE BEGIN USART2_Init 1 */

  /* USER CODE END USART2_Init 1 */
  huart2.Instance = USART2;
  huart2.Init.BaudRate = 115200;
  huart2.Init.WordLength = UART_WORDLENGTH_8B;
  huart2.Init.StopBits = UART_STOPBITS_1;
  huart2.Init.Parity = UART_PARITY_NONE;
  huart2.Init.Mode = UART_MODE_TX_RX;
  huart2.Init.HwFlowCtl = UART_HWCONTROL_NONE;
  huart2.Init.OverSampling = UART_OVERSAMPLING_16;
  huart2.Init.OneBitSampling = UART_ONE_BIT_SAMPLE_DISABLE;
  huart2.AdvancedInit.AdvFeatureInit = UART_ADVFEATURE_NO_INIT;
  if (HAL_UART_Init(&huart2) != HAL_OK)
  {
    Error_Handler();
  }
  /* USER CODE BEGIN USART2_Init 2 */

  /* USER CODE END USART2_Init 2 */
}

/**
 * @brief GPIO Initialization Function
 * @param None
 * @retval None
 */
static void MX_GPIO_Init(void)
{
  GPIO_InitTypeDef GPIO_InitStruct = {0};
  /* USER CODE BEGIN MX_GPIO_Init_1 */
  /* USER CODE END MX_GPIO_Init_1 */

  /* GPIO Ports Clock Enable */
  __HAL_RCC_GPIOC_CLK_ENABLE();
  __HAL_RCC_GPIOA_CLK_ENABLE();
  __HAL_RCC_GPIOB_CLK_ENABLE();

  /*Configure GPIO pin Output Level */
  HAL_GPIO_WritePin(GPIOA, XSHUT_L_Pin | XSHUT_F_Pin, GPIO_PIN_RESET);

  /*Configure GPIO pin Output Level */
  HAL_GPIO_WritePin(GPIOB, LD3_Pin | XSHUT_R_Pin, GPIO_PIN_RESET);

  /*Configure GPIO pin : MODE_BTN_Pin */
  GPIO_InitStruct.Pin = MODE_BTN_Pin;
  GPIO_InitStruct.Mode = GPIO_MODE_IT_FALLING;
  GPIO_InitStruct.Pull = GPIO_PULLUP;
  HAL_GPIO_Init(MODE_BTN_GPIO_Port, &GPIO_InitStruct);

  /*Configure GPIO pins : XSHUT_L_Pin XSHUT_F_Pin */
  GPIO_InitStruct.Pin = XSHUT_L_Pin | XSHUT_F_Pin;
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;
  HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);

  /*Configure GPIO pins : LD3_Pin XSHUT_R_Pin */
  GPIO_InitStruct.Pin = LD3_Pin | XSHUT_R_Pin;
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;
  HAL_GPIO_Init(GPIOB, &GPIO_InitStruct);

  /* EXTI interrupt init*/
  HAL_NVIC_SetPriority(EXTI0_IRQn, 5, 0);
  HAL_NVIC_EnableIRQ(EXTI0_IRQn);

  /* USER CODE BEGIN MX_GPIO_Init_2 */
  /* USER CODE END MX_GPIO_Init_2 */
}

/* USER CODE BEGIN 4 */
void HAL_GPIO_EXTI_Callback(uint16_t GPIO_Pin)
{
  if (GPIO_Pin == MODE_BTN_Pin)
  {
    BaseType_t xHigherPriorityTaskWoken = pdFALSE;
    xSemaphoreGiveFromISR((SemaphoreHandle_t)BinSemModeHandle,
                          &xHigherPriorityTaskWoken);
    portYIELD_FROM_ISR(xHigherPriorityTaskWoken);
  }
}
/* USER CODE END 4 */

/* USER CODE BEGIN Header_StartDefaultTask */
/**
 * @brief  Function implementing the defaultTask thread.
 * @param  argument: Not used
 * @retval None
 */
/* USER CODE END Header_StartDefaultTask */
void StartDefaultTask(void *argument)
{
  /* USER CODE BEGIN 5 */
  /* Infinite loop */
  for (;;)
  {
    osDelay(1);
  }
  /* USER CODE END 5 */
}

/* USER CODE BEGIN Header_StartSensorTask */
/**
 * @brief Function implementing the Sensor thread.
 * @param argument: Not used
 * @retval None
 */
/* USER CODE END Header_StartSensorTask */
void StartSensorTask(void *argument)
{
  /* USER CODE BEGIN StartSensorTask */
  DistanceMsg_t msg;
  /* Infinite loop */
  for (;;)
  {
    msg.t_ms = HAL_GetTick();
    msg.d_fwd = filter_push(IDX_FWD, read_one(IDX_FWD));
    msg.d_left = filter_push(IDX_LEFT, read_one(IDX_LEFT));
    msg.d_right = filter_push(IDX_RIGHT, read_one(IDX_RIGHT));

    xQueueSendToBack((QueueHandle_t)distanceQueueHandle, &msg, 0);
    osDelay(33);
  }
  /* USER CODE END StartSensorTask */
}

/* USER CODE BEGIN Header_StartFeedbackTask */
/**
 * @brief Function implementing the Feedback thread.
 * @param argument: Not used
 * @retval None
 */
/* USER CODE END Header_StartFeedbackTask */
void StartFeedbackTask(void *argument)
{
  /* USER CODE BEGIN StartFeedbackTask */
  DistanceMsg_t msg = {0};
  int print_tick = 0;
  static AlertZone_t last_zone[N_CH] = {ALERT_OFF, ALERT_OFF, ALERT_OFF};
  /* Infinite loop */
  for (;;)
  {
    xQueueReceive((QueueHandle_t)distanceQueueHandle,
                  &msg, pdMS_TO_TICKS(20));

    uint8_t enabled;
    taskENTER_CRITICAL();
    enabled = motor_enabled;
    taskEXIT_CRITICAL();

    if (!enabled)
    {
      silence_all();
    }
    else
    {
      apply_bucket(IDX_FWD, msg.d_fwd);
      apply_bucket(IDX_LEFT, msg.d_left);
      apply_bucket(IDX_RIGHT, msg.d_right);
    }

    /* Detect zone transitions, push to comms queue */
    const uint16_t d[N_CH] = {msg.d_fwd, msg.d_left, msg.d_right};
    for (int i = 0; i < N_CH; i++)
    {
      AlertZone_t z = dist_to_zone(d[i]);
      if (z != last_zone[i])
      {
        AlertMsg_t a = {.dir = (uint8_t)i, .zone = z, .dist_mm = d[i]};
        xQueueSendToBack((QueueHandle_t)alertQueueHandle, &a, 0);
        last_zone[i] = z;
      }
    }

    if (++print_tick >= 3)
    {
      print_tick = 0;
      publish_telemetry(&msg);
    }
    osDelay(1);
  }
  /* USER CODE END StartFeedbackTask */
}

/* USER CODE BEGIN Header_StartButtonTask */
/**
 * @brief Function implementing the Button thread.
 * @param argument: Not used
 * @retval None
 */
/* USER CODE END Header_StartButtonTask */
void StartButtonTask(void *argument)
{
  /* USER CODE BEGIN StartButtonTask */
  /* Infinite loop */
  for (;;)
  {
    if (xSemaphoreTake((SemaphoreHandle_t)BinSemModeHandle,
                       portMAX_DELAY) == pdTRUE)
    {
      osDelay(20);
      if (HAL_GPIO_ReadPin(MODE_BTN_GPIO_Port, MODE_BTN_Pin) == GPIO_PIN_RESET)
      {
        taskENTER_CRITICAL();
        motor_enabled = !motor_enabled;
        taskEXIT_CRITICAL();
      }
    }
    osDelay(1);
  }
  /* USER CODE END StartButtonTask */
}

/* USER CODE BEGIN Header_StartDebugTask */
/**
 * @brief Function implementing the Debug thread.
 * @param argument: Not used
 * @retval None
 */
/* USER CODE END Header_StartDebugTask */
void StartDebugTask(void *argument)
{
  /* USER CODE BEGIN StartDebugTask */
  TelemetrySnapshot_t snap;
  char buf[96];
  /* Infinite loop */
  for (;;)
  {
    if (xQueueReceive((QueueHandle_t)telemetryQueueHandle,
                      &snap, portMAX_DELAY) == pdPASS)
    {
      int n = snprintf(buf, sizeof(buf),
                       "F=%4u L=%4u R=%4u m=%s e=%lu/%lu/%lu r=%lu\r\n",
                       snap.dist.d_fwd, snap.dist.d_left, snap.dist.d_right,
                       snap.motor_enabled ? "on" : "off",
                       (unsigned long)snap.err_count[0],
                       (unsigned long)snap.err_count[1],
                       (unsigned long)snap.err_count[2],
                       (unsigned long)snap.bus_recover_count);
      HAL_UART_Transmit(&huart2, (uint8_t *)buf, n, HAL_MAX_DELAY);
      HAL_GPIO_TogglePin(LD3_GPIO_Port, LD3_Pin);
    }
    osDelay(1);
  }
  /* USER CODE END StartDebugTask */
}

/* USER CODE BEGIN Header_StartCommsTask */
/**
 * @brief Function implementing the Comms thread.
 * @param argument: Not used
 * @retval None
 */
/* USER CODE END Header_StartCommsTask */
void StartCommsTask(void *argument)
{
  /* USER CODE BEGIN StartCommsTask */
  AlertMsg_t a;
  char buf[32];

  static const char *dir_str[] = {"F", "L", "R"};
  static const char *zone_str[] = {"OFF", "FAR", "MED", "CLOSE", "NEAR"};
  /* Infinite loop */
  for (;;)
  {
    if (xQueueReceive((QueueHandle_t)alertQueueHandle,
                      &a, portMAX_DELAY) == pdPASS)
    {
      int n = snprintf(buf, sizeof(buf), "%s:%s:%u\n",
                       dir_str[a.dir], zone_str[a.zone], a.dist_mm);
      HAL_UART_Transmit(&huart1, (uint8_t *)buf, n, HAL_MAX_DELAY);
    }
    osDelay(1);
  }
  /* USER CODE END StartCommsTask */
}

/**
 * @brief  Period elapsed callback in non blocking mode
 * @note   This function is called  when TIM6 interrupt took place, inside
 * HAL_TIM_IRQHandler(). It makes a direct call to HAL_IncTick() to increment
 * a global variable "uwTick" used as application time base.
 * @param  htim : TIM handle
 * @retval None
 */
void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim)
{
  /* USER CODE BEGIN Callback 0 */

  /* USER CODE END Callback 0 */
  if (htim->Instance == TIM6)
  {
    HAL_IncTick();
  }
  /* USER CODE BEGIN Callback 1 */

  /* USER CODE END Callback 1 */
}

/**
 * @brief  This function is executed in case of error occurrence.
 * @retval None
 */
void Error_Handler(void)
{
  /* USER CODE BEGIN Error_Handler_Debug */
  /* User can add his own implementation to report the HAL error return state */
  __disable_irq();
  while (1)
  {
  }
  /* USER CODE END Error_Handler_Debug */
}

#ifdef USE_FULL_ASSERT
/**
 * @brief  Reports the name of the source file and the source line number
 *         where the assert_param error has occurred.
 * @param  file: pointer to the source file name
 * @param  line: assert_param error line source number
 * @retval None
 */
void assert_failed(uint8_t *file, uint32_t line)
{
  /* USER CODE BEGIN 6 */
  /* User can add his own implementation to report the file name and line number,
     ex: printf("Wrong parameters value: file %s on line %d\r\n", file, line) */
  /* USER CODE END 6 */
}
#endif /* USE_FULL_ASSERT */
