# BookReaders for Android

This Android app is a native WebView shell around the existing BookReaders website. It intentionally loads the live site instead of duplicating its screens, so the website remains the source of truth for the interface and library features. The launcher name and icon use BookReaders branding. The existing Android application ID stays stable so this renamed build can update the current installation.

## Shared data

The app uses the same website and Supabase-backed accounts, catalogue, loans, and saved reading/listening progress. Sign in once inside the app. Android WebView storage is separate from Chrome storage, but the library account and server-side data are shared.

## Build

The GitHub Actions workflow `.github/workflows/android-apk.yml` builds a debug APK and uploads it as the `BookReaders-Android-debug` artifact. Open the workflow run in GitHub Actions and download the artifact.

This first build is for personal testing. It is not a signed release APK for public distribution.
