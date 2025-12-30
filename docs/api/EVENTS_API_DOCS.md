# Events API documentation

# What is Events API

Events API allows users to receive notifications about events like chat messages, private messages, tips, etc. Any programming language can be used to connect to this API from a 3rd party server.

# Authorization

Events API access is controlled by [tokens](https://chaturbate.com/statsapi/authtoken/). You can create multiple access tokens and delete them to remove access.

Make sure to select `Events API` scope to gain access to this API.

After deleting a token, please wait up to one minute for API access to get revoked.

# Warning

With these credentials, participating third party services can connect features and services for your room, such as toy controls. Please only provide your access token to services that you trust, as it does grant access to tip information and private messages.

# How to use it

Connect to the [longpoll JSON event feed](https://chaturbate.com/apps/api/docs/rest.html#rest)

# Method Types[¶](https://chaturbate.com/apps/api/docs/index.html#method-types)

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

# Object Types

- [Objects](https://chaturbate.com/apps/api/docs/objects.html)
    - [broadcaster](https://chaturbate.com/apps/api/docs/objects.html#broadcaster)
    - [media](https://chaturbate.com/apps/api/docs/objects.html#media)
    - [message](https://chaturbate.com/apps/api/docs/objects.html#message)
    - [subject](https://chaturbate.com/apps/api/docs/objects.html#subject)
    - [tip](https://chaturbate.com/apps/api/docs/objects.html#tip)
    - [user](https://chaturbate.com/apps/api/docs/objects.html#user)

[Changelog](https://chaturbate.com/apps/api/docs/changelog.html#changelog)

©2011-2021 chaturbate.com. | [Page source](https://chaturbate.com/apps/api/docs/_sources/index.rst.txt)

# broadcastStart

Receive a notification broadcaster has started broadcasting.

Includes [broadcaster](https://chaturbate.com/apps/api/docs/objects.html#broadcaster) and [user](https://chaturbate.com/apps/api/docs/objects.html#user) objects.

# Example Output

`{
  **"broadcaster"**: "testuser",
  **"user"**: {
    **"username"**: "testuser",
    **"inFanclub"**: **false**,
    **"gender"**: "m",
    **"hasTokens"**: **true**,
    **"recentTips"**: "none",
    **"isMod"**: **false**}
}`

©2011-2021 chaturbate.com. | [Page source](https://chaturbate.com/apps/api/docs/_sources/methods/broadcastStart.rst.txt)

# broadcastStop

Receive a notification broadcaster has stopped broadcasting.

Includes [broadcaster](https://chaturbate.com/apps/api/docs/objects.html#broadcaster) and [user](https://chaturbate.com/apps/api/docs/objects.html#user) objects.

# Example Output

`{
  **"broadcaster"**: "testuser",
  **"user"**: {
    **"username"**: "testuser",
    **"inFanclub"**: **false**,
    **"gender"**: "m",
    **"hasTokens"**: **true**,
    **"recentTips"**: "none",
    **"isMod"**: **false**}
}`

©2011-2021 chaturbate.com. | [Page source](https://chaturbate.com/apps/api/docs/_sources/methods/broadcastStop.rst.txt)

# chatMessage

Receive a notification when a message is sent.

Includes [message](https://chaturbate.com/apps/api/docs/objects.html#message), [broadcaster](https://chaturbate.com/apps/api/docs/objects.html#broadcaster), and [user](https://chaturbate.com/apps/api/docs/objects.html#user) objects.

# Note

There is a separate notification for [private chat message](https://chaturbate.com/apps/api/docs/methods/privateMessage.html#privatemessage).

# Example Output

`{
    **"message"**: {
      **"color"**: "#494949",
      **"bgColor"**: **null**,
      **"message"**: "hello",
      **"font"**: "default",
    },
    **"broadcaster"**: "testuser",
    **"user"**: {
      **"username"**: "testuser1",
      **"inFanclub"**: **false**,
      **"gender"**: "m",
      **"hasTokens"**: **true**,
      **"recentTips"**: "none",
      **"isMod"**: **false**}
}`

©2011-2021 chaturbate.com. | [Page source](https://chaturbate.com/apps/api/docs/_sources/methods/chatMessage.rst.txt)

# fanclubJoin

Receive a notification when a user has joined the fan club.

Includes [broadcaster](https://chaturbate.com/apps/api/docs/objects.html#broadcaster) and [user](https://chaturbate.com/apps/api/docs/objects.html#user) objects.

# Example Output

`{
  **"broadcaster"**: "testuser",
  **"user"**: {
    **"username"**: "testuser1",
    **"inFanclub"**: **true**,
    **"gender"**: "m",
    **"hasTokens"**: **true**,
    **"recentTips"**: "none",
    **"isMod"**: **false**}
}`

©2011-2021 chaturbate.com. | [Page source](https://chaturbate.com/apps/api/docs/_sources/methods/fanclubJoin.rst.txt)

# follow

Receive a notification when a user has followed.

Includes [broadcaster](https://chaturbate.com/apps/api/docs/objects.html#broadcaster) and [user](https://chaturbate.com/apps/api/docs/objects.html#user) objects.

# Example Output

`{
  **"broadcaster"**: "testuser",
  **"user"**: {
    **"username"**: "testuser1",
    **"inFanclub"**: **false**,
    **"gender"**: "m",
    **"hasTokens"**: **true**,
    **"recentTips"**: "none",
    **"isMod"**: **false**}
}`

©2011-2021 chaturbate.com. | [Page source](https://chaturbate.com/apps/api/docs/_sources/methods/follow.rst.txt)

# mediaPurchase

Receive a notification when a user purchased photos or videos.

Includes [broadcaster](https://chaturbate.com/apps/api/docs/objects.html#broadcaster), [user](https://chaturbate.com/apps/api/docs/objects.html#user), and [media](https://chaturbate.com/apps/api/docs/objects.html#media) objects.

# Example Output

`{
  **"broadcaster"**: "testuser",
  **"user"**: {
    **"username"**: "testuser1",
    **"inFanclub"**: **false**,
    **"gender"**: "m",
    **"hasTokens"**: **true**,
    **"recentTips"**: "none",
    **"isMod"**: **false**},
  **"media"**: {
    **"id"**: 1,
    **"name"**: "photoset1",
    **"type"**: "photos",
    **"tokens"**: 25
  }
}`

©2011-2021 chaturbate.com. | [Page source](https://chaturbate.com/apps/api/docs/_sources/methods/mediaPurchase.rst.txt)

# privateMessage

Receive a notification when a private message is sent or received.

Includes [message](https://chaturbate.com/apps/api/docs/objects.html#message), [broadcaster](https://chaturbate.com/apps/api/docs/objects.html#broadcaster), and [user](https://chaturbate.com/apps/api/docs/objects.html#user) objects.

# Note

There is a separate notification for [public chat messages](https://chaturbate.com/apps/api/docs/methods/chatMessage.html#chatmessage).

# Example Output

`{
  **"message"**: {
    **"color"**: "",
    **"toUser"**: "testuser",
    **"bgColor"**: **null**,
    **"fromUser"**: "testuser1",
    **"message"**: "hello",
    **"font"**: "default",
  },
  **"broadcaster"**: "testuser",
  **"user"**: {
    **"username"**: "testuser1",
    **"inFanclub"**: **false**,
    **"gender"**: "m",
    **"hasTokens"**: **true**,
    **"recentTips"**: "none",
    **"isMod"**: **false**}
}`

©2011-2021 chaturbate.com. | [Page source](https://chaturbate.com/apps/api/docs/_sources/methods/privateMessage.rst.txt)

# roomSubjectChange

Receive a notification when broadcaster changed room subject.

Includes [broadcaster](https://chaturbate.com/apps/api/docs/objects.html#broadcaster) and [subject](https://chaturbate.com/apps/api/docs/objects.html#subject) objects.

# Example Output

`{
  **"broadcaster"**: "testuser",
  **"subject"**: "Testuser's room"
}`

©2011-2021 chaturbate.com. | [Page source](https://chaturbate.com/apps/api/docs/_sources/methods/roomSubjectChange.rst.txt)

# tip

Receive a notification when a user sent a tip.

Includes [broadcaster](https://chaturbate.com/apps/api/docs/objects.html#broadcaster), [tip](https://chaturbate.com/apps/api/docs/objects.html#tip), and [user](https://chaturbate.com/apps/api/docs/objects.html#user) objects.

# Example Output

`{
  **"broadcaster"**: "testuser",
  **"tip"**: {
    **"tokens"**: 25,
    **"isAnon"**: **false**,
    **"message"**: ""
  },
  **"user"**: {
    **"username"**: "testuser1",
    **"inFanclub"**: **false**,
    **"gender"**: "f",
    **"hasTokens"**: **true**,
    **"recentTips"**: "some",
    **"isMod"**: **false**}
}`

©2011-2021 chaturbate.com. | [Page source](https://chaturbate.com/apps/api/docs/_sources/methods/tip.rst.txt)

# unfollow

Receive a notification when a user has unfollowed.

Includes [broadcaster](https://chaturbate.com/apps/api/docs/objects.html#broadcaster) and [user](https://chaturbate.com/apps/api/docs/objects.html#user) objects.

# Example Output

`{
  **"broadcaster"**: "testuser",
  **"user"**: {
    **"username"**: "testuser1",
    **"inFanclub"**: **false**,
    **"gender"**: "m",
    **"hasTokens"**: **true**,
    **"recentTips"**: "none",
    **"isMod"**: **false**}
}`

©2011-2021 chaturbate.com. | [Page source](https://chaturbate.com/apps/api/docs/_sources/methods/unfollow.rst.txt)

# userEnter

Receive a notification when a user enters the room.

Includes [broadcaster](https://chaturbate.com/apps/api/docs/objects.html#broadcaster) and [user](https://chaturbate.com/apps/api/docs/objects.html#user) objects.

# Example Output

`{
  **"broadcaster"**: "testuser",
  **"user"**: {
    **"username"**: "testuser1",
    **"inFanclub"**: **false**,
    **"gender"**: "m",
    **"hasTokens"**: **true**,
    **"recentTips"**: "none",
    **"isMod"**: **false**}
}`

# userLeave[¶](https://chaturbate.com/apps/api/docs/methods/userLeave.html#userleave)

Receive a notification when a user leaves a room.

Includes [broadcaster](https://chaturbate.com/apps/api/docs/objects.html#broadcaster) and [user](https://chaturbate.com/apps/api/docs/objects.html#user) objects.

# Example Output

`{
  **"broadcaster"**: "testuser",
  **"user"**: {
    **"username"**: "testuser1",
    **"inFanclub"**: **false**,
    **"gender"**: "m",
    **"hasTokens"**: **true**,
    **"recentTips"**: "none",
    **"isMod"**: **false**}
}`

# Objects

# broadcaster

type: `string`

name of the broadcaster

# media

type: `object`

- (`number`) `id`: unique ID of media set
- (`string`) `type`: “photos” or “video”
- (`string`) `name`: name of media set
- (`number`) `tokens`: how many tokens paid

# message

type: `object`

- (`string`) `color`: color of message
- (`string` or `null`) `bgColor`: background color of message
- (`string`) `message`: message
- (`string`) `font`: font of message
- (`string`) `fromUser`: username who sent message (**Private Messages only**)
- (`string`) `toUser`: username who received message (**Private Messages only**)

# subject

type: `string`

the room title

# tip

type: `object`

- (`number`) `tokens`: number of tokens tipped
- (`bool`) `isAnon`: did user tip anonymously?
- (`string`) `message`: tip message

# user

type: `object`

- (`string`) `user`: the user’s username
- (`bool`) `inFanclub`: is the user in the broadcasters fan club
- (`bool`) `hasTokens`: does the user have at least 1 token
- (`bool`) `isMod`: is the user a moderator
- (`string`) `recentTips`: “none” (grey), “some” (dark blue), “lots” (light purple), or “tons” (dark purple)
- (`string`) `gender`: “m” (male), “f” (female), “t” (trans), or “c” (couple)
- (`string`) `subgender`: “” (non-trans), “tf” (transfemme), “tm” (transmasc), or “tn” (non-binary)

Be aware that U.S. Patent 9,762,515 pertains to tip-based vibrations for adult toys. Chaturbate’s terms of service prohibit any use that infringes any third-party intellectual property.

# Longpoll JSON event feed

Steps:

1. Load the room event feed `https://eventsapi.chaturbate.com/events/:username/:token/` (displayed on user’s settings page on CB)
2. You will receive a list of all latest events plus .
    
    nextUrl
    
3. Use  to load the next set of events, and continue like this for as long as you want.
    
    nextUrl
    

Optional query parameter

- timeout: The server will wait at most this long before returning results. If a timeout is not set, the  will default to a 10 second timeout
    
    nextUrl
    
    - example: `https://eventsapi.chaturbate.com/events/:username/:token/?timeout=0`
    - default: 10
    - min: 0
    - max: 90

Example code

# Note

The rate limit for the API is 2000 requests per minute.

# Example Response

The response is a json encoded string that needs to be deserialized.

`{
  "events": [
    {
        "method": "chatMessage",
        "id": "1625274862454-0",
        "object": {...}
    }
  ],
  "nextUrl": "https://eventsapi.chaturbate.com/events/testuser/************************/?i=1625274862454-0&timeout=10",
}`

- `events`: an array that may contain zero or more items
- `nextUrl`: the URL you should extract and load to listen for subsequent events

`id` refers to the unique ID of an event.

`object` field varies depending on `method`, please check [Method Types](https://chaturbate.com/apps/api/docs/index.html#method-types).