# Mind Map

A free-form, no-signup mind map you run entirely on your own computer. No install,
no build step, no server, no account — open it and start mapping.

## Why there's no ".exe"

A website (HTML/CSS/JS) runs inside your browser, not as its own program, so it
can never package itself into a `.exe` — that's what a *desktop app* does, which
is a different kind of project built with different tools. What this app does
instead, which covers the same need:

- **Autosaves automatically** to your browser's local storage as you work, so
  closing the tab or restarting your computer never loses your map.
- **"💾 Save file"** downloads a real `.json` file to your computer that you can
  rename, back up, move around, or send to someone — reopen it any time with
  **"📂 Open file"**.
- **"🖼 Export image"** downloads a `.png` picture of your current map.

None of this ever leaves your computer — there is no backend, no account, and
no data sent anywhere. That stays true even if you later put this on the
internet (see "Putting it online" below): people would each get their own
private map living only in their own browser.

## How to run it locally

Pick whichever is easiest for you:

**Option A — just open the file**
Double-click `index.html`. It opens directly in your browser. Good enough for
most things, though a couple of browsers restrict opening local files for
images — Option B avoids that.

**Option B — VS Code Live Server (recommended)**
1. In VS Code, install the **"Live Server"** extension (by Ritwick Dey).
2. Open this folder in VS Code (`File → Open Folder…`).
3. Right-click `index.html` → **"Open with Live Server"**.
4. Your browser opens something like `http://127.0.0.1:5500` — that's
   "localhost," your own machine acting as the server.

**Option C — Python's built-in server**
If you have Python installed, open a terminal in this folder and run:
```
python3 -m http.server 8000
```
Then visit `http://localhost:8000` in your browser.

## How to use it

Works the same on a laptop, a tablet, or a phone — mouse, trackpad, and touch
all drive the same canvas.

- **Tap/click empty space twice quickly** → create a new idea, ready to type
  into immediately.
- **Tap/click an existing note twice quickly** → create a new note already connected
  to it (great for branching out a topic).
- **Drag a note** (mouse, finger, or pen) → move it anywhere.
- **Click/tap a note, then the ✏️ button** → rename it.
- **Click/tap a note, then 🔗** → enters link mode; tap any other note to draw
  a connection between them (works for any two notes, not just parent → child).
- **Tap a color dot** on the floating toolbar → tag the selected note with a color.
- **Click/tap directly on a connecting line** → removes that connection.
- **Select a note and press Delete/Backspace** (or use 🗑) → deletes it and any
  connections attached to it.

**Panning and zooming:**

| Input | Pan the map | Zoom |
|---|---|---|
| **Scroll wheel** (mouse) | — | Scroll up/down |
| **Trackpad** | Two-finger swipe (any direction) | Pinch in/out |
| **Touch** (phone/tablet) | One-finger drag on empty space | Two-finger pinch |

"⤾ Reset view" re-centers on your whole map at any time.

## File structure

```
mind-map-app/
├── index.html     – page structure and toolbar layout
├── style.css      – all visual styling (dark canvas, sticky-note look, etc.)
├── script.js      – all behavior: nodes, connections, drag/zoom, save/load
└── README.md      – this file
```

Everything is plain JavaScript — no npm install, no React, no bundler. You can
open `script.js` directly in VS Code and edit it; refresh the browser to see
your changes.

## Using it from your phone or tablet too

The interface itself now works on touch the same as on a laptop. To actually
*open* it from a phone or tablet, that device needs to reach whichever
computer is running the server (Option B or C above):

1. Find your laptop's local network IP (on Windows: `ipconfig`, look for
   IPv4 Address; on Mac: `ifconfig` or System Settings → Wi-Fi → Details).
2. Make sure the phone/tablet is on the **same Wi-Fi network** as the laptop.
3. On the phone/tablet, visit `http://<that-ip>:<port>` — e.g.
   `http://192.168.1.42:5500` for Live Server, or `:8000` for the Python server.

One thing worth knowing: autosave uses each browser's own local storage, so a
phone visiting this way has its **own separate map**, not the same one as the
laptop. To move a map between devices, use **"💾 Save file"** on one and
**"📂 Open file"** on the other.

## Putting it online (optional, later)

When you're ready, you can deploy this folder as-is to something like Vercel,
Netlify, or GitHub Pages (drag-and-drop, no backend needed) so you can reach it
from any device by URL. Since all the saving logic lives in the browser, each
visitor's map stays private to their own browser — you don't get a shared
database unless you build one later.
