#ifndef VL53L1_PLATFORM_H
#define VL53L1_PLATFORM_H

#include <stdint.h>
#include "stm32l4xx_hal.h"

typedef struct {
    I2C_HandleTypeDef *I2cHandle;
    uint8_t            I2cDevAddr;   /* HAL 8-bit format; default 0x52 = 0x29 << 1 */
} VL53L1_Dev_t;

typedef VL53L1_Dev_t *VL53L1_DEV;

int8_t VL53L1_WrByte (VL53L1_Dev_t *dev, uint16_t index, uint8_t  data);
int8_t VL53L1_WrWord (VL53L1_Dev_t *dev, uint16_t index, uint16_t data);
int8_t VL53L1_WrDWord(VL53L1_Dev_t *dev, uint16_t index, uint32_t data);
int8_t VL53L1_RdByte (VL53L1_Dev_t *dev, uint16_t index, uint8_t  *pdata);
int8_t VL53L1_RdWord (VL53L1_Dev_t *dev, uint16_t index, uint16_t *pdata);
int8_t VL53L1_RdDWord(VL53L1_Dev_t *dev, uint16_t index, uint32_t *pdata);

#endif
