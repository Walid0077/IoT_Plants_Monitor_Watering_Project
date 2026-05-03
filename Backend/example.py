#!/usr/bin/env python3

import pigpio
import struct
import time
import signal
import sys

I2C_SLAVE_ADDRESS = 0x17

# Packet format:
# int32_t a
# int32_t b
# int32_t c
# int32_t rh_x100
# int32_t temperature_x100
# int32_t light_lux_x100
#
# Pico / RP2040 is little-endian, so we use "<"
PACKET_FORMAT = "<iiiiii"
PACKET_SIZE = struct.calcsize(PACKET_FORMAT)

rx_buffer = bytearray()
running = True


def handle_shutdown(signum, frame):
    global running
    running = False


def print_packet(packet_bytes):
    (
        a,
        b,
        c,
        rh_x100,
        temperature_x100,
        light_lux_x100
    ) = struct.unpack(PACKET_FORMAT, packet_bytes)

    humidity = rh_x100 / 100.0
    temperature = temperature_x100 / 100.0
    light_lux = light_lux_x100 / 100.0

    print(
        f"Received packet: "
        f"a={a}, "
        f"b={b}, "
        f"c={c}, "
        f"humidity={humidity:.2f} %RH "
        f"(rh_x100={rh_x100}), "
        f"temperature={temperature:.2f} °C "
        f"(temperature_x100={temperature_x100}), "
        f"light={light_lux:.2f} lux "
        f"(light_lux_x100={light_lux_x100})"
    )


def i2c_event_callback(event_id, tick):
    global rx_buffer

    status, byte_count, data = pi.bsc_i2c(I2C_SLAVE_ADDRESS)

    if byte_count > 0:
        rx_buffer.extend(data[:byte_count])

        while len(rx_buffer) >= PACKET_SIZE:
            packet = rx_buffer[:PACKET_SIZE]
            del rx_buffer[:PACKET_SIZE]

            print_packet(packet)


signal.signal(signal.SIGINT, handle_shutdown)
signal.signal(signal.SIGTERM, handle_shutdown)

pi = pigpio.pi()

if not pi.connected:
    print("Could not connect to pigpio daemon.")
    print("Start it with: sudo pigpiod")
    sys.exit(1)

callback = pi.event_callback(pigpio.EVENT_BSC, i2c_event_callback)

pi.bsc_i2c(I2C_SLAVE_ADDRESS)

print(f"Raspberry Pi I2C slave listening at address 0x{I2C_SLAVE_ADDRESS:02X}")
print(f"Expected packet size: {PACKET_SIZE} bytes")
print("Press Ctrl+C to stop.")

try:
    while running:
        time.sleep(0.1)

finally:
    callback.cancel()

    pi.bsc_i2c(0)

    pi.stop()

    print("\nI2C slave stopped.")