from datetime import datetime, timedelta, timezone
import math
import random
from pymongo import MongoClient


# =========================
# Editable parameters
# =========================

MONGO_URI = "mongodb://localhost:27017/"
DATABASE_NAME = "sensor_database"
COLLECTION_NAME = "environment_data"

SAMPLE_FREQUENCY_HZ = 0.1
DURATION_HOURS = 24

AVERAGE_LIGHT = 60
AVERAGE_MOISTURE = 100
AVERAGE_TEMPERATURE = 20
AVERAGE_HUMIDITY = 30

START_TIME = datetime.now(timezone.utc).replace(
    hour=0, minute=0, second=0, microsecond=0
)

# Noise settings
LIGHT_NOISE = 3
TEMPERATURE_NOISE = 0.5
HUMIDITY_NOISE = 1.0
MOISTURE_NOISE = 0.8

# Moisture behavior
MOISTURE_DRYING_RATE_PER_HOUR = 2.2
WATERING_HOURS = [7, 19]  # Watering events at 07:00 and 19:00
WATERING_SPIKE_AMOUNT = 18
MOISTURE_MIN = 40
MOISTURE_MAX = 100


# =========================
# Helper functions
# =========================

def clamp(value, min_value, max_value):
    return max(min_value, min(value, max_value))


def smoothstep(x):
    """
    Smooth transition curve.
    x should be between 0 and 1.
    """
    x = clamp(x, 0, 1)
    return x * x * (3 - 2 * x)


def get_daylight_factor(hour_float):
    """
    Returns a daylight factor between 0 and 1.

    Light starts increasing around 07:00,
    peaks during the day,
    and decreases smoothly after 19:00.
    """
    sunrise = 7
    sunset = 19

    if hour_float < sunrise or hour_float > sunset:
        return 0

    daylight_progress = (hour_float - sunrise) / (sunset - sunrise)

    # Smooth sine curve: 0 at sunrise, 1 at midday, 0 at sunset
    return math.sin(math.pi * daylight_progress)


def get_temperature_factor(hour_float):
    """
    Temperature starts increasing at 07:00,
    remains higher during the day,
    and smoothly decreases from 19:00.
    """
    morning_start = 7
    evening_start = 19

    if hour_float < morning_start:
        return 0

    if morning_start <= hour_float < evening_start:
        progress = (hour_float - morning_start) / (evening_start - morning_start)
        return smoothstep(progress)

    # Smooth decrease after 19:00 until midnight
    progress = (hour_float - evening_start) / (24 - evening_start)
    return 1 - smoothstep(progress)


def generate_light(hour_float):
    daylight_factor = get_daylight_factor(hour_float)

    # Low but non-zero light at night
    night_light = AVERAGE_LIGHT * 0.05
    day_light = AVERAGE_LIGHT * 1.6

    value = night_light + daylight_factor * (day_light - night_light)
    value += random.uniform(-LIGHT_NOISE, LIGHT_NOISE)

    return round(clamp(value, 0, 100), 2)


def generate_temperature(hour_float):
    temp_factor = get_temperature_factor(hour_float)

    night_temperature = AVERAGE_TEMPERATURE - 4
    day_temperature = AVERAGE_TEMPERATURE + 5

    value = night_temperature + temp_factor * (day_temperature - night_temperature)
    value += random.uniform(-TEMPERATURE_NOISE, TEMPERATURE_NOISE)

    return round(value, 2)


def generate_humidity(hour_float):
    humidity_factor = get_temperature_factor(hour_float)

    night_humidity = AVERAGE_HUMIDITY - 5
    day_humidity = AVERAGE_HUMIDITY + 8

    value = night_humidity + humidity_factor * (day_humidity - night_humidity)
    value += random.uniform(-HUMIDITY_NOISE, HUMIDITY_NOISE)

    return round(clamp(value, 0, 100), 2)


def is_watering_time(hour_float):
    """
    Checks if current time is near a watering event.
    The spike is applied during the first sample after the watering hour.
    """
    current_hour = int(hour_float)
    current_minute = int((hour_float - current_hour) * 60)

    return current_hour in WATERING_HOURS and current_minute == 0


def generate_sensor_data():
    sample_interval_seconds = 1 / SAMPLE_FREQUENCY_HZ
    total_samples = int(DURATION_HOURS * 3600 * SAMPLE_FREQUENCY_HZ)

    data = []
    current_moisture = AVERAGE_MOISTURE

    for i in range(total_samples):
        timestamp = START_TIME + timedelta(seconds=i * sample_interval_seconds)

        hour_float = (
            timestamp.hour
            + timestamp.minute / 60
            + timestamp.second / 3600
        )

        # Moisture slowly decreases over time
        current_moisture -= MOISTURE_DRYING_RATE_PER_HOUR / 3600 * sample_interval_seconds

        # Moisture spikes when watering happens
        if is_watering_time(hour_float):
            current_moisture += WATERING_SPIKE_AMOUNT

        current_moisture = clamp(current_moisture, MOISTURE_MIN, MOISTURE_MAX)

        moisture_value = current_moisture + random.uniform(
            -MOISTURE_NOISE,
            MOISTURE_NOISE
        )

        document = {
            "timestamp": timestamp,
            "light": generate_light(hour_float),
            "temperature": generate_temperature(hour_float),
            "humidity": generate_humidity(hour_float),
            "moisture": round(clamp(moisture_value, MOISTURE_MIN, MOISTURE_MAX), 2),
            "sampleFrequencyHz": SAMPLE_FREQUENCY_HZ
        }

        data.append(document)

    return data


def store_data_in_mongodb(data):
    client = MongoClient(MONGO_URI)
    db = client[DATABASE_NAME]
    collection = db[COLLECTION_NAME]

    if data:
        collection.insert_many(data)

    client.close()


if __name__ == "__main__":
    generated_data = generate_sensor_data()
    store_data_in_mongodb(generated_data)

    print(f"Inserted {len(generated_data)} records into MongoDB.")
    print(f"Database: {DATABASE_NAME}")
    print(f"Collection: {COLLECTION_NAME}")