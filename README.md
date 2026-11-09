# BookReaders

BookReaders is a web-based borrowing library with an Android app wrapper. Readers can discover and borrow books, graphic novels, and audiobooks, read EPUBs, listen to audio, manage loans, and keep reading progress. The live site is:

**https://pickles315.github.io/Book-writers/**

The Android APK is not a separate copy of the website. It is a small native Android application that opens this same live website inside an Android WebView. This keeps the website as the single source of truth for screens and most features. The launcher name and icon are branded BookReaders. The existing Android application ID is intentionally kept stable so this renamed APK can update an existing installation instead of creating a second app.

## Contents

- [How the app works](#how-the-app-works)
- [Main features](#main-features)
- [What's New and library announcements](#whats-new-and-library-announcements)
- [Project layout](#project-layout)
- [Backend and data](#backend-and-data)
- [Android APK: build and install](#android-apk-build-and-install)
- [How to rebuild the APK](#how-to-rebuild-the-apk)
- [How website updates reach the APK](#how-website-updates-reach-the-apk)
- [Troubleshooting](#troubleshooting)
- [Security notes](#security-notes)

## How the app works

### Website

GitHub Pages hosts the website from the repository's published branch. The browser loads `index.html`, which loads the JavaScript modules and styles for the library.

The website talks to the Supabase Edge Function named `library-api` over HTTPS. The Edge Function validates the reader's session, checks permissions, reads and updates the database, and creates short-lived signed links for private book files. The browser does not connect directly to private Storage objects using a service-role key.

### Android app

The Android project is in `android/`. Its `MainActivity.kt` creates a WebView and loads:

`https://pickles315.github.io/Book-writers/`

The WebView enables JavaScript and browser storage because the website needs them for sign-in, themes, reading progress, and offline downloads. The app also:

- Keeps the BookReaders website inside the app when the URL is on `pickles315.github.io`.
- Opens other web links in the device's browser.
- Provides a file picker for EPUB books, MP3 audiobooks, and images.
- Bridges the website's session token to Android so background notifications can check the signed-in reader's account.
- Uses Android WorkManager for periodic notification checks when the device has network access. Android decides the exact run time; a 15-minute periodic interval is the minimum requested interval, not an exact alarm.
- Requests notification permission on Android versions that require it.

The website and APK use the same library account and server-side records. However, Chrome and the Android app have separate local WebView/browser storage. Sign in separately on each device. Offline downloads and locally saved session details are stored on that device.

## Main features

- Library cards with a card number and PIN.
- Discover catalogue with search, filters, ratings, and book details.
- Loans, returns, renewals, and waitlists.
- EPUB reading and audiobook playback.
- Reading progress saved per loan.
- Offline downloads for supported loaned titles.
- Reader profiles, privacy options, reviews, wishlist, reading history, collections, notes, and bookmarks.
- Multiple appearance presets.
- Administrator catalogue and library-management tools.
- Reader notifications, release notes, and library announcements.

Feature availability can depend on the reader's role, the title's release status, loan status, and network connection.

## What's New and library announcements

Administrators can publish release notes from the **Library admin** page:

1. Sign in using an administrator library card.
2. Open **Library admin** in the top navigation. This option is only shown to administrator accounts.
3. Find the **What's new** section.
4. Enter an update title and a description of what changed.
5. Press **Publish to What's new**.
6. The update appears in the admin list. Use **Delete update** if it needs to be removed.

These entries are release notes about app features, improvements, and fixes. They are separate from **Library announcements**:

- **What's new** is the product update/release-notes feed shown to readers on My shelf.
- **Library announcements** are messages from the library and are sent to readers as in-app notifications. The Android background worker can also display eligible notifications as Android notifications.

Publishing and deleting are checked by the Edge Function. Hiding the admin button in the interface is not the security boundary; the server independently verifies administrator permissions.

## Project layout

| Path | Purpose |
| --- | --- |
| `index.html` | Main website page, layout, theme styles, and script loading. |
| `library.js` | Sign-in, navigation, catalogue, loans, reader, and core library behavior. |
| `book-details.js` | Book detail view and related interactions. |
| `requests.js` | Reader book requests. |
| `features.js` | My shelf, Library admin page, reviews, wishlist, reading tools, and related features. |
| `extras.js` | Reading goals, collections, profile editor, What’s New publishing, announcements, and profile-picture review. |
| `offline.js` | IndexedDB downloads and offline media support. |
| `sw.js` | Service worker cache and offline fallback for site resources. |
| `jszip.min.js` | Local JSZip dependency used when opening EPUB files. |
| `android/app/src/main/java/com/BookReaders/app/MainActivity.kt` | Android WebView shell, file picker, and website-to-Android bridge. |
| `android/app/src/main/java/com/BookReaders/app/NotificationWorker.kt` | Background notification fetch and display. |
| `android/app/build.gradle.kts` | Android application ID, SDK levels, version, and dependencies. |
| `.github/workflows/android-apk.yml` | Automated debug APK build. |
| `*-migration.sql`, `*-schema.sql`, `*-functions.sql` | Database setup and migration scripts. |

## Backend and data

The live backend uses the Supabase project configured for BookReaders and the `library-api` Edge Function.

- **Database:** library cards, profiles, catalogue items, loans, waitlists, reading progress, reviews, notifications, and other library records.
- **Private Storage:** EPUBs, MP3s, and cover images. The API issues short-lived signed URLs when access is allowed.
- **Sessions:** the website sends the current session token with API requests. The API checks the token and account permissions before returning private data or changing records.
- **Administrator actions:** catalogue management, inventory changes, release notes, announcements, and profile-picture review are server-authorized.
- **Migrations:** SQL files in the repository describe schema and database changes. Apply a migration only when its corresponding feature needs it, and back up important data before production schema changes.

The publishable Supabase key used by the frontend is designed for client-side use. Never put a Supabase service-role key, Edge Function secret, reader PIN, or private session token in a public repository.

## Android APK: build and install

The GitHub Actions workflow creates a **debug APK** for testing. It is not a Play Store release build and is not a signed production release.

### Download the latest APK

1. Open the repository's **Actions** tab on GitHub.
2. Select **Build BookReaders Android APK**.
3. Open the latest successful run on the `main` branch.
4. Scroll to **Artifacts** and download **BookReaders-Android-debug**.
5. Extract the ZIP file and install `app-debug.apk` on the Android device.

The workflow keeps the artifact for 14 days. If the artifact has expired, run the workflow again.

### Build requirements

The automated workflow uses:

- Ubuntu runner.
- Java 17 (Temurin).
- Android SDK platform 35 and build-tools 35.0.0.
- Gradle 8.9.
- Android Gradle Plugin 8.7.3.
- Kotlin plugin 2.0.21.

### Build locally on Windows

Install Android Studio/Android SDK, JDK 17, and Gradle 8.9. Make sure the Android SDK has platform 35 and build-tools 35.0.0 installed. Then open Command Prompt in the repository and run:

```bat
cd android
gradle --no-daemon :app:assembleDebug
```

The output APK is:

`android/app/build/outputs/apk/debug/app-debug.apk`

This repository currently uses the installed Gradle command rather than including a Gradle wrapper script. If `gradle` is not recognized, install Gradle 8.9 and add its `bin` directory to PATH, or use the GitHub Actions build instead.

### Trigger a build on GitHub

A push to `main` that changes files under `android/` or the APK workflow itself will start the APK workflow. Website-only and backend-only changes do not rebuild the APK because the installed app loads the live website. You can also start a build manually:

1. Open **Actions**.
2. Select **Build BookReaders Android APK**.
3. Press **Run workflow**.
4. Select `main` and confirm.

The workflow checks JavaScript syntax, sets up Java/Android/Gradle, builds the debug APK, and uploads the artifact.

## How website updates reach the APK

Most BookReaders changes are website changes, not native Android changes. Since the APK loads the live GitHub Pages website, changes to HTML, CSS, JavaScript, catalogue data, and Edge Function behavior normally reach the installed APK without rebuilding or reinstalling it.

For frontend changes:
1. Commit and publish the website files to the GitHub Pages branch.
2. Increase the relevant script query version in `index.html` when changing a cached JavaScript file.
3. Update `CACHE_NAME` and the matching precache URL in `sw.js` when changing the service-worker shell or its cached assets.
4. Allow GitHub Pages and the service worker to fetch the new files. Fully close and reopen the app if an older cached page is still open.

Rebuild the APK only when changing native Android code, Android resources, permissions, Gradle configuration, or other files packaged into the Android application. A new APK is also useful when you intentionally need to update the native shell.

## Troubleshooting

- **The APK opens an old version of the site:** fully close and reopen the app, check the script version in `index.html`, and confirm the service-worker cache version and precache list in `sw.js`.
- **A website feature works in Chrome but not in the APK:** check WebView storage, permissions, file chooser behavior, and whether the feature depends on browser APIs unsupported by Android WebView.
- **EPUB files do not open:** check that JSZip and epub.js loaded, the book is a valid EPUB, and the device can reach the file URL or has downloaded the title for offline use.
- **Offline books are missing:** download the loan while online first. Offline files are stored locally on that device and are not shared with Chrome or another phone.
- **Notifications do not appear:** enable notifications in Android settings, allow BookReaders notification permission, sign in again if the session expired, and ensure the device has network access. WorkManager scheduling is controlled by Android and may be delayed by battery optimization.
- **An APK update reports a package/signature conflict:** the debug APK may have been signed with a different temporary debug key by a different GitHub Actions runner. Android cannot install an APK over an existing app when the signatures do not match. Back up anything needed, uninstall the old debug app, then install the new one and sign in again. Uninstalling clears that installation's local WebView/offline data; server-side account data remains on the backend.
- **A build fails:** open the failed workflow run and inspect the JavaScript syntax-check or Gradle build log.

## Security notes

- Do not commit service-role keys, Supabase secrets, PINs, session tokens, or private signing keys.
- Keep private book media in the private Storage bucket and serve it through authorized signed URLs.
- Keep administrator checks in the Edge Function, even when the frontend hides admin-only controls.
- Treat debug APKs as test builds. For public distribution, configure a stable release signing key and a dedicated release build type; do not publish the debug APK as a production release.
