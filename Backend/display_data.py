from pymongo import MongoClient
import pandas as pd

# MongoDB configuration
MONGO_URI = "mongodb://localhost:27017/"
DATABASE_NAME = "sensor_database"
COLLECTION_NAME = "environment_data"

def load_sensor_data():
    try:
        # Connect to MongoDB
        client = MongoClient(MONGO_URI)

        # Select database and collection
        db = client[DATABASE_NAME]
        collection = db[COLLECTION_NAME]

        # Load data from MongoDB
        cursor = collection.find(
            {},
            {
                "_id": 0,
                "light": 1,
                "temperature": 1,
                "humidity": 1,
                "moisture": 1
            }
        )

        # Convert to DataFrame
        data = list(cursor)
        df = pd.DataFrame(data)

        if df.empty:
            print("No data found in the collection.")
        else:
            print("\nSensor Data:")
            print(df)

        return df

    except Exception as e:
        print(f"Error loading data from MongoDB: {e}")
        return None

    finally:
        try:
            client.close()
        except:
            pass

if __name__ == "__main__":
    load_sensor_data()