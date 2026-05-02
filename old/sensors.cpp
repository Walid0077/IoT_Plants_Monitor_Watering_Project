#include "sensors.h"

#include <stdio.h>
#include "pico/stdlib.h"
#include "hardware/gpio.h"
#include "hardware/i2c.h"

#define DHT11_PIN 3

#define I2C_PORT i2c0

#define BH1750_ADDRESS 0x23

#define BH1750_POWER_ON              0x01
#define BH1750_RESET                 0x07
#define BH1750_CONT_HIGH_RES_MODE    0x10

struct DHT11Reading {
    bool valid;
    int32_t humidity_x100;
    int32_t temperature_x100;
};

static DHT11Reading last_dht11 = {
    false,
    0,
    0
};

static int32_t last_light_lux_x100 = 0;

// ---------------------------------------------------------
// DHT11 section
// ---------------------------------------------------------

static bool wait_for_level(uint pin, bool level, uint32_t timeout_us) {
    uint32_t start = time_us_32();

    while (gpio_get(pin) != level) {
        if ((time_us_32() - start) > timeout_us) {
            return false;
        }
    }

    return true;
}

static bool dht11_read_raw(uint8_t data[5]) {
    for (int i = 0; i < 5; i++) {
        data[i] = 0;
    }

    gpio_set_dir(DHT11_PIN, GPIO_OUT);
    gpio_put(DHT11_PIN, 0);
    sleep_ms(20);

    gpio_put(DHT11_PIN, 1);
    sleep_us(30);

    gpio_set_dir(DHT11_PIN, GPIO_IN);

    if (!wait_for_level(DHT11_PIN, 0, 100)) {
        return false;
    }

    if (!wait_for_level(DHT11_PIN, 1, 100)) {
        return false;
    }

    if (!wait_for_level(DHT11_PIN, 0, 100)) {
        return false;
    }

    for (int bit_index = 0; bit_index < 40; bit_index++) {
        if (!wait_for_level(DHT11_PIN, 1, 100)) {
            return false;
        }

        uint32_t high_start = time_us_32();

        if (!wait_for_level(DHT11_PIN, 0, 120)) {
            return false;
        }

        uint32_t high_time = time_us_32() - high_start;

        uint8_t bit_value = high_time > 40 ? 1 : 0;

        data[bit_index / 8] <<= 1;
        data[bit_index / 8] |= bit_value;
    }

    uint8_t checksum = data[0] + data[1] + data[2] + data[3];

    return checksum == data[4];
}

static DHT11Reading read_dht11() {
    uint8_t data[5];

    DHT11Reading reading;
    reading.valid = false;
    reading.humidity_x100 = last_dht11.humidity_x100;
    reading.temperature_x100 = last_dht11.temperature_x100;

    if (!dht11_read_raw(data)) {
        printf("DHT11 read error, using last valid value\n");
        return reading;
    }

    reading.humidity_x100 = ((int32_t)data[0] * 100) + data[1];
    reading.temperature_x100 = ((int32_t)data[2] * 100) + data[3];
    reading.valid = true;

    last_dht11 = reading;

    return reading;
}

// ---------------------------------------------------------
// BH1750 section
// ---------------------------------------------------------
/*
static bool bh1750_write_command(uint8_t command) {
    int result = i2c_write_blocking(
        I2C_PORT,
        BH1750_ADDRESS,
        &command,
        1,
        false
    );

    return result == 1;
}



static int32_t bh1750_read_lux_x100() {
    uint8_t buffer[2];

    int result = i2c_read_blocking(
        I2C_PORT,
        BH1750_ADDRESS,
        buffer,
        2,
        false
    );

    if (result != 2) {
        printf("BH1750 read error, using last valid value\n");
        return last_light_lux_x100;
    }

    uint16_t raw = ((uint16_t)buffer[0] << 8) | buffer[1];

    
        // BH1750 conversion:
        // lux = raw / 1.2

        // We store lux × 100:

        // lux_x100 = raw × 100 / 1.2
        //          = raw × 1000 / 12
    

    int32_t lux_x100 = ((int32_t)raw * 1000) / 12;

    last_light_lux_x100 = lux_x100;

    return lux_x100;
}
*/
// ---------------------------------------------------------
// Public sensor API
// ---------------------------------------------------------

void sensors_init() {
    gpio_init(DHT11_PIN);
    gpio_pull_up(DHT11_PIN);
    gpio_set_dir(DHT11_PIN, GPIO_IN);

    sleep_ms(1000);

    bh1750_init();
}

int32_t read_humidity_x100() {
    DHT11Reading reading = read_dht11();

    return reading.humidity_x100;
}

int32_t read_temperature_x100() {
    return last_dht11.temperature_x100;
}

int32_t read_light_lux_x100() {
    return bh1750_read_lux_x100();
}