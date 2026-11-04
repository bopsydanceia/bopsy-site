// A small stand-in for a Supabase project, just enough of GoTrue, PostgREST,
// Storage and the Edge Functions of the contract to run the live adapters
// (src/live) end to end without an account. Not a test of the server: the
// rules live in the real migrations and functions.
// node e2e-live/mock-supabase.mjs  (port 54321, posters from the app on 4175)
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.MOCK_PORT ?? 54321);
const APP = process.env.MOCK_APP_ORIGIN ?? 'http://localhost:4175';
const CODE = '123456';
const clip = (name) => readFileSync(fileURLToPath(new URL(`../public/demo/${name}`, import.meta.url)));

const users = new Map(); // id -> user
const tokens = new Map(); // access token -> user id
const photos = new Map(); // id -> { user_id, storage_path }
const videos = new Map(); // id -> row
const log = []; // requests, for the test (GET /__log)

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

function videoRow(video) {
  const age = Date.now() - Date.parse(video.created_at);
  if (video.status === 'rendering' && age > 2500) Object.assign(video, { status: 'ready', progress: 100, ready_at: new Date().toISOString(), result_path: `${video.user_id}/${video.id}.mp4` });
  return video;
}

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, accept, accept-profile, content-profile, prefer, range, x-upsert, cache-control, x-supabase-api-version',
  'access-control-expose-headers': 'content-range',
};

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { ...cors, 'content-type': type });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
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
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  if (req.method === 'OPTIONS') return send(res, 204, '', 'text/plain');
  const body = req.method === 'GET' ? null : await readBody(req);
  const user = caller(req);
  if (path === '/__log') return send(res, 200, log);
  log.push({ method: req.method, path, query: url.search, user: user?.id ?? null, body: typeof body === 'object' ? body : null });

  if (path === '/rest/v1/dances') {
    if (url.searchParams.get('active') !== 'eq.true') return send(res, 400, { message: 'active filter expected' });
    return send(res, 200, dances);
  }
  // GoTrue
  if (path === '/auth/v1/signup' && req.method === 'POST') return send(res, 200, session(newUser(null)));
  if (path === '/auth/v1/user' && req.method === 'GET') return user ? send(res, 200, user) : send(res, 401, { code: 'no_authorization' });
  if (path === '/auth/v1/user' && req.method === 'PUT') {
    if (!user) return send(res, 401, { code: 'no_authorization' });
    const taken = [...users.values()].some((other) => other.email === body.email && other.id !== user.id);
    if (taken) return send(res, 422, { code: 'email_exists', msg: 'A user with this email address has already been registered' });
    user.new_email = body.email;
    return send(res, 200, user);
  }
  if (path === '/auth/v1/otp' && req.method === 'POST') return send(res, 200, {});
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
  // Storage
  const upload = /^\/storage\/v1\/object\/photos\/(.+)$/.exec(path);
  if (upload && req.method === 'POST') {
    if (!user || !upload[1].startsWith(`${user.id}/`)) return send(res, 403, { statusCode: '403', error: 'Unauthorized' });
    return send(res, 200, { Key: `photos/${upload[1]}`, Id: randomUUID() });
  }
  const sign = /^\/storage\/v1\/object\/sign\/(results|photos)\/(.+)$/.exec(path);
  if (sign && req.method === 'POST') return send(res, 200, { signedURL: `/object/sign/${sign[1]}/${sign[2]}?token=t` });
  if (sign && req.method === 'GET') {
    const id = sign[2].split('/')[1]?.replace('.mp4', '');
    return send(res, 200, clip(videos.get(id)?.is_preview ? 'man-preview.mp4' : 'man-result.mp4'), 'video/mp4');
  }
  // Edge Functions (contract of step3/functions)
  if (path.startsWith('/functions/v1/') && !user) return send(res, 401, { error: 'unauthorized' });
  if (path === '/functions/v1/check-photo') {
    if (!String(body.photo_path).startsWith(`${user.id}/`)) return send(res, 403, { error: 'not_your_photo' });
    const id = randomUUID();
    photos.set(id, { user_id: user.id, storage_path: body.photo_path });
    return send(res, 200, { status: 'accepted', photo_id: id });
  }
  if (path === '/functions/v1/start-preview' || path === '/functions/v1/start-generation') {
    const preview = path.endsWith('preview');
    if (!body.consent_at) return send(res, 409, { refusal: 'consent_missing' });
    if (photos.get(body.photo_id)?.user_id !== user.id) return send(res, 409, { refusal: 'photo_not_checked' });
    if (preview && [...videos.values()].some((video) => video.is_preview && video.user_id === user.id)) return send(res, 409, { refusal: 'preview_already_used' });
    if (!preview) return send(res, 409, { refusal: 'not_subscribed' });
    const video = {
      id: randomUUID(), user_id: user.id, dance_id: body.dance_id, photo_id: body.photo_id, status: 'rendering', progress: 0, error_code: null,
      is_preview: true, cost: 0, coins_refunded: 0, created_at: new Date().toISOString(), ready_at: null, result_path: null,
    };
    videos.set(video.id, video);
    return send(res, 200, { video });
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
    const photo = photos.get(id);
    return send(res, 200, photo && photo.user_id === user?.id ? [{ storage_path: photo.storage_path, erased_at: null }] : []);
  }
  if (path === '/rest/v1/app_config') return send(res, 200, user ? [{ value: 2 }] : []);
  if (path === '/rest/v1/wallets') return send(res, 200, user ? [{ plan_balance: 0, bought_balance: 0, total: 0 }] : []);
  if (path === '/rest/v1/subscriptions') return send(res, 200, []);
  if (path === '/rest/v1/reports') return send(res, 201, '', 'text/plain');
  if (path.startsWith('/realtime/')) return send(res, 404, { message: 'no realtime in the mock' });
  return send(res, 404, { message: `mock: ${req.method} ${path}` });
}).listen(PORT, () => console.log(`mock supabase on http://localhost:${PORT}`));
