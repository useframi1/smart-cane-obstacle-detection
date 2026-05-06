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
#include "i2c.h"
#include "tim.h"
#include "usart.h"
#include "gpio.h"

/* Private includes ----------------------------------------------------------*/
/* USER CODE BEGIN Includes */
#include <stdio.h>
#include "VL53L1X_api.h"
#include "vl53l1_platform.h"
/* USER CODE END Includes */

/* Private typedef -----------------------------------------------------------*/
/* USER CODE BEGIN PTD */

/* USER CODE END PTD */

/* Private define ------------------------------------------------------------*/
/* USER CODE BEGIN PD */

/* USER CODE END PD */

/* Private macro -------------------------------------------------------------*/
/* USER CODE BEGIN PM */

/* USER CODE END PM */

/* Private variables ---------------------------------------------------------*/

/* USER CODE BEGIN PV */
#define N_CH 3
#define IDX_FWD   0
#define IDX_LEFT  1
#define IDX_RIGHT 2

typedef struct {
    VL53L1_Dev_t   dev;
    GPIO_TypeDef  *xshut_port;
    uint16_t       xshut_pin;
    uint32_t       pwm_channel;       /* TIM_CHANNEL_x on htim2 */
    uint16_t       last_dist;         /* mm; 0 = out of range */
    uint32_t       pulse_period_ms;   /* 0 = motor silent */
    uint32_t       last_flip_ms;
    uint8_t        toggle_state;
} channel_t;

static channel_t ch[N_CH] = {
    [IDX_FWD] = {
        .dev = { .I2cHandle = &hi2c1 },
        .xshut_port = XSHUT_F_GPIO_Port, .xshut_pin = XSHUT_F_Pin,
        .pwm_channel = TIM_CHANNEL_1,
    },
    [IDX_LEFT] = {
        .dev = { .I2cHandle = &hi2c1 },
        .xshut_port = XSHUT_L_GPIO_Port, .xshut_pin = XSHUT_L_Pin,
        .pwm_channel = TIM_CHANNEL_2,
    },
    [IDX_RIGHT] = {
        .dev = { .I2cHandle = &hi2c1 },
        .xshut_port = XSHUT_R_GPIO_Port, .xshut_pin = XSHUT_R_Pin,
        .pwm_channel = TIM_CHANNEL_4,
    },
};

/* Targets must be even (HAL 8-bit format = 7-bit << 1) and unique. */
static const uint8_t SENSOR_ADDRS[N_CH] = { 0x54, 0x56, 0x58 };

static volatile uint8_t motor_enabled = 1;
/* USER CODE END PV */

/* Private function prototypes -----------------------------------------------*/
void SystemClock_Config(void);
/* USER CODE BEGIN PFP */

/* USER CODE END PFP */

/* Private user code ---------------------------------------------------------*/
/* USER CODE BEGIN 0 */

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
  /* USER CODE BEGIN 2 */
	for (int i = 0; i < N_CH; i++) {
			HAL_GPIO_WritePin(ch[i].xshut_port, ch[i].xshut_pin, GPIO_PIN_RESET);
	}
	HAL_Delay(2);

	for (int i = 0; i < N_CH; i++) {
			HAL_GPIO_WritePin(ch[i].xshut_port, ch[i].xshut_pin, GPIO_PIN_SET);
			HAL_Delay(2);

			ch[i].dev.I2cDevAddr = 0x52;

			uint8_t booted = 0;
			uint32_t boot_start = HAL_GetTick();
			while (!booted) {
					VL53L1X_BootState(ch[i].dev, &booted);
					if (HAL_GetTick() - boot_start > 100) {
							char err[24];
							int n = snprintf(err, sizeof(err), "S%d boot fail\r\n", i);
							HAL_UART_Transmit(&huart2, (uint8_t *)err, n, HAL_MAX_DELAY);
							Error_Handler();
					}
					HAL_Delay(2);
			}

			VL53L1X_SetI2CAddress(ch[i].dev, SENSOR_ADDRS[i]);
			ch[i].dev.I2cDevAddr = SENSOR_ADDRS[i];

			VL53L1X_SensorInit(ch[i].dev);
			VL53L1X_SetDistanceMode(ch[i].dev, 1);
			VL53L1X_SetTimingBudgetInMs(ch[i].dev, 50);
			VL53L1X_SetInterMeasurementInMs(ch[i].dev, 50);
			VL53L1X_StartRanging(ch[i].dev);

			char ok[28];
			int n = snprintf(ok, sizeof(ok), "S%d up @ 0x%02X\r\n", i, SENSOR_ADDRS[i]);
			HAL_UART_Transmit(&huart2, (uint8_t *)ok, n, HAL_MAX_DELAY);
	}

	HAL_TIM_PWM_Start(&htim2, TIM_CHANNEL_1);
	HAL_TIM_PWM_Start(&htim2, TIM_CHANNEL_2);
	HAL_TIM_PWM_Start(&htim2, TIM_CHANNEL_4);
  /* USER CODE END 2 */

  /* Infinite loop */
  /* USER CODE BEGIN WHILE */
  while (1)
  {
    /* USER CODE END WHILE */

    /* USER CODE BEGIN 3 */
		if (!motor_enabled) {
				for (int i = 0; i < N_CH; i++) {
						ch[i].pulse_period_ms = 0;
						__HAL_TIM_SET_COMPARE(&htim2, ch[i].pwm_channel, 0);
				}
		} else {
				for (int i = 0; i < N_CH; i++) {
						uint8_t ready = 0;
						int8_t rc = VL53L1X_CheckForDataReady(ch[i].dev, &ready);
						if (rc != 0) {
								char e[20];
								int n = snprintf(e, sizeof(e), "S%d rdy err\r\n", i);
								HAL_UART_Transmit(&huart2, (uint8_t *)e, n, HAL_MAX_DELAY);
								continue;
						}
						if (!ready) continue;

						uint16_t dist = 0;
						int8_t rd  = VL53L1X_GetDistance(ch[i].dev, &dist);
						int8_t rc2 = VL53L1X_ClearInterrupt(ch[i].dev);
						if (rd != 0 || rc2 != 0) {
								char e[28];
								int n = snprintf(e, sizeof(e), "S%d io err %d/%d\r\n", i, rd, rc2);
								HAL_UART_Transmit(&huart2, (uint8_t *)e, n, HAL_MAX_DELAY);
						}
						ch[i].last_dist = dist;

						if (dist == 0 || dist > 2000) {
								ch[i].pulse_period_ms = 0;
								__HAL_TIM_SET_COMPARE(&htim2, ch[i].pwm_channel, 0);
						} else if (dist < 200) {
								ch[i].pulse_period_ms = 0;
								__HAL_TIM_SET_COMPARE(&htim2, ch[i].pwm_channel, 999);
						} else if (dist <= 500) {
								ch[i].pulse_period_ms = 50;
						} else if (dist <= 1000) {
								ch[i].pulse_period_ms = 100;
						} else {
								ch[i].pulse_period_ms = 250;
						}
				}
		}

		uint32_t now = HAL_GetTick();
		for (int i = 0; i < N_CH; i++) {
				if (ch[i].pulse_period_ms > 0 &&
						(now - ch[i].last_flip_ms) >= ch[i].pulse_period_ms) {
						ch[i].toggle_state = !ch[i].toggle_state;
						__HAL_TIM_SET_COMPARE(&htim2, ch[i].pwm_channel,
																	ch[i].toggle_state ? 999 : 0);
						ch[i].last_flip_ms = now;
				}
		}

		static uint32_t last_print = 0;
		if (now - last_print >= 100) {
				last_print = now;
				char buf[64];
				int n = snprintf(buf, sizeof(buf),
						"F=%4u L=%4u R=%4u motor=%s\r\n",
						ch[IDX_FWD].last_dist, ch[IDX_LEFT].last_dist,
						ch[IDX_RIGHT].last_dist, motor_enabled ? "on" : "off");
				HAL_UART_Transmit(&huart2, (uint8_t *)buf, n, HAL_MAX_DELAY);
				HAL_GPIO_TogglePin(LD3_GPIO_Port, LD3_Pin);
		}
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
  RCC_OscInitStruct.OscillatorType = RCC_OSCILLATORTYPE_LSE|RCC_OSCILLATORTYPE_MSI;
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
  RCC_ClkInitStruct.ClockType = RCC_CLOCKTYPE_HCLK|RCC_CLOCKTYPE_SYSCLK
                              |RCC_CLOCKTYPE_PCLK1|RCC_CLOCKTYPE_PCLK2;
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

/* USER CODE BEGIN 4 */
void HAL_GPIO_EXTI_Callback(uint16_t GPIO_Pin)
{
    if (GPIO_Pin == MODE_BTN_Pin) {
        static uint32_t last_press = 0;
        uint32_t now = HAL_GetTick();
        if (HAL_GPIO_ReadPin(MODE_BTN_GPIO_Port, MODE_BTN_Pin) == GPIO_PIN_RESET &&
            now - last_press > 200) {
            motor_enabled = !motor_enabled;
            last_press = now;
        }
    }
}
/* USER CODE END 4 */

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

#ifdef  USE_FULL_ASSERT
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
