#include <stdio.h>
#include "pico/stdlib.h"
#include "hardware/i2c.h"

#include "packet.h"
#include "sensors.h"
#include "actuator.h"
#include <cstdint>

#define I2C_PORT i2c0
#define SDA_PIN 4
#define SCL_PIN 5

#define RPI_SLAVE_ADDRESS 0x17

#define LIGHT_THRESHOLD_LUX_X100 1000  // 10.00 lux


#define BH1750_ADDR 0x23
#define BH1750_POWER_ON 0x01
#define BH1750_RESET 0x07
#define BH1750_CONT_HIGH_RES_MODE 0x10

static void bh1750_init() {
    bh1750_write_command(BH1750_POWER_ON);
    sleep_ms(10);

    bh1750_write_command(BH1750_RESET);
    sleep_ms(10);

    bh1750_write_command(BH1750_CONT_HIGH_RES_MODE);

    // First measurement in high-resolution mode needs about 120 ms.
    sleep_ms(180);
}

bool bh1750_write_cmd(uint8_t cmd) {
    int result = i2c_write_blocking(I2C_PORT, BH1750_ADDR, &cmd, 1, false);
    return result == 1;
}

bool bh1750_read_lux(float *lux) {
    uint8_t data[2];

    int result = i2c_read_blocking(I2C_PORT, BH1750_ADDR, data, 2, false);
    if (result != 2) {
        return false;
    }

    uint16_t raw = (data[0] << 8) | data[1];

    // According to common BH1750 conversion:
    // lux = raw / 1.2
    *lux = raw / 1.2f;

    return true;
}



SensorPacket build_sensor_packet(int counter) {
    SensorPacket packet;
    float lux = 0;

    packet.rh_x100 = read_humidity_x100();
    packet.temperature_x100 = read_temperature_x100();
    packet.light_lux_x100 = bh1750_read_lux(&lux);//read_light_lux_x100();

    return packet;
}

void update_actuator(const SensorPacket& packet) {
    /*
        Example logic:
        Turn actuator ON when light is below 10 lux.
        Turn actuator OFF otherwise.
    */

    // if (packet.light_lux_x100 < LIGHT_THRESHOLD_LUX_X100) {
    //     actuator_on();
    // } else {
    //     actuator_off();
    // }
}

bool send_packet_i2c(const SensorPacket& packet) {
    int result = i2c_write_blocking(
        I2C_PORT,
        RPI_SLAVE_ADDRESS,
        reinterpret_cast<const uint8_t*>(&packet),
        sizeof(packet),
        false
    );

    return result == sizeof(packet);
}

int main() {
    stdio_init_all();

    i2c_init(I2C_PORT, 115200);

    gpio_set_function(SDA_PIN, GPIO_FUNC_I2C);
    gpio_set_function(SCL_PIN, GPIO_FUNC_I2C);

    gpio_pull_up(SDA_PIN);
    gpio_pull_up(SCL_PIN);

    sensors_init();
    actuator_init();

    int counter = 0;

    while (true) {
        SensorPacket packet = build_sensor_packet(counter);

        update_actuator(packet);

        bool ok = send_packet_i2c(packet);

        printf(
            "Sent:  RH=%ld.%02ld %%, Temp=%ld.%02ld C, Light=%ld.%02ld lux, Actuator=%s\n",
            packet.rh_x100 / 100,
            packet.rh_x100 % 100,
            packet.temperature_x100 / 100,
            packet.temperature_x100 % 100,
            packet.light_lux_x100 / 100,
            packet.light_lux_x100 % 100,
            packet.light_lux_x100 < LIGHT_THRESHOLD_LUX_X100 ? "ON" : "OFF"
        );

        printf((const char *)ok);


        counter++;

        sleep_ms(2000);
    }
}