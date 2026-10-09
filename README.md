# BookWriters

BookWriters is a static website hosted on GitHub Pages, using Supabase for accounts and persistent data.

## Files

- `index.html` — the website (HTML, CSS, and JavaScript in one file).
- `supabase-fix.sql` — signup-trigger and row-level security fixes for the database schema previously created for this project.

## 1. Finish the Supabase setup

1. Open your Supabase project and go to **SQL Editor**.
2. Open `supabase-fix.sql` in this repository, copy its contents, paste them into a new SQL query, and run it.
3. In **Authentication → URL Configuration**, set the Site URL to your GitHub Pages URL, for example `https://pickles315.github.io/Book-writers/`. Add that URL to the Redirect URLs list too.
4. In **Authentication → Providers → Email**, review whether email confirmation is enabled. If it is enabled, new users must confirm their email before signing in.
5. To turn on live chat updates, open **Database → Publications** and make sure `chat_messages` is included in the `supabase_realtime` publication. The table must already have RLS enabled.

The SQL fix assumes the five tables from the original setup already exist: `profiles`, `books`, `book_collaborators`, `chapters`, and `chat_messages`. It does not create those tables from scratch.

## 2. Turn on GitHub Pages

1. Open the repository's **Settings → Pages**.
2. Under **Build and deployment**, select **Deploy from a branch**.
3. Select branch `main` and folder `/ (root)`, then save.
4. Wait for the Pages deployment to finish. The site URL will be shown on that page.

## 3. Important security notes

- The website uses a **Supabase publishable key** in the browser. Publishable keys are designed for client-side use, but only when Row Level Security is correctly configured.
- **Never put a Supabase secret key, service-role key, or database password in `index.html` or any public GitHub file.**
- The database contains writing drafts and messages. Review the RLS policies before inviting people to use the site. Do not store sensitive personal information in public profiles.
- Published books and their chapters are intended to be readable by anyone. Private drafts and project chat should only be accessible to the owner and collaborators.
- The first version supports sign-up/sign-in, public book discovery, book creation, chapter editing, profiles, collaborator invitations by username, and project chat. Live chat requires the Realtime publication step above.

## 4. Test the first version

1. Open the deployed Pages URL.
2. Create an account and confirm your email if requested.
3. Edit your profile.
4. Create a book, add a chapter, and test making it public/private.
5. Create a second test account and invite it by its BookWriters username to test collaboration and chat.

If something fails, open the browser's developer console and check the error message. Supabase errors usually point to a missing table, a policy, or an authentication URL setting.
