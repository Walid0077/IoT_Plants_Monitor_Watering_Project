import json
import time
import argparse
import struct
from datetime import datetime

import paho.mqtt.client as mqtt
from smbus2 import SMBus, i2c_msg


I2C_BUS = 1
I2C_SLAVE_ADDRESS = 0x17
PACKET_LENGTH = 16

#actuator commands
CMD_ACTUATOR = 0xA1
ACTUATOR_OFF = 0x00
ACTUATOR_ON = 0x01


def read_i2c_raw(bus, address, length):
    """
        Reads raw bytes from the Pico I2C slave.
    """
    read_msg = i2c_msg.read(address, length)
    bus.i2c_rdwr(read_msg)
    return list(read_msg)


def read_i2c_from_register(bus, address, register, length):
    """
        Reads bytes using SMBus block read.
        This first sends a register/command byte to the Pico.
        The Pico slave code must handle and discard that byte.
    """
    return bus.read_i2c_block_data(address, register, length)


def decode_pico_packet(data_bytes):
    """
    Decode the 16-byte Pico packet:
        int32_t a = light
        int32_t b = temperature
        int32_t c = humidity
        int32_t d = moisture
    """
    if len(data_bytes) != PACKET_LENGTH:
        raise ValueError(f"Expected 16 bytes, got {len(data_bytes)}")

    light, temp, hum, moisture = struct.unpack(
        "<iiii",
        bytes(data_bytes)
    )

    return {
        "light": light,
        "temperature": temp,
        "humidity": hum,
        "moisture": moisture
    }


def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print("Connected to MQTT broker")
    else:
        print(f"Failed to connect to MQTT broker. Return code: {rc}")

def estimate_watering_decision(
    soil_moisture,
    air_temperature,
    air_humidity,
    light,
    field_capacity=1,
    wilting_point=25,
    target_soil_moisture=60,
    soil_volume_liters=1
):
    def normalize(value, min_value, max_value):
        value = max(min_value, min(value, max_value))
        return (value - min_value) / (max_value - min_value)

    paw = 100 * (soil_moisture - wilting_point) / (field_capacity - wilting_point)
    paw = max(0, min(100, paw))

    water_stress = 1 - paw / 100

    temp_score = normalize(air_temperature, 15, 35)
    humidity_score = 1 - normalize(air_humidity, 30, 90)
    light_score = normalize(light, 0, 1000)

    demand_index = (
        0.4 * temp_score +
        0.3 * humidity_score +
        0.3 * light_score
    )

    watering_need_index = (
        0.7 * water_stress +
        0.3 * demand_index
    )

    if watering_need_index >= 0.7:
        decision = "water_now"
    elif watering_need_index >= 0.5:
        decision = "water_soon"
    elif watering_need_index >= 0.3:
        decision = "monitor"
    else:
        decision = "no_water_needed"

    if decision in ["water_now", "water_soon"]:
        moisture_deficit = max(0, target_soil_moisture - soil_moisture)

        water_liters = (
            moisture_deficit / 100
            * soil_volume_liters
            * 0.6
        )
    else:
        water_liters = 0

    return {
        "plant_available_water_percent": round(paw, 2),
        "water_stress_index": round(water_stress, 2),
        "demand_index": round(demand_index, 2),
        "watering_need_index": round(watering_need_index, 2),
        "decision": decision,
        "estimated_water_liters": round(water_liters, 2),
        "estimated_water_ml": round(water_liters * 1000)
    }





def main():
    parser = argparse.ArgumentParser(
        description="Raspberry Pi IoT Gateway using I2C and MQTT"
    )

    parser.add_argument(
        "--broker",
        default="192.168.50.1",
        help="MQTT broker IP address"
    )

    parser.add_argument(
        "--port",
        type=int,
        default=1883,
        help="MQTT broker port"
    )

    parser.add_argument(
        "--gateway-id",
        default="gateway-001",
        help="Gateway ID"
    )

    parser.add_argument(
        "--i2c-address",
        type=lambda x: int(x, 0),
        default=I2C_SLAVE_ADDRESS,
        help="I2C slave address, for example 0x17"
    )

    parser.add_argument(
        "--read-length",
        type=int,
        default=PACKET_LENGTH,
        help="Number of bytes to read from the I2C slave"
    )

    parser.add_argument(
        "--sample-frequency",
        type=float,
        default=0.5,
        help="Time between readings, in seconds"
    )

    parser.add_argument(
        "--register",
        type=lambda x: int(x, 0),
        default=0x00,
        help="I2C register to read from, for example 0x00"
    )

    parser.add_argument(
        "--raw-i2c",
        action="store_true",
        default=True,
        help="Use raw I2C read without register"
    )

    args = parser.parse_args()

    telemetry_topic = f"iot/{args.gateway_id}/telemetry"

    client = mqtt.Client(client_id=f"{args.gateway_id}-client")
    client.on_connect = on_connect

    print(f"Connecting to MQTT broker at {args.broker}:{args.port}...")
    client.connect(args.broker, args.port, keepalive=60)
    client.loop_start()

    print(f"Opening I2C bus {I2C_BUS}")
    print(f"Reading from Pico I2C slave address: {hex(args.i2c_address)}")
    print(f"Reading {args.read_length} bytes")
    print(f"Publishing MQTT messages to topic: {telemetry_topic}")

    try:
        with SMBus(I2C_BUS) as bus:
            while True:
                try:
                    if args.raw_i2c:
                        data_bytes = read_i2c_raw(bus,args.i2c_address,args.read_length)
                    else:
                        data_bytes = read_i2c_from_register(bus,args.i2c_address,args.register,args.read_length)

                    decoded = decode_pico_packet(data_bytes)

                    packet = {
                        "gateway_id": args.gateway_id,
                        "timestamp": datetime.now().isoformat(),
                        "decoded": decoded
                    }
                    

                    watering_decision = estimate_watering_decision(
                        decoded.moisture,
                        decoded.temperature,
                        decoded.humidity,
                        decoded.light,
                        field_capacity=70,
                        wilting_point=25,
                        target_soil_moisture=60,
                        soil_volume_liters=5
                    )
                    
                    if(watering_decision.decision == "water_now"):
                        bus.write_i2c_block_data(I2C_SLAVE_ADDRESS, CMD_ACTUATOR, [ACTUATOR_ON])
            
                    estimated_water_liters

                    print("\nReceived from Pico:")
                    print(json.dumps(packet, indent=4))
                    
 
                    client.publish(
                        telemetry_topic,
                        json.dumps(packet),
                        qos=1
                    )

                    print("Packet sent via MQTT")

                except OSError as e:
                    print(f"I2C error: {e}")
                    print("Check wiring, slave address, and whether the Pico is running.")

                except Exception as e:
                    print(f"Unexpected error: {e}")

                time.sleep(args.sample_frequency)

    except KeyboardInterrupt:
        print("\nStopping IoT Gateway...")

    finally:
        client.loop_stop()
        client.disconnect()
        print("MQTT disconnected")


if __name__ == "__main__":
    main()