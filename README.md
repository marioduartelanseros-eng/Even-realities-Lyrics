# 🎵 LyricLens

### Real-time synced lyrics on your Even Realities G2 smart glasses

## 📱 Deploy & Test on G2 Glasses

### Production QR Code

**✅ No regeneration needed** - The OAuth redirect URI fix was made in the code, not the URL.

GitHub Pages URL for this repo is:
`https://marioduartelanseros-eng.github.io/Even-realities-Lyrics/`

Open directly in Even Hub:
https://marioduartelanseros-eng.github.io/Even-realities-Lyrics/

<p align="left">
  <a href="https://marioduartelanseros-eng.github.io/Even-realities-Lyrics/">
    <img
      src="https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=https%3A%2F%2Fmarioduartelanseros-eng.github.io%2FEven-realities-Lyrics%2F"
      alt="Even hub testing QR code"
    />
  </a>
</p>

### 🕶️ Testing on Your G2 Glasses

**The QR code does NOT need to be regenerated after the authentication fix.** The fix was in the code itself (dynamic redirect URI handling), not the deployment URL.

#### Option 1: Test Production on Real Glasses (Recommended)

1. **Deploy to GitHub Pages**
   - Merge your changes to the `main` branch
   - GitHub Actions will automatically build and deploy to: `https://marioduartelanseros-eng.github.io/Even-realities-Lyrics/`
   - Wait ~2-3 minutes for deployment to complete

2. **Open on Your Glasses**
   - Open the **Even Hub app** on your phone
   - Use the QR code scanner (or click the QR code image above to open directly)
   - The app will load on your G2 glasses

3. **Configure Spotify**
   - On first launch, click the settings icon
   - Enter your Spotify Client ID (from [Spotify Developer Dashboard](https://developer.spotify.com/dashboard))
   - Make sure your Spotify app has this redirect URI: `https://marioduartelanseros-eng.github.io/Even-realities-Lyrics`
   - Click "Save Keys" and then "Login with Spotify"
   - Complete the OAuth flow
   - Play a song on Spotify and enjoy synced lyrics on your glasses! 🎵

#### Option 2: Test Local Development with Simulator

If you want to test changes before deploying:

```bash
# In terminal 1: Start dev server
npx vite --host

# In terminal 2: Launch simulator
npx evenhub-simulator http://127.0.0.1:5173
```

**Note**: For local testing, your Spotify app must have this redirect URI: `http://127.0.0.1:5173/Even-realities-Lyrics`

#### Option 3: Test Local Development on Real Glasses (Advanced)

For testing local changes on real glasses without deploying:

1. **Create a tunnel** (using ngrok, cloudflare tunnel, or similar):
   ```bash
   # Example with ngrok
   ngrok http 5173
   ```

2. **Update your Spotify app** redirect URIs to include: `https://YOUR_TUNNEL_URL/Even-realities-Lyrics`

3. **Generate a temporary QR code** for your tunnel URL:
   ```
   https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=https://YOUR_TUNNEL_URL/Even-realities-Lyrics/
   ```

4. **Scan the QR code** with Even Hub app on your phone

------------------------------------------------------------------------


<p align="center">

<a href="https://www.evenrealities.com/">
  <img src="https://img.shields.io/badge/Even%20Realities-G2-00cc66?style=for-the-badge" />
</a>

<a href="https://developer.spotify.com/">
  <img src="https://img.shields.io/badge/Spotify-Connected-1DB954?style=for-the-badge&logo=spotify&logoColor=white" />
</a>

<a href="https://www.typescriptlang.org/">
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" />
</a>

<a href="https://vitejs.dev/">
  <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" />
</a>

</p>

LyricLens connects to your Spotify account and displays the lyrics of whatever you're currently listening to synced line-by-line in real time, directly on your Even Realities G2 glasses.

<p align="center">
  <img src="https://img.shields.io/badge/display-576×200px-00cc66?style=flat-square" />
  <img src="https://img.shields.io/badge/color-green%20monochrome-00cc66?style=flat-square" />
  <img src="https://img.shields.io/badge/refresh-60Hz-00cc66?style=flat-square" />
</p>


------------------------------------------------------------------------

## ✨ Features

  -----------------------------------------------------------------------
  Feature                        Description
  ------------------------------ ----------------------------------------
  🎧 **Spotify Integration**     Connects via OAuth 2.0 (PKCE) to detect
                                 your currently playing track

  📝 **Synced Lyrics**           Fetches time-synced lyrics from LRCLIB
                                 --- highlights the current line as the
                                 song plays

  👓 **Glasses Display**         Renders album art, track info, progress
                                 bar, and lyrics on the G2's green
                                 monochrome display

  💍 **Ring Controller**         Use the R1 ring to play/pause, skip
                                 forward, or go back

  🔄 **Fallback Modes**          Gracefully falls back to list-based
                                 display if image mode is unavailable

  📄 **Plain Lyrics**            Shows unsynced lyrics when synced
                                 versions aren't available
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## 🔧 How It Works

LyricLens is an **Even Hub app** --- a web app that communicates with
the G2 glasses through the Even Hub SDK.

    Spotify API ──► LyricLens App ──► Even Hub SDK ──► G2 Glasses
            │
            └──► LRCLIB API (synced lyrics)

1.  Polls Spotify every 3 seconds for the current track\
2.  Fetches synced lyrics from LRCLIB\
3.  Renders each line on the glasses display at the correct timestamp\
4.  Uses local progress interpolation between polls to keep lyrics
    perfectly synced

------------------------------------------------------------------------

## 👓 Glasses Display

The G2 display renders at **576×200 pixels** in green monochrome:

    ┌──────────┬─────────────────────────────────┐
    │          │ Track Name                      │
    │ Album    │ Artist Name                     │
    │ Art      │ ▓▓▓▓▓▓▓▓░░░░░░ 1:23 / 3:45       │
    ├──────────┴─────────────────────────────────┤
    │ previous lyric line (dim)                  │
    │ ▶ CURRENT LYRIC LINE (bright) ◀            │
    │ next lyric line (dim)                      │
    └─────────────────────────────────────────────┘

-   **Album art** rendered as grayscale via custom PNG encoder\
-   **Current lyric** displayed bright and bold (24px)\
-   **Previous/next lyrics** dimmed for context (16px)\
-   **Progress bar** with elapsed and total time

------------------------------------------------------------------------

## 🛠️ Tech Stack

-   **TypeScript** --- Type-safe application logic\
-   **Vite** --- Fast dev server and build tool\
-   **Even Hub SDK** --- G2 glasses communication\
-   **Spotify Web API** --- OAuth 2.0 PKCE flow\
-   **LRCLIB** --- Free synced lyrics (no API key required)\
-   **Custom grayscale PNG encoder** --- For glasses image transmission

------------------------------------------------------------------------

## 🚀 Getting Started

### Prerequisites

-   Node.js v18+
-   Spotify Developer account
-   Even Hub Simulator:

``` bash
npm i -g evenhub-simulator
```

------------------------------------------------------------------------

### Debugging Setup

**1. Clone the repository**

``` bash
git clone https://github.com/marioduartelanseros-eng/Even-realities-lyrics.git
cd Even-realities-lyrics
```

**2. Install dependencies**

``` bash
npm install
```

**3. Create a Spotify App**

-   Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
-   Create a new app
-   **For Redirect URIs**, you need to add **BOTH** of these URLs (so the app works in both environments):
    - `http://127.0.0.1:5173/Even-realities-Lyrics` (for local simulator testing)
    - `https://marioduartelanseros-eng.github.io/Even-realities-Lyrics` (for real G2 glasses via GitHub Pages)
-   Copy your Client ID

> **Important**: The redirect URI must match **exactly** where your app is hosted. If you're using a different hosting platform or custom domain, add that URL instead of the GitHub Pages URL.

**4. Configure your keys in-app**

Use the login screen settings panel:
- Spotify Client ID (required)
- AudD API token (optional, enables ambient recognition)

Click **Save Keys**.

**5. Start the dev server**

``` bash
npx vite --host
```

**6. Launch the simulator**

``` bash
npx evenhub-simulator http://127.0.0.1:5173
```

**7. Connect Spotify**

Click login, authorize, and play a song.

------------------------------------------------------------------------
`r`n## 💍 Ring Controller

  Action    Function
  --------- ----------------
  Click     Play / Pause
  Forward   Next Track
  Back      Previous Track

------------------------------------------------------------------------

## 📁 Project Structure

    src/
    ├── main.ts          # App logic, Spotify polling, lyrics sync
    ├── spotify.ts       # Spotify OAuth PKCE flow & now-playing API
    ├── lyrics.ts        # LRCLIB synced lyrics fetching
    ├── lrc-parser.ts    # LRC timestamp format parser
    ├── glasses.ts       # Even Hub SDK integration (image + list mode)
    ├── png-encoder.ts   # Grayscale PNG encoder for glasses display
    └── style.css        # Even Realities design system CSS

------------------------------------------------------------------------

## 🔍 Troubleshooting

### Spotify Authentication Issues

If you see "Spotify login failed" or the app doesn't authenticate:

1. **Check your Redirect URIs in Spotify Dashboard**
   - Must include the **exact** URL where your app is hosted
   - Local: `http://127.0.0.1:5173/Even-realities-Lyrics`
   - Production: `https://marioduartelanseros-eng.github.io/Even-realities-Lyrics`
   - **Note**: No trailing slash at the end

2. **Open Browser Console** (F12) and check for errors
   - Look for messages like "Starting Spotify OAuth flow with redirect URI:"
   - Check if the redirect URI matches what you configured in Spotify Dashboard

3. **Clear your browser cache and localStorage**
   ```javascript
   localStorage.clear();
   location.reload();
   ```

4. **Verify you're using HTTPS or localhost**
   - Spotify OAuth requires a secure context
   - `http://127.0.0.1` ✅ works
   - `http://192.168.x.x` ❌ won't work
   - `https://your-domain.com` ✅ works

### Glasses Not Connecting

**If the app doesn't load on your glasses:**
- Make sure you're scanning the QR code through the **Even Hub app** on your phone (not your phone's camera)
- Check that your G2 glasses are paired and connected via Bluetooth
- Verify the glasses have sufficient battery
- Try restarting the Even Hub app

**If the app loads but shows blank/frozen:**
- Check your internet connection
- Make sure GitHub Pages deployment is complete (check the Actions tab in GitHub)
- Try force-closing and reopening the Even Hub app
- Clear the app cache in Even Hub settings

### After the OAuth Fix

**Q: Do I need to regenerate the QR code after the authentication fix?**

**A: No!** ❌ The QR code does NOT need to be regenerated. The fix improved how the app determines its redirect URI at runtime (using `window.location.origin`), but the deployment URL remains the same: `https://marioduartelanseros-eng.github.io/Even-realities-Lyrics/`

**Q: How do I test it now?**

**A: Follow these steps:**

1. **Ensure your Spotify app has the correct redirect URI:**
   - Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
   - Edit your app settings
   - Verify `https://marioduartelanseros-eng.github.io/Even-realities-Lyrics` is in the Redirect URIs list
   - **Important**: No trailing slash!

2. **Deploy your changes:**
   - Merge to `main` branch (or push to trigger GitHub Actions)
   - Wait for the deployment to complete (~2-3 minutes)
   - Check the Actions tab to confirm it's deployed

3. **Test on your glasses:**
   - Open Even Hub app on your phone
   - Scan the QR code from the README (or click the link directly)
   - The app will open on your G2 glasses
   - Click settings, enter your Spotify Client ID
   - Click "Login with Spotify"
   - Authorize the app
   - Play a song and enjoy! 🎵

### Common Issues on Glasses

**App crashes or shows "Failed to load":**
- The build might have failed - check GitHub Actions logs
- Try accessing the URL directly in a web browser first: `https://marioduartelanseros-eng.github.io/Even-realities-Lyrics/`

**Spotify OAuth doesn't work:**
- Double-check the redirect URI in Spotify Dashboard matches exactly
- Check browser console logs if testing in simulator (F12)
- Verify your Spotify Client ID is correct

**No lyrics appear:**
- Make sure a song is actually playing in Spotify
- Check that the song has lyrics available (try a popular song)
- The app polls every 3 seconds - give it a moment to load

------------------------------------------------------------------------

## 🙏 Acknowledgments

The grayscale PNG encoder and display pipeline approach is based on the
work from **DisplayPlusMusic by @Oliemanq**, which was invaluable for
understanding the Even Hub SDK image container system.
https://github.com/Oliemanq/DisplayPlusMusic

Thanks to **LRCLIB** for providing free synced lyrics with no
authentication required.

------------------------------------------------------------------------

::: {align="center"}
Built for the Even Realities G2 smart glasses
:::
