import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
const fail = (message: string, status = 400) => json({ error: message }, status);
const encoder = new TextEncoder();

async function derivePin(pin: string, salt: Uint8Array, iterations = 310000) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(pin), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256
  ));
}
function fromHex(value: string) {
  return new Uint8Array(value.match(/.{2}/g)?.map((x) => parseInt(x, 16)) || []);
}
async function hashPin(pin: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const digest = await derivePin(pin, salt);
  return "pbkdf2$310000$" + hex(salt) + "$" + hex(digest);
}
async function verifyPin(pin: string, encoded: string) {
  const parts = encoded.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2" || Number(parts[1]) !== 310000) return false;
  const expected = fromHex(parts[3]);
  const actual = await derivePin(pin, fromHex(parts[2]));
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}
const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
async function sha(value: string) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}
function randomDigits(length: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map((b) => String(b % 10)).join("");
}
const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
const serviceKey = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!serviceKey) throw new Error("Supabase server secret is unavailable.");
const db = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function makeSession(cardId: string) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha(token);
  const { error } = await db.from("library_sessions").insert({
    token_hash: tokenHash, card_id: cardId,
    expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
  });
  if (error) throw error;
  return token;
}
async function getCard(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token || token.length < 40) return null;
  const { data: session } = await db.from("library_sessions")
    .select("card_id,expires_at,revoked_at")
    .eq("token_hash", await sha(token)).maybeSingle();
  if (!session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) return null;
  const { data: card } = await db.from("library_cards")
    .select("id,card_number,role,display_name,disabled_at")
    .eq("id", session.card_id).maybeSingle();
  if (!card || card.disabled_at) return null;
  return { ...card, tokenHash: await sha(token) };
}
async function adminOnly(card: any) {
  return card?.role === "admin";
}
async function signedCover(path: string | null) {
  if (!path) return null;
  const { data } = await db.storage.from("library-media").createSignedUrl(path, 3600);
  return data?.signedUrl || null;
}
async function expireLoans() {
  await db.rpc("library_expire_loans");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("Use POST.", 405);
  let body: any;
  try { body = await req.json(); } catch { return fail("Invalid JSON."); }
  const action = String(body.action || "");

  try {
    if (action === "register") {
      const displayName = String(body.display_name || "Reader").trim().slice(0, 60) || "Reader";
      const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "unknown";
      const attemptKey = "signup:" + await sha(ip);
      const { data: allowed, error: limitError } = await db.rpc("library_check_login_limit", { p_attempt_key: attemptKey });
      if (limitError || allowed === false) return fail("Too many card requests. Try again in 15 minutes.", 429);
      await db.rpc("library_record_failed_login", { p_attempt_key: attemptKey });
      const pin = randomDigits(4);
      const pinHash = await hashPin(pin);
      let cardNumber = "";
      let card: { id: string } | null = null;
      for (let i = 0; i < 12; i++) {
        const candidate = randomDigits(12);
        const { data, error } = await db.from("library_cards")
          .insert({ card_number: candidate, pin_hash: pinHash, role: "reader", display_name: displayName })
          .select("id").single();
        if (!error && data) {
          cardNumber = candidate;
          card = data;
          break;
        }
        // The database unique constraint is the final authority. If another
        // signup claimed this number between generation and insertion, retry.
        if (error?.code === "23505") continue;
        if (error) throw error;
      }
      if (!card || !cardNumber) return fail("Could not create a card right now. Try again.", 503);
      const token = await makeSession(card.id);
      return json({ card_number: cardNumber, pin, token, display_name: displayName, role: "reader" }, 201);
    }

    if (action === "login") {
      const cardNumber = String(body.card_number || "").trim();
      const pin = String(body.pin || "");
      if (!/^\d{12}$/.test(cardNumber) || !/^\d{4}$/.test(pin)) return fail("Enter a 12-digit card number and 4-digit PIN.", 400);
      const attemptKey = "card:" + cardNumber;
      const { data: allowed, error: limitError } = await db.rpc("library_check_login_limit", { p_attempt_key: attemptKey });
      if (limitError || allowed === false) return fail("Too many incorrect attempts. Try again in 15 minutes.", 429);
      const { data: card } = await db.from("library_cards")
        .select("id,pin_hash,role,display_name,disabled_at")
        .eq("card_number", cardNumber).maybeSingle();
      if (!card || card.disabled_at || !(await verifyPin(pin, card.pin_hash))) {
        await db.rpc("library_record_failed_login", { p_attempt_key: attemptKey });
        return fail("Card number or PIN is incorrect.", 401);
      }
      await db.rpc("library_clear_login_attempts", { p_attempt_key: attemptKey });
      const token = await makeSession(card.id);
      return json({ token, role: card.role, display_name: card.display_name, card_number: cardNumber });
    }

    if (action === "public-stats") {
      const { count, error } = await db.from("library_loans").select("id", { count: "exact", head: true });
      if (error) throw error;
      return json({ books_borrowed: count || 0 });
    }

    const card = await getCard(req);
    if (!card) return fail("Your session expired. Please sign in again.", 401);

    if (action === "me") {
      return json({ role: card.role, display_name: card.display_name, card_number: card.card_number });
    }
    if (action === "logout") {
      await db.from("library_sessions").update({ revoked_at: new Date().toISOString() }).eq("token_hash", card.tokenHash);
      return json({ ok: true });
    }
    if (action === "discover") {
      await expireLoans();
      const [{ data: items, error }, { data: active, error: loanError }, { data: allLoans, error: allLoanError }, { data: reviews, error: reviewError }] = await Promise.all([
        db.from("library_items").select("id,title,author,narrator,description,media_type,age_classification,total_copies,page_count,audio_duration_seconds,cover_path,created_at,genre,series_name,series_number").order("created_at", { ascending: false }),
        db.from("library_loans").select("item_id").is("returned_at", null).gt("due_at", new Date().toISOString()),
        db.from("library_loans").select("item_id"),
        db.from("library_reviews").select("item_id,rating"),
      ]);
      if (error || loanError || allLoanError || reviewError) throw error || loanError || allLoanError || reviewError;
      const counts = new Map<string, number>(), popularity = new Map<string, number>(), ratingTotals = new Map<string, {sum:number,count:number}>();
      for (const loan of active || []) counts.set(loan.item_id, (counts.get(loan.item_id) || 0) + 1);
      for (const loan of allLoans || []) popularity.set(loan.item_id, (popularity.get(loan.item_id) || 0) + 1);
      for (const review of reviews || []) { const v=ratingTotals.get(review.item_id)||{sum:0,count:0};v.sum+=review.rating;v.count++;ratingTotals.set(review.item_id,v); }
      const result = await Promise.all((items || []).map(async (item) => {
        const rating=ratingTotals.get(item.id)||{sum:0,count:0};
        return { ...item, available_copies: Math.max(0, item.total_copies - (counts.get(item.id) || 0)),
          borrow_count: popularity.get(item.id)||0, average_rating: rating.count?rating.sum/rating.count:null, review_count:rating.count,
          cover_url: await signedCover(item.cover_path) };
      }));
      return json({ items: result });
    }

    if (action === "item-detail") {
      const itemId = String(body.item_id || "");
      const [{ data: item, error }, { count, error: countError }] = await Promise.all([
        db.from("library_items").select("id,title,author,narrator,description,media_type,age_classification,total_copies,page_count,audio_duration_seconds,cover_path,created_at,genre,series_name,series_number").eq("id", itemId).maybeSingle(),
        db.from("library_loans").select("id", { count: "exact", head: true }).eq("item_id", itemId).is("returned_at", null).gt("due_at", new Date().toISOString()),
      ]);
      if (error || countError) throw error || countError;
      if (!item) return fail("Book not found.", 404);
      return json({ item: { ...item, available_copies: Math.max(0, item.total_copies - (count || 0)), cover_url: await signedCover(item.cover_path) } });
    }

    if (action === "loans") {
      await expireLoans();
      const { data: loans, error } = await db.from("library_loans")
        .select("id,item_id,borrowed_at,due_at")
        .eq("card_id", card.id).is("returned_at", null)
        .gt("due_at", new Date().toISOString()).order("due_at");
      if (error) throw error;
      const ids = (loans || []).map((x) => x.item_id);
      const loanIds = (loans || []).map((x) => x.id);
      const [{ data: items }, { data: progress }] = await Promise.all([
        ids.length ? db.from("library_items").select("id,title,author,narrator,description,media_type,age_classification,total_copies,page_count,audio_duration_seconds,cover_path,file_path").in("id", ids) : Promise.resolve({ data: [] }),
        loanIds.length ? db.from("library_progress").select("loan_id,current_page,total_pages,audio_position_seconds,reading_location").in("loan_id", loanIds) : Promise.resolve({ data: [] }),
      ]);
      const itemMap = new Map((items || []).map((x) => [x.id, x]));
      const progressMap = new Map((progress || []).map((x) => [x.loan_id, x]));
      return json({ loans: await Promise.all((loans || []).map(async (loan) => ({
        ...loan, item: { ...itemMap.get(loan.item_id), cover_url: await signedCover(itemMap.get(loan.item_id)?.cover_path || null) },
        progress: progressMap.get(loan.id) || null,
      }))) });
    }
    if (action === "borrow") {
      const itemId = String(body.item_id || "");
      const { data: reservation } = await db.from("library_waitlist").select("id,card_id").eq("item_id", itemId).eq("status", "ready").order("created_at").limit(1).maybeSingle();
      if (reservation && reservation.card_id !== card.id) return fail("A returned copy is being held for the next reader on the waitlist.", 409);
      const { data, error } = await db.rpc("library_borrow_item", { p_card_id: card.id, p_item_id: itemId });
      if (error) return fail(error.message.includes("NO_COPIES") ? "No copies are available right now." : error.message.includes("ALREADY") ? "You already have this item on loan." : "Could not borrow this item.", 409);
      if (reservation?.card_id === card.id) await db.from("library_waitlist").delete().eq("id", reservation.id);
      return json({ loan_id: data });
    }
    if (action === "return") {
      const { data, error } = await db.rpc("library_return_item", { p_card_id: card.id, p_loan_id: body.loan_id });
      if (error) throw error;
      if (!data) return fail("That loan could not be returned.", 404);
      const { data: returnedLoan } = await db.from("library_loans").select("item_id").eq("id", String(body.loan_id || "")).maybeSingle();
      if (returnedLoan?.item_id) {
        const { data: nextUp } = await db.from("library_waitlist").select("id,card_id").eq("item_id", returnedLoan.item_id).eq("status", "waiting").order("created_at").limit(1).maybeSingle();
        if (nextUp) {
          await db.from("library_waitlist").update({ status: "ready", updated_at: new Date().toISOString() }).eq("id", nextUp.id);
          const { data: item } = await db.from("library_items").select("title").eq("id", returnedLoan.item_id).maybeSingle();
          await db.from("library_notifications").upsert({ card_id: nextUp.card_id, kind: "waitlist", title: "A book is ready", message: (item?.title || "A book") + " is ready for you to borrow.", source_key: "waitlist:" + nextUp.id }, { onConflict: "card_id,source_key", ignoreDuplicates: true });
        }
      }
      return json({ ok: true });
    }
    if (action === "progress") {
      const loanId = String(body.loan_id || "");
      const { data: loan } = await db.from("library_loans").select("id")
        .eq("id", loanId).eq("card_id", card.id).is("returned_at", null)
        .gt("due_at", new Date().toISOString()).maybeSingle();
      if (!loan) return fail("This loan is no longer active.", 404);
      const update = {
        loan_id: loanId,
        current_page: Math.max(0, Math.floor(Number(body.current_page) || 0)),
        total_pages: body.total_pages == null ? null : Math.max(1, Math.floor(Number(body.total_pages) || 1)),
        audio_position_seconds: Math.max(0, Number(body.audio_position_seconds) || 0),
        reading_location: String(body.reading_location || "").slice(0, 500),
        updated_at: new Date().toISOString(),
      };
      const { error } = await db.from("library_progress").upsert(update, { onConflict: "loan_id" });
      if (error) throw error;
      return json({ ok: true });
    }
    if (action === "media-url") {
      const itemId = String(body.item_id || "");
      const loanId = String(body.loan_id || "");
      const { data: loan } = await db.from("library_loans").select("id")
        .eq("id", loanId).eq("item_id", itemId).eq("card_id", card.id)
        .is("returned_at", null).gt("due_at", new Date().toISOString()).maybeSingle();
      if (!loan && card.role !== "admin") return fail("Borrow this item to open it.", 403);
      const { data: item } = await db.from("library_items").select("file_path").eq("id", itemId).maybeSingle();
      if (!item) return fail("Item not found.", 404);
      const { data, error } = await db.storage.from("library-media").createSignedUrl(item.file_path, 3600);
      if (error) throw error;
      return json({ url: data.signedUrl });
    }
    if (action === "upload-start") {
      if (!(await adminOnly(card))) return fail("Administrator access required.", 403);
      const itemId = crypto.randomUUID();
      const mediaType = String(body.media_type || "");
      const fileExt = mediaType === "audiobook" ? "mp3" : "epub";
      const coverExt = String(body.cover_ext || "jpg").toLowerCase();
      if (!["jpg", "jpeg", "png", "webp"].includes(coverExt)) return fail("Unsupported cover image.");
      const filePath = itemId + "/media." + fileExt;
      const coverPath = itemId + "/cover." + coverExt;
      const [media, cover] = await Promise.all([
        db.storage.from("library-media").createSignedUploadUrl(filePath),
        db.storage.from("library-media").createSignedUploadUrl(coverPath),
      ]);
      if (media.error || cover.error) throw media.error || cover.error;
      return json({ item_id: itemId, file_path: filePath, cover_path: coverPath, media_upload: media.data, cover_upload: cover.data });
    }
    if (action === "item-create") {
      if (!(await adminOnly(card))) return fail("Administrator access required.", 403);
      const mediaType = String(body.media_type || "");
      const age = String(body.age_classification || "");
      if (!["book", "graphic_novel", "audiobook"].includes(mediaType)) return fail("Choose a valid media type.");
      if (!["Juvenile", "Adult", "All Ages"].includes(age)) return fail("Choose an age classification.");
      const row = {
        id: body.item_id, title: String(body.title || "").trim(),
        author: String(body.author || "").trim() || "Unknown author", narrator: String(body.narrator || "").trim() || null,
        media_type: mediaType, age_classification: age,
        description: String(body.description || "").trim().slice(0, 4000),
        genre: String(body.genre || "Uncategorized").trim().slice(0, 60) || "Uncategorized",
        series_name: String(body.series_name || "").trim().slice(0, 120) || null,
        series_number: body.series_number == null || body.series_number === "" ? null : Number(body.series_number),
        page_count: mediaType === "audiobook" ? null : (Number.isInteger(Number(body.page_count)) && Number(body.page_count) > 0 ? Number(body.page_count) : null),
        audio_duration_seconds: mediaType === "audiobook" ? (Number.isInteger(Number(body.audio_duration_seconds)) && Number(body.audio_duration_seconds) > 0 ? Number(body.audio_duration_seconds) : null) : null,
        total_copies: Math.max(1, Math.min(10000, Math.floor(Number(body.total_copies) || 1))),
        file_path: body.file_path, cover_path: body.cover_path, created_by: card.id,
      };
      if (row.series_number !== null && (!Number.isInteger(row.series_number) || row.series_number < 1 || row.series_number > 999)) return fail("Series book number must be between 1 and 999.");
      if (row.series_number !== null && !row.series_name) return fail("Enter the series name or choose Standalone.");
      const { data, error } = await db.from("library_items").insert(row).select("id").single();
      if (error) throw error;
      return json({ id: data.id }, 201);
    }

    if (action === "admin-cover-start") {
      if (!(await adminOnly(card))) return fail("Administrator access required.", 403);
      const itemId = String(body.item_id || "");
      const { data: item, error: itemError } = await db.from("library_items").select("id").eq("id", itemId).maybeSingle();
      if (itemError) throw itemError;
      if (!item) return fail("Book not found.", 404);
      const ext = String(body.cover_ext || "jpg").toLowerCase();
      if (!["jpg", "jpeg", "png", "webp"].includes(ext)) return fail("Unsupported cover image.");
      const coverPath = itemId + "/cover-" + crypto.randomUUID() + "." + ext;
      const { data, error } = await db.storage.from("library-media").createSignedUploadUrl(coverPath);
      if (error) throw error;
      return json({ cover_path: coverPath, cover_upload: data });
    }
    if (action === "admin-update-item") {
      if (!(await adminOnly(card))) return fail("Administrator access required.", 403);
      const itemId = String(body.item_id || "");
      const title = String(body.title || "").trim();
      const author = String(body.author || "").trim();
      const mediaType = String(body.media_type || "");
      const age = String(body.age_classification || "");
      const copies = Number(body.total_copies);
      const pageCount = body.page_count === "" || body.page_count == null ? null : Number(body.page_count);
      const duration = body.audio_duration_seconds === "" || body.audio_duration_seconds == null ? null : Number(body.audio_duration_seconds);
      const description = String(body.description || "").trim();
      if (!title || title.length > 180) return fail("Enter a title up to 180 characters.");
      if (!author || author.length > 120) return fail("Enter an author up to 120 characters.");
      if (String(body.narrator || "").length > 120) return fail("Narrator must be 120 characters or fewer.");
      if (description.length > 4000) return fail("Description must be 4,000 characters or fewer.");
      if (!["book", "graphic_novel", "audiobook"].includes(mediaType)) return fail("Choose a valid format.");
      if (!["Juvenile", "Adult", "All Ages"].includes(age)) return fail("Choose a valid age classification.");
      if (!Number.isInteger(copies) || copies < 1 || copies > 10000) return fail("Copies must be between 1 and 10,000.");
      if (mediaType !== "audiobook" && pageCount !== null && (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > 100000)) return fail("Enter a valid page count.");
      if (mediaType === "audiobook" && duration !== null && (!Number.isInteger(duration) || duration < 1 || duration > 864000)) return fail("Enter a valid audio length in seconds.");
      const { data: oldItem, error: readError } = await db.from("library_items").select("cover_path,media_type").eq("id", itemId).maybeSingle();
      if (readError) throw readError;
      if (!oldItem) return fail("Book not found.", 404);
      if (mediaType !== oldItem.media_type) return fail("The format cannot be changed without replacing the uploaded book file.");
      const update = {
        title, author, narrator: String(body.narrator || "").trim() || null, description,
        genre: String(body.genre || "Uncategorized").trim().slice(0, 60) || "Uncategorized",
        series_name: String(body.series_name || "").trim().slice(0, 120) || null,
        series_number: body.series_number === "" || body.series_number == null ? null : Number(body.series_number),
        media_type: mediaType, age_classification: age, total_copies: copies,
        page_count: mediaType === "audiobook" ? null : pageCount,
        audio_duration_seconds: mediaType === "audiobook" ? duration : null,
        ...(body.cover_path ? { cover_path: String(body.cover_path) } : {}),
      };
      if (body.cover_path && !String(body.cover_path).startsWith(itemId + "/cover-")) return fail("Invalid cover upload path.");
      if (update.series_number !== null && (!Number.isInteger(update.series_number) || update.series_number < 1 || update.series_number > 999)) return fail("Series book number must be between 1 and 999.");
      if (update.series_number !== null && !update.series_name) return fail("Enter the series name or choose Standalone.");
      const { error } = await db.from("library_items").update(update).eq("id", itemId);
      if (error) throw error;
      if (body.cover_path && oldItem.cover_path !== body.cover_path) {
        const { error: removeError } = await db.storage.from("library-media").remove([oldItem.cover_path]);
        if (removeError) console.warn("Old cover cleanup failed", removeError);
      }
      return json({ ok: true });
    }



    if (action === "wishlist") {
      const { data, error } = await db.from("library_wishlist").select("item_id,created_at").eq("card_id", card.id).order("created_at", { ascending: false });
      if (error) throw error;
      const ids = (data || []).map((x: any) => x.item_id);
      const { data: rows, error: itemError } = ids.length ? await db.from("library_items").select("id,title,author,media_type,age_classification,cover_path").in("id", ids) : { data: [], error: null };
      if (itemError) throw itemError;
      const map = new Map((rows || []).map((x: any) => [x.id, x]));
      return json({ items: await Promise.all((data || []).filter((x: any) => map.has(x.item_id)).map(async (x: any) => ({ ...map.get(x.item_id), created_at: x.created_at, cover_url: await signedCover(map.get(x.item_id)?.cover_path || null) }))) });
    }
    if (action === "wishlist-add") {
      const itemId = String(body.item_id || "");
      const { error } = await db.from("library_wishlist").upsert({ card_id: card.id, item_id: itemId }, { onConflict: "card_id,item_id", ignoreDuplicates: true });
      if (error) throw error;
      return json({ ok: true });
    }
    if (action === "wishlist-remove") {
      const { error } = await db.from("library_wishlist").delete().eq("card_id", card.id).eq("item_id", String(body.item_id || ""));
      if (error) throw error;
      return json({ ok: true });
    }
    if (action === "reviews") {
      const itemId = String(body.item_id || "");
      const { data, error } = await db.from("library_reviews").select("id,card_id,rating,review,created_at,updated_at").eq("item_id", itemId).order("created_at", { ascending: false });
      if (error) throw error;
      const rows = data || [];
      return json({ reviews: rows.map((x: any) => ({ ...x, is_mine: x.card_id === card.id, card_id: undefined })), average: rows.length ? rows.reduce((n: number, x: any) => n + x.rating, 0) / rows.length : null, count: rows.length });
    }
    if (action === "review-save") {
      const itemId = String(body.item_id || "");
      const rating = Number(body.rating);
      const review = String(body.review || "").trim();
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) return fail("Choose a rating from 1 to 5.");
      if (review.length > 1000) return fail("Review must be 1,000 characters or fewer.");
      const { data, error } = await db.from("library_reviews").upsert({ card_id: card.id, item_id: itemId, rating, review, updated_at: new Date().toISOString() }, { onConflict: "card_id,item_id" }).select("id,rating,review,updated_at").single();
      if (error) throw error;
      return json({ review: data });
    }
    if (action === "waitlist") {
      const { data, error } = await db.from("library_waitlist").select("id,item_id,status,created_at").eq("card_id", card.id).in("status", ["waiting","ready"]).order("created_at", { ascending: false });
      if (error) throw error;
      const ids = (data || []).map((x: any) => x.item_id);
      const { data: rows, error: itemError } = ids.length ? await db.from("library_items").select("id,title,author,media_type,cover_path").in("id", ids) : { data: [], error: null };
      if (itemError) throw itemError;
      const map = new Map((rows || []).map((x: any) => [x.id, x]));
      return json({ items: await Promise.all((data || []).map(async (x: any) => ({ ...x, item: map.get(x.item_id), cover_url: await signedCover(map.get(x.item_id)?.cover_path || null) }))) });
    }
    if (action === "waitlist-join") {
      const itemId = String(body.item_id || "");
      const { data: item, error: itemError } = await db.from("library_items").select("id,total_copies").eq("id", itemId).maybeSingle();
      if (itemError) throw itemError;
      if (!item) return fail("Book not found.", 404);
      const { count, error: countError } = await db.from("library_loans").select("id", { count: "exact", head: true }).eq("item_id", itemId).is("returned_at", null).gt("due_at", new Date().toISOString());
      if (countError) throw countError;
      if ((item.total_copies - (count || 0)) > 0) return fail("A copy is available now. You can borrow it from Discover.");
      const { error } = await db.from("library_waitlist").insert({ card_id: card.id, item_id: itemId });
      if (error?.code === "23505") return fail("You are already on this waitlist.");
      if (error) throw error;
      return json({ ok: true }, 201);
    }
    if (action === "waitlist-cancel") {
      const { error } = await db.from("library_waitlist").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", String(body.waitlist_id || "")).eq("card_id", card.id).in("status", ["waiting","ready"]);
      if (error) throw error;
      return json({ ok: true });
    }
    if (action === "recent-view") {
      const itemId = String(body.item_id || "");
      const { error } = await db.from("library_recent_views").upsert({ card_id: card.id, item_id: itemId, viewed_at: new Date().toISOString() }, { onConflict: "card_id,item_id" });
      if (error) throw error;
      return json({ ok: true });
    }
    if (action === "recent-views") {
      const { data, error } = await db.from("library_recent_views").select("item_id,viewed_at").eq("card_id", card.id).order("viewed_at", { ascending: false }).limit(12);
      if (error) throw error;
      const ids = (data || []).map((x: any) => x.item_id);
      const { data: rows, error: itemError } = ids.length ? await db.from("library_items").select("id,title,author,media_type,age_classification,cover_path").in("id", ids) : { data: [], error: null };
      if (itemError) throw itemError;
      const map = new Map((rows || []).map((x: any) => [x.id, x]));
      return json({ items: await Promise.all((data || []).filter((x: any) => map.has(x.item_id)).map(async (x: any) => ({ ...map.get(x.item_id), viewed_at: x.viewed_at, cover_url: await signedCover(map.get(x.item_id)?.cover_path || null) }))) });
    }
    if (action === "reader-bookmarks" || action === "reader-notes") {
      const table = action === "reader-bookmarks" ? "library_bookmarks" : "library_notes";
      const select = action === "reader-bookmarks" ? "id,loan_id,location,label,created_at" : "id,loan_id,content,created_at,updated_at";
      let query = db.from(table).select(select).eq("card_id", card.id).order("created_at", { ascending: false });
      if (body.loan_id) query = query.eq("loan_id", String(body.loan_id));
      const { data, error } = await query;
      if (error) throw error;
      return json({ entries: data || [] });
    }
    if (action === "bookmark-add") {
      const loanId = String(body.loan_id || ""), location = String(body.location || "").trim(), label = String(body.label || "").trim();
      if (!location || location.length > 500 || label.length > 120) return fail("Enter a valid bookmark location and label.");
      const { data: loan } = await db.from("library_loans").select("id").eq("id", loanId).eq("card_id", card.id).is("returned_at", null).maybeSingle();
      if (!loan) return fail("That loan is no longer active.", 404);
      const { data, error } = await db.from("library_bookmarks").insert({ card_id: card.id, loan_id: loanId, location, label }).select("id,loan_id,location,label,created_at").single();
      if (error) throw error;
      return json({ entry: data }, 201);
    }
    if (action === "bookmark-delete" || action === "note-delete") {
      const table = action === "bookmark-delete" ? "library_bookmarks" : "library_notes";
      const { error } = await db.from(table).delete().eq("id", String(body.id || "")).eq("card_id", card.id);
      if (error) throw error;
      return json({ ok: true });
    }
    if (action === "note-add") {
      const loanId = String(body.loan_id || ""), content = String(body.content || "").trim();
      if (!content || content.length > 3000) return fail("Notes must be between 1 and 3,000 characters.");
      const { data: loan } = await db.from("library_loans").select("id").eq("id", loanId).eq("card_id", card.id).is("returned_at", null).maybeSingle();
      if (!loan) return fail("That loan is no longer active.", 404);
      const { data, error } = await db.from("library_notes").insert({ card_id: card.id, loan_id: loanId, content }).select("id,loan_id,content,created_at").single();
      if (error) throw error;
      return json({ entry: data }, 201);
    }
    if (action === "reader-stats") {
      const [all, active, wish, loanRows] = await Promise.all([
        db.from("library_loans").select("id", { count: "exact", head: true }).eq("card_id", card.id),
        db.from("library_loans").select("id", { count: "exact", head: true }).eq("card_id", card.id).is("returned_at", null).gt("due_at", new Date().toISOString()),
        db.from("library_wishlist").select("item_id", { count: "exact", head: true }).eq("card_id", card.id),
        db.from("library_loans").select("id").eq("card_id", card.id)
      ]);
      if (all.error || active.error || wish.error || loanRows.error) throw all.error || active.error || wish.error || loanRows.error;
      const loanIds = (loanRows.data || []).map((x: any) => x.id);
      const progressResult = loanIds.length ? await db.from("library_progress").select("audio_position_seconds,current_page,total_pages").in("loan_id", loanIds) : { data: [], error: null };
      if (progressResult.error) throw progressResult.error;
      const progress = progressResult.data || [];
      const minutes = progress.reduce((n: number, x: any) => n + Number(x.audio_position_seconds || 0), 0) / 60;
      const pages = progress.reduce((n: number, x: any) => n + Number(x.current_page || 0), 0);
      return json({ total_loans: all.count || 0, active_loans: active.count || 0, wishlist: wish.count || 0, listening_minutes: Math.round(minutes), pages_read: pages });
    }
    if (action === "recommendations") {
      const { data: history, error: historyError } = await db.from("library_loans").select("item_id").eq("card_id", card.id).order("borrowed_at", { ascending: false }).limit(30);
      if (historyError) throw historyError;
      const ids = [...new Set((history || []).map((x: any) => x.item_id))];
      const { data: viewed } = await db.from("library_recent_views").select("item_id").eq("card_id", card.id);
      const excluded = [...new Set([...ids, ...(viewed || []).map((x: any) => x.item_id)])];
      const { data: prefs } = ids.length ? await db.from("library_items").select("media_type").in("id", ids) : { data: [] };
      const counts = new Map<string, number>();
      for (const x of prefs || []) counts.set(x.media_type, (counts.get(x.media_type) || 0) + 1);
      const preferred = [...counts.entries()].sort((a,b) => b[1]-a[1])[0]?.[0];
      let q = db.from("library_items").select("id,title,author,media_type,age_classification,total_copies,cover_path").order("created_at", { ascending: false }).limit(8);
      if (preferred) q = q.eq("media_type", preferred);
      if (excluded.length) q = q.not("id", "in", "(" + excluded.join(",") + ")");
      const { data, error } = await q;
      if (error) throw error;
      return json({ items: await Promise.all((data || []).map(async (x: any) => ({ ...x, cover_url: await signedCover(x.cover_path) }))) });
    }
    if (action === "reading-goal") {
      const year = Number(body.year) || new Date().getFullYear();
      if (!Number.isInteger(year) || year < 2020 || year > 2100) return fail("Choose a valid goal year.");
      if (body.target_books !== undefined) {
        const target = Number(body.target_books);
        if (!Number.isInteger(target) || target < 1 || target > 500) return fail("Set a goal between 1 and 500 books.");
        const { error } = await db.from("library_reading_goals").upsert({ card_id: card.id, goal_year: year, target_books: target, updated_at: new Date().toISOString() }, { onConflict: "card_id,goal_year" });
        if (error) throw error;
      }
      const start = new Date(Date.UTC(year,0,1)).toISOString(), end = new Date(Date.UTC(year+1,0,1)).toISOString();
      const [{ data: goal }, { count, error: countError }] = await Promise.all([
        db.from("library_reading_goals").select("target_books").eq("card_id", card.id).eq("goal_year", year).maybeSingle(),
        db.from("library_loans").select("id", { count: "exact", head: true }).eq("card_id", card.id).not("returned_at", "is", null).gte("borrowed_at", start).lt("borrowed_at", end)
      ]);
      if (countError) throw countError;
      return json({ year, target_books: goal?.target_books || 12, finished_books: count || 0 });
    }
    if (action === "collections") {
      const { data, error } = await db.from("library_collections").select("id,name,created_at").eq("card_id", card.id).order("created_at", { ascending: false });
      if (error) throw error;
      const ids = (data || []).map((x: any) => x.id);
      const { data: links, error: linkError } = ids.length ? await db.from("library_collection_items").select("collection_id,item_id,added_at").in("collection_id", ids) : { data: [], error: null };
      if (linkError) throw linkError;
      const itemIds = [...new Set((links || []).map((x: any) => x.item_id))];
      const { data: items, error: itemError } = itemIds.length ? await db.from("library_items").select("id,title,author,media_type,genre,series_name,series_number,cover_path").in("id", itemIds) : { data: [], error: null };
      if (itemError) throw itemError;
      const itemMap = new Map((items || []).map((x: any) => [x.id,x]));
      const linksByCollection = new Map<string, any[]>();
      for (const link of links || []) linksByCollection.set(link.collection_id, [...(linksByCollection.get(link.collection_id)||[]), { ...link, item: itemMap.get(link.item_id) }]);
      return json({ collections: await Promise.all((data || []).map(async (x: any) => ({ ...x, items: await Promise.all((linksByCollection.get(x.id)||[]).filter((v:any)=>v.item).map(async (v:any)=>({ ...v, item: { ...v.item, cover_url: await signedCover(v.item.cover_path) } }))) }))) });
    }
    if (action === "collection-create") {
      const name = String(body.name || "").trim();
      if (!name || name.length > 60) return fail("Collection names must be 1 to 60 characters.");
      const { data, error } = await db.from("library_collections").insert({ card_id: card.id, name }).select("id,name,created_at").single();
      if (error?.code === "23505") return fail("You already have a collection with that name.");
      if (error) throw error;
      return json({ collection: data }, 201);
    }
    if (action === "collection-delete") {
      const { error } = await db.from("library_collections").delete().eq("id", String(body.collection_id || "")).eq("card_id", card.id);
      if (error) throw error;
      return json({ ok: true });
    }
    if (action === "collection-add") {
      const collectionId = String(body.collection_id || ""), itemId = String(body.item_id || "");
      const { data: owned, error: ownedError } = await db.from("library_collections").select("id").eq("id", collectionId).eq("card_id", card.id).maybeSingle();
      if (ownedError) throw ownedError;
      if (!owned) return fail("Collection not found.", 404);
      const { error } = await db.from("library_collection_items").upsert({ collection_id: collectionId, item_id: itemId }, { onConflict: "collection_id,item_id", ignoreDuplicates: true });
      if (error) throw error;
      return json({ ok: true });
    }
    if (action === "collection-remove") {
      const collectionId = String(body.collection_id || ""), itemId = String(body.item_id || "");
      const { data: owned, error: ownedError } = await db.from("library_collections").select("id").eq("id", collectionId).eq("card_id", card.id).maybeSingle();
      if (ownedError) throw ownedError;
      if (!owned) return fail("Collection not found.", 404);
      const { error } = await db.from("library_collection_items").delete().eq("collection_id", collectionId).eq("item_id", itemId);
      if (error) throw error;
      return json({ ok: true });
    }
    if (action === "reader-profile") {
      if (body.display_name !== undefined) {
        const displayName = String(body.display_name || "").trim();
        if (!displayName || displayName.length > 60) return fail("Display name must be 1 to 60 characters.");
        const { error } = await db.from("library_cards").update({ display_name: displayName }).eq("id", card.id);
        if (error) throw error;
      }
      if (body.bio !== undefined || body.favorite_genre !== undefined) {
        const bio = String(body.bio || "").trim(), favoriteGenre = String(body.favorite_genre || "").trim();
        if (bio.length > 240 || favoriteGenre.length > 60) return fail("Profile text is too long.");
        const { error } = await db.from("library_reader_profiles").upsert({ card_id: card.id, bio, favorite_genre: favoriteGenre, updated_at: new Date().toISOString() }, { onConflict: "card_id" });
        if (error) throw error;
      }
      const [{ data: profile }, { data: cardData }] = await Promise.all([
        db.from("library_reader_profiles").select("bio,favorite_genre").eq("card_id", card.id).maybeSingle(),
        db.from("library_cards").select("display_name,card_number,created_at").eq("id", card.id).single()
      ]);
      return json({ profile: { display_name: cardData.display_name, card_suffix: String(cardData.card_number).slice(-4), member_since: cardData.created_at, bio: profile?.bio || "", favorite_genre: profile?.favorite_genre || "" } });
    }
    if (action === "announcements") {
      const { data, error } = await db.from("library_announcements").select("id,title,message,created_at").eq("is_published", true).order("created_at", { ascending: false }).limit(12);
      if (error) throw error;
      return json({ announcements: data || [] });
    }
    if (action === "admin-announcement-create") {
      if (!(await adminOnly(card))) return fail("Administrator access required.", 403);
      const title = String(body.title || "").trim(), message = String(body.message || "").trim();
      if (!title || title.length > 120 || !message || message.length > 1500) return fail("Enter a title and a message (up to 1,500 characters).");
      const { data, error } = await db.from("library_announcements").insert({ title, message, created_by: card.id }).select("id,title,message,created_at").single();
      if (error) throw error;
      const { data: readers, error: readersError } = await db.from("library_cards").select("id").is("disabled_at", null);
      if (readersError) throw readersError;
      const rows = (readers || []).filter((x:any)=>x.id!==card.id).map((x:any)=>({ card_id:x.id, kind:"announcement", title, message, source_key:"announcement:"+data.id }));
      if (rows.length) { const { error: notifyError } = await db.from("library_notifications").upsert(rows, { onConflict:"card_id,source_key", ignoreDuplicates:true }); if (notifyError) throw notifyError; }
      return json({ announcement: data }, 201);
    }
    if (action === "admin-announcement-delete") {
      if (!(await adminOnly(card))) return fail("Administrator access required.", 403);
      const { error } = await db.from("library_announcements").delete().eq("id", String(body.announcement_id || ""));
      if (error) throw error;
      return json({ ok: true });
    }
    if (action === "notifications") {
      const { data, error } = await db.from("library_notifications").select("id,kind,title,message,created_at,read_at").eq("card_id", card.id).order("created_at", { ascending: false }).limit(30);
      if (error) throw error;
      return json({ notifications: data || [], unread: (data || []).filter((x:any)=>!x.read_at).length });
    }
    if (action === "notification-read") {
      const { error } = await db.from("library_notifications").update({ read_at: new Date().toISOString() }).eq("id", String(body.notification_id || "")).eq("card_id", card.id).is("read_at", null);
      if (error) throw error;
      return json({ ok: true });
    }
    if (action === "admin-analytics") {
      if (!(await adminOnly(card))) return fail("Administrator access required.", 403);
      const [cards, items, loans, overdue, requests, waiting] = await Promise.all([
        db.from("library_cards").select("id", { count: "exact", head: true }).is("disabled_at", null),
        db.from("library_items").select("id", { count: "exact", head: true }),
        db.from("library_loans").select("id", { count: "exact", head: true }).is("returned_at", null).gt("due_at", new Date().toISOString()),
        db.from("library_loans").select("id", { count: "exact", head: true }).is("returned_at", null).lte("due_at", new Date().toISOString()),
        db.from("library_book_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        db.from("library_waitlist").select("id", { count: "exact", head: true }).eq("status", "waiting")
      ]);
      for (const x of [cards,items,loans,overdue,requests,waiting]) if (x.error) throw x.error;
      return json({ active_cards: cards.count || 0, catalogue_items: items.count || 0, active_loans: loans.count || 0, overdue_loans: overdue.count || 0, pending_requests: requests.count || 0, waitlist_entries: waiting.count || 0 });
    }
    if (action === "admin-loans") {
      if (!(await adminOnly(card))) return fail("Administrator access required.", 403);
      const { data, error } = await db.from("library_loans").select("id,card_id,item_id,borrowed_at,due_at,returned_at").is("returned_at", null).order("due_at");
      if (error) throw error;
      const itemIds = [...new Set((data || []).map((x: any) => x.item_id))], cardIds = [...new Set((data || []).map((x: any) => x.card_id))];
      const [{ data: itemRows }, { data: cardRows }] = await Promise.all([
        itemIds.length ? db.from("library_items").select("id,title,author").in("id", itemIds) : { data: [] },
        cardIds.length ? db.from("library_cards").select("id,display_name,card_number").in("id", cardIds) : { data: [] }
      ]);
      const im = new Map((itemRows || []).map((x: any) => [x.id,x])), cm = new Map((cardRows || []).map((x: any) => [x.id,x]));
      return json({ loans: (data || []).map((x: any) => ({ ...x, item: im.get(x.item_id), member: cm.get(x.card_id) ? { display_name: cm.get(x.card_id).display_name, card_suffix: String(cm.get(x.card_id).card_number).slice(-4) } : null })) });
    }
    if (action === "admin-overdue-history") {
      if (!(await adminOnly(card))) return fail("Administrator access required.", 403);
      const { data, error } = await db.from("library_loans").select("id,card_id,item_id,borrowed_at,due_at,returned_at").not("returned_at", "is", null).order("returned_at", { ascending: false }).limit(100);
      if (error) throw error;
      const expired = (data || []).filter((x: any) => Math.abs(new Date(x.returned_at).getTime() - new Date(x.due_at).getTime()) < 1500);
      const itemIds = [...new Set(expired.map((x: any) => x.item_id))], cardIds = [...new Set(expired.map((x: any) => x.card_id))];
      const [{ data: itemRows }, { data: cardRows }] = await Promise.all([
        itemIds.length ? db.from("library_items").select("id,title,author").in("id", itemIds) : { data: [] },
        cardIds.length ? db.from("library_cards").select("id,display_name,card_number").in("id", cardIds) : { data: [] }
      ]);
      const im = new Map((itemRows || []).map((x: any) => [x.id,x])), cm = new Map((cardRows || []).map((x: any) => [x.id,x]));
      return json({ loans: expired.map((x: any) => ({ ...x, item: im.get(x.item_id), member: cm.get(x.card_id) ? { display_name: cm.get(x.card_id).display_name, card_suffix: String(cm.get(x.card_id).card_number).slice(-4) } : null })) });
    }
    if (action === "admin-restore-loan") {
      if (!(await adminOnly(card))) return fail("Administrator access required.", 403);
      const loanId = String(body.loan_id || ""), days = Number(body.days);
      if (!Number.isInteger(days) || days < 1 || days > 30) return fail("Choose an extension from 1 to 30 days.");
      const { data: loan, error: readError } = await db.from("library_loans").select("id,due_at,returned_at").eq("id", loanId).maybeSingle();
      if (readError) throw readError;
      if (!loan || !loan.returned_at || Math.abs(new Date(loan.returned_at).getTime() - new Date(loan.due_at).getTime()) >= 1500) return fail("Only automatically expired loans can be restored.", 409);
      const due = new Date(Date.now() + days * 86400000).toISOString();
      const { error } = await db.from("library_loans").update({ due_at: due, returned_at: null }).eq("id", loanId);
      if (error) throw error;
      return json({ ok: true, due_at: due });
    }
    if (action === "admin-extend-loan") {
      if (!(await adminOnly(card))) return fail("Administrator access required.", 403);
      const loanId = String(body.loan_id || ""), days = Number(body.days);
      if (!Number.isInteger(days) || days < 1 || days > 30) return fail("Choose an extension from 1 to 30 days.");
      const { data: loan, error: readError } = await db.from("library_loans").select("id,due_at").eq("id", loanId).is("returned_at", null).maybeSingle();
      if (readError) throw readError;
      if (!loan) return fail("Active loan not found.", 404);
      const base = new Date(Math.max(Date.now(), new Date(loan.due_at).getTime()));
      base.setDate(base.getDate() + days);
      const { error } = await db.from("library_loans").update({ due_at: base.toISOString() }).eq("id", loanId).is("returned_at", null);
      if (error) throw error;
      return json({ ok: true, due_at: base.toISOString() });
    }
    if (action === "book-request-create") {
      const title = String(body.title || "").trim();
      const author = String(body.author || "").trim();
      const reason = String(body.reason || "").trim();
      if (!title || title.length > 180) return fail("Enter a title up to 180 characters.");
      if (author.length > 120) return fail("Author must be 120 characters or fewer.");
      if (reason.length > 1000) return fail("Reason must be 1,000 characters or fewer.");
      const { data, error } = await db.from("library_book_requests")
        .insert({ card_id: card.id, title, author, reason })
        .select("id,title,author,reason,status,admin_note,created_at").single();
      if (error) throw error;
      return json({ request: data }, 201);
    }
    if (action === "book-requests") {
      const { data, error } = await db.from("library_book_requests")
        .select("id,title,author,reason,status,admin_note,created_at,updated_at")
        .eq("card_id", card.id).order("created_at", { ascending: false });
      if (error) throw error;
      return json({ requests: data || [] });
    }
    if (action === "admin-book-requests") {
      if (!(await adminOnly(card))) return fail("Administrator access required.", 403);
      const { data, error } = await db.from("library_book_requests")
        .select("id,title,author,reason,status,admin_note,created_at,card_id")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return json({ requests: data || [] });
    }
    if (action === "admin-update-book-request") {
      if (!(await adminOnly(card))) return fail("Administrator access required.", 403);
      const requestId = String(body.request_id || "");
      const status = String(body.status || "");
      const adminNote = String(body.admin_note || "").trim();
      if (!requestId) return fail("Request ID is missing.");
      if (!["pending", "approved", "declined"].includes(status)) return fail("Choose a valid request status.");
      if (adminNote.length > 1000) return fail("Admin note must be 1,000 characters or fewer.");
      const { data: existingRequest, error: requestReadError } = await db.from("library_book_requests").select("id,card_id,title").eq("id", requestId).maybeSingle();
      if (requestReadError) throw requestReadError;
      if (!existingRequest) return fail("Request not found.", 404);
      const { data, error } = await db.from("library_book_requests")
        .update({ status, admin_note: adminNote, updated_at: new Date().toISOString() })
        .eq("id", requestId).select("id,status,admin_note").maybeSingle();
      if (error) throw error;
      if (!data) return fail("Request not found.", 404);
      await db.from("library_notifications").insert({ card_id: existingRequest.card_id, kind: "request", title: "Your book request was updated", message: existingRequest.title + " is now " + status + (adminNote ? ". " + adminNote : "."), source_key: "request:" + requestId + ":" + new Date().toISOString() });
      return json({ request: data });
    }
    if (action === "delete-card") {
      if (card.role === "admin") return fail("The administrator card cannot be deleted here.", 403);
      await db.from("library_cards").update({ disabled_at: new Date().toISOString() }).eq("id", card.id);
      await db.from("library_sessions").update({ revoked_at: new Date().toISOString() }).eq("card_id", card.id);
      return json({ ok: true });
    }
    if (action === "admin-delete-item") {
      if (!(await adminOnly(card))) return fail("Administrator access required.", 403);
      const itemId = String(body.item_id || "");
      const { data: active } = await db.from("library_loans").select("id")
        .eq("item_id", itemId).is("returned_at", null).gt("due_at", new Date().toISOString()).limit(1);
      if (active?.length) return fail("Return active loans before removing this item.", 409);
      const { data: item } = await db.from("library_items").select("file_path,cover_path").eq("id", itemId).maybeSingle();
      if (!item) return fail("Item not found.", 404);
      const { error: storageError } = await db.storage.from("library-media").remove([item.file_path, item.cover_path]);
      if (storageError) throw storageError;
      const { error } = await db.from("library_items").delete().eq("id", itemId);
      if (error) throw error;
      return json({ ok: true });
    }
    return fail("Unknown action.", 404);
  } catch (error) {
    console.error("library-api error", error);
    return fail("The library could not complete that request. Please try again.", 500);
  }
});
