# Meeting Frontend

This app keeps the same UI and now works across devices on the same Wi-Fi.

## Run It On Your Network

1. Start the backend in `C:\Users\Lenovo\projects\REAL TIME MEETHING SUMMARIZER\user_realtime`.
2. Start the frontend in `C:\Users\Lenovo\projects\REAL TIME MEETHING SUMMARIZER\meeting-frontend`:

```powershell
npm run dev:lan
```

3. Open the app from another device on the same Wi-Fi using:

```text
http://YOUR-COMPUTER-IP:5173
```

## What Changed

- The frontend no longer hardcodes `localhost`.
- It automatically connects to the same host/IP that served the page.
- The Vite dev server is exposed on the local network.

## Optional Overrides

If the backend runs on another machine, set a custom API host before starting:

```powershell
$env:VITE_API_HOST="192.168.x.x"
npm run dev:lan
```

Optional port overrides:

- `VITE_API_PORT`
- `VITE_WS_PORT`
- `VITE_CAPTION_WS_PORT`

## Notes

- If other devices cannot open the app, allow Node.js/Vite and Python through Windows Firewall on your private network.
