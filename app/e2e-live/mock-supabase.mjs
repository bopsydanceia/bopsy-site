// A small stand-in for a Supabase project, just enough of GoTrue, PostgREST,
// Storage and the Edge Functions of the contract (supabase/functions/README.md
// of the app repo) to run the live adapters (src/live) end to end without an
// account. Not a test of the server: the rules live in the real migrations
// and functions. Follows the contract's shapes: the CAPTCHA of Auth (D132),
// start-preview's platform, Origin and Turnstile token (D130), the private
// previews bucket behind preview-url, and the common 429 (D131).
// node e2e-live/mock-supabase.mjs  (port 54321, posters from the app on 4175)
// GET /__log: the requests seen; POST /__control {flags}: the next refusals.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.MOCK_PORT ?? 54321);
const APP = process.env.MOCK_APP_ORIGIN ?? 'http://localhost:4175';
const SELF = `http://localhost:${PORT}`;
const CODE = '123456';
const clip = (name) => readFileSync(fileURLToPath(new URL(`../public/demo/${name}`, import.meta.url)));

const users = new Map(); // id -> user
const tokens = new Map(); // access token -> user id
const photos = new Map(); // storage path -> { id, user_id }
const videos = new Map(); // id -> row
const usedCaptcha = new Set(); // Turnstile tokens are single use
const log = []; // requests, for the test (GET /__log)
let signed = 0;
/** Refusals asked by the test: each flag is used once, except the limits that stay until cleared. */
const control = {
  authCaptchaFailOnce: false,
  previewCaptchaFailOnce: false,
  checkLimitOnce: false,
  reportLimit: false,
  generationLimit: false,
  brokenPreviewUrlOnce: false,
  previewUrlSeconds: 120,
};
/** Emails with bought coins (C4: they pay without a plan). */
const RICH = new Set(['rich@example.com']);

const dances = [
  ['street-bounce', 'Street Bounce', 'trends', 'man-dance', true, false],
  ['hip-sway', 'Hip Sway', 'trends', 'dog-dance', false, true],
  ['kitchen-boogie', 'Kitchen Boogie', 'pets', 'cat-dance', false, false],
].map(([slug, name, family, poster, isNew, isHot], index) => ({
  id: `00000000-0000-4000-8000-00000000000${index + 1}`, slug, name, family, preview_url: `${APP}/demo/${poster}.webp`,
  cost: 60, duration_seconds: 8, is_new: isNew, is_hot: isHot, sort: index + 1,
}));

function session(user) {
  const access = `access-${randomUUID()}`;
  tokens.set(access, user.id);
  return { access_token: access, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: `refresh-${user.id}`, user };
}

function newUser(email) {
  const user = { id: randomUUID(), aud: 'authenticated', role: 'authenticated', email: email ?? '', is_anonymous: !email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  users.set(user.id, user);
  return user;
}

function caller(req) {
  const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
  return token ? users.get(tokens.get(token)) : undefined;
}

/** GoTrue's CAPTCHA check (Attack Protection on): a fresh token each call. */
function authCaptchaOk(body) {
  const token = body?.gotrue_meta_security?.captcha_token;
  if (typeof token !== 'string' || !token || usedCaptcha.has(token)) return false;
  usedCaptcha.add(token);
  if (control.authCaptchaFailOnce) {
    control.authCaptchaFailOnce = false;
    return false;
  }
  return true;
}

function videoRow(video) {
  const age = Date.now() - Date.parse(video.created_at);
  if (video.status === 'rendering' && age > 2500) Object.assign(video, { status: 'ready', progress: 100, ready_at: new Date().toISOString(), result_path: `${video.user_id}/${video.id}.mp4` });
  return video;
}

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, accept, accept-profile, content-profile, prefer, range, x-upsert, cache-control, x-supabase-api-version',
  'access-control-expose-headers': 'content-range, retry-after',
};

function send(res, status, body, type = 'application/json', headers = {}) {
  res.writeHead(status, { ...cors, 'content-type': type, ...headers });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}

/** The common 429 of the Edge Functions (D131). */
function limited(res, action, seconds) {
  send(res, 429, { error: 'rate_limited', action, retry_after: seconds }, 'application/json', { 'retry-after': String(seconds) });
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks);
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    return raw.length;
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url, SELF);
  const path = url.pathname;
  if (req.method === 'OPTIONS') return send(res, 204, '', 'text/plain');
  const body = req.method === 'GET' ? null : await readBody(req);
  const user = caller(req);
  if (path === '/__log') return send(res, 200, log);
  if (path === '/__control') {
    Object.assign(control, body);
    return send(res, 200, control);
  }
  log.push({ method: req.method, path, query: url.search, user: user?.id ?? null, origin: req.headers.origin ?? null, body: typeof body === 'object' ? body : null });

  if (path === '/rest/v1/dances') {
    if (url.searchParams.get('active') !== 'eq.true') return send(res, 400, { message: 'active filter expected' });
    return send(res, 200, dances);
  }
  // GoTrue
  if (path === '/auth/v1/signup' && req.method === 'POST') {
    if (!authCaptchaOk(body)) return send(res, 400, { code: 'captcha_failed', msg: 'captcha protection: request disallowed (invalid-input-response)' });
    return send(res, 200, session(newUser(null)));
  }
  if (path === '/auth/v1/user' && req.method === 'GET') return user ? send(res, 200, user) : send(res, 401, { code: 'no_authorization' });
  if (path === '/auth/v1/user' && req.method === 'PUT') {
    if (!user) return send(res, 401, { code: 'no_authorization' });
    const taken = [...users.values()].some((other) => other.email === body.email && other.id !== user.id);
    if (taken) return send(res, 422, { code: 'email_exists', msg: 'A user with this email address has already been registered' });
    user.new_email = body.email;
    return send(res, 200, user);
  }
  if (path === '/auth/v1/otp' && req.method === 'POST') {
    if (!authCaptchaOk(body)) return send(res, 400, { code: 'captcha_failed', msg: 'captcha protection: request disallowed (invalid-input-response)' });
    return send(res, 200, {});
  }
  if (path === '/auth/v1/verify' && req.method === 'POST') {
    if (body.token !== CODE) return send(res, 403, { code: 'otp_expired', msg: 'Token has expired or is invalid' });
    if (body.type === 'email_change') {
      // GoTrue finds the user by the pending email and the code, not by the JWT.
      const changing = [...users.values()].find((other) => other.new_email === body.email);
      if (!changing) return send(res, 403, { code: 'otp_expired', msg: 'Token has expired or is invalid' });
      Object.assign(changing, { email: body.email, is_anonymous: false });
      delete changing.new_email;
      return send(res, 200, session(changing));
    }
    const existing = [...users.values()].find((other) => other.email === body.email) ?? newUser(body.email);
    return send(res, 200, session(existing));
  }
  if (path === '/auth/v1/token') {
    const id = String(body?.refresh_token ?? '').replace('refresh-', '');
    return users.has(id) ? send(res, 200, session(users.get(id))) : send(res, 400, { code: 'refresh_token_not_found' });
  }
  if (path === '/auth/v1/logout') return send(res, 204, '', 'text/plain');
  // Storage: photos (own folder, images only), results (paid videos), previews (no client access, preview-url only)
  const upload = /^\/storage\/v1\/object\/photos\/(.+)$/.exec(path);
  if (upload && req.method === 'POST') {
    // storage-js sends a multipart form; the type and size rules of the bucket are not mocked.
    if (!user || !upload[1].startsWith(`${user.id}/`)) return send(res, 400, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
    return send(res, 200, { Key: `photos/${upload[1]}`, Id: randomUUID() });
  }
  const sign = /^\/storage\/v1\/object\/sign\/(results|photos)\/(.+)$/.exec(path);
  if (sign && req.method === 'POST') return send(res, 200, { signedURL: `/object/sign/${sign[1]}/${sign[2]}?token=t` });
  const read = /^\/storage\/v1\/object\/sign\/(results|photos|previews)\/(.+)$/.exec(path);
  if (read && req.method === 'GET') {
    const id = read[2].split('/')[1]?.replace('.mp4', '');
    const video = videos.get(id);
    if (read[1] === 'previews') {
      if (url.searchParams.get('token') === 'broken') return send(res, 400, { statusCode: '400', error: 'InvalidJWT', message: 'jwt expired' });
      return video?.is_preview ? send(res, 200, clip('man-preview.mp4'), 'video/mp4') : send(res, 404, { message: 'not found' });
    }
    if (read[1] === 'results' && video?.is_preview) return send(res, 404, { message: 'not found' }); // previews are not in results
    return send(res, 200, clip('man-result.mp4'), 'video/mp4');
  }
  // Edge Functions (contract of supabase/functions/README.md)
  if (path.startsWith('/functions/v1/') && !user) return send(res, 401, { error: 'unauthorized' });
  if (path === '/functions/v1/check-photo') {
    if (!String(body.photo_path).startsWith(`${user.id}/`)) return send(res, 403, { error: 'not_your_photo' });
    // Asked again (lost answer, retry): the stored verdict, no new check, no limit taken.
    const known = photos.get(body.photo_path);
    if (known) return send(res, 200, { status: 'accepted', photo_id: known.id });
    if (control.checkLimitOnce) {
      control.checkLimitOnce = false;
      return limited(res, 'photo_check', 600);
    }
    const id = randomUUID();
    photos.set(body.photo_path, { id, user_id: user.id });
    return send(res, 200, { status: 'accepted', photo_id: id });
  }
  if (path === '/functions/v1/start-preview' || path === '/functions/v1/start-generation') {
    const preview = path.endsWith('preview');
    if (preview) {
      if (body.platform !== undefined && body.platform !== 'web' && body.platform !== 'ios') return send(res, 400, { error: 'platform_invalid' });
      const fromWeb = req.headers.origin === APP;
      if (body.platform === 'web' && !fromWeb) return send(res, 403, { error: 'origin_not_allowed' });
      if (fromWeb || body.platform === 'web') {
        const token = body.captcha_token;
        const fresh = typeof token === 'string' && token !== '' && !usedCaptcha.has(token);
        if (fresh) usedCaptcha.add(token);
        if (!fresh || control.previewCaptchaFailOnce) {
          control.previewCaptchaFailOnce = false;
          return send(res, 403, { error: 'captcha_failed' });
        }
      }
    }
    if (!body.consent_at) return send(res, 409, { refusal: 'consent_missing' });
    const photo = [...photos.values()].find((item) => item.id === body.photo_id);
    if (photo?.user_id !== user.id) return send(res, 409, { refusal: 'photo_not_checked' });
    if (preview && [...videos.values()].some((video) => video.is_preview && video.user_id === user.id)) return send(res, 409, { refusal: 'preview_already_used' });
    if (!preview && control.generationLimit) return limited(res, 'generation', 1500);
    if (!preview && !RICH.has(user.email)) return send(res, 409, { refusal: 'not_subscribed' });
    const video = {
      id: randomUUID(), user_id: user.id, dance_id: body.dance_id, photo_id: body.photo_id, status: 'rendering', progress: 0, error_code: null,
      is_preview: preview, cost: preview ? 0 : 60, coins_refunded: 0, created_at: new Date().toISOString(), ready_at: null, result_path: null,
    };
    videos.set(video.id, video);
    return send(res, 200, { video });
  }
  if (path === '/functions/v1/preview-url') {
    const video = videos.get(body.video_id);
    if (!video || video.user_id !== user.id || !video.is_preview || videoRow(video).status !== 'ready') return send(res, 404, { error: 'preview_not_found' });
    const broken = control.brokenPreviewUrlOnce;
    control.brokenPreviewUrlOnce = false;
    const token = broken ? 'broken' : `p${++signed}`;
    return send(res, 200, { url: `${SELF}/storage/v1/object/sign/previews/${video.result_path}?token=${token}`, expires_in: control.previewUrlSeconds, thumbnail_url: null });
  }
  if (path === '/functions/v1/delete-media') return send(res, 200, { ok: true });
  // PostgREST, RLS: own rows only
  if (path === '/rest/v1/videos') {
    const id = url.searchParams.get('id')?.replace('eq.', '');
    const rows = [...videos.values()].filter((video) => video.user_id === user?.id && (!id || video.id === id)).map(videoRow);
    return send(res, 200, rows);
  }
  if (path === '/rest/v1/photos') {
    const id = url.searchParams.get('id')?.replace('eq.', '');
    const found = [...photos.entries()].find(([, photo]) => photo.id === id);
    return send(res, 200, found && found[1].user_id === user?.id ? [{ storage_path: found[0], erased_at: null }] : []);
  }
  if (path === '/rest/v1/app_config') return send(res, 200, user ? [{ value: 2 }] : []);
  if (path === '/rest/v1/wallets') {
    if (!user) return send(res, 200, []);
    const bought = RICH.has(user.email) ? 600 : 0;
    return send(res, 200, [{ plan_balance: 0, bought_balance: bought, total: bought }]);
  }
  if (path === '/rest/v1/subscriptions') return send(res, 200, []);
  if (path === '/rest/v1/reports') {
    // The report limit is a trigger raising PT429: PostgREST answers HTTP 429 (D131).
    if (control.reportLimit) {
      return send(res, 429, { code: 'PT429', message: 'rate_limited', details: JSON.stringify({ allowed: false, action: 'report', limit: 10, remaining: 0, retry_after: 7200 }), hint: null });
    }
    return send(res, 201, '', 'text/plain');
  }
  if (path.startsWith('/realtime/')) return send(res, 404, { message: 'no realtime in the mock' });
  return send(res, 404, { message: `mock: ${req.method} ${path}` });
}).listen(PORT, () => console.log(`mock supabase on ${SELF}`));
