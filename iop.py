from smbus2 import SMBus
import time

I2C_BUS = 1
PICO_ADDRESS = 0x17

bus = SMBus(I2C_BUS)

while True:
    data = bus.read_i2c_block_data(PICO_ADDRESS, 0x00, 16)
    print(data)
    time.sleep(1)