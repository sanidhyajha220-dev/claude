# Mistral Chat

## Run the browser app

```sh
npm start
```

Open the URL printed in the terminal (normally <http://localhost:4174>). If that port is already occupied, the server automatically tries the next available port and prints its URL.

## Download website and publishing

The responsive download website is in `website/` and is configured for Firebase Hosting in `firebase.json`. The site sends users to the project's GitHub Releases page for installers; executable files are not included in the Firebase Hosting upload. This also means the download link works when the page is opened from a local file, without turning into a broken `file:///download/windows` link.

The GitHub Actions workflow builds Windows and macOS installers. Pushing a version tag such as `v1.0.0` creates a GitHub Release and attaches the installers. The Windows asset is named `Mistral-Chat-Setup.exe`; Mac assets are named by architecture. Windows builds are currently unsigned, and macOS signing/notarization still needs to be configured before presenting the Mac build as ready for general users.

To publish the site, install/authenticate the Firebase CLI and deploy Hosting from this project folder:

```sh
npx --yes firebase-tools@13.35.1 login
npm run preview:website
npm run deploy:website
```

This publishes the static download website to the `claude-2b903` Firebase project. Confirm the correct Firebase project is selected before deployment. Firebase Hosting serves static files with HTTPS; it does not publish the chat API. The browser chat and mobile app still need a protected backend before they can be made public.

To publish desktop installers, commit and push the project to the configured GitHub repository, then push a version tag (for example, `v1.0.0`). GitHub Actions builds the Windows and Mac packages and attaches them to a new Release. The download website links to the Releases page, so it never points to a local disk path.

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

This creates the Windows installer `Mistral-Chat-Setup.exe` in `release/`.

On macOS:

```sh
npm ci
npm run dist:mac
```

This creates `.dmg` and `.zip` downloads for Intel and Apple Silicon Macs in `release/`. macOS packages must be built on macOS. The GitHub Actions workflow builds Windows and macOS downloads when run manually; pushing a `v*` tag also publishes them as a GitHub Release.
