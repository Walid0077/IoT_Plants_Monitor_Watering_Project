from smbus2 import SMBus
import time

I2C_BUS = 1
PICO_ADDRESS = 0x17

CMD_ACTUATOR = 0xA1
ACTUATOR_OFF = 0x00
ACTUATOR_ON = 0x01

bus = SMBus(I2C_BUS)

print("Actuator ON")
bus.write_i2c_block_data(PICO_ADDRESS, CMD_ACTUATOR, [ACTUATOR_ON])

time.sleep(3)

print("Actuator OFF")
bus.write_i2c_block_data(PICO_ADDRESS, CMD_ACTUATOR, [ACTUATOR_OFF])

bus.close()