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
      const [{ data: items, error }, { data: active, error: loanError }] = await Promise.all([
        db.from("library_items").select("id,title,author,narrator,description,media_type,age_classification,total_copies,page_count,audio_duration_seconds,cover_path,created_at").order("created_at", { ascending: false }),
        db.from("library_loans").select("item_id").is("returned_at", null).gt("due_at", new Date().toISOString()),
      ]);
      if (error || loanError) throw error || loanError;
      const counts = new Map<string, number>();
      for (const loan of active || []) counts.set(loan.item_id, (counts.get(loan.item_id) || 0) + 1);
      const result = await Promise.all((items || []).map(async (item) => ({
        ...item, available_copies: Math.max(0, item.total_copies - (counts.get(item.id) || 0)),
        cover_url: await signedCover(item.cover_path),
      })));
      return json({ items: result });
    }

    if (action === "item-detail") {
      const itemId = String(body.item_id || "");
      const [{ data: item, error }, { count, error: countError }] = await Promise.all([
        db.from("library_items").select("id,title,author,narrator,description,media_type,age_classification,total_copies,page_count,audio_duration_seconds,cover_path,created_at").eq("id", itemId).maybeSingle(),
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
      const { data, error } = await db.rpc("library_borrow_item", { p_card_id: card.id, p_item_id: body.item_id });
      if (error) return fail(error.message.includes("NO_COPIES") ? "No copies are available right now." : error.message.includes("ALREADY") ? "You already have this item on loan." : "Could not borrow this item.", 409);
      return json({ loan_id: data });
    }
    if (action === "return") {
      const { data, error } = await db.rpc("library_return_item", { p_card_id: card.id, p_loan_id: body.loan_id });
      if (error) throw error;
      if (!data) return fail("That loan could not be returned.", 404);
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
        page_count: mediaType === "audiobook" ? null : (Number.isInteger(Number(body.page_count)) && Number(body.page_count) > 0 ? Number(body.page_count) : null),
        audio_duration_seconds: mediaType === "audiobook" ? (Number.isInteger(Number(body.audio_duration_seconds)) && Number(body.audio_duration_seconds) > 0 ? Number(body.audio_duration_seconds) : null) : null,
        total_copies: Math.max(1, Math.min(10000, Math.floor(Number(body.total_copies) || 1))),
        file_path: body.file_path, cover_path: body.cover_path, created_by: card.id,
      };
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
        media_type: mediaType, age_classification: age, total_copies: copies,
        page_count: mediaType === "audiobook" ? null : pageCount,
        audio_duration_seconds: mediaType === "audiobook" ? duration : null,
        ...(body.cover_path ? { cover_path: String(body.cover_path) } : {}),
      };
      if (body.cover_path && !String(body.cover_path).startsWith(itemId + "/cover-")) return fail("Invalid cover upload path.");
      const { error } = await db.from("library_items").update(update).eq("id", itemId);
      if (error) throw error;
      if (body.cover_path && oldItem.cover_path !== body.cover_path) {
        const { error: removeError } = await db.storage.from("library-media").remove([oldItem.cover_path]);
        if (removeError) console.warn("Old cover cleanup failed", removeError);
      }
      return json({ ok: true });
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
