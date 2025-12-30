# Events API documentation

## What is Events API

Events API allows users to receive notifications about events like chat messages, private messages, tips, etc. Any programming language can be used to connect to this API from a 3rd party server.

## Authorization

Events API access is controlled by [tokens](https://chaturbate.com/statsapi/authtoken/). You can create multiple access tokens and delete them to remove access.

Make sure to select `Events API` scope to gain access to this API.

After deleting a token, please wait up to one minute for API access to get revoked.

## Warning

With these credentials, participating third party services can connect features and services for your room, such as toy controls. Please only provide your access token to services that you trust, as it does grant access to tip information and private messages.

## How to use it

Connect to the [longpoll JSON event feed](https://chaturbate.com/apps/api/docs/rest.html#rest)

## Method Types

- [broadcastStart](https://chaturbate.com/apps/api/docs/methods/broadcastStart.html)
- [broadcastStop](https://chaturbate.com/apps/api/docs/methods/broadcastStop.html)
- [chatMessage](https://chaturbate.com/apps/api/docs/methods/chatMessage.html)
- [fanclubJoin](https://chaturbate.com/apps/api/docs/methods/fanclubJoin.html)
- [follow](https://chaturbate.com/apps/api/docs/methods/follow.html)
- [mediaPurchase](https://chaturbate.com/apps/api/docs/methods/mediaPurchase.html)
- [privateMessage](https://chaturbate.com/apps/api/docs/methods/privateMessage.html)
- [roomSubjectChange](https://chaturbate.com/apps/api/docs/methods/roomSubjectChange.html)
- [tip](https://chaturbate.com/apps/api/docs/methods/tip.html)
- [unfollow](https://chaturbate.com/apps/api/docs/methods/unfollow.html)
- [userEnter](https://chaturbate.com/apps/api/docs/methods/userEnter.html)
- [userLeave](https://chaturbate.com/apps/api/docs/methods/userLeave.html)

## Object Types

- [Objects](https://chaturbate.com/apps/api/docs/objects.html)
    -- [broadcaster](https://chaturbate.com/apps/api/docs/objects.html#broadcaster)
    -- [media](https://chaturbate.com/apps/api/docs/objects.html#media)
    -- [message](https://chaturbate.com/apps/api/docs/objects.html#message)
    -- [subject](https://chaturbate.com/apps/api/docs/objects.html#subject)
    -- [tip](https://chaturbate.com/apps/api/docs/objects.html#tip)
    -- [user](https://chaturbate.com/apps/api/docs/objects.html#user)
