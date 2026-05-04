import json
import threading
from datetime import datetime, timezone
from statsmodels.tsa.arima.model import ARIMA
import paho.mqtt.client as mqtt
from pymongo import MongoClient, DESCENDING
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import pandas as pd
from prophet import Prophet


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
MQTT_TOPIC2 = "iot/gateway-001/updateparams"

mqtt_client = mqtt.Client(client_id="iot-server")
params_lock = threading.Lock()
PLANT_PARAMS = {
    "fieldCapacity": 80.0,
    "sampleFrequency": 10,
    "soilVolumeLiters": 5.0,
    "targetSoilMoisture": 55.0,
    "wiltingPoint": 30.0,
}


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

    # print(document)

    result = sensor_collection.insert_one(document)

    # print(f"Data stored in MongoDB with id: {result.inserted_id}")


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
        client.subscribe(MQTT_TOPIC2)
        print(f"Subscribed to topics: {MQTT_TOPIC}, {MQTT_TOPIC2}")
    else:
        print(f"Failed to connect to MQTT broker. Return code: {rc}")


def parse_update_params_payload(payload: str):
    pairs = [part.strip() for part in payload.split(",") if part.strip()]
    parsed = {}

    for pair in pairs:
        if ":" not in pair:
            continue

        key, value = [item.strip() for item in pair.split(":", 1)]
        if key not in PLANT_PARAMS:
            continue

        try:
            parsed[key] = float(value)
        except ValueError:
            return None

    if not parsed:
        return None

    if "sampleFrequency" in parsed:
        parsed["sampleFrequency"] = int(parsed["sampleFrequency"])

    return parsed


def update_local_params(params):
    with params_lock:
        for key, value in params.items():
            if key in PLANT_PARAMS:
                PLANT_PARAMS[key] = value

        return json.dumps(PLANT_PARAMS, indent=2)


def on_message(client, userdata, message):
    try:
        payload = message.payload.decode().strip()

        if message.topic == MQTT_TOPIC2:
            parsed = parse_update_params_payload(payload)
            if parsed is None:
                print(f"Unable to parse update params payload: {payload}")
                return

            update_local_params(parsed)
            return

        data = json.loads(payload)
        store_sensor_data(data)

    except KeyError as e:
        print(f"Missing field in MQTT packet: {e}")

    except ValueError as e:
        print(f"Invalid numeric value in MQTT packet: {e}")

    except Exception as e:
        print(f"Error processing MQTT message: {e}")


def start_mqtt_client():
    mqtt_client.on_connect = on_connect
    mqtt_client.on_message = on_message

    print(f"Connecting to MQTT broker at {MQTT_BROKER}:{MQTT_PORT}")
    mqtt_client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)

    mqtt_client.loop_forever()



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
    
    # print(serialize_document(document))
    return serialize_document(document)



def predict_arima(values, steps, order=(1, 1, 1)):
    """
    Forecast future values using ARIMA.

    values: list of historical sensor values
    steps: number of future values to predict
    order: ARIMA(p, d, q), default is (1, 1, 1)
    """

    if steps <= 0 or not values:
        return []

    if len(values) == 1:
        return [round(values[0], 2) for _ in range(steps)]

    # ARIMA needs enough data to fit reliably.
    # If too few values are available, use a simple fallback.
    if len(values) < 8:
        latest = values[-1]
        return [round(latest, 2) for _ in range(steps)]

    try:
        model = ARIMA(values, order=order)
        fitted_model = model.fit()

        forecast = fitted_model.forecast(steps=steps)

        return [round(float(value), 2) for value in forecast]

    except Exception as e:
        print(f"ARIMA prediction failed: {e}")

        # Safe fallback: repeat latest value
        latest = values[-1]
        return [round(latest, 2) for _ in range(steps)]

def predict_prophet(values, steps):
    if steps <= 0 or not values:
        return []

    if len(values) == 1:
        return [round(values[0], 2) for _ in range(steps)]

 

    # Prophet requires columns named ds and y
    df = pd.DataFrame({
        "ds": pd.date_range(start="2024-01-01", periods=len(values), freq="D"),
        "y": values
    })

    model = Prophet(
        daily_seasonality=False,
        weekly_seasonality=False,
        yearly_seasonality=False
    )

    model.fit(df)

    future = model.make_future_dataframe(periods=steps, freq="D")
    forecast = model.predict(future)

    predictions = forecast["yhat"].tail(steps)

    return [
        round(value, 2)
        for value in predictions
    ]

def predict_least_squares(values, steps):

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


@app.get("/api/predictions")
def get_predictions(steps: int = 10, limit: int = 28):
    steps = max(0, min(steps, 100))
    limit = max(2, min(limit, 500))
    documents = list(newest_documents(limit))
    documents.reverse()
    # print(documents)

    response = {}
    #     "steps": steps,
    #     "generated_at": datetime.now(timezone.utc).isoformat(),
    # }

        
    result = {}
    method = "linear_least_squares" #rolling-window linear regression trend extrapolation
    #but it is not a full time-series forecasting model like ARIMA, exponential smoothing, Prophet, or an LSTM.
    

    for doc in documents:
        for key, value in METRIC_FIELD_NAMES.items():
            if isinstance(doc[value], (int, float)) and not isinstance(value, bool):
                if key not in result:
                    result[key] = []

                result[key].append(doc[value])
            # print(value)
            if(method == "linear_least_squares"):
                response[value] = predict_least_squares(result[value], steps)
            elif(method == "arima"):
                response[value] = predict_arima(result[value], steps)
            elif(method == "prophet"):
                response[value] = predict_prophet(result[value], steps)
    return response


class UpdateParams(BaseModel):
    fieldCapacity: float
    sampleFrequency: int
    soilVolumeLiters: float
    targetSoilMoisture: float
    wiltingPoint: float


@app.post("/api/update-params")
def update_params(params: UpdateParams):
    payload = (
        f"fieldCapacity : {params.fieldCapacity}, "
        f"sampleFrequency : {params.sampleFrequency}, "
        f"soilVolumeLiters : {params.soilVolumeLiters} , "
        f"targetSoilMoisture : {params.targetSoilMoisture}, "
        f"wiltingPoint : {params.wiltingPoint}"
    )

    dic_payload =  update_local_params(params.model_dump())

    result = mqtt_client.publish(MQTT_TOPIC2, dic_payload)

    if result.rc != mqtt.MQTT_ERR_SUCCESS:
        raise HTTPException(
            status_code=500,
            detail=f"MQTT publish failed with code {result.rc}",
        )

    return {"status": "ok", "published_payload": payload}


@app.delete("/api/sensor-data")
def delete_all_sensor_data():
    result = sensor_collection.delete_many({})

    return {"deleted_count": result.deleted_count}


if __name__ == "__main__":
    mqtt_thread = threading.Thread(target=start_mqtt_client)
    mqtt_thread.daemon = True
    mqtt_thread.start()

    uvicorn.run(app,host="0.0.0.0",port=8000)
