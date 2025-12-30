# Model Activity API For Programmers

# Intorduction

Welcome to the Model Activity API. This API allows you to retrieve statistics for models across three different sites. Access is granted based on whether a model has a trophy/calendar icon in their bio, which indicates they are registered in our trophy database. You must successfully look up the model in our studio search one time for the model to enter the trophy database. Model must maintain the trophy/calendar on their bio to stay in the database.

## Authentication

This API does not use traditional API keys. Authentication is handled by checking if the requested `username` exists in the trophy database for the specified `domain`.

If the user is not found in the database, the API will return the following error:

```
{
  "status": "error",
  "message": "Error Code:300 To use this api please add a trophy/calendar to the models bio and then use the STUDIO search successfully one time."
}
```

## Rate Limiting

To ensure a stable service for all users, you are limited to **one API request per second**. Exceeding this limit may result in a temporary block.

## Endpoints

The base URL for all API calls is the location of your `api.php` file.

**Base URL**: `https://www.cbhours.com/api.php`

### 1. Get Activity Data (Updated Every 3 Minutes)

This endpoint retrieves the total online time per day for a model. Optionally, it can also include the detailed data for every 3-minute segment.

- **URL**: `?action=get_activity`
- **Method**: `GET`

### Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `action` | String | Yes | Must be set to `get_activity`. |
| `domain` | String | Yes | The site to query. Options: `cbhours`, `striphours`, `sodahours`. |
| `username` | String | Yes | The model's username (case-insensitive). |
| `start_date` | String | Yes | The start of the date range in `YYYY-MM-DD` format. The maximum range is 60 days. |
| `end_date` | String | Yes | The end of the date range in `YYYY-MM-DD` format. The maximum range is 60 days. |
| `tzo` | Int | Yes | The timezone offset in minutes from GMT (e.g., `-300` for America/New_York). This is populated automatically in the example below. |
| `include_details` | Boolean | No | Set to `true` to include the detailed 3-minute data segments. Defaults to `false`. |

### Example Request URL (Last 30 Days with Details)

Your browser's timezone and local date have been automatically detected and inserted into the example URL below.

```
https://www.cbhours.com/api.php?action=get_activity&domain=cbhours&username=model_name&start_date=2025-11-23&end_date=2025-12-23&tzo=-300&include_details=true
```

### Example Success Response

```
{
  "response_time": "0.0035169124603271 seconds",
  "status": true,
  "model": "model_name",
  "serverStatus": true,
  "serverMessage": "",
  "activity": {
    "2025-08-12": "2025-08-12 Tue - 01 Hours 24 Minutes"
  },
  "total_time": {
    "hours": 1,
    "minutes": 24
  },
  "details": {
    "2025-08-12": [
      {
        "timestamp": "2025-08-12T22:36",
        "type": "_public",
        "rank": "5720",
        "followers": "64829",
        "viewers": "0",
        "gender": "f",
        "grank": "4012"
      },
      {
        "timestamp": "2025-08-12T22:39",
        "type": "_public",
        "rank": "8617",
        "followers": "64829",
        "viewers": "3",
        "gender": "f",
        "grank": "5949"
      }
    ]
  }
}
}
```

### 2. Get Live Stats (Updated Every Minute)

[(Download Example Stats Tracker)](https://www.cbhours.com/stats_tracker.zip)

This endpoint retrieves the current live status and stats for up to 50 models at a time. **Only models present in the trophy database will return live data.**

This action is for **cbhours only** and does not require the `domain` parameter.

- **URL**: `?action=get_live`
- **Method**: `GET`

### Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `action` | String | Yes | Must be set to `get_live`. |
| `usernames` | String | Yes | A comma-separated list of model usernames (e.g., `model1,model2,model3`). Maximum of 50 names. |

### Example Request

```
https://www.cbhours.com/api.php?action=get_live&usernames=model1,model2
```

### Example Success Response (Updated)

```
{
    "server_status": "up",
    "data": {
        "model1": {
            "room_status": "Online",
            "gender": "Female",
            "rank": 123,
            "grank": 45,
            "viewers": 1024,
            "followers": 54321,
            "current_show": "public",
            "room_subject": "GOAL: [304 tokens remaining] helloo lets have fun #new #ebony #pvt",
            "tags": ["new", "ebony", "pvt"],
            "is_new": false
        },
        "model2": {
            "room_status": "Offline"
        }
    }
}
```

### 3. Get Available Months

This endpoint retrieves a list of months for which a specific model has recorded data.

- **URL**: `?action=get_months`
- **Method**: `GET`

### Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `action` | String | Yes | Must be set to `get_months`. |
| `domain` | String | Yes | The site to query. Options: `cbhours`, `striphours`, `sodahours`. Case-insensitive. |
| `username` | String | Yes | The model's username (case-insensitive). |

### Example Request

```
https://www.cbhours.com/api.php?action=get_months&domain=cbhours&username=model_name
```

### Example Success Response

```
[ "2025-08", "2025-07", "2025-06" ]
```