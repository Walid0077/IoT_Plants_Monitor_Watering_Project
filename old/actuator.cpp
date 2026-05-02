#include "actuator.h"

#include "pico/stdlib.h"
#include "hardware/gpio.h"

#define ACTUATOR_PIN 2

void actuator_init() {
    gpio_init(ACTUATOR_PIN);
    gpio_set_dir(ACTUATOR_PIN, GPIO_OUT);

    // Start in a safe OFF state
    gpio_put(ACTUATOR_PIN, 0);
}

void actuator_on() {
    gpio_put(ACTUATOR_PIN, 1);
}

void actuator_off() {
    gpio_put(ACTUATOR_PIN, 0);
}

void actuator_set(bool enabled) {
    gpio_put(ACTUATOR_PIN, enabled ? 1 : 0);
}