# Even-realities-lyrics
Real-time synced lyrics on your Even Realities G2 smart glasses.

LyricLens connects to your Spotify account and displays the lyrics of whatever you're currently listening to — synced line-by-line in real time — directly on your Even Realities G2 glasses.

Features
Spotify Integration — Connects via OAuth 2.0 (PKCE) to detect your currently playing track
Synced Lyrics — Fetches time-synced lyrics from LRCLIB and highlights the current line as the song plays
Glasses Display — Renders album art, track info, progress bar, and lyrics on the G2's green monochrome display using image mode with a custom grayscale PNG encoder
Ring Controller Support — Use the R1 ring to play/pause, skip forward, or go back
Fallback Modes — Gracefully falls back to list-based display if image mode is unavailable
Plain Lyrics Fallback — Shows unsynced lyrics when synced versions aren't available
How It Works
LyricLens is an Even Hub app — a web app that communicates with the G2 glasses through the Even Hub SDK. It polls Spotify every 3 seconds for the current track, fetches synced lyrics, and renders each line on the glasses display at the correct timestamp. Between polls, local progress interpolation keeps lyrics perfectly in sync.

Tech Stack
TypeScript + Vite
Even Hub SDK (@evenrealities/even_hub_sdk)
Spotify Web API (OAuth 2.0 PKCE)
LRCLIB (free synced lyrics, no API key needed)
Custom grayscale PNG encoder for glasses image transmission
Getting Started
Clone the repo and install dependencies:

npm install

Create a Spotify Developer app with redirect URI http://127.0.0.1:5173/callback

Paste your Client ID in src/spotify.ts

Start the dev server:

npx vite --host

Launch the Even Hub simulator:

npx evenhub-simulator http://127.0.0.1:5173

Click Connect Spotify, authorize, and play a song!

Glasses Display
The G2 display renders at 576×200 pixels in green monochrome. LyricLens shows:

Album art (grayscale) + track name + artist
Progress bar with elapsed/total time
Previous lyric (dim), current lyric (bright/bold), next lyric (dim)
Acknowledgments
The grayscale PNG encoder used for rendering images on the G2 glasses display is based on the work from DisplayPlusMusic by @Oliemanq. Their project was also a valuable reference for understanding the Even Hub SDK's image container and display pipeline.
