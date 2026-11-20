# Mistral Chat desktop app

## Run the browser app

```sh
npm start
```

Then open <http://localhost:4174>.

The download website is available at <http://localhost:4174/download>. It serves the Windows installer from `release/`. For a public site, deploy this Node server together with the installer file; a static-only host will not serve the download route.

## Run the desktop app from source

```sh
npm install
npm run dev
```

In the packaged desktop app, open **Settings → OpenRouter API key** and add your own key. The app stores it encrypted with Windows or macOS secure storage. The key in the development `.env` file is excluded from all installers.

## Build downloads

On Windows:

```sh
npm ci
npm run dist:win
```

This creates the Windows installer `.exe` in `release/`.

On macOS:

```sh
npm ci
npm run dist:mac
```

This creates `.dmg` and `.zip` downloads for Intel and Apple Silicon Macs in `release/`. macOS packages must be built on macOS. The GitHub Actions workflow can build Windows and macOS downloads when run manually or when a `v*` tag is pushed.
