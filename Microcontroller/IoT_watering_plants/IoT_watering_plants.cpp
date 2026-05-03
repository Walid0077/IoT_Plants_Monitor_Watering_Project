#include <stdio.h>
#include <string.h>

#include "pico/stdlib.h"
#include "hardware/i2c.h"
#include "hardware/adc.h"
#include "hardware/sync.h"
#include "pico/i2c_slave.h"

// I2C bus used between Raspberry Pi and Pico
// Pico is SLAVE on this bus
#define PI_I2C_PORT i2c0
#define PI_SDA_PIN 4
#define PI_SCL_PIN 5
#define SLAVE_ADDRESS 0x17
#define ACTUATOR_PIN 2

// I2C bus used between Pico and BH1750
// Pico is MASTER on this bus
#define SENSOR_I2C_PORT i2c1
#define SENSOR_SDA_PIN 6
#define SENSOR_SCL_PIN 7

#define DHT_PIN 3

#define BH1750_ADDR 0x23
#define BH1750_POWER_ON 0x01
#define BH1750_RESET 0x07
#define BH1750_CONT_HIGH_RES_MODE 0x10

//commands for actuator
#define CMD_ACTUATOR 0xA1
#define ACTUATOR_OFF 0x00
#define ACTUATOR_ON 0x01

const uint ADC_PIN = 26;   // GPIO26 = ADC0

struct DataPacket {
    int32_t a;   // lux x 100
    int32_t b;   // temperature x 100
    int32_t c;   // humidity x 100
    int32_t d;   // voltage in millivolts
};


volatile uint8_t tx_index = 0;
uint8_t tx_buffer[sizeof(DataPacket)];

// Receive buffer for commands from Raspberry Pi
volatile uint8_t rx_buffer[8];
volatile uint8_t rx_index = 0;

volatile bool actuator_state = false;

bool wait_for_pin_state(uint pin, bool state, uint32_t timeout_us) {
    while (gpio_get(pin) != state) {
        if (timeout_us-- == 0) {
            return false;
        }
        sleep_us(1);
    }

    return true;
}

bool read_dht11(float *temperature, float *air_humidity) {
    uint8_t data[5] = {0, 0, 0, 0, 0};

    // Start signal from Picok
    gpio_set_dir(DHT_PIN, GPIO_OUT);
    gpio_put(DHT_PIN, 0);
    sleep_ms(18);

    gpio_put(DHT_PIN, 1);
    sleep_us(40);

    gpio_set_dir(DHT_PIN, GPIO_IN);

    // DHT11 response:
    // LOW about 80 us, then HIGH about 80 us
    if (!wait_for_pin_state(DHT_PIN, 0, 10000)) return false;
    if (!wait_for_pin_state(DHT_PIN, 1, 10000)) return false;
    if (!wait_for_pin_state(DHT_PIN, 0, 10000)) return false;

    // Read 40 bits
    for (int i = 0; i < 40; i++) {
        // Each bit starts with LOW for about 50 us
        if (!wait_for_pin_state(DHT_PIN, 1, 10000)) return false;

        // Then HIGH duration determines bit value:
        // around 26-28 us = 0
        // around 70 us    = 1
        uint32_t start = time_us_32();

        if (!wait_for_pin_state(DHT_PIN, 0, 10000)) return false;

        uint32_t pulse_length = time_us_32() - start;

        data[i / 8] <<= 1;

        if (pulse_length > 50) {
            data[i / 8] |= 1;
        }
    }

    uint8_t checksum = data[0] + data[1] + data[2] + data[3];

    if (checksum != data[4]) {
        return false;
    }

    *air_humidity = data[0] + data[1] * 0.1f;
    *temperature = data[2] + data[3] * 0.1f;

    return true;
}

// bool read_dht11(float *temperature, float *air_humidity) { uint8_t data[5] = {0, 0, 0, 0, 0}; gpio_set_dir(DHT_PIN, GPIO_OUT); gpio_put(DHT_PIN, 0); sleep_ms(18); gpio_put(DHT_PIN, 1); sleep_us(40); gpio_set_dir(DHT_PIN, GPIO_IN); uint timeout = 10000; while (gpio_get(DHT_PIN) == 1) { if (--timeout == 0) return false; sleep_us(1); } timeout = 10000; while (gpio_get(DHT_PIN) == 0) { if (--timeout == 0) return false; sleep_us(1); } timeout = 10000; while (gpio_get(DHT_PIN) == 1) { if (--timeout == 0) return false; sleep_us(1); } for (int i = 0; i < 40; i++) { timeout = 10000; while (gpio_get(DHT_PIN) == 0) { if (--timeout == 0) return false; sleep_us(1); } uint32_t start = time_us_32(); timeout = 10000; while (gpio_get(DHT_PIN) == 1) { if (--timeout == 0) return false; sleep_us(1); } uint32_t pulse_length = time_us_32() - start; data[i / 8] <<= 1; if (pulse_length > 50) { data[i / 8] |= 1; } } uint8_t checksum = data[0] + data[1] + data[2] + data[3]; if (checksum != data[4]) { return false; } *air_humidity = data[0] + data[1] * 0.1f; *temperature = data[2] + data[3] * 0.1f; return true; }

bool bh1750_write_cmd(uint8_t cmd) {
    int result = i2c_write_blocking(SENSOR_I2C_PORT,BH1750_ADDR,&cmd,1,false);
    return result == 1;
}

bool bh1750_read_lux(float *lux) {
    uint8_t data[2];

    int result = i2c_read_blocking(SENSOR_I2C_PORT,BH1750_ADDR,data,2,false);

    if (result != 2) {
        return false;
    }

    uint16_t raw = (data[0] << 8) | data[1];
    *lux = raw / 1.2f;

    return true;
}

void update_i2c_packet(const DataPacket *packet) {
    uint32_t interrupts = save_and_disable_interrupts();

    memcpy(tx_buffer, packet, sizeof(DataPacket));
    tx_index = 0;

    restore_interrupts(interrupts);
}

void process_i2c_command() {
    if (rx_index < 2) {
        rx_index = 0;
        return;
    }

    uint8_t command = rx_buffer[0];
    uint8_t value   = rx_buffer[1];

    if (command == CMD_ACTUATOR) {
        if (value == ACTUATOR_ON) {
            actuator_state = true;
            gpio_put(ACTUATOR_PIN, 1);
        } else if (value == ACTUATOR_OFF) {
            actuator_state = false;
            gpio_put(ACTUATOR_PIN, 0);
        }
    }

    rx_index = 0;
}

static void i2c_slave_handler(i2c_inst_t *i2c, i2c_slave_event_t event) {
    switch (event) {
        case I2C_SLAVE_RECEIVE: {
            // Raspberry Pi is writing a byte to the Pico.
            uint8_t byte = i2c_read_byte_raw(i2c);

            if (rx_index < sizeof(rx_buffer)) {
                rx_buffer[rx_index++] = byte;
            }

            break;
        }

        case I2C_SLAVE_REQUEST:
            // Raspberry Pi is reading sensor packet bytes from the Pico.
            i2c_write_byte_raw(i2c, tx_buffer[tx_index]);

            tx_index++;

            if (tx_index >= sizeof(DataPacket)) {
                tx_index = 0;
            }

            break;

        case I2C_SLAVE_FINISH:
            // End of I2C transaction.
            //
            // If the Pi wrote a command, process it here.
            // If the Pi only wrote register 0x00 before reading, this will be ignored
            // because rx_index will usually be 1.
            process_i2c_command();

            tx_index = 0;
            break;
    }
}

float voltage_to_moisture_percent(float voltage) {
    // Replace these with your measured calibration values
    const float dry_voltage = 2.80f;
    const float wet_voltage = 1.20f;

    float moisture = (dry_voltage - voltage) * 100.0f / 
                     (dry_voltage - wet_voltage);

    if (moisture < 0.0f) {
        moisture = 0.0f;
    }

    if (moisture > 100.0f) {
        moisture = 100.0f;
    }

    return moisture;
}

int main() {
    uint32_t delay  = 200;
    stdio_init_all();

    sleep_ms(1000);

    //actuator
    gpio_init(ACTUATOR_PIN);
    gpio_set_dir(ACTUATOR_PIN, GPIO_OUT);
    gpio_put(ACTUATOR_PIN, 0);

    // -------------------------------
    // I2C0: Pico as slave for Raspberry Pi
    // -------------------------------
    i2c_init(PI_I2C_PORT, 100 * 1000);

    gpio_set_function(PI_SDA_PIN, GPIO_FUNC_I2C);
    gpio_set_function(PI_SCL_PIN, GPIO_FUNC_I2C);

    gpio_pull_up(PI_SDA_PIN);
    gpio_pull_up(PI_SCL_PIN);

    i2c_slave_init(PI_I2C_PORT, SLAVE_ADDRESS, &i2c_slave_handler);

    // -------------------------------
    // I2C1: Pico as master for BH1750
    // -------------------------------
    i2c_init(SENSOR_I2C_PORT, 100 * 1000);

    gpio_set_function(SENSOR_SDA_PIN, GPIO_FUNC_I2C);
    gpio_set_function(SENSOR_SCL_PIN, GPIO_FUNC_I2C);

    gpio_pull_up(SENSOR_SDA_PIN);
    gpio_pull_up(SENSOR_SCL_PIN);

    // -------------------------------
    // DHT11 setup
    // -------------------------------
    gpio_init(DHT_PIN);
    gpio_pull_up(DHT_PIN);

    // -------------------------------
    // ADC setup
    // -------------------------------
    adc_init();
    adc_gpio_init(ADC_PIN);
    adc_select_input(0);

    // -------------------------------
    // Initial packet
    // -------------------------------
    DataPacket packet = {0, 0, 0, 0};
    update_i2c_packet(&packet);

    // -------------------------------
    // BH1750 setup
    // -------------------------------
    if (!bh1750_write_cmd(BH1750_POWER_ON)) {
        printf("BH1750 not responding\n");
    }

    bh1750_write_cmd(BH1750_RESET);
    bh1750_write_cmd(BH1750_CONT_HIGH_RES_MODE);

    while (true) {
        float lux = 0.0f;
        float temperature = 0.0f;
        float air_humidity = 0.0f;

        uint16_t raw = adc_read();
        float moisture = voltage_to_moisture_percent(raw * 3.3f / 4095.0f);

        bool dht_ok = read_dht11(&temperature, &air_humidity);
        bool lux_ok = bh1750_read_lux(&lux);

        if (!dht_ok) {
            printf("DHT11 read failed\n");
        }

        if (!lux_ok) {
            printf("BH1750 read failed\n");
        }

        packet.a = (int32_t)(lux);
        packet.b = (int32_t)(temperature);
        packet.c = (int32_t)(air_humidity);
        packet.d = (int32_t)(moisture);

        update_i2c_packet(&packet);

        printf("Light: %.2f\n", lux);
        printf("Temperature: %.2f C\n", temperature);
        printf("Air_humidity: %.2f %%\n", air_humidity);
        printf("Moisture raw: %u | Voltage: %.3f V\n", raw, moisture);
        printf("Actuator state: %d\n", actuator_state);
        printf("T: %d sec\n", (800 + delay)/1000);

        
        // printf("Packet int32: %ld, %ld, %ld, %ld\n",packet.a,packet.b,packet.c,packet.d);
        sleep_ms((800 + delay));
    }
}