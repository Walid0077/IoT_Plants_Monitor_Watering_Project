#pragma once

#include <stdint.h>

struct SensorPacket {
    int32_t rh_x100;             // Relative humidity × 100
    int32_t temperature_x100;    // Temperature °C × 100
    int32_t light_lux_x100;      // Light level lux × 100
};