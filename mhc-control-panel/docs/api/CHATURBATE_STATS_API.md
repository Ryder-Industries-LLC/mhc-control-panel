# API - User statistics

In order to access a users statistics the user must first generate a token at (https://chaturbate.com/statsapi/authtoken/)

Submit GET request to (https://chaturbate.com/statsapi/) with the username and token. A json encoded response will be returned. The data is refreshed once every 5 minutes.

# Required request parameters

- username: the username of the user
- token: the 24 character long token provided by the user

## Example request 

(https://chaturbate.com/statsapi/?username=example_username&token=example_token)

# Response data

- username: the username of the user
- token_balance: current token balance of the user
- tips_in_last_hour: number of tips received in the past hour
- votes_up: total number of thumbs up in the past 90 days
- votes_down: total number of thumbs down in the past 90 days
- satisfaction_score: percentage thumbsup vs thumbsdown
- last_broadcast: the last time the user was seen broadcasting in datetime isoformat, if the user has never broadcasted returns -1
- time_online: how long the user has been broadcasting, in minutes. If the user is not broadcasting returns -1
- num_followers: current number of followers of the user
- num_viewers: the total number of users currently in the broadcaster's room
- num_registered_viewers: number of users with accounts in the broadcaster's room
