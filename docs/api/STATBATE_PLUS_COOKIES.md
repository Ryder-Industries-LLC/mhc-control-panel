# Getting Statbate Plus Cookies for Chat Import

This guide shows how to extract the authentication cookies needed for Statbate Plus chat history import.

## What You Need

The Statbate Plus chat import feature requires two cookies from your authenticated browser session:

1. **`statbate_plus_session`** - Your session token
2. **`XSRF-TOKEN`** - CSRF protection token

## Step-by-Step Instructions

### 1. Log into Statbate Plus

1. Open your browser (Chrome, Firefox, Edge, etc.)
2. Go to https://plus.statbate.com
3. Log in with your Statbate Plus account
4. Navigate to a page with chat history (e.g., a model's chat log)

### 2. Open Developer Tools

**Chrome/Edge**:
- Press `F12` or `Ctrl+Shift+I` (Windows/Linux)
- Press `F12` or `Cmd+Option+I` (Mac)

**Firefox**:
- Press `F12` or `Ctrl+Shift+I` (Windows/Linux)
- Press `F12` or `Cmd+Option+I` (Mac)

### 3. Navigate to Cookies

1. Click the **Application** tab (Chrome/Edge) or **Storage** tab (Firefox)
2. In the left sidebar, expand **Cookies**
3. Click on **https://plus.statbate.com**

You should see a list of cookies like this:

```
Name                          Value
_cfuvid                       XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
_dd_s                         logs=1&...
statbate_plus_session         eyJpdiI6IlhYWFhYWFhYWFhYWFhYWFhY...
XSRF-TOKEN                    eyJpdiI6IlhYWFhYWFhYWFhYWFhYWFhY...
```

### 4. Copy Cookie Values

**For `statbate_plus_session`:**
1. Find the row with Name = `statbate_plus_session`
2. Click on the **Value** cell
3. It should select the entire value (usually starts with `eyJpdiI6...`)
4. Copy it (`Ctrl+C` or `Cmd+C`)

**For `XSRF-TOKEN`:**
1. Find the row with Name = `XSRF-TOKEN`
2. Click on the **Value** cell
3. Copy the entire value

### 5. Add to .env File

Open your `.env` file and paste the values:

```env
# Statbate Plus cookies
STATBATE_PLUS_SESSION_COOKIE=eyJpdiI6IlhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYPSIsInZhbHVlIjoiWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYPSIsIm1hYyI6IlhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYIn0=
STATBATE_PLUS_XSRF_TOKEN=eyJpdiI6IlhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYPSIsInZhbHVlIjoiWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYIn0=
```

## Important Notes

### You Only Need These Two Cookies

- **`_cfuvid`** - Cloudflare tracking, not needed
- **`_dd_s`** - DataDog analytics, not needed
- **`statbate_plus_session`** ✅ **REQUIRED**
- **`XSRF-TOKEN`** ✅ **REQUIRED**

### Cookie Expiration

Session cookies expire after some time (typically 1-7 days). When they expire:

1. The chat import will fail with authentication error
2. Log back into Statbate Plus
3. Extract new cookie values
4. Update your `.env` file
5. Restart the application

### Security

**⚠️ IMPORTANT**: These cookies grant full access to your Statbate Plus account!

- **Never share** these cookie values with anyone
- **Never commit** your `.env` file to git (it's in `.gitignore`)
- **Keep them secure** like you would a password
- If compromised, log out and back in to invalidate old cookies

### Testing the Cookies

To verify your cookies work, you can test them with curl:

```bash
curl 'https://plus.statbate.com/api/some-endpoint' \
  -H 'Cookie: statbate_plus_session=YOUR_SESSION_COOKIE; XSRF-TOKEN=YOUR_XSRF_TOKEN' \
  -H 'X-XSRF-TOKEN: YOUR_XSRF_TOKEN'
```

If you get a 200 response, your cookies are valid!

## Troubleshooting

### "Unauthenticated" or 401 errors

- Cookies have expired - extract new ones
- Wrong cookie values - double-check you copied the full value
- XSRF token missing from request headers

### Can't find cookies in DevTools

- Make sure you're logged into Statbate Plus
- Try refreshing the page
- Check you're looking at `https://plus.statbate.com` cookies, not a different domain

### Cookies are very long (200+ characters)

This is normal! Laravel session cookies are encrypted and encoded, making them quite long.

## Cookie Format Example

Valid cookies typically look like this:

```
statbate_plus_session:
eyJpdiI6IlhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYPSIsInZhbHVlIjoiWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYPSIsIm1hYyI6IlhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYIn0=

XSRF-TOKEN:
eyJpdiI6IlhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYPSIsInZhbHVlIjoiWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYIn0=
```

Both start with `eyJ` (base64-encoded JSON) and are URL-safe.

## Alternative: Browser Extensions

Some browser extensions can export cookies in various formats. If using one:

1. Export cookies for `plus.statbate.com`
2. Find `statbate_plus_session` and `XSRF-TOKEN`
3. Copy just the **value** field (not name, domain, etc.)

---

**Next Step**: After adding cookies to `.env`, the chat import feature will be able to authenticate with Statbate Plus to retrieve chat history.
