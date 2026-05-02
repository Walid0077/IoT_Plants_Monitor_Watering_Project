import json
import threading
from datetime import datetime, timezone

import paho.mqtt.client as mqtt
from pymongo import MongoClient, DESCENDING
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn


# -----------------------------
# MongoDB configuration
# -----------------------------

MONGO_URI = "mongodb://localhost:27017"
MONGO_DB_NAME = "iot_project"
MONGO_COLLECTION_NAME = "sensor_data"


mongo_client = MongoClient(MONGO_URI)
db = mongo_client[MONGO_DB_NAME]
sensor_collection = db[MONGO_COLLECTION_NAME]


# -----------------------------
# MQTT configuration
# -----------------------------

MQTT_BROKER = "localhost"
MQTT_PORT = 1883
MQTT_TOPIC = "iot/gateway-001/telemetry"


# -----------------------------
# FastAPI app
# -----------------------------

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # okay for development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


METRIC_FIELD_NAMES = {
    "temperature": "temperature",
    "light": "light",
    "moisture": "moisture",
    "humidity": "humidity"
}


def newest_documents(limit):
    return (
        sensor_collection
        .find()
        .sort([
            ("received_at", DESCENDING),
            ("timestamp", DESCENDING),
            ("_id", DESCENDING),
        ])
        .limit(limit)
    )


def serialize_timestamp(value):
    if isinstance(value, datetime):
        return value.isoformat()

    if value is None:
        return None

    return str(value)



def read_numeric_field(document, field_names):
    for field_name in field_names:
        value = document.get(field_name)

        if isinstance(value, bool):
            continue

        if isinstance(value, (int, float)):
            return float(value)

        if isinstance(value, str):
            try:
                return float(value)
            except ValueError:
                continue

    return None


def predict_next_values(values, steps):
    if steps <= 0 or not values:
        return []

    if len(values) == 1:
        return [round(values[0], 2) for _ in range(steps)]

    recent_values = values[-8:]
    mean_x = (len(recent_values) - 1) / 2
    mean_y = sum(recent_values) / len(recent_values)
    numerator = sum(
        (index - mean_x) * (value - mean_y)
        for index, value in enumerate(recent_values)
    )
    denominator = sum(
        (index - mean_x) ** 2
        for index, _value in enumerate(recent_values)
    )
    slope = numerator / denominator if denominator else 0
    latest = recent_values[-1]

    return [
        round(latest + slope * (step + 1), 2)
        for step in range(steps)
    ]


def store_sensor_data(data):
    """
        Stores one MQTT packet in MongoDB.
    """
    
    
    decoded = data["decoded"]
    document = {
        "gateway_id": data.get("gateway_id", "unknown"),
        "timestamp": data.get("timestamp"),
        "received_at": datetime.now(timezone.utc),
        "light": decoded["light"],
        "temperature": decoded["temperature"],
        "humidity": decoded["humidity"],
        "moisture": decoded["moisture"],
    }

    print(document)

    result = sensor_collection.insert_one(document)

    print(f"Data stored in MongoDB with id: {result.inserted_id}")


def serialize_document(document):
    """
    Converts MongoDB document to JSON-friendly format.
    MongoDB ObjectId and datetime are not directly JSON serializable.
    """

    return {
        "id": str(document["_id"]),
        "gateway_id": document.get("gateway_id"),
        "temperature": document.get("temperature"),
        "humidity": document.get("humidity"),
        "light": document.get("light"),
        "moisture": document.get("moisture"),
        "received_at": document.get("timestamp")
    }


def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print("Connected to MQTT broker")
        client.subscribe(MQTT_TOPIC)
        print(f"Subscribed to topic: {MQTT_TOPIC}")
    else:
        print(f"Failed to connect to MQTT broker. Return code: {rc}")


def on_message(client, userdata, message):
    try:
        payload = message.payload.decode()
        data = json.loads(payload)

        print("\nReceived MQTT packet:")
        print(json.dumps(data, indent=4))

        store_sensor_data(data)

    except KeyError as e:
        print(f"Missing field in MQTT packet: {e}")

    except ValueError as e:
        print(f"Invalid numeric value in MQTT packet: {e}")

    except Exception as e:
        print(f"Error processing MQTT message: {e}")


def start_mqtt_client():
    client = mqtt.Client(client_id="iot-server")
    client.on_connect = on_connect
    client.on_message = on_message

    print(f"Connecting to MQTT broker at {MQTT_BROKER}:{MQTT_PORT}")
    client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)

    client.loop_forever()



@app.get("/api/sensor-data")
def get_sensor_data(limit: int = 50):
    limit = min(limit, 500)

    documents = newest_documents(limit)

    return [serialize_document(document) for document in documents]


@app.get("/api/latest")
def get_latest_sensor_data():
    document = sensor_collection.find_one(
        sort=[("received_at", DESCENDING),("timestamp", DESCENDING),("_id", DESCENDING)])

    if document is None:
        return {"message": "No data available"}
    
    print(serialize_document(document))
    return serialize_document(document)


@app.get("/api/predictions")
def get_predictions(steps: int = 10, limit: int = 28):
    steps = max(0, min(steps, 100))
    limit = max(2, min(limit, 500))
    documents = list(newest_documents(limit))
    documents.reverse()

    response = {
        "steps": steps,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

    for metric_name, field_names in METRIC_FIELD_NAMES.items():
        values = [
            value
            for value in (
                read_numeric_field(document, field_names)
                for document in documents
            )
            if value is not None
        ]
        response[metric_name] = predict_next_values(values, steps)

    return response


@app.delete("/api/sensor-data")
def delete_all_sensor_data():
    result = sensor_collection.delete_many({})

    return {"deleted_count": result.deleted_count}


if __name__ == "__main__":
    mqtt_thread = threading.Thread(target=start_mqtt_client)
    mqtt_thread.daemon = True
    mqtt_thread.start()

    uvicorn.run(app,host="0.0.0.0",port=8000)
