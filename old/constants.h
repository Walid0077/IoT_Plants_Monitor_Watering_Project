
//com with pi
static const uint I2C_SDA_PIN   = 0;       // GP4
static const uint I2C_SCL_PIN   = 1;       // GP5
static const uint I2C_ADDRESS   = 0x17;    // 7-bit slave address
static const uint I2C_BAUDRATE  = 100000;  // 100 kHz
//


const uint GPIO_PIN = 7;
const uint DHT_PIN = 6;
#define I2C_PORT i2c0
#define SDA_PIN 4
#define SCL_PIN 5

#define BH1750_ADDR 0x23
#define BH1750_POWER_ON 0x01
#define BH1750_RESET 0x07
#define BH1750_CONT_HIGH_RES_MODE 0x10