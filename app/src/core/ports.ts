// The interfaces the screens and the flow talk to. Two implementations:
// demo (src/demo, in-memory, D118) and live (src/live, Supabase and
// RevenueCat). Nothing outside src/live imports a provider SDK.
import type {
  Account,
  Dance,
  PhotoCheckResult,
  ReportReason,
  Session,
  StartRequest,
  StartResult,
  Video,
  Wallet,
} from './types';

export type SendCodeResult =
  | { ok: true; demoCode?: string }
  | { ok: false; error: 'invalid_email' | 'rate_limited' | 'network' };

export type VerifyCodeResult =
  | { ok: true; session: Session; userChanged: boolean }
  | { ok: false; error: 'invalid_code' | 'rate_limited' | 'network' };

export interface AuthPort {
  current(): Session | null;
  /** Loads the stored session, or the one a magic link put in the URL. */
  restore(): Promise<Session | null>;
  subscribe(listener: (session: Session | null) => void): () => void;
  /**
   * The session that owns the photo before the email is known: the current
   * one, or a new guest session (live: Supabase anonymous sign-in).
   */
  ensureSession(): Promise<Session>;
  /** Sends the 6-digit code (and the magic link) to [email]. */
  sendCode(email: string): Promise<SendCodeResult>;
  verifyCode(email: string, code: string): Promise<VerifyCodeResult>;
  signOut(): Promise<void>;
}

export interface Backend {
  readonly demo: boolean;
  readonly auth: AuthPort;
  dances(): Promise<Dance[]>;
  /** app_config estimated_minutes (C21). */
  estimatedMinutes(): Promise<number>;
  /** Uploads the photo of the session's folder and runs check-photo. */
  checkPhoto(file: Blob, fileName: string): Promise<PhotoCheckResult>;
  photoUrl(photoId: string): Promise<string | null>;
  startPreview(request: StartRequest): Promise<StartResult>;
  startGeneration(request: StartRequest & { idempotencyKey: string }): Promise<StartResult>;
  video(id: string): Promise<Video | null>;
  /** Realtime changes of one video (with a polling fallback). */
  watchVideo(id: string, listener: (video: Video) => void): () => void;
  videos(): Promise<Video[]>;
  /** A playable URL of a ready video; [download] asks for an attachment named so. */
  videoUrl(video: Video, download?: string): Promise<string | null>;
  account(): Promise<Account | null>;
  /** Realtime wallet of the signed-in user (null without a session). */
  watchWallet(listener: (wallet: Wallet | null) => void): () => void;
  report(videoId: string, reason: ReportReason, note: string): Promise<boolean>;
  deleteMedia(): Promise<boolean>;
}

/** A price as the store gives it: never computed from a constant (D112). */
export interface Money {
  micros: number;
  currency: string;
  formatted: string;
}

export type PlanProductId = 'bopsy_weekly' | 'bopsy_yearly';
export type PackProductId = 'bopsy_coins_600' | 'bopsy_coins_1500';

export interface PlanItem {
  kind: 'plan';
  productId: PlanProductId;
  period: 'week' | 'year';
  price: Money;
  /** The launch offer, present only when RevenueCat says the buyer is eligible. */
  intro: { price: Money; weeks: number } | null;
  /** Plan coins: 180 per week, 240 per month (products table). */
  coins: number;
  /** The provider's package, handed back to purchase(). */
  ref: unknown;
}

export interface PackItem {
  kind: 'pack';
  productId: PackProductId;
  coins: number;
  price: Money;
  bestValue: boolean;
  ref: unknown;
}

export type OfferItem = PlanItem | PackItem;

export interface Offer {
  plans: PlanItem[];
  packs: PackItem[];
  /** Entitlement `pro` active for this user. */
  proActive: boolean;
  /** RevenueCat's subscription management page for a Web Billing plan. */
  managementUrl: string | null;
}

export interface PurchaseContext {
  email: string | null;
  /** Where the in-page checkout renders (no popup, works in in-app browsers). */
  target: HTMLElement;
  metadata: Record<string, string>;
}

export type PurchaseOutcome =
  | { kind: 'purchased' }
  | { kind: 'cancelled' }
  | { kind: 'failed' };

export interface Billing {
  offer(session: Session): Promise<Offer>;
  purchase(session: Session, item: OfferItem, context: PurchaseContext): Promise<PurchaseOutcome>;
}

export interface Services {
  backend: Backend;
  billing: () => Promise<Billing>;
}
