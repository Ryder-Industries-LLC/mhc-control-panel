# Webhook Help

## What are Webhooks?

Webhooks allow you to receive real-time notifications when specific events happen on cam sites. They work by sending HTTP POST requests to a URL you specify whenever a trigger event occurs.

## How Webhooks Work

Webhooks function as automated messengers that deliver event data to your applications:

1. You create a webhook and specify a URL where you want to receive notifications
2. You select which events should trigger the webhook (e.g., when a model receives a tip)
3. When that event occurs, our system automatically sends a POST request to your URL
4. Your application receives this data and can process it however you need

## Common Use Cases

Webhooks can be used for many purposes, including:

- Sending notifications to your phone or email when a favorite model goes online
- Triggering custom alerts when a model receives tips
- Integrating with other services like Discord, Telegram, or Slack
- Collecting data for your own analytics
- Automating actions in your own applications

## Technical Requirements

To use webhooks effectively:

- You need a publicly accessible URL that can receive POST requests
- Your endpoint should respond with a 200 status code to acknowledge receipt
- The URL should be a service you control, not a cam site URL
- Popular services for webhook testing: [webhook.site](https://webhook.site/), [pipedream.com](https://pipedream.com/)

## Webhook Payload Example

When a webhook is triggered, it sends a JSON payload similar to this:

``` node.js
// For model.tip event:
{
  "site": "Chaturbate",
  "room": "model_name",
  "member": "username",
  "body": "Thank you for the tip!",
  "amount": 50,
  "is_first_tip": false
}

// For member.first_tip event:
{
  "site": "Chaturbate",
  "room": "model_name",
  "member": "username",
  "body": "Thank you for the tip!",
  "amount": 50,
  "is_first_tip": true
}
```

## Important Note

Webhook URLs should point to your own server or a webhook service you control. Do not enter cam site URLs (chaturbate.com, myfreecams.com, etc.) as they cannot receive webhook data.
