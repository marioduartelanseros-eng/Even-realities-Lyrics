# 🎵 LyricLens

### Real-time synced lyrics on your Even Realities G2 smart glasses

{align="center"}
[![Even
Realities](https://img.shields.io/badge/Even%20Realities-G2-00cc66?style=for-the-badge)](https://www.evenrealities.com/)
[![Spotify](https://img.shields.io/badge/Spotify-Connected-1DB954?style=for-the-badge&logo=spotify&logoColor=white)](https://developer.spotify.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)

`<br/>`{=html}

LyricLens connects to your Spotify account and displays the lyrics of
whatever you're currently listening to --- synced line-by-line in real
time --- directly on your Even Realities G2 glasses.

`<br/>`{=html}

![Display
Size](https://img.shields.io/badge/display-576×200px-00cc66?style=flat-square)
![Color](https://img.shields.io/badge/color-green%20monochrome-00cc66?style=flat-square)
![Refresh
Rate](https://img.shields.io/badge/refresh-60Hz-00cc66?style=flat-square)
:::

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

### Setup

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

-   Go to Spotify Developer Dashboard\
-   Create a new app\
-   Add `http://127.0.0.1:5173/callback` as a Redirect URI\
-   Copy your Client ID

**4. Configure your Client ID**

Open `src/spotify.ts` and replace the `CLIENT_ID` value with your own.

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

## 💍 Ring Controller

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
