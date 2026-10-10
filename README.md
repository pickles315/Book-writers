# BookWriters

BookWriters is a static writing and collaboration website built with HTML, CSS, JavaScript, and Supabase.

## Features

- Account sign-up/sign-in, writer profiles, public book discovery, and a personal library.
- Books, chapters, collaborator invitations by username, and project chat.
- Light/dark theme toggle.
- Chapter word and character counts, fullscreen editing, and Ctrl/Cmd+S save shortcut.
- Local browser draft recovery for an edited chapter.
- TXT and EPUB export, plus browser print / Save as PDF.
- Book likes, bookmarks, writer follows, writer search, and optional cover images.
- Chapter version snapshots and a version-history restore panel.

## Files

- `index.html` — main app and existing book-writing/collaboration features.
- `enhancements.js` — editor utilities, theme, exports, draft recovery, and chapter version history.
- `social-enhancements.js` — writer search, likes, bookmarks, follows, and cover images.
- `supabase-fix.sql` — original schema/policy repair script for an existing installation.
- `feature-migration.sql` — adds the cover URL column, social tables, chapter-version table, and their row-level security policies.

## Supabase setup

1. Open your Supabase project and go to **SQL Editor**.
2. If you have not already applied the original app setup, review and run `supabase-fix.sql`. It assumes the original tables already exist; it is not a fresh-install schema.
3. Review `feature-migration.sql`, then run it in the SQL Editor. It is designed to be re-runnable and does not delete books or chapters. It enables likes, bookmarks, follows, cover images, and chapter version history.
4. In **Authentication → URL Configuration**, set the Site URL to your deployed GitHub Pages URL and add the same URL to Redirect URLs.
5. In **Authentication → Providers → Email**, check whether email confirmation is enabled. If enabled, new users must confirm their email before signing in.
6. For live chat updates, open **Database → Publications** and ensure `chat_messages` is included in the `supabase_realtime` publication.

The original app schema is expected to contain `profiles`, `books`, `book_collaborators`, `chapters`, and `chat_messages`. The feature migration does not create these original tables.

## GitHub Pages deployment

1. Open repository **Settings → Pages**.
2. Choose **Deploy from a branch**.
3. Select `main` and folder `/ (root)`, then save.
4. Wait for the deployment to complete. GitHub shows the published site URL on the Pages settings screen.

The app loads Supabase's browser client and JSZip from their public CDNs. EPUB files are generated locally in the browser; TXT and print/PDF use built-in browser features.

## Security notes

- A Supabase publishable key is intended for client-side use only when Row Level Security (RLS) is configured correctly.
- Never put a Supabase secret/service-role key or database password in any public repository file.
- Review RLS policies before deployment, especially if you have customized your original database schema.
- Public profiles and published books are discoverable. Do not put private or sensitive personal information in public profile fields.
- Private drafts and project chat should remain accessible only to the owner and authorized collaborators. Test this using separate accounts.
- Cover images must be reachable via HTTPS. Only a book owner can change that book's cover through the UI.

## Test checklist

After applying the migration and deploying the branch:

1. Sign in and edit a profile.
2. Create a book and chapter, then test publishing and making it private.
3. Edit a chapter, save it, open **Version history**, and restore a previous version.
4. Type in an existing chapter and close/reopen the editor without saving to test local draft recovery.
5. Export a book as TXT and EPUB; open the EPUB in a reader that supports EPUB 3.
6. Print a book or choose **Save as PDF** in the browser print dialog.
7. Like and bookmark a published book, follow a writer, search for writers, and set/remove a cover image.
8. Use a second account to test collaborator permissions and project chat.
9. Confirm that a non-owner cannot edit a book's cover or read a private book they were not invited to.
10. Check the browser console and Supabase logs if a feature fails; common causes are a missing migration, RLS policy, or auth URL setting.

## Notes

The browser draft recovery feature stores edited chapter text in that browser's local storage on that device. Clear browser storage if you want to remove those local copies. This branch is a proposed upgrade; review and test it before merging into `main`.
