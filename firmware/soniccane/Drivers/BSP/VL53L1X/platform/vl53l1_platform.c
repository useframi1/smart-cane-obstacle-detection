#include "vl53l1_platform.h"

#define VL53L1_I2C_TIMEOUT_MS  100u

static int8_t i2c_write(VL53L1_Dev_t *dev, uint16_t reg, uint8_t *buf, uint16_t len)
{
    return HAL_I2C_Mem_Write(dev->I2cHandle, dev->I2cDevAddr,
                             reg, I2C_MEMADD_SIZE_16BIT,
                             buf, len, VL53L1_I2C_TIMEOUT_MS) == HAL_OK ? 0 : -1;
}

static int8_t i2c_read(VL53L1_Dev_t *dev, uint16_t reg, uint8_t *buf, uint16_t len)
{
    return HAL_I2C_Mem_Read(dev->I2cHandle, dev->I2cDevAddr,
                            reg, I2C_MEMADD_SIZE_16BIT,
                            buf, len, VL53L1_I2C_TIMEOUT_MS) == HAL_OK ? 0 : -1;
}

int8_t VL53L1_WrByte(VL53L1_Dev_t *dev, uint16_t reg, uint8_t data)
{
    return i2c_write(dev, reg, &data, 1);
}

int8_t VL53L1_WrWord(VL53L1_Dev_t *dev, uint16_t reg, uint16_t data)
{
    uint8_t buf[2] = { (uint8_t)(data >> 8), (uint8_t)data };
    return i2c_write(dev, reg, buf, 2);
}

int8_t VL53L1_WrDWord(VL53L1_Dev_t *dev, uint16_t reg, uint32_t data)
{
    uint8_t buf[4] = {
        (uint8_t)(data >> 24), (uint8_t)(data >> 16),
        (uint8_t)(data >>  8), (uint8_t)data
    };
    return i2c_write(dev, reg, buf, 4);
}

int8_t VL53L1_RdByte(VL53L1_Dev_t *dev, uint16_t reg, uint8_t *pdata)
{
    return i2c_read(dev, reg, pdata, 1);
}

int8_t VL53L1_RdWord(VL53L1_Dev_t *dev, uint16_t reg, uint16_t *pdata)
{
    uint8_t buf[2];
    int8_t rc = i2c_read(dev, reg, buf, 2);
    if (rc == 0) *pdata = ((uint16_t)buf[0] << 8) | buf[1];
    return rc;
}

int8_t VL53L1_RdDWord(VL53L1_Dev_t *dev, uint16_t reg, uint32_t *pdata)
{
    uint8_t buf[4];
    int8_t rc = i2c_read(dev, reg, buf, 4);
    if (rc == 0) {
        *pdata = ((uint32_t)buf[0] << 24) | ((uint32_t)buf[1] << 16) |
                 ((uint32_t)buf[2] <<  8) |  (uint32_t)buf[3];
    }
    return rc;
}
