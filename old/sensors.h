#pragma once

#include <stdint.h>

void sensors_init();

int32_t read_humidity_x100();
int32_t read_temperature_x100();
int32_t read_light_lux_x100();