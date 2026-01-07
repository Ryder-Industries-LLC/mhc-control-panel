# Apps & Bots Programming Documentation

# What are apps & bots?

Apps allow users to customize the chat room experience. You can alter messages, count tips, set timers, send messages to the room, and more. With this toolset, the number of fun games that can be created for chat rooms is limitless.

Bots are a special type of app that have less functions. Each room can run one app and many bots.

# Who is qualified to write apps?

All apps are written in javascript that is executed server side. Anyone who is familiar with javascript will have no problem writing apps.

# Can I modify an existing app?

Yes! Most apps are open source. Just copy and paste the source from an app, modify it, and create your own app with it. Just remember, it’s polite to give credit if you copy someone else’s app. Viewing source code from featured apps is a great way to learn how to build your own apps.

# Help! I have a problem!

If you need help with your app code, please post your question in the thread on your app page. There, other people who use your app in testbed will be able to help you. If your question is about how to use a particular feature of the API, post the question in the respective thread on its documentation page. If you have a problem with the API itself or the backend infrastructure supporting it (for example, testbed being down), you can request help at [apps[at]chaturbate.com](mailto:apps%40chaturbate.com).

# Programming Documentation

- [Developing on the Test Bed](https://chaturbate.com/apps/docs/testbed.html)
- [API Changelog](https://chaturbate.com/apps/docs/changelog.html)
    - [Changelog](https://chaturbate.com/apps/docs/changelog.html#id1)
    - [Make a Suggestion](https://chaturbate.com/apps/docs/changelog.html#make-a-suggestion)
- [Objects](https://chaturbate.com/apps/docs/objects.html)
    - [user](https://chaturbate.com/apps/docs/objects.html#user)
    - [media](https://chaturbate.com/apps/docs/objects.html#media)
- [cb.cancelTimeout(id)](https://chaturbate.com/apps/docs/api/cb.cancelTimeout.html)
- [cb.changeRoomSubject(new_subject)](https://chaturbate.com/apps/docs/api/cb.changeRoomSubject.html)
- [cb.drawPanel()](https://chaturbate.com/apps/docs/api/cb.drawPanel.html)
- [cb.getRoomOwnerData(func)](https://chaturbate.com/apps/docs/api/cb.getRoomOwnerData.html)
- [cb.getRoomUsersData(func)](https://chaturbate.com/apps/docs/api/cb.getRoomUsersData.html)
- [cb.limitCam… Functions](https://chaturbate.com/apps/docs/api/cb.limitCam.html)
- [cb.log(message)](https://chaturbate.com/apps/docs/api/cb.log.html)
- [cb.onBroadcastStart(func)](https://chaturbate.com/apps/docs/api/cb.onBroadcastStart.html)
- [cb.onBroadcastStop(func)](https://chaturbate.com/apps/docs/api/cb.onBroadcastStop.html)
- [cb.onDrawPanel(func)](https://chaturbate.com/apps/docs/api/cb.onDrawPanel.html)
- [cb.onEnter(func)](https://chaturbate.com/apps/docs/api/cb.onEnter.html)
- [cb.onFanclubJoin(func)](https://chaturbate.com/apps/docs/api/cb.onFanclubJoin.html)
- [cb.onFollow(func)](https://chaturbate.com/apps/docs/api/cb.onFollow.html)
- [cb.onLeave(func)](https://chaturbate.com/apps/docs/api/cb.onLeave.html)
- [cb.onMediaPurchase(func)](https://chaturbate.com/apps/docs/api/cb.onMediaPurchase.html)
- [cb.onMessage(func)](https://chaturbate.com/apps/docs/api/cb.onMessage.html)
- [cb.onStart(func)](https://chaturbate.com/apps/docs/api/cb.onStart.html)
- [cb.onTip(func)](https://chaturbate.com/apps/docs/api/cb.onTip.html)
- [cb.onUnFollow(func)](https://chaturbate.com/apps/docs/api/cb.onUnFollow.html)
- [cb.room_slug](https://chaturbate.com/apps/docs/api/cb.room_slug.html)
- [cb.sendNotice(message, [to_user], [background], [foreground], [weight], [to_group])](https://chaturbate.com/apps/docs/api/cb.sendNotice.html)
- [cb.setTimeout(func, msecs)](https://chaturbate.com/apps/docs/api/cb.setTimeout.html)
- [cb.settings_choices](https://chaturbate.com/apps/docs/api/cb.settings_choices.html)
- [cb.tipOptions(func)](https://chaturbate.com/apps/docs/api/cb.tipOptions.html)
- [cbjs.arrayContains(array, object)](https://chaturbate.com/apps/docs/api/cbjs.arrayContains.html)
- [cbjs.arrayRemove(array, object)](https://chaturbate.com/apps/docs/api/cbjs.arrayRemove.html)

# Developing on the Test Bed

The testbed was set up as a place to create and try new apps. It is an isolated sandbox, with a standalone database.

Here are some advantages over developing on the main site.

- Tokens are free on the testbed. All accounts are given 100,000 tokens at signup. If you need more, just make a new account.
- All accounts are marked as verified and can receive tips.
- All accounts are marked as “online”. There is no need to broadcast your webcam.
- Only other developers will be on this site.

To use the testbed, just visit [https://testbed.cb.dev/](https://testbed.cb.dev/) and make an account. Visit [https://m.testbed.cb.dev/](https://m.testbed.cb.dev/) to test your apps on mobile.

Next, click on “Broadcast Yourself”. Don’t worry, no one on testbed will see your broadcast, even if they go into your room. On the “Apps and Bots” tab you’ll see the apps and bots exactly as a model would see them. To upload an app, first click “Choose an App” then at the top of the page you’ll see the link to “Create an App.”

# Objects

## user

- `room`: name of the room
- `user`: the user’s username
- `in_fanclub`: is the user in the broadcasters fan club
- `has_tokens`: does the user have at least 1 token
- `is_mod`: is the user a moderator
- `tipped_recently`: is the user a “dark blue”?
- `tipped_alot_recently`: is the user a “purple”?
- `tipped_tons_recently`: is the user a “dark purple”?
- `gender`: “m” (male), “f” (female), “s” (trans), or “c” (couple)

## media

- `id`: unique ID of media set
- `type`: “photos” or “video”
- `name`: name of media set
- `tokens`: how many tokens paid

# cb.cancelTimeout(id)

cancelTimeout cancels the timeout identified by id. use the id returned from cb.setTimeout to cancel timeout.

## Example Code

function callme will NOT be called in this example since it is canceled.

`function callme() {
    cb.sendNotice("hello world");
    cb.setTimeout(callme, 10000);
}
var id = cb.setTimeout(callme, 10000)
cb.cancelTimeout(id);`

# cb.changeRoomSubject(new_subject)

Changes the room subject.

# cb.drawPanel()

This function is only available to apps, not bots.

Requests that all users reload the panel (the HTML info area below the cam). The contents of the panel are controlled by [cb.onDrawPanel(func)](https://chaturbate.com/apps/docs/api/cb.onDrawPanel.html#cb-ondrawpanel).

# cb.getRoomOwnerData(func)

Get information of room owner. The `func` argument should be a function that receives 1 argument itself, `ownerData`.

The `ownerData` variable passed to the function has these fields:

- success: did the request succeed
- errorMessage: error message if success=false
- data:
    - room_status: the current status of the room (`public`, `private`, `group`, `hidden`)
    - followers: number of followers
    - show_cam_to_genders: array of genders that owner is broadcasting to [`m` (male), `f` (female), `t` (trans), `c` (couple)]
    - fanclub_cost: tokens needed for owner’s fan club membership
    - allow_private_shows: does the owner allow private shows
    - allow_private_show_recordings: does the owner allow private show recordings
    - private_show_tokens_per_minute: tokens required per minute for private show
    - private_show_minimum_minutes: minimum minutes required for private show
    - spy_on_private_show_tokens_per_minute: tokens required per minute to spy on private show
    - chat_allowed_by: type of users allowed to chat (`all`, `tip_recent`, `tip_anytime`, `tokens`)Note: `chat_allowed_by: "tokens"` are users who have used tokens.

Note: This call is executed asynchronously and the code continues to run in the background. Once the information is received, the callback code will be executed with requested data.

## Example Usage

`cb.getRoomOwnerData(ownerData => {
    if (ownerData['success']) {
        cb.sendNotice(cb.room_slug + ' has ' + ownerData['data']['followers'] + ' followers!')
    }
});`

## Example Output

`Notice: testuser has 1000 followers!`

# cb.getRoomUsersData(func)

Get information of room users. The `func` argument should be a function that receives 1 argument itself, `usersData`.

The `userData` variable passed to the function has a array of these fields:

- success: did the request succeed
- errorMessage: error message if success=false
- data:
    - room_owner: array with the name of the room owner
    - moderator: array of room moderators
    - fanclub: array of fan club members
    - dark_purple: array of users with dark purple chat color
    - light_purple: array of users with light purple chat color
    - dark_blue: array of users with dark blue chat color
    - light_blue: array of users with light blue chat color
    - grey: array of users with grey chat color

Note: This call is executed asynchronously and the code continues to run in the background. Once the information is received, the callback code will be executed with requested data.

## Example Usage

`cb.getRoomUsersData(usersData => {
    if (usersData['success']) {
        for (user of usersData['data']['fanclub']) {
            cb.sendNotice(user + ' is a fan club member!')
        }
    }
});`

## Example Output

`Notice: testuser is a fan club member!
Notice: testuser2 is a fan club member!`

# [cb.limitCam](https://chaturbate.com/apps/docs/api/cb.limitCam.html#cb-limitcam)… Functions

## cb.limitCam_start(message, [allowed_users])

Hides the cam feed from viewers and shows them a custom message. You can optionally pass in an array of usernames of whom you’d like to be able to view the cam.

## cb.limitCam_stop()

Stops the camera from being hidden from viewers, returning the broadcaster to public broadcasting.

## cb.limitCam_addUsers(allowed_users):

Add an array of usernames to allow viewing of the cam while it is hidden to others. You can use this before, during, or after you start/stop limiting the cam.

## cb.limitCam_removeUsers(removed_users):

Remove an array of usernames to no longer be able to view the cam.

## cb.limitCam_removeAllUsers():

Remove all viewers from being able to view the cam.

## cb.limitCam_userHasAccess(user):

Check if a particular username is in the list of those allowed to view the cam.

## cb.limitCam_allUsersWithAccess():

Get an array of the usernames that are allowed to view the cam.

## cb.limitCam_isRunning():

Check if the cam is viewable by those not in the allowed list.

## Example Usage

You can see an example bot that demonstrates how to use the limitCam api here: [https://chaturbate.com/apps/app_details/secret-show/](https://chaturbate.com/apps/app_details/secret-show/)

The source code is also listed here:

`cb.settings_choices = [
    {name: 'min_start_tokens', type: 'int', minValue: 1, maxValue: 1000, defaultValue: 100, label: "Cost to Join Before Show Starts"},
    {name: 'min_join_tokens', type: 'int', minValue: 0, maxValue: 1000, defaultValue: 100, label: "Cost to Join During Show. Set to 0 to Disable Joining During Show."},
    {name: 'hide_message', label: 'Cam Message', type: 'str', minLength: 1, maxLength: 256, defaultValue: 'Secret Show in progress! Tip at least 100 tokens to join in on the fun!' },
];

cb.onTip(function(tip) {
    if (!cbjs.arrayContains(cb.limitCam_allUsersWithAccess(), tip['from_user'])) {
        if(!cb.limitCam_isRunning() && parseInt(tip['amount']) >= cb.settings.min_start_tokens) {
            output('Added '+ tip['from_user'] + ' to secret show!');
            cb.limitCam_addUsers([tip['from_user']]);
        }
        if(cb.limitCam_isRunning() && parseInt(tip['amount']) >= cb.settings.min_join_tokens && cb.settings.min_join_tokens > 0) {
            output('Added '+ tip['from_user'] + ' to secret show!');
            cb.limitCam_addUsers([tip['from_user']]);
        }
    }
});

cb.onMessage(function (msg) {
    var message = msg['m'];
    var user = msg['user'];
    var username = "";

    if (cb.room_slug === user && message == '/start' && !cb.limitCam_isRunning()) {
        output(cb.room_slug + ' has started the show!');
        cb.limitCam_start(cb.settings.hide_message);
    }

    if (cb.room_slug === user && message == '/stop' && cb.limitCam_isRunning()) {
        output(cb.room_slug + ' has stopped the show!');
        cb.limitCam_stop();
    }

    if (cb.room_slug === user && message.substring(0, 7) == '/remove' && cb.limitCam_allUsersWithAccess().length > 0 && cb.limitCam_isRunning()) {
        username = message.substring(8, message.length);
        if (cbjs.arrayContains(cb.limitCam_allUsersWithAccess(), username)) {
            cb.limitCam_removeUsers([username]);
            output(cb.room_slug + ' has removed ' + username + ' from the show!');
        }
    }

    if (cb.room_slug === user && message.substring(0, 6) == '/check') {
        username = message.substring(7, message.length);
        if (cb.limitCam_userHasAccess(username)) {
            output(username + " is in the show!");
        }
        else {
            output(username + " is not in the show!");
        }
    }

    if (cb.room_slug === user && message === '/list') {
        var userlist = cb.limitCam_allUsersWithAccess();
        if (userlist.length > 0) {
            output("" + userlist.length + (userlist.length > 1 ? " users" : " user") + " in show: " + cbjs.arrayJoin(userlist, ", "));
        }
        else {
            output("No users in show.");
        }
    }

    if (message[0] == '/') {
        msg['X-Spam'] = true;
    }
    return msg;
});

function output(message) {
    cb.sendNotice(message);
}`

# cb.log(message)

Adds a debug message to the chat. These log messages are broadcast to the chat room, but you must enable debug mode to see them. Message length is limited to 48KiB. (49152 bytes)

To enable or disable debug mode, type `/debug` into chat.

## Example Usage

### App source code:

`cb.onMessage(function(msg) {
    cb.log(msg);
});`

### Output in chat:

`Debug: {u'c': u'#494949', u'm': u'hello', u'user': u'testuser',
        u'f': u'default'}`

# cb.onBroadcastStart(func)[¶](https://chaturbate.com/apps/docs/api/cb.onBroadcastStart.html#cb-onbroadcaststart-func)

Receive a notification when broadcast is started. The `func` argument should be a function that receives 1 argument itself, [user](https://chaturbate.com/apps/docs/objects.html#user).

## Example Usage

`cb.onBroadcastStart(user => {
    cb.sendNotice(user['user'] + ' started broadcasting!');
});`

## Example Output

`Notice: testuser started broadcasting!`

# cb.onBroadcastStop(func)

Receive a notification when broadcast is stopped. The `func` argument should be a function that receives 1 argument itself, [user](https://chaturbate.com/apps/docs/objects.html#user).

## Example Usage

`cb.onBroadcastStop(user => {
    cb.sendNotice(user['user'] + ' stopped broadcasting!');
});`

## Example Output

`Notice: testuser stopped broadcasting!`

# cb.onDrawPanel(func)

This function is only available to apps, not bots.

Return data needed to display the info panel for a user. The `func` argument should be a function that receives 1 argument itself, [user](https://chaturbate.com/apps/docs/objects.html#user).

The return value is a key-value set with a `template` key. Depending on the template chosen, additional keys should be passed in. For more information, see [Available Templates](https://chaturbate.com/apps/docs/api/cb.onDrawPanel.html#available-templates)

# Available Templates

These are the supported templates with examples of how to use them.

### 3_rows_of_labels

3_rows_of_labels consists of three rows of data, each row of the template includes labels and values.

![../_images/3_rows_of_labels.png](https://chaturbate.com/apps/docs/_images/3_rows_of_labels.png)

Example

`/* Layout is roughly
    {row1_label}: {row1_value}
    {row2_label}: {row2_value}
    {row3_label}: {row3_value}
*/
cb.onDrawPanel(function(user) {
    return {
        'template': '3_rows_of_labels',
        'row1_label': 'Tip Received / Goal :',
        'row1_value': '0',
        'row2_label': 'Highest Tip:',
        'row2_value': user['user'],
        'row3_label': 'Latest Tip Received:',
        'row3_value': '0'
    };
});`

### 3_rows_11_21_31

3_rows_11_21_31 consists of three rows of data, each row of the template includes only values.

![../_images/3_rows_11_21_31.png](https://chaturbate.com/apps/docs/_images/3_rows_11_21_31.png)

Example

`/* Layout is roughly
    {row1_value}
    {row2_value}
    {row3_value}
*/

cb.onDrawPanel(function(user) {
    return {
        'template': '3_rows_11_21_31',
        'row1_value': '0',
        'row2_value': user['user'],
        'row3_value': '0'
    };
});`

### 3_rows_12_21_31

3_rows_12_21_31 consists of three rows of data. The first row will includes both label and value. The second and third rows includes only values.

![../_images/3_rows_12_21_31.png](https://chaturbate.com/apps/docs/_images/3_rows_12_21_31.png)

Example

`/* Layout is roughly
    {row1_label}: {row1_value}
    {row2_value}
    {row3_value}
*/

cb.onDrawPanel(function(user) {
    return {
        'template': '3_rows_12_21_31',
        'row1_label': 'Tip Received / Goal :',
        'row1_value': '0',
        'row2_value': user['user'],
        'row3_value': '0'
    };
});`

### 3_rows_12_22_31

3_rows_12_22_31 consists of three rows of data. The first and second rows include both labelS and valueS. The third row includes only value.

![../_images/3_rows_12_22_31.png](https://chaturbate.com/apps/docs/_images/3_rows_12_22_31.png)

Example

`/* Layout is roughly
    {row1_label}: {row1_value}
    {row2_label}: {row2_value}
    {row3_value}
*/

cb.onDrawPanel(function(user) {
    return {
        'template': '3_rows_12_22_31',
        'row1_label': 'Tip Received / Goal :',
        'row1_value': '0',
        'row2_label': 'Highest Tip:',
        'row2_value': user['user'],
        'row3_value': '0'
    };
});`

### image_template

image_template offers the ability to pass a list of objects to be added to the app panel. The two types of objects are `image` add `text`. Each object is applied to the panel in the order specified by the `layers` list. The dimensions of the app panel are 270 X 69 pixels; text and images that overflow the app panel will be hidden.

image_template also offers the ability to include a customizable table. The table has three rows and each row can consist of one or two columns. The height of each row is 23px and cannot be changed. Rows that are omitted will be left blank. A limited amount of css styling can be specified in the template. The font-family and font-size of the table are not configurable, the defaults are UbuntuRegular and 11px.

![../_images/image_template_example.png](https://chaturbate.com/apps/docs/_images/image_template_example.png)

Example and Documentation

**Image**
• Required fields:
    ◦ type: ‘image’
    ◦ fileID: ID that was assigned to file during upload
• Optional fields:
    ◦ left [default=0, min=0, max=270]: number of pixels from the left of the app panel that the top, left corner of the image will be placed.
    ◦ top [default=0, min=0, max=69]: number of pixels from the top of the app panel that the top, left corner of the image will be placed.
    ◦ opacity [default=1]: specifies the opacity of image from 0.0 (fully transparent) to 1.0 (fully opaque)**Text**
• Required fields:
    ◦ type: ‘text’
• Optional fields:
    ◦ color [default=black]: color of the text.
    ◦ font-family [default=UbuntuRegular]: font-family of the text.
    ◦ font-size [default=11]: font-size of the text in pixels.
    ◦ font-style [default=normal]: font-style of the text.
    ◦ left [default=0, min=0, max=270]: number of pixels from the left of the app panel that the top, left corner of the text element will be placed.
    ◦ top [default=0, min=0, max=69]:: number of pixels from the top of the app panel that the top, left corner of the text element will be placed.
    ◦ text [default=””]: text to be displayed.
    ◦ width [max=270]: width of the text element, overflow will be hidden and ellipsis will be shown.
    ◦ max-width [max=270]: max-width of the text element, overflow will be hidden and ellipsis will be shown.**Table**
• Required fields:
    ◦ type: ‘table’
• Optional fields (order of inheritance is table, row, header/data):
    ◦ color [default=black]: color of the text for the table.
    ◦ background-color [default=None]: color of the background for the table
    ◦ text-align [default=center]: alignment of the text for the table
    ◦ font-weight [default=normal]: weight of the font for the table
    ◦ font-style [default=normal]: style of the font for the table
    ◦ width (header only) [default=135]: width of the header column in pixels**Uploading an Image File**
• Go to the `edit` tab on the app page
• Click Upload Image Files (or Manage Image Files if you have already uploaded an image)
• Select one or more files and click upload
• If upload successful you will be redirect to the file management page
• Each file will have a unique ID
• The ID should be used as the fileID in the image layer

- •
    
    Required fields:
        ◦ 
        ◦ type: ‘image’
        ◦ 
        ◦ fileID: ID that was assigned to file during upload
    
    - ◦  ◦
        
        type: ‘image’
        
    - ◦  ◦
        
        fileID: ID that was assigned to file during upload
        
- type: ‘image’
- fileID: ID that was assigned to file during upload
- •
    
    Optional fields:
        ◦ 
        ◦ left [default=0, min=0, max=270]: number of pixels from the left of the app panel that the top, left corner of the image will be placed.
        ◦ 
        ◦ top [default=0, min=0, max=69]: number of pixels from the top of the app panel that the top, left corner of the image will be placed.
        ◦ 
        ◦ opacity [default=1]: specifies the opacity of image from 0.0 (fully transparent) to 1.0 (fully opaque)
    
    - ◦  ◦
        
        left [default=0, min=0, max=270]: number of pixels from the left of the app panel that the top, left corner of the image will be placed.
        
    - ◦  ◦
        
        top [default=0, min=0, max=69]: number of pixels from the top of the app panel that the top, left corner of the image will be placed.
        
    - ◦  ◦
        
        opacity [default=1]: specifies the opacity of image from 0.0 (fully transparent) to 1.0 (fully opaque)
        
- left [default=0, min=0, max=270]: number of pixels from the left of the app panel that the top, left corner of the image will be placed.
- top [default=0, min=0, max=69]: number of pixels from the top of the app panel that the top, left corner of the image will be placed.
- opacity [default=1]: specifies the opacity of image from 0.0 (fully transparent) to 1.0 (fully opaque)
- •
    
    Required fields:
        ◦ 
        ◦ type: ‘text’
    
    - ◦  ◦
        
        type: ‘text’
        
- type: ‘text’
- •
    
    Optional fields:
        ◦ 
        ◦ color [default=black]: color of the text.
        ◦ 
        ◦ font-family [default=UbuntuRegular]: font-family of the text.
        ◦ 
        ◦ font-size [default=11]: font-size of the text in pixels.
        ◦ 
        ◦ font-style [default=normal]: font-style of the text.
        ◦ 
        ◦ left [default=0, min=0, max=270]: number of pixels from the left of the app panel that the top, left corner of the text element will be placed.
        ◦ 
        ◦ top [default=0, min=0, max=69]:: number of pixels from the top of the app panel that the top, left corner of the text element will be placed.
        ◦ 
        ◦ text [default=””]: text to be displayed.
        ◦ 
        ◦ width [max=270]: width of the text element, overflow will be hidden and ellipsis will be shown.
        ◦ 
        ◦ max-width [max=270]: max-width of the text element, overflow will be hidden and ellipsis will be shown.
    
    - ◦  ◦
        
        color [default=black]: color of the text.
        
    - ◦  ◦
        
        font-family [default=UbuntuRegular]: font-family of the text.
        
    - ◦  ◦
        
        font-size [default=11]: font-size of the text in pixels.
        
    - ◦  ◦
        
        font-style [default=normal]: font-style of the text.
        
    - ◦  ◦
        
        left [default=0, min=0, max=270]: number of pixels from the left of the app panel that the top, left corner of the text element will be placed.
        
    - ◦  ◦
        
        top [default=0, min=0, max=69]:: number of pixels from the top of the app panel that the top, left corner of the text element will be placed.
        
    - ◦  ◦
        
        text [default=””]: text to be displayed.
        
    - ◦  ◦
        
        width [max=270]: width of the text element, overflow will be hidden and ellipsis will be shown.
        
    - ◦  ◦
        
        max-width [max=270]: max-width of the text element, overflow will be hidden and ellipsis will be shown.
        
- color [default=black]: color of the text.
- font-family [default=UbuntuRegular]: font-family of the text.
- font-size [default=11]: font-size of the text in pixels.
- font-style [default=normal]: font-style of the text.
- left [default=0, min=0, max=270]: number of pixels from the left of the app panel that the top, left corner of the text element will be placed.
- top [default=0, min=0, max=69]:: number of pixels from the top of the app panel that the top, left corner of the text element will be placed.
- text [default=””]: text to be displayed.
- width [max=270]: width of the text element, overflow will be hidden and ellipsis will be shown.
- max-width [max=270]: max-width of the text element, overflow will be hidden and ellipsis will be shown.
- •
    
    Required fields:
        ◦ 
        ◦ type: ‘table’
    
    - ◦  ◦
        
        type: ‘table’
        
- type: ‘table’
- •
    
    Optional fields (order of inheritance is table, row, header/data):
        ◦ 
        ◦ color [default=black]: color of the text for the table.
        ◦ 
        ◦ background-color [default=None]: color of the background for the table
        ◦ 
        ◦ text-align [default=center]: alignment of the text for the table
        ◦ 
        ◦ font-weight [default=normal]: weight of the font for the table
        ◦ 
        ◦ font-style [default=normal]: style of the font for the table
        ◦ 
        ◦ width (header only) [default=135]: width of the header column in pixels
    
    - ◦  ◦
        
        color [default=black]: color of the text for the table.
        
    - ◦  ◦
        
        background-color [default=None]: color of the background for the table
        
    - ◦  ◦
        
        text-align [default=center]: alignment of the text for the table
        
    - ◦  ◦
        
        font-weight [default=normal]: weight of the font for the table
        
    - ◦  ◦
        
        font-style [default=normal]: style of the font for the table
        
    - ◦  ◦
        
        width (header only) [default=135]: width of the header column in pixels
        
- color [default=black]: color of the text for the table.
- background-color [default=None]: color of the background for the table
- text-align [default=center]: alignment of the text for the table
- font-weight [default=normal]: weight of the font for the table
- font-style [default=normal]: style of the font for the table
- width (header only) [default=135]: width of the header column in pixels
- •
    
    Go to the `edit` tab on the app page
    
- •
    
    Click Upload Image Files (or Manage Image Files if you have already uploaded an image)
    
- •
    
    Select one or more files and click upload
    
- •
    
    If upload successful you will be redirect to the file management page
    
- •
    
    Each file will have a unique ID
    
- •
    
    The ID should be used as the fileID in the image layer
    

Image for example code [**`background_image.jpg`**](https://chaturbate.com/apps/docs/_downloads/f690e3ec9ad585574a13c7aa53837b20/background_image.jpg)

[**`background_image.jpg`**](https://chaturbate.com/apps/docs/_downloads/f690e3ec9ad585574a13c7aa53837b20/background_image.jpg)

`var backgroundImage = '05b83220-1ccc-4871-9333-70f97488de00';
var tipsReceived = 3545;
var highestTip = 'tipDaddy 135';
var lastTipReceived = 'big_tipper 25';
var fontSize = 11;

cb.onDrawPanel(function(user) {
  return {
      "template": "image_template",
      "layers": [
          {'type': 'image', 'fileID': backgroundImage},
          {
              'type': 'text',
              'text': 'TIPS RECEIVED',
              'top': 5,
              'left': 61,
              'font-size': fontSize,
              'color': 'orange',
          },
                    {
              'type': 'text',
              'text': 'HIGHEST TIP',
              'top': 29,
              'left': 73,
              'font-size': fontSize,
              'color': 'orange',
          },
          {
              'type': 'text',
              'text': 'LATEST TIP RECEIVED',
              'top': 52,
              'left': 28,
              'font-size': fontSize,
              'color': 'orange',
          },
          {
              'type': 'text',
              'text': tipsReceived,
              'top': 5,
              'left': 147,
              'font-size': fontSize,
              'color': 'white',
          },
          {
              'type': 'text',
              'text': highestTip,
              'top': 29,
              'left': 147,
              'font-size': fontSize,
              'color': 'white',
          },
          {
              'type': 'text',
              'text': lastTipReceived,
              'top': 51,
              'left': 147,
              'font-size': fontSize,
              'color': 'white',
          },
      ],
    };
});
cb.drawPanel();`

# Additional templates

If nothing here works for you, please email support and request an additional template to suit your needs. Let us know what you’re looking for and we’ll try to accommodate you.

# cb.onEnter(func)

Receive a notification when a registered member enters the room. The `func` argument should be a function that receives 1 argument itself, [user](https://chaturbate.com/apps/docs/objects.html#user).

## Example Usage

`cb.onEnter(function(user) {
    cb.sendNotice('Welcome ' + user['user'] + '!');
});`

## Example Output

`Notice: Welcome testuser!
Notice: {u'user': u'testuser', u'in_fanclub': False,
         u'has_tokens': False, u'is_mod': False,
         u'gender': u'm', u'tipped_recently': True}`

# cb.onFanclubJoin(func)[¶](https://chaturbate.com/apps/docs/api/cb.onFanclubJoin.html#cb-onfanclubjoin-func)

Receive a notification when a registered member joins the room’s fan club. The `func` argument should be a function that receives 1 argument itself, [user](https://chaturbate.com/apps/docs/objects.html#user).

## Example Usage

`cb.onFanclubJoin(user => {
    cb.sendNotice(user['user'] + ' has joined my fan club!');
});`

## Example Output

`Notice: testuser has joined my fan club!`

# cb.onFollow(func)

Receive a notification when a registered member follows the room. The `func` argument should be a function that receives 1 argument itself, [user](https://chaturbate.com/apps/docs/objects.html#user).

Note: In the case that you use this feature to send a message to the chat room, please keep in mind that users could follow and unfollow over and over. Your app should then throttle its output to avoid flooding the room with follow notices.

## Example Usage

`cb.onFollow(user => {
    cb.sendNotice(user['user'] + ' is my new follower!');
});`

## Example Output

`Notice: testuser is my new follower!`

# cb.onLeave(func)

Receive a notification when a registered member leaves the room. The `func` argument should be a function that receives 1 argument itself, [user](https://chaturbate.com/apps/docs/objects.html#user).

## Example Usage

`cb.onLeave(function(user) {
    cb.sendNotice('Bye ' + user['user'] + '!');
});`

## Example Output

`Notice: Bye testuser!
Notice: {u'user': u'testuser', u'in_fanclub': False,
         u'has_tokens': False, u'is_mod': False,
         u'gender': u'm', u'tipped_recently': True}`

# cb.onMediaPurchase(func)

Receive a notification when a registered member purchases media from the broadcaster. The `func` argument should be a function that receives 2 arguments, [user](https://chaturbate.com/apps/docs/objects.html#user) and [media](https://chaturbate.com/apps/docs/objects.html#media).

## Example Usage

`cb.onMediaPurchase((user, media) => {
    cb.sendNotice(`${user.user} has purchased media ${media.name}`);
});`

## Example Output

`Notice: testuser has purchased media testphotos!`

# cb.onMessage(func)

Receive a notification when a message is sent. The `func` argument should be a function that receives 1 argument itself, `message`.

Your app can manipulate the message.

You must return the original message object.

The message variable passed to the function has these fields:

- c: message color
- m: the message text
- user: username of message sender
- f: message font
- in_fanclub: is the user in the broadcasters fan club
- has_tokens: does the user have at least 1 token
- is_mod: is the user a moderator
- tipped_recently: is the user a “dark blue”?
- tipped_alot_recently: is the user a “purple”?
- tipped_tons_recently: is the user a “dark purple”?
- gender: “m” (male), “f” (female), “s” (trans), or “c” (couple)

### Example Usage

`cb.onMessage(function (message) {
    cb.sendNotice(message);
});`

### Example Output

`Notice: {u'c': u'#494949', u'm': u'hello', u'user': u'testuser',
         u'f': u'default',  u'in_fanclub': False, u'has_tokens': False,
         u'is_mod': False, u'gender': u'm', u'tipped_recently': True}`

## Changing the background color of a message

`cb.onMessage(function (msg) {
    msg['background'] = '#9F9';
    return msg;
});`

## Hiding a message from chat

Accomplished by setting the ‘X-Spam’ attribute on the message.

`cb.onMessage(function (msg) {
    if (msg['m'] == '/stats') {
        msg['X-Spam'] = true;
    }
    return msg;
});`

# cb.onStart(func)

Receive a notification when an app has started. The `func` argument should be a function that receives 1 argument itself, [user](https://chaturbate.com/apps/docs/objects.html#user).

## Example Usage

`cb.onStart(user => {
    cb.sendNotice(user['user'] + ' started an app!');
});`

## Example Output

`Notice: testuser started an app!`

# cb.onTip(func)

Receive a notification when a tip is sent. The `func` argument should be a function that receives 1 argument itself, `tip`.

These fields are available:

- amount: amount of tip
- message: message in tip
- is_anon_tip: is this tip sent anonymously
- to_user: user who received tip
- from_user: user who sent tip
- from_user_in_fanclub: is the user in the broadcasters fan club
- from_user_has_tokens: does the user have at least 1 token
- from_user_is_mod: is the user a moderator
- from_user_tipped_recently: is the user a “dark blue”?
- from_user_tipped_alot_recently: is the user a “purple”?
- from_user_tipped_tons_recently: is the user a “dark purple”?
- from_user_gender: “m” (male), “f” (female), “s” (trans), or “c” (couple)

## Example Usage

`var total_tipped = 0;
cb.onTip(function (tip) {
    total_tipped += parseInt(tip['amount'])
    cb.sendNotice("Total Tipped: " + total_tipped);
    cb.sendNotice(tip);
});`

## Example Output

`Notice: Total Tipped: 5
Notice: {u'to_user': u'testuser', u'amount': 5, u'message': u'',
         u'from_user': u'testuser2', u'from_user_in_fanclub': False,
         u'from_user_has_tokens': False, u'from_user_is_mod': False,
         u'from_user_gender': u'm', u'from_user_tipped_recently': True,
         u'is_anon_tip': True }`

# cb.onUnFollow(func)

Receive a notification when a followed member stops following the room. The `func` argument should be a function that receives 1 argument itself, [user](https://chaturbate.com/apps/docs/objects.html#user).

Note: In the case that you use this feature to send a message to the chat room, please keep in mind that users could follow and unfollow over and over. Your app should then throttle its output to avoid flooding the room with follow notices.

## Example Usage

`cb.onUnFollow(user => {
    cb.sendNotice(user['user'] + ' has stopped following!');
});`

## Example Output

`Notice: testuser has stopped following!`

# cb.room_slug

A variable that contains the name of the current room.

This can be used to determine if a message is being sent by the broadcaster.

`if (msg['user'] == cb.room_slug) {
    cb.sendNotice("Message sent by broadcaster")
}`

# cb.sendNotice(message, [to_user], [background], [foreground], [weight], [to_group])

Send a message to the room. If `to_user` is given, the message will only be seen by that user. You can also use the optional params `background`, `foreground`, and `weight` to style your message. Only HTML color codes (such as `#FF0000`) may be given for the color stying, and the font weight will only accept the options `normal`, `bold`, or `bolder`. If you want to provide styling options, but not a `to_user`, just pass an empty string to `to_user`.

Text sent in your `message` will be truncated if it exceeds the maximum length limitation of 48KiB. (49152 bytes)

You can use a `\n` inside the message to send a multi-line notice.

You may use `:emoticons` in the notice.

You can send a message to a certain category of users with the optional `to_group` param. Just provide the color of which class of users you would like the message to be sent to. Valid choices are `red` (moderators), `green` (fan club members), `darkblue` (users who have tipped 50 recently), `lightpurple` (users who have tipped 250 recently), `darkpurple` (users who have tipped 1000 recently), and `lightblue` (users who own or have purchased tokens). Keep in mind that many users will have multiple categories applied to them, for example a fan club member who is also a moderator will get messages sent with `red` and `green`, even though their name only shows in red in chat. Using `to_group` will always override `to_user`.

# cb.setTimeout(func, msecs)

calls function func after timeout of msecs. It returns an id which can be used to cancel the timeout.

## Example Code

This example will print “hello world” in the chat every 10 seconds.

`function callme() {
    cb.sendNotice("hello world");
    cb.setTimeout(callme, 10000)
}
cb.setTimeout(callme, 10000)`

# cb.settings_choices

Set this variable in order to have a form filled out by the broadcaster before the app is launched.

## Example Usage

`cb.settings_choices = [
    {name:'tokens_per_minute_to_be_king', type:'int',
        minValue:1, maxValue:99, defaultValue:5, label: "Tokens per Minute"},
    {name:'remove_king_when', type:'choice',
        choice1:'someone else outbids',
        choice2:'score decays to 0', defaultValue:'someone else outbids'}
];`

## Accessing the initialized variables[¶](https://chaturbate.com/apps/docs/api/cb.settings_choices.html#accessing-the-initialized-variables)

For each `name` in `cb.settings_choices`, there will be a value loaded in `cb.settings`. For the example above, there will be a `cb.settings.remove_king_when` variable.

## Field Types

### int

`{name:'somefield', type:'int', minValue:1, maxValue:99},`

### str

`{name: 'somefield', type: 'str', minLength: 1, maxLength: 255}`

### choice

`{name:'remove_king_when', type:'choice',
    choice1:'foo',
    choice2:'bar', defaultValue: 'foo'}`

You may add as many choices as needed. The next choice would be choice3, followed by choice4, etc.

## Optional fields

All fields accept a `required: false` parameter which makes them become optional.

All fields accept a `label: "Some String"` field. This will be the display name for the field as shown in the final rendered form.

## Default values

All fields accept a `defaultValue:` parameter.

# cb.tipOptions(func)

This function is only available to apps and bots.

When users send a tip, present them with a list of messages to send with their tip. These messages can be received and processed later by [cb.onTip(func)](https://chaturbate.com/apps/docs/api/cb.onTip.html#cb-ontip).

## Example Code

`cb.tipOptions(function(user) {
    return {options:[{label: 'choice1'}, {label: 'choice2'},  {label: 'choice3'}],
            label:"Select a choice:"};
});`

When a tip is received, the object will look like this:

`{u'to_user': u'testuser', u'amount': 5, u'message': u'choice1',
         u'from_user': u'testuser2'}`

## Disabling tip options

If you no longer wish to display custom tip options and would prefer the user type their own message, simply return nothing.

`cb.tipOptions(function(user) {
    // If we determine we want to show no custom tip options, do this . . .
    return;
});`

# cbjs.arrayContains(array, object)

Returns true if `array` contains at least once instance of `object`.

# cbjs.arrayRemove(array, object)

Removes all instances of `object` from `array` and returns the new array.

```
.. _Developing on the Test Bed:

==========================
Developing on the Test Bed
==========================

The testbed was set up as a place to create and try new apps. It is an isolated sandbox, with a standalone database.

Here are some advantages over developing on the main site.

* Tokens are free on the testbed. All accounts are given 100,000 tokens at signup. If you need more, just make a new account.
* All accounts are marked as verified and can receive tips.
* All accounts are marked as "online". There is no need to broadcast your webcam.
* Only other developers will be on this site.

To use the testbed, just visit https://testbed.cb.dev/ and make an account. Visit https://m.testbed.cb.dev/ to test your apps on mobile.

Next, click on "Broadcast Yourself". Donâ€™t worry, no one on testbed will see your broadcast, even if they go into your room. On the "Apps and Bots" tab youâ€™ll see the apps and bots exactly as a model would see them. To upload an app, first click "Choose an App" then at the top of the page youâ€™ll see the link to "Create an App."
```

For information on developing apps and bots, please visit the [developer documentation](https://chaturbate.com/apps/docs/index.html).

Non-working apps will be deleted from the live site.

Name:Type:   App    Bot  Summary:Description:Javascript:Hide javascript:[ ]  Hide the javascript of your app from public access