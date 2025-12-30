# API Documentation

## Authentication

All API requests must include your API token in the Authorization header:

- Authorization: Bearer YOUR_API_TOKEN

## WebSocket API

### WebSocket Connection Documentation

#### Connection Details

Connect to our WebSocket server to receive real-time updates:

- wss://statbate.com/ws/?api_key=API_KEY

#### Channel Subscription

After connecting, you must send an initial message to subscribe to a channel:

```{"chanel":"chaturbate"}```

##### Available Channels

- chaturbate
- bongacams
- stripchat
- camsoda
- mfc
  
#### Example Messages

Here are examples of messages you'll receive:

##### Tip sent (50+ tokens tips)

```{"amount":100,"chanel":"chaturbate","donator":"memberUsername","room":"modelName"}```

##### Tracked rooms

```{"chanel":"chaturbate","count":4536}```

##### Tips per hour in thousand dollars

```{"chanel":"chaturbate","index":12.425269899359563}```
