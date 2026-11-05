// Backend and AuthPort over the demo server (fake-db.ts). The state is kept
// in sessionStorage so a reload keeps the demo; Realtime is a ticker that
// settles the clock and tells the watchers what changed. The server's
// refusals (limits, CAPTCHA, previews off) are simulated on demand (sim.ts).
import { secondsToUtcMidnight } from '../core/limits';
import type { AuthPort, Backend, SendCodeResult, VerifyCodeResult } from '../core/ports';
import { browserToken, uuid } from '../core/store';
import { isValidEmail, normalizeEmail } from '../core/otp';
import type {
  Account,
  Dance,
  PhotoCheckResult,
  PreviewLink,
  ReportReason,
  ReportResult,
  Session,
  StartResult,
  UploadedPhoto,
  Video,
  Wallet,
} from '../core/types';
import { clipUrl, DEMO_DANCES, DEMO_SAMPLES, DEMO_TIMING, sampleUrl, type DemoClip, type DemoProductId } from './data';
import * as db from './fake-db';
import type { Simulation } from './sim';

export interface FakeOptions {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  /** Keep the demo across reloads (sessionStorage). */
  persist?: boolean;
  tickMs?: number;
  /** Refusals of the server to show (?sim=, sim.ts). */
  sim?: ReadonlySet<Simulation>;
}

/** Lifetime of the demo's preview links, as preview_url_seconds. */
export const DEMO_PREVIEW_URL_SECONDS = 120;
/** check-photo's limit in the demo: short, so its Try again shows while clicking through. */
export const DEMO_CHECK_LIMIT_SECONDS = 10;

const STORAGE_KEY = 'bopsy.demo.v1';

function publicVideo(video: db.FakeVideo): Video {
  const { id, danceId, photoId, status, progress, errorCode, isPreview, cost, coinsRefunded, createdAt, readyAt, resultPath } = video;
  return { id, danceId, photoId, status, progress, errorCode, isPreview, cost, coinsRefunded, createdAt, readyAt, resultPath };
}

export class FakeBackend implements Backend, AuthPort {
  readonly demo = true;
  readonly auth: AuthPort = this;
  readonly samples = DEMO_SAMPLES;
  readonly state: db.FakeState;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly sessionListeners = new Set<(session: Session | null) => void>();
  private readonly tickers = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly sim: ReadonlySet<Simulation>;
  /** Simulations that refuse once, then let the retry through. */
  private readonly spent = new Set<string>();

  constructor(private readonly options: FakeOptions = {}) {
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.random = options.random ?? Math.random;
    this.state = (options.persist && this.load()) || db.emptyState();
    this.sim = options.sim ?? new Set();
  }

  /** True the first time [key] is asked while [simulation] is on. */
  private once(simulation: Simulation, key: string = simulation): boolean {
    if (!this.sim.has(simulation) || this.spent.has(key)) return false;
    this.spent.add(key);
    return true;
  }

  private load(): db.FakeState | null {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? { ...db.emptyState(), ...(JSON.parse(raw) as db.FakeState) } : null;
    } catch {
      return null;
    }
  }

  private save(): void {
    if (!this.options.persist) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      /* the demo still works in memory */
    }
  }

  private settle(): void {
    db.settle(this.state, this.now());
    this.save();
  }

  // AuthPort -------------------------------------------------------------

  current(): Session | null {
    const user = this.state.sessionUserId ? this.state.users[this.state.sessionUserId] : undefined;
    return user ? { userId: user.id, email: user.email, guest: user.guest } : null;
  }

  async restore(): Promise<Session | null> {
    return this.current();
  }

  subscribe(listener: (session: Session | null) => void): () => void {
    this.sessionListeners.add(listener);
    return () => this.sessionListeners.delete(listener);
  }

  private setSession(userId: string | null): void {
    this.state.sessionUserId = userId;
    this.save();
    const session = this.current();
    for (const listener of [...this.sessionListeners]) listener(session);
  }

  async ensureSession(): Promise<Session> {
    const current = this.current();
    if (current) return current;
    const id = uuid();
    this.state.users[id] = { id, email: null, guest: true }; // the guest session of the live adapter
    this.setSession(id);
    return this.current()!;
  }

  async sendCode(email: string): Promise<SendCodeResult> {
    await this.sleep(600);
    if (!isValidEmail(email)) return { ok: false, error: 'invalid_email' };
    if (this.once('captcha-code')) return { ok: false, error: 'captcha' };
    const code = String(Math.floor(this.random() * 900_000) + 100_000);
    this.state.codes[normalizeEmail(email)] = code;
    this.save();
    return { ok: true, demoCode: code };
  }

  async verifyCode(email: string, code: string): Promise<VerifyCodeResult> {
    await this.sleep(500);
    const address = normalizeEmail(email);
    if (!this.state.codes[address] || this.state.codes[address] !== code) return { ok: false, error: 'invalid_code' };
    delete this.state.codes[address];
    const before = this.current();
    const existing = Object.values(this.state.users).find((user) => user.email === address && !user.guest);
    let userId: string;
    if (existing) userId = existing.id; // signInWithOtp on an existing account: the user changes
    else if (before?.guest) {
      userId = before.userId; // the guest becomes this email account (same id, photo and preview kept)
      this.state.users[userId] = { id: userId, email: address, guest: false };
    } else {
      userId = uuid();
      this.state.users[userId] = { id: userId, email: address, guest: false };
    }
    this.setSession(userId);
    return { ok: true, session: this.current()!, userChanged: before !== null && before.userId !== userId };
  }

  async saveNewsletterChoice(optIn: boolean): Promise<void> {
    const user = this.state.sessionUserId ? this.state.users[this.state.sessionUserId] : undefined;
    if (!user || user.guest) return;
    user.newsletter = optIn;
    this.save();
  }

  async signOut(): Promise<void> {
    this.setSession(null);
  }

  // Backend ----------------------------------------------------------------

  async dances(): Promise<Dance[]> {
    return [...DEMO_DANCES].sort((a, b) => a.sort - b.sort);
  }

  async estimatedMinutes(): Promise<number> {
    return DEMO_TIMING.estimatedMinutes;
  }

  async checkPhoto(_file: Blob, fileName: string, uploaded?: UploadedPhoto): Promise<PhotoCheckResult> {
    // The guest session needs a CAPTCHA token (D132): refused once with captcha-photo.
    if (!this.current() && this.once('captcha-photo')) return { status: 'failed', reason: 'captcha' };
    const session = await this.ensureSession();
    await this.sleep(DEMO_TIMING.checkMs);
    const verdict = db.judgePhoto(fileName);
    const failure = 'failure' in verdict ? verdict.failure : null;
    // The upload, under the bucket's rules (D131), unless the file is already there.
    const known = uploaded && uploaded.userId === session.userId && this.state.uploads[uploaded.photoPath] ? uploaded.photoPath : null;
    let path = known;
    if (!path) {
      if (failure === 'too_large' || this.sim.has('too-large')) return { status: 'failed', reason: 'too_large' };
      if (failure === 'bad_type' || this.sim.has('bad-type')) return { status: 'failed', reason: 'bad_type' };
      if (failure === 'daily_cap' || this.sim.has('upload-cap')) {
        return { status: 'failed', reason: 'daily_cap', retryAfter: secondsToUtcMidnight(this.now()) };
      }
      path = `${session.userId}/${uuid()}.jpg`;
      this.state.uploads[path] = { userId: session.userId, name: fileName };
      this.save();
    }
    const ref: UploadedPhoto = { photoPath: path, userId: session.userId };
    // check-photo's hourly limit refuses once; Try again checks the same file.
    const limited = failure === 'rate_limited' ? !this.spent.has(`limit:${path}`) : this.sim.has('check-limit') && !this.spent.has(`limit:${path}`);
    if (limited) {
      this.spent.add(`limit:${path}`);
      return { status: 'failed', reason: 'rate_limited', retryAfter: DEMO_CHECK_LIMIT_SECONDS, uploaded: ref };
    }
    if (failure === 'network') return { status: 'failed', reason: 'network', uploaded: ref };
    if ('rejection' in verdict) return { status: 'rejected', reason: verdict.rejection };
    return { status: 'accepted', ...this.accept(session.userId, fileName, 'clip' in verdict ? verdict.clip : 'man') };
  }

  private accept(userId: string, fileName: string, clip: DemoClip): { photoId: string; userId: string } {
    const id = uuid();
    this.state.photos[id] = { id, userId, name: fileName, status: 'accepted', clip, erased: false };
    this.save();
    return { photoId: id, userId };
  }

  async photoUrl(photoId: string): Promise<string | null> {
    const photo = this.state.photos[photoId];
    return photo ? sampleUrl(photo.name) : null;
  }

  private start(run: (userId: string) => db.FakeVideo): StartResult {
    const session = this.current();
    if (!session) return { kind: 'failed' }; // 401
    try {
      const video = run(session.userId);
      this.save();
      this.kick();
      return { kind: 'started', video: publicVideo(video) };
    } catch (error) {
      if (error instanceof db.Refusal) return { kind: 'refused', refusal: error.refusal };
      return { kind: 'failed' };
    }
  }

  async startPreview(request: { danceId: string; photoId: string; consentAt: string }): Promise<StartResult> {
    await this.sleep(400);
    if (this.sim.has('preview-off')) return { kind: 'preview_unavailable' };
    // The live adapter retries a refused token once: refused twice, then the visitor's next tap passes.
    if (this.once('captcha-preview')) return { kind: 'captcha_failed' };
    if (this.sim.has('preview-limit')) return { kind: 'rate_limited', action: 'preview', retryAfter: secondsToUtcMidnight(this.now()) };
    return this.start((userId) =>
      db.startPreview(this.state, { ...request, userId, now: this.now(), id: uuid(), deviceHash: browserToken(), ip: db.DEMO_IP }),
    );
  }

  async startGeneration(request: { danceId: string; photoId: string; consentAt: string; idempotencyKey: string }): Promise<StartResult> {
    await this.sleep(400);
    if (this.sim.has('generation-limit')) {
      // A fixed hour window (10:00 to 11:00 UTC): the wait runs to its end, nothing is debited.
      return { kind: 'rate_limited', action: 'generation', retryAfter: Math.max(1, Math.ceil((3_600_000 - (this.now() % 3_600_000)) / 1000)) };
    }
    return this.start((userId) =>
      db.startGeneration(this.state, { ...request, userId, now: this.now(), id: uuid(), key: request.idempotencyKey }),
    );
  }

  async video(id: string): Promise<Video | null> {
    this.settle();
    const video = this.state.videos[id];
    return video && video.userId === this.current()?.userId ? publicVideo(video) : null;
  }

  watchVideo(id: string, listener: (video: Video) => void): () => void {
    let last = '';
    return this.tick(() => {
      const video = this.state.videos[id];
      if (!video || video.userId !== this.current()?.userId) return;
      const snapshot = JSON.stringify(publicVideo(video));
      if (snapshot !== last) {
        last = snapshot;
        listener(publicVideo(video));
      }
    });
  }

  async videos(): Promise<Video[]> {
    this.settle();
    const userId = this.current()?.userId;
    return Object.values(this.state.videos)
      .filter((video) => video.userId === userId && !video.isPreview)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(publicVideo);
  }

  async videoUrl(video: Video): Promise<string | null> {
    const fake = this.state.videos[video.id];
    return fake && fake.status === 'ready' && !fake.isPreview ? clipUrl(fake.clip, false) : null;
  }

  /** preview-url: the caller's ready preview only, a link that expires (D130). */
  async previewUrl(videoId: string): Promise<PreviewLink | null> {
    this.settle();
    const fake = this.state.videos[videoId];
    if (!fake || fake.userId !== this.current()?.userId || !fake.isPreview || fake.status !== 'ready') return null;
    return { url: clipUrl(fake.clip, true), expiresAt: this.now() + DEMO_PREVIEW_URL_SECONDS * 1000, thumbnailUrl: null };
  }

  async account(): Promise<Account | null> {
    this.settle();
    const session = this.current();
    if (!session) return null;
    const wallet = db.walletOf(this.state, session.userId);
    const sub = this.state.subscriptions[session.userId];
    const active = db.subscriptionActive(this.state, session.userId, this.now());
    return {
      wallet: { plan: active ? wallet.plan : 0, bought: wallet.bought, total: (active ? wallet.plan : 0) + wallet.bought },
      subscription: sub
        ? { active, period: sub.productId === 'bopsy_yearly' ? 'yearly' : 'weekly', renewsAt: new Date(sub.expiresAt).toISOString() }
        : null,
    };
  }

  watchWallet(listener: (wallet: Wallet | null) => void): () => void {
    let last = '';
    return this.tick(() => {
      void this.account().then((account) => {
        const wallet = account?.wallet ?? null;
        const snapshot = JSON.stringify(wallet);
        if (snapshot !== last) {
          last = snapshot;
          listener(wallet);
        }
      });
    });
  }

  async report(videoId: string, reason: ReportReason, note: string): Promise<ReportResult> {
    await this.sleep(400);
    const userId = this.current()?.userId;
    const video = this.state.videos[videoId];
    if (!userId || !video || video.userId !== userId) return { kind: 'failed' }; // RLS: own videos only
    if (this.sim.has('report-limit')) return { kind: 'rate_limited', action: 'report', retryAfter: secondsToUtcMidnight(this.now()) };
    this.state.reports.push({ userId, videoId, reason, note: note.trim() || null });
    this.save();
    return { kind: 'sent' };
  }

  async deleteMedia(): Promise<boolean> {
    await this.sleep(600);
    const userId = this.current()?.userId;
    if (!userId) return false;
    db.deleteMedia(this.state, userId);
    this.save();
    return true;
  }

  /** The fake RevenueCat webhook (fake-billing.ts). */
  recordPurchase(productId: DemoProductId): void {
    const userId = this.current()?.userId;
    if (!userId) return;
    db.recordPurchase(this.state, userId, productId, this.now());
    this.save();
    this.kick();
  }

  launchOfferEligible(): boolean {
    const userId = this.current()?.userId;
    return userId !== undefined && !this.state.introUsed.includes(userId) && !this.state.subscriptions[userId];
  }

  proActive(): boolean {
    const userId = this.current()?.userId;
    return userId !== undefined && db.subscriptionActive(this.state, userId, this.now());
  }

  // Ticker standing in for Realtime ---------------------------------------------

  private tick(run: () => void): () => void {
    const wrapped = () => run();
    this.tickers.add(wrapped);
    queueMicrotask(() => {
      this.settle();
      wrapped();
    });
    if (!this.timer) this.timer = setInterval(() => this.kick(), this.options.tickMs ?? 400);
    return () => {
      this.tickers.delete(wrapped);
      if (this.tickers.size === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
  }

  /** Settles the clock and runs every watcher now. */
  kick(): void {
    this.settle();
    for (const run of [...this.tickers]) run();
  }
}
