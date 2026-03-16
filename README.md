# 🎵 LyricLens

### Real-time synced lyrics on your Even Realities G2 smart glasses

## Even hub testing QR code

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

If you want to test from local dev without deploying first, create a tunnel URL and run:

```bash
npx evenhub-simulator https://YOUR_TUNNEL_URL
```

Then use that same tunnel URL inside the QR image link above.

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

- Make sure you're running the app through the Even Hub app or simulator
- Check that your glasses are paired and connected via Bluetooth
- Try restarting the Even Hub app

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
