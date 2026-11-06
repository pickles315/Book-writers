# BookWriters Library

BookWriters is being redesigned as a borrowing library inspired by Libby.

## Current redesign

The `libby-library-redesign` branch contains the new library-card interface and its server-side API.

- Readers create a card with a generated 12-digit card number and 4-digit PIN.
- Readers sign in with their card number and PIN.
- Discover, Loans, and Settings pages.
- Administrator-only catalogue creation.
- Books and graphic novels use EPUB files; audiobooks use MP3 files.
- Covers, author, optional narrator, copy count, and age classification.
- Loans last 12 days.
- Reading location and audiobook position are saved per loan.
- Light and dark themes.

## Backend

The Supabase project uses the `library-api` Edge Function. It handles card login, sessions, catalogue access, borrowing, returns, progress, and signed Storage URLs. The function uses the project's server-side secret key; no service-role key is included in browser code.

The `library-borrowing-schema.sql` and `library-borrowing-functions.sql` files document the additive database setup. The new tables have RLS enabled and no browser-role table privileges. The existing writer/EPUB tables and old account records are not deleted by this redesign.

## Deployment status

The database setup and Edge Function are deployed to the Supabase project. The new frontend is on the `libby-library-redesign` branch and is not live on the main GitHub Pages site until the branch is reviewed and merged.

## Storage

The private `library-media` bucket stores EPUB, MP3, and cover files. Browser uploads and reads use short-lived signed URLs issued by the Edge Function.

## Important

The 4-digit PIN is verified server-side using a salted PBKDF2 hash. Login attempts are rate-limited by card number. Never place card PINs, session tokens, or Supabase secret keys in public source files.
