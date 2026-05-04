import datetime
import json
import time
import random
import paho.mqtt.client as mqtt


MQTT_BROKER = "localhost"  # Use PC IP address if running from Raspberry Pi, e.g. "192.168.137.1"
MQTT_PORT = 1883
MQTT_TOPIC = "iot/gateway-001/telemetry"


def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print("Connected to MQTT broker")
    else:
        print(f"Connection failed with code {rc}")


def generate_sensor_data():
    light = random.randint(0, 1000)
    temp = round(random.uniform(18.0, 35.0), 2)
    hum = round(random.uniform(30.0, 80.0), 2)
    moisture = round(random.uniform(0.0, 100.0), 2)

    return {
        "gateway_id": 2,
        "timestamp": datetime.datetime.now().isoformat(),
        "decoded": {
            "light": light,
            "temperature": temp,
            "humidity": hum,
            "moisture": moisture
        }
    }



def main():
    client = mqtt.Client(client_id="gateway-001")
    client.on_connect = on_connect

    client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
    client.loop_start()

    try:
        while True:
            data = generate_sensor_data()

            payload = json.dumps(data)

            client.publish(MQTT_TOPIC, payload, qos=1)

            print(f"Sent to topic {MQTT_TOPIC}:")
            print(payload)

            time.sleep(5)

    except KeyboardInterrupt:
        print("\nStopping gateway...")

    finally:
        client.loop_stop()
        client.disconnect()


if __name__ == "__main__":
    main()