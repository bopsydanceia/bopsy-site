// Interface texts, in English and French (the locale is chosen once at
// startup, src/locale.ts). English wording taken from the app
// (lib/l10n/app_en.arb of the Flutter repo, key in the comment); lines marked
// NEW are web-only texts in the same tone, to validate (same rule as D04).
// French: tutoiement, short and punchy (16-30 y.o., TikTok and Instagram).
// Positioning: the trends of the moment rather than "dances" (user-facing
// texts only; identifiers, routes and the Dance type keep their names).
// `fr` must have every key of `en` with the same types (checked by tsc and by
// copy.test.ts).
import type { LimitedAction } from './core/limits';
import type { GenerationRefusal, PhotoRejection, ReportReason } from './core/types';
import { LOCALE, LOCALE_TAG, type Locale } from './locale';

const number = new Intl.NumberFormat(LOCALE_TAG);

/** A count in the active locale: "1,500" in English, "1 500" in French. */
export function formatNumber(value: number): string {
  return number.format(value);
}

function enCoins(count: number): string {
  return count === 1 ? '1 coin' : `${formatNumber(count)} coins`;
}
function enVideos(count: number): string {
  return count === 1 ? '1 video' : `${count} videos`;
}
function frCoins(count: number): string {
  return count <= 1 ? `${count} pièce` : `${formatNumber(count)} pièces`;
}
function frVideos(count: number): string {
  return count <= 1 ? `${count} vidéo` : `${count} vidéos`;
}

/** The price lines of a plan (07), from prices already formatted by the store. */
export interface PlanPrices {
  price: string;
  period: 'week' | 'year';
  intro: { price: string; weeks: number } | null;
}

const en = {
  coins: enCoins,
  videosCount: enVideos,
  wordmark: 'bopsy', // commonWordmark
  homeLabel: 'Bopsy home', // NEW (a11y)
  demoBadge: 'Demo', // NEW
  demoBadgeTitle: 'Demo mode: nothing is charged, nothing is sent', // NEW
  hook: 'Zero dance skills needed.', // NEW (catalogue kicker)
  pickDance: 'Pick a trend', // createPickDanceTitle (trend wording)
  pickDanceBody: 'One photo. Any trend. Ready in about', // story1Body (first part)
  minutes: (minutes: number) => (minutes === 1 ? '1 minute' : `${minutes} minutes`), // NEW
  pickForPhoto: 'Pick a trend for your photo.', // NEW (C11)
  loadingDances: 'Loading trends', // NEW (a11y)
  loading: 'Loading', // NEW (a11y)
  signingIn: 'Signing you in…', // NEW
  catalogError: "We couldn't load the trends.", // homeCatalogError
  catalogEmpty: 'New trends are on the way. Check back soon.', // homeCatalogEmpty
  families: {
    trends: 'Trending this week', // homeTrendingTitle
    pets: 'Pets love these', // homePetsTitle
    memes: 'Meme classics', // homeMemesTitle
    party: 'Party starters', // homePartyTitle
    victory: 'Victory moves', // homeVictoryTitle
  },
  badgeNew: 'NEW', // commonBadgeNew
  badgeHot: 'HOT', // homeBadgeHot
  tryAgain: 'Try again', // commonTryAgain
  error: 'Something went wrong. Try again.', // commonError
  offline: "You're offline. Check your connection.", // commonOffline
  backHome: 'Back to Home', // commonBackHome
  back: 'Back', // a11yBack
  usePhoto: 'Use my photo', // NEW (trend screen)
  trendHint: 'One photo of you, whole body in the frame, and you are in this trend.', // NEW (trend screen)
  soundOn: 'Sound on', // NEW (trend screen)
  soundOff: 'Sound off', // NEW (trend screen)
  trendVideoLabel: (name: string) => `${name}: example video`, // NEW (a11y)
  close: 'Close', // a11yClose
  cancel: 'Cancel', // commonCancel
  continue: 'Continue', // commonContinue
  ok: 'OK', // commonOk
  danceFallback: 'Trend', // NEW (a dance no longer in the catalogue)
  navDances: 'Trends', // NEW (desktop header)
  language: 'Language', // NEW
  languageNames: { en: 'English', fr: 'Français' } as Record<Locale, string>, // NEW

  createTitle: 'Join the trend', // createTitle (trend wording)
  danceLabel: 'Trend', // createDanceLabel
  danceMeta: (seconds: number, cost: number) => `${seconds} s · ${enCoins(cost)}`, // createDanceMeta
  change: 'Change', // createChangeDance
  addPhotoTitle: 'Add a photo', // createAddPhotoTitle
  addPhotoBody: 'Whole body in the frame. One person, sharp photo.', // createAddPhotoBody
  camera: 'Camera', // createCamera
  gallery: 'Gallery', // createGallery
  tipsTitle: 'Photo tips', // photoTipsTitle
  exTitle: 'Like this, not like that', // NEW (photo examples)
  exSittingKo: 'Sitting, body hidden', // NEW
  exStandingOk: 'Standing, head to feet', // NEW
  exSelfieKo: 'Face only', // NEW
  exBodyOk: 'Whole body, some space around', // NEW
  exGroupKo: 'Several people', // NEW
  exAloneOk: 'Alone in the photo', // NEW
  tipWholeBody: 'Whole body in the frame', // photoTipsRuleWholeBody
  tipOneSubject: 'One adult, alone in the photo', // NEW (photoTipsRuleOneSubject aligned on C8)
  tipSharp: 'Sharp photo, good light', // photoTipsRuleSharp
  tipsWontWork: "Won't work", // photoTipsWontWork
  tipsFaceOnly: 'Face only', // photoTipsFaceOnly
  tipsGroup: 'Group photo', // photoTipsGroupPhoto
  tipsKids: 'Kids or nudity', // photoTipsKidsOrNudity
  samplesLabel: 'No photo at hand? Try a sample:', // NEW (demo only)
  sampleNames: { Man: 'Man', Dog: 'Dog', Grandma: 'Grandma' } as Record<string, string>, // NEW (demo only)
  yourPhoto: 'Your photo', // a11yCreateReadyPhoto
  replace: 'Replace', // createReadyReplace
  notSent: 'Not sent yet', // createReadyNotSent
  checking: 'Checking your photo…', // createReadyChecking
  scanTitle: 'Scanning your photo',
  scanSending: 'Sending the photo…',
  scanBody: 'Finding you to start your video…',
  scanAlmost: 'Almost there…',
  scanButton: 'Scanning your photo…',
  fullBody: 'Full body detected', // createReadyFullBodyDetected
  cantUse: "Can't use this photo", // createReadyErrorBadge
  consent: "This is me, or I have this person's permission to use their photo.", // createReadyConsent
  aiNotice: 'Your photo is sent to our AI partners to check it and make your video.', // createReadyAiDisclosure
  privacy: 'Privacy', // commonPrivacy
  terms: 'Terms', // paywallTerms
  uploadFailed: "We couldn't upload your photo. Check your connection and try again.", // createReadyUploadFailed
  consentMissing: 'Check the box to confirm you can use this photo.', // createReadyConsentMissing
  recheck: 'We need to check your photo again. Check the box to send it.', // createReadyRecheck
  photoGone: 'This photo is no longer available. Add a new one.', // createReadyPhotoGone
  planActivating: 'Your plan is being activated. Try again in a moment.', // createReadyPlanActivating
  generationLimited: (wait: string) => `You've reached the hourly video limit. Try again in ${wait}. No coins were used.`, // NEW (D131)
  rendering: (count: number) => `${enVideos(count)} rendering`, // createReadyTooManyInProgress
  tooMany: (count: number) => `${enVideos(count)} rendering. Wait for one to finish.`, // createReadyTooManyInProgress + NEW
  generateFreePreview: 'Generate free preview', // createPreviewGenerate
  generate: (cost: number) => `Generate · ${enCoins(cost)}`, // createGenerate
  danceUnavailable: "This trend isn't available anymore.", // danceDetailNotFound
  photoTooLarge: 'This photo is too large (10 MB max). Choose another one.', // NEW (D131)
  photoType: "This file type isn't supported. Use a JPEG, PNG, WebP or HEIC photo.", // NEW (D131)
  uploadCap: (wait: string) => `You've added a lot of photos today. Try again in ${wait}.`, // NEW (D131, photos per day)
  checkLimited: (wait: string) => `Too many photo checks. Try again in ${wait}.`, // NEW (D131, check-photo per hour)
  captchaFailed: "We couldn't confirm you're not a bot. Try again.", // NEW (D132)
  captchaTitle: "Quick check that you're not a bot", // NEW (D132, shown only when Turnstile asks for a tap)
  pickAnother: 'Pick another trend', // danceDetailPickAnother
  makeVideo: 'Make my video', // NEW (D139)

  preparingTitle: 'Getting your trend ready', // NEW (D139)
  preparingSteps: ['Checking your photo', 'Lining up the moves', 'Setting up your video'], // NEW (D139)
  teaserTitle: 'Your video is one tap away', // NEW (D139)
  teaserBody: (dance: string, seconds: number, minutes: number) =>
    `Unlock it and we make your ${seconds}-second ${dance} video in HD, no watermark. Ready about ${minutes} min later.`, // NEW (D139)
  teaserPlayLabel: 'Locked video. Unlock it to make it.', // NEW (D139, a11y)
  unlockMine: 'Unlock my video', // NEW (D139)
  teaserNote: 'Made just for you once you unlock it.', // NEW (D139)
  newsletter: 'Email me when the iPhone app is out and when new trends drop.', // NEW (D139, unticked by default)

  previewTitle: 'Your free preview', // previewTitle
  previewTag: (seconds: number) => `PREVIEW · ${seconds} S`, // previewTag
  previewMaking: 'Making your preview', // generatingPreviewTitle
  previewVideoLabel: 'Preview of your photo dancing', // NEW (a11y)
  originalPhoto: 'Original photo', // NEW (a11y)
  previewPitchLead: 'Looks good?', // previewPitchLead
  previewPitchBody: (seconds: number) => `Get the full ${seconds}-second video in HD, no watermark.`, // previewPitchBody
  unlock: 'Unlock full video', // previewUnlock
  unlockSubtitle: (minutes: number) => `HD · no watermark · ready in about ${minutes} min`, // previewUnlockSubtitle
  previewUsed: 'You already used your free preview.', // NEW (previewAlreadyUsed without "on this device")
  previewOff: 'Free previews are paused right now. Unlock the full video to make yours.', // NEW (D130, previews off)
  previewLimited: (wait: string) => `Too many free previews from your connection today. Try again in ${wait}, or unlock the full video now.`, // NEW (D130, per IP)
  previewFailed: "Your preview didn't render. Unlock the full video to try again.", // previewFailedBody
  previewFailedNoBody: "We couldn't see the whole body in this photo. Unlock the full video and try another photo.", // previewFailedNoFullBody
  videoFailedQ: 'Video failed?', // commonVideoFailedQuestion
  coinsComeBack: 'Your coins come back automatically.', // commonCoinsComeBack

  signInTitle: 'Where should we send your video?', // NEW
  signInBody: "Enter your email. We'll send you a code. Your videos and coins stay with this email.", // NEW
  emailLabel: 'Email', // NEW
  sendCode: 'Send code', // NEW
  codeTitle: 'Enter your code', // NEW
  loginTitle: 'Sign in',
  loginBody: "Enter the email you used. We'll send you a code to find your videos and coins.",
  codeBody: (email: string) => `We sent a code to ${email}. You can also tap the link in the email.`, // NEW
  codeLabel: 'Code from the email', // NEW
  verify: 'Verify', // NEW
  resend: 'Resend code', // NEW
  resendIn: (seconds: number) => `Resend code in ${seconds} s`, // NEW
  changeEmail: 'Use another email', // NEW
  demoCode: (code: string) => `Demo: your code is ${code}`, // NEW
  invalidEmail: 'Enter a valid email address.', // NEW
  invalidCode: "That code didn't work. Check it or ask for a new one.", // NEW
  rateLimited: 'Too many tries. Wait a minute and try again.', // NEW

  paywallTitle: 'Unlock Bopsy', // paywallTitle
  coinLine: (weekly: number, cost: number) => `${enCoins(weekly)} every week · 1 video = ${enCoins(cost)}`, // paywallCoinLine
  launchOffer: 'LAUNCH OFFER', // paywallBadgeLaunchOffer
  saveBadge: (percent: number) => `Save ${percent}%`, // paywallAnnualSaveBadge
  planTitle: ({ price, period, intro }: PlanPrices) => (period === 'year' ? `${price} / year` : `${intro?.price ?? price} / week`), // paywallWeeklyTitle, paywallAnnualTitle
  planSubtitle: ({ price, period, intro }: PlanPrices, perWeek: string, coins: number) =>
    period === 'year'
      ? `${perWeek} / week · ${enCoins(coins)} every month`
      : intro
        ? `for your first ${intro.weeks === 1 ? 'week' : `${intro.weeks} weeks`}, then ${price} / week`
        : 'Billed weekly · cancel anytime', // paywallAnnualSubtitle, paywallWeeklyIntroSubtitle, paywallWeeklySubtitle
  renewalTerms: ({ price, period, intro }: PlanPrices) => {
    const unit = period === 'year' ? 'year' : 'week';
    const first = intro ? `${intro.price} / week for your first ${intro.weeks === 1 ? 'week' : `${intro.weeks} weeks`}, then ` : '';
    return (
      `${first}${price} / ${unit}, charged today and every ${unit} until you cancel. ` +
      'Renews automatically. Cancel anytime from My account, at least 24 h before the renewal.'
    );
  }, // NEW
  whatAreCoins: 'What are coins?', // paywallWhatAreCoins
  paywallLoadError: "We couldn't load the plans. Check your connection.", // paywallLoadError
  purchaseFailed: "The purchase didn't go through. Try again.", // commonPurchaseFailed
  waiver: 'I want my video now and I give up my 14-day right of withdrawal for this digital content.', // NEW (D115)
  activating: 'Your plan is being activated…', // NEW
  needCoins: (cost: number) => `You need ${enCoins(cost)}`, // outOfCoinsTitle
  balance: (balance: number) => `You have ${enCoins(balance)}.`, // outOfCoinsBalance
  packTitle: (count: number) => enCoins(count), // outOfCoinsPackTitle
  packSubtitle: (videos: number) => `${enVideos(videos)} · never expire`, // outOfCoinsPackSubtitle
  bestValue: 'Best value', // outOfCoinsBestValue
  buyCoins: (count: number) => `Buy ${enCoins(count)}`, // outOfCoinsBuy
  packLoadError: "We couldn't load the coin packs. Check your connection.", // outOfCoinsPackLoadError
  packTerms: 'One-time purchase. Bought coins never expire.', // NEW
  coinsInfoCard: (cost: number) => `1 trend video = ${enCoins(cost)}`, // coinsInfoCardTitle
  coinsInfoBody: 'Coins pay for each video you make.', // coinsInfoCardBody
  coinsInfoWeeklyLabel: 'Weekly plan:', // NEW
  coinsInfoYearlyLabel: 'Yearly plan:', // NEW
  coinsInfoPacksLabel: 'Coin packs', // NEW
  coinsInfoWeekly: (weekly: number, videos: number) =>
    `${enCoins(weekly)} every week, enough for ${enVideos(videos)}. Plan coins reset each week.`, // coinsInfoWeeklyBody
  coinsInfoYearly: (monthly: number, videos: number) => `${enCoins(monthly)} every month, enough for ${enVideos(videos)}.`, // coinsInfoYearlyBody
  coinsInfoPacks: (count: number, price: string) => `(subscribers): ${enCoins(count)} for ${price}. Bought coins never expire.`, // coinsInfoPacksBody
  gotIt: 'Got it', // coinsInfoGotIt
  checkoutDemoTitle: 'Demo checkout', // NEW (demo only)
  checkoutDemoBody: 'No card is charged in demo mode.', // NEW (demo only)
  checkoutPlanLine: (period: 'week' | 'year', price: string) => `${period === 'week' ? 'Weekly' : 'Yearly'} plan · ${price} today`, // NEW (demo only)
  checkoutPackLine: (count: number, price: string) => `${enCoins(count)} · ${price}`, // NEW (demo only)
  pay: (price: string) => `Pay ${price}`, // NEW (demo only)

  generatingTitle: 'Making your video', // generatingTitle
  generatingPhotoLabel: 'Your photo being animated', // NEW (a11y)
  failedPhotoLabel: 'The photo that could not be animated', // NEW (a11y)
  progressLabel: 'Video progress', // NEW (a11y)
  trendingWhileWaiting: 'Trending while you wait', // NEW
  minLeft: (minutes: number) => `About ${minutes} min left`, // generatingTimeLeft
  queued: 'Queued', // generatingQueued
  stepPhoto: 'Photo checked', // generatingStepPhotoChecked
  stepMoves: (dance: string) => `${dance} moves loaded`, // generatingStepMovesLoaded
  stepMovesLoading: (dance: string) => `Loading ${dance} moves`, // generatingStepMovesLoading
  stepRendering: (seconds: number) => `Rendering your ${seconds} s video`, // generatingStepRendering
  generatingCaption: (cost: number) =>
    `You can close this page, your video stays in My videos. If it fails, your ${cost === 1 ? '1 coin comes' : `${cost} coins come`} back automatically.`, // NEW (generatingCaption for the web)
  takingLonger: "Taking a bit longer than usual. You can close this page, it'll be in My videos.", // NEW (generatingTakingLonger for the web)

  resultTitle: "It's dancing!", // resultTitle
  resultVideoLabel: (dance: string) => `Your finished video: ${dance}`, // NEW (a11y)
  resultMeta: (dance: string, seconds: number) => `${dance} · ${seconds} s · HD`, // resultMeta
  coinsLeft: (balance: number) => `${formatNumber(balance)} left`, // resultCoinsLeft
  download: 'Download', // NEW (resultSave on the web)
  share: 'Share', // resultShare
  hint: 'It already has the sound of the trend. Download it and post it.', // resultHint
  makeAnother: 'Make another', // resultMakeAnother
  linkCopied: 'Link copied. It works for 7 days.', // NEW
  shareFailed: "We couldn't share your video. Try Download.", // NEW
  videoLoadError: "We couldn't load your video. Check your connection.", // resultVideoLoadError
  notReady: "Your video is still dancing its way here. It shows up as soon as it's ready.", // resultNotReady
  unavailable: "This video isn't available anymore.", // resultUnavailable
  failedTitle: "This one didn't work", // failedTitle
  failedNoBody: "We couldn't see the whole body in this photo, so the video didn't render.", // failedCauseNoFullBody
  failedTimeout: 'Rendering took too long, so we stopped it.', // failedCauseTimeout
  failedServer: "Something went wrong on our side, so the video didn't render.", // failedCauseServerError
  failedRefund: (refund: number, balance: number | null) =>
    balance === null
      ? `${refund === 1 ? '1 coin is back.' : `${refund} coins are back.`}` // failedRefundNoBalance
      : `${refund === 1 ? '1 coin is back' : `${refund} coins are back`}. You have ${formatNumber(balance)}.`, // failedRefund
  tryAnotherPhoto: 'Try another photo', // failedTryAnotherPhoto
  contactSupport: 'Contact support', // failedContactSupport

  reportTitle: 'Report this video', // resultReportTitle
  reportNote: 'Add a note (optional)', // resultReportNoteHint
  reportSubmit: 'Send report', // resultReportSubmit
  reportThanks: "Thanks for letting us know. We'll take a look.", // resultReportThanks
  reportFailed: "We couldn't send your report. Try again.", // resultReportFailed
  reportLimited: (wait: string) => `You reached today's report limit. Try again in ${wait}.`, // NEW (D131)

  myVideos: 'My videos', // myVideosTitle
  tileRendering: (dance: string) => `${dance} · rendering`, // myVideosTileRendering
  tileQueued: (dance: string) => `${dance} · queued`, // myVideosTileQueued
  tileFailed: (dance: string) => `${dance} · failed`, // myVideosTileFailed
  emptyTitle: 'No videos yet', // myVideosEmptyTitle
  emptyBody: 'Your trend videos will show up here.', // myVideosEmptyBody
  emptyCta: 'Make your first video', // myVideosEmptyCta
  videosError: "We couldn't load your videos.", // myVideosLoadError

  account: 'My account', // NEW
  signedInAs: (email: string) => `Signed in as ${email}`, // NEW
  coinsTitle: 'Coins', // settingsCoins
  weeklyPlan: 'Weekly plan', // settingsWeeklyPlan
  yearlyPlan: 'Yearly plan', // settingsYearlyPlan
  noPlan: 'Subscribe to get coins for your videos', // settingsNoPlanDetail
  coinsDetailWeekly: (bought: number) => `180 every week · unused coins don't roll over · ${formatNumber(bought)} bought, never expire`, // settingsCoinsDetail
  coinsDetailYearly: (bought: number) => `240 every month · unused coins don't roll over · ${formatNumber(bought)} bought, never expire`, // settingsCoinsDetailYearly
  coinsDetailNoPlan: (bought: number) => `${formatNumber(bought)} bought, never expire`, // settingsCoinsDetailNoPlan
  getPro: 'Get Bopsy Pro', // settingsGetPro
  manage: 'Manage subscription', // NEW (settingsManage)
  manageFallback: 'Write to us from the Support page to change your plan.', // NEW
  buyCoinsLink: 'Buy coins', // settingsBuyCoins
  deleteMedia: 'Delete my photos and videos', // settingsDeleteMedia
  deleteConfirmTitle: 'Delete your photos and videos?', // settingsDeleteConfirmTitle
  deleteConfirmBody: "This deletes all your photos and videos. It can't be undone. Your coins and plan are kept.", // settingsDeleteConfirmBody
  deleteAction: 'Delete', // settingsDeleteConfirmAction
  deleteDone: 'Your photos and videos are deleted.', // settingsDeleteDone
  deleteFailed: "We couldn't delete your photos and videos. Try again.", // settingsDeleteFailed
  signOut: 'Sign out', // NEW
  signIn: 'Sign in', // NEW
  help: 'Help and support', // settingsHelp
  termsOfUse: 'Terms of use', // settingsTerms
  privacyPolicy: 'Privacy policy', // settingsPrivacy
  coinBalance: (balance: number) => enCoins(balance), // a11yCoinBalance

  rejection: {
    several_subjects: 'We found more than one person. Use a photo with just one.', // createReadyRejectMultiple
    body_not_visible: "We couldn't see the whole body. Try a photo with the whole body in the frame.", // createReadyRejectNotFullBody
    looks_like_child: 'This photo looks like it shows a child. Use a photo of an adult.', // createReadyRejectChild
    unsafe_content: 'This photo may show nudity or violence. Choose another one.', // createReadyRejectUnsafe
    no_subject: "We couldn't find a person in this photo. Choose another one.", // createReadyRejectNoSubject
    unsupported_subject: 'Use a photo of one person.', // createReadyRejectUnsupportedSubject
  } as Record<PhotoRejection, string>,
  reportReasons: {
    sexual: 'Sexual or suggestive', // resultReportReasonSexual
    violent: 'Violent or harmful', // resultReportReasonViolent
    child: 'Shows a child', // resultReportReasonChild
    no_permission: 'Uses my photo without permission', // resultReportReasonNoPermission
    other: 'Something else', // resultReportReasonOther
  } as Record<ReportReason, string>,
};

export type Copy = typeof en;

const fr: Copy = {
  coins: frCoins,
  videosCount: frVideos,
  wordmark: 'bopsy',
  homeLabel: 'Accueil Bopsy',
  demoBadge: 'Démo',
  demoBadgeTitle: 'Mode démo : rien n’est facturé, rien n’est envoyé',
  hook: 'Zéro talent de danse requis.',
  pickDance: 'Choisis ta trend',
  pickDanceBody: 'Une photo. Toutes les trends. Prête en environ',
  minutes: (minutes: number) => (minutes <= 1 ? `${minutes} minute` : `${minutes} minutes`),
  pickForPhoto: 'Choisis une trend pour ta photo.',
  loadingDances: 'Chargement des trends',
  loading: 'Chargement',
  signingIn: 'Connexion en cours…',
  catalogError: 'Impossible de charger les trends.',
  catalogEmpty: 'De nouvelles trends arrivent. Repasse bientôt.',
  families: {
    trends: 'En tendance cette semaine',
    pets: 'Tes animaux vont adorer',
    memes: 'Les classiques des mèmes',
    party: 'Pour lancer la soirée',
    victory: 'Danses de la victoire',
  },
  badgeNew: 'NOUVEAU',
  badgeHot: 'HOT',
  tryAgain: 'Réessayer',
  error: 'Oups, un souci. Réessaie.',
  offline: 'Tu es hors ligne. Vérifie ta connexion.',
  backHome: 'Retour à l’accueil',
  back: 'Retour',
  usePhoto: 'Importer ma photo',
  trendHint: 'Une photo de toi en pied, et tu es dans cette trend.',
  soundOn: 'Activer le son',
  soundOff: 'Couper le son',
  trendVideoLabel: (name: string) => `${name} : vidéo d’exemple`,
  close: 'Fermer',
  cancel: 'Annuler',
  continue: 'Continuer',
  ok: 'OK',
  danceFallback: 'Trend',
  navDances: 'Trends',
  language: 'Langue',
  languageNames: { en: 'English', fr: 'Français' },

  createTitle: 'Fais la trend',
  danceLabel: 'Trend',
  danceMeta: (seconds: number, cost: number) => `${seconds} s · ${frCoins(cost)}`,
  change: 'Changer',
  addPhotoTitle: 'Ajoute une photo',
  addPhotoBody: 'En pied, bien nette : une seule personne.',
  camera: 'Appareil photo',
  gallery: 'Galerie',
  tipsTitle: 'Conseils photo',
  exTitle: 'Comme ça, pas comme ça',
  exSittingKo: 'Assise, corps caché',
  exStandingOk: 'Debout, de la tête aux pieds',
  exSelfieKo: 'Visage seul',
  exBodyOk: 'Corps entier, un peu d’espace autour',
  exGroupKo: 'Plusieurs personnes',
  exAloneOk: 'Seule sur la photo',
  tipWholeBody: 'Le corps entier dans le cadre',
  tipOneSubject: 'Un adulte, seul sur la photo',
  tipSharp: 'Photo nette, bonne lumière',
  tipsWontWork: 'Ça ne marchera pas',
  tipsFaceOnly: 'Visage seul',
  tipsGroup: 'Photo de groupe',
  tipsKids: 'Enfants ou nudité',
  samplesLabel: 'Pas de photo sous la main ? Essaie un exemple :',
  sampleNames: { Man: 'Homme', Dog: 'Chien', Grandma: 'Mamie' },
  yourPhoto: 'Ta photo',
  replace: 'Remplacer',
  notSent: 'Pas encore envoyée',
  checking: 'On vérifie ta photo…',
  scanTitle: 'On scanne ta photo',
  scanSending: 'Envoi de la photo…',
  scanBody: 'On te repère pour lancer ta vidéo…',
  scanAlmost: 'Presque prêt…',
  scanButton: 'Scan de ta photo…',
  fullBody: 'Corps entier détecté',
  cantUse: 'Photo inutilisable',
  consent: 'C’est moi, ou j’ai l’accord de cette personne pour utiliser sa photo.',
  aiNotice: 'Ta photo est envoyée à nos partenaires IA pour la vérifier et créer ta vidéo.',
  privacy: 'Confidentialité',
  terms: 'Conditions',
  uploadFailed: 'Impossible d’envoyer ta photo. Vérifie ta connexion et réessaie.',
  consentMissing: 'Coche la case pour confirmer que tu peux utiliser cette photo.',
  recheck: 'On doit revérifier ta photo. Coche la case pour l’envoyer.',
  photoGone: 'Cette photo n’est plus disponible. Ajoutes-en une nouvelle.',
  planActivating: 'Ton abonnement s’active. Réessaie dans un instant.',
  generationLimited: (wait: string) => `Tu as atteint la limite de vidéos pour cette heure. Réessaie dans ${wait}. Aucune pièce n’a été utilisée.`,
  rendering: (count: number) => `${frVideos(count)} en cours`,
  tooMany: (count: number) => `${frVideos(count)} en cours. Attends qu’une soit terminée.`,
  generateFreePreview: 'Générer l’aperçu gratuit',
  generate: (cost: number) => `Générer · ${frCoins(cost)}`,
  danceUnavailable: 'Cette trend n’est plus disponible.',
  photoTooLarge: 'Cette photo est trop lourde (10 Mo max). Choisis-en une autre.',
  photoType: 'Ce type de fichier n’est pas pris en charge. Utilise une photo JPEG, PNG, WebP ou HEIC.',
  uploadCap: (wait: string) => `Tu as ajouté beaucoup de photos aujourd’hui. Réessaie dans ${wait}.`,
  checkLimited: (wait: string) => `Trop de vérifications de photo. Réessaie dans ${wait}.`,
  captchaFailed: 'On n’a pas pu vérifier que tu n’es pas un robot. Réessaie.',
  captchaTitle: 'Petite vérif : tu n’es pas un robot ?',
  pickAnother: 'Choisis une autre trend',
  makeVideo: 'Lancer ma vidéo',

  preparingTitle: 'On prépare ta trend',
  preparingSteps: ['On vérifie ta photo', 'On cale les mouvements', 'On prépare ta vidéo'],
  teaserTitle: 'Ta vidéo est à un tap',
  teaserBody: (dance: string, seconds: number, minutes: number) =>
    `Débloque-la et on crée ta vidéo ${dance} de ${seconds} secondes en HD, sans filigrane. Prête environ ${minutes} min après.`,
  teaserPlayLabel: 'Vidéo verrouillée. Débloque-la pour la créer.',
  unlockMine: 'Débloquer ma vidéo',
  teaserNote: 'Créée rien que pour toi, dès que tu la débloques.',
  newsletter: 'Préviens-moi par e-mail quand l’app iPhone sort et quand de nouvelles trends arrivent.',

  previewTitle: 'Ton aperçu gratuit',
  previewTag: (seconds: number) => `APERÇU · ${seconds} S`,
  previewMaking: 'On crée ton aperçu',
  previewVideoLabel: 'Aperçu de ta photo qui danse',
  originalPhoto: 'Photo d’origine',
  previewPitchLead: 'Ça te plaît ?',
  previewPitchBody: (seconds: number) => `Obtiens la vidéo complète de ${seconds} secondes en HD, sans filigrane.`,
  unlock: 'Débloquer la vidéo complète',
  unlockSubtitle: (minutes: number) => `HD · sans filigrane · prête en environ ${minutes} min`,
  previewUsed: 'Tu as déjà utilisé ton aperçu gratuit.',
  previewOff: 'Les aperçus gratuits sont en pause. Débloque la vidéo complète pour créer la tienne.',
  previewLimited: (wait: string) => `Trop d’aperçus gratuits depuis ta connexion aujourd’hui. Réessaie dans ${wait}, ou débloque la vidéo complète maintenant.`,
  previewFailed: 'Ton aperçu n’a pas pu être créé. Débloque la vidéo complète pour réessayer.',
  previewFailedNoBody: 'On ne voit pas le corps entier sur cette photo. Débloque la vidéo complète et essaie une autre photo.',
  videoFailedQ: 'Vidéo ratée ?',
  coinsComeBack: 'Tes pièces te sont rendues automatiquement.',

  signInTitle: 'On t’envoie ta vidéo où ?',
  signInBody: 'Entre ton e-mail. On t’envoie un code. Tes vidéos et tes pièces restent liées à cet e-mail.',
  emailLabel: 'E-mail',
  sendCode: 'Recevoir le code',
  codeTitle: 'Entre ton code',
  loginTitle: 'Se connecter',
  loginBody: 'Entre l’e-mail que tu as utilisé. On t’envoie un code pour retrouver tes vidéos et tes pièces.',
  codeBody: (email: string) => `On a envoyé un code à ${email}. Tu peux aussi toucher le lien dans l’e-mail.`,
  codeLabel: 'Code reçu par e-mail',
  verify: 'Valider',
  resend: 'Renvoyer le code',
  resendIn: (seconds: number) => `Renvoyer le code dans ${seconds} s`,
  changeEmail: 'Utiliser un autre e-mail',
  demoCode: (code: string) => `Démo : ton code est ${code}`,
  invalidEmail: 'Entre une adresse e-mail valide.',
  invalidCode: 'Ce code ne marche pas. Vérifie-le ou demande-en un nouveau.',
  rateLimited: 'Trop d’essais. Attends une minute et réessaie.',

  paywallTitle: 'Débloque ta vidéo',
  coinLine: (weekly: number, cost: number) => `${frCoins(weekly)} chaque semaine · 1 vidéo = ${frCoins(cost)}`,
  launchOffer: 'OFFRE DE LANCEMENT',
  saveBadge: (percent: number) => `−${percent} %`,
  planTitle: ({ price, period, intro }: PlanPrices) => (period === 'year' ? `${price} / an` : `${intro?.price ?? price} / semaine`),
  planSubtitle: ({ price, period, intro }: PlanPrices, perWeek: string, coins: number) =>
    period === 'year'
      ? `${perWeek} / semaine · ${frCoins(coins)} chaque mois`
      : intro
        ? `pour ${intro.weeks === 1 ? 'ta première semaine' : `tes ${intro.weeks} premières semaines`}, puis ${price} / semaine`
        : 'Facturé chaque semaine · résiliable à tout moment',
  renewalTerms: ({ price, period, intro }: PlanPrices) => {
    const unit = period === 'year' ? 'an' : 'semaine';
    const every = period === 'year' ? 'chaque année' : 'chaque semaine';
    const first = intro ? `${intro.price} / semaine ${intro.weeks === 1 ? 'la première semaine' : `les ${intro.weeks} premières semaines`}, puis ` : '';
    return (
      `${first}${price} / ${unit}, prélevé aujourd’hui puis ${every} jusqu’à ta résiliation. ` +
      'Renouvellement automatique. Résilie quand tu veux depuis Mon compte, au moins 24 h avant le renouvellement.'
    );
  },
  whatAreCoins: 'C’est quoi, les pièces ?',
  paywallLoadError: 'Impossible de charger les offres. Vérifie ta connexion.',
  purchaseFailed: 'L’achat n’a pas abouti. Réessaie.',
  waiver: 'Je veux ma vidéo tout de suite et je renonce à mon droit de rétractation de 14 jours pour ce contenu numérique.',
  activating: 'Ton abonnement s’active…',
  needCoins: (cost: number) => `Il te faut ${frCoins(cost)}`,
  balance: (balance: number) => `Tu as ${frCoins(balance)}.`,
  packTitle: (count: number) => frCoins(count),
  packSubtitle: (videos: number) => `${frVideos(videos)} · sans expiration`,
  bestValue: 'Meilleur prix',
  buyCoins: (count: number) => `Acheter ${frCoins(count)}`,
  packLoadError: 'Impossible de charger les packs de pièces. Vérifie ta connexion.',
  packTerms: 'Achat unique. Les pièces achetées n’expirent jamais.',
  coinsInfoCard: (cost: number) => `1 vidéo trend = ${frCoins(cost)}`,
  coinsInfoBody: 'Les pièces paient chaque vidéo que tu crées.',
  coinsInfoWeeklyLabel: 'Abonnement hebdo :',
  coinsInfoYearlyLabel: 'Abonnement annuel :',
  coinsInfoPacksLabel: 'Packs de pièces',
  coinsInfoWeekly: (weekly: number, videos: number) =>
    `${frCoins(weekly)} chaque semaine, de quoi faire ${frVideos(videos)}. Les pièces de l’abonnement repartent à zéro chaque semaine.`,
  coinsInfoYearly: (monthly: number, videos: number) => `${frCoins(monthly)} chaque mois, de quoi faire ${frVideos(videos)}.`,
  coinsInfoPacks: (count: number, price: string) => `(abonnés) : ${frCoins(count)} pour ${price}. Les pièces achetées n’expirent jamais.`,
  gotIt: 'Compris',
  checkoutDemoTitle: 'Paiement de démo',
  checkoutDemoBody: 'Aucune carte n’est débitée en mode démo.',
  checkoutPlanLine: (period: 'week' | 'year', price: string) => `Abonnement ${period === 'week' ? 'hebdo' : 'annuel'} · ${price} aujourd’hui`,
  checkoutPackLine: (count: number, price: string) => `${frCoins(count)} · ${price}`,
  pay: (price: string) => `Payer ${price}`,

  generatingTitle: 'On crée ta vidéo',
  generatingPhotoLabel: 'Ta photo en train d’être animée',
  failedPhotoLabel: 'La photo qui n’a pas pu être animée',
  progressLabel: 'Progression de la vidéo',
  trendingWhileWaiting: 'En tendance pendant que tu attends',
  minLeft: (minutes: number) => `Encore environ ${minutes} min`,
  queued: 'En file d’attente',
  stepPhoto: 'Photo vérifiée',
  stepMoves: (dance: string) => `Pas de ${dance} chargés`,
  stepMovesLoading: (dance: string) => `Chargement des pas de ${dance}`,
  stepRendering: (seconds: number) => `Rendu de ta vidéo de ${seconds} s`,
  generatingCaption: (cost: number) =>
    `Tu peux fermer cette page, ta vidéo t’attend dans Mes vidéos. Si ça échoue, ${cost <= 1 ? `ta pièce t’est rendue` : `tes ${cost} pièces te sont rendues`} automatiquement.`,
  takingLonger: 'Ça prend un peu plus de temps que d’habitude. Tu peux fermer cette page, elle sera dans Mes vidéos.',

  resultTitle: 'Ta trend est prête !',
  resultVideoLabel: (dance: string) => `Ta vidéo terminée : ${dance}`,
  resultMeta: (dance: string, seconds: number) => `${dance} · ${seconds} s · HD`,
  coinsLeft: (balance: number) => `${formatNumber(balance)} ${balance <= 1 ? 'restante' : 'restantes'}`,
  download: 'Télécharger',
  share: 'Partager',
  hint: 'Elle a déjà le son de la trend. Télécharge-la et poste-la.',
  makeAnother: 'En faire une autre',
  linkCopied: 'Lien copié. Il marche pendant 7 jours.',
  shareFailed: 'Impossible de partager ta vidéo. Essaie Télécharger.',
  videoLoadError: 'Impossible de charger ta vidéo. Vérifie ta connexion.',
  notReady: 'Ta vidéo est encore en route. Elle s’affiche dès qu’elle est prête.',
  unavailable: 'Cette vidéo n’est plus disponible.',
  failedTitle: 'Celle-ci n’a pas marché',
  failedNoBody: 'On ne voit pas le corps entier sur cette photo, la vidéo n’a donc pas pu être créée.',
  failedTimeout: 'Le rendu a pris trop de temps, on l’a arrêté.',
  failedServer: 'Un souci de notre côté, la vidéo n’a pas pu être créée.',
  failedRefund: (refund: number, balance: number | null) =>
    balance === null
      ? `${refund <= 1 ? `${refund} pièce t’est rendue.` : `${refund} pièces te sont rendues.`}`
      : `${refund <= 1 ? `${refund} pièce t’est rendue` : `${refund} pièces te sont rendues`}. Tu en as ${formatNumber(balance)}.`,
  tryAnotherPhoto: 'Essayer une autre photo',
  contactSupport: 'Contacter le support',

  reportTitle: 'Signaler cette vidéo',
  reportNote: 'Ajoute une note (facultatif)',
  reportSubmit: 'Envoyer le signalement',
  reportThanks: 'Merci de nous avoir prévenus. On va regarder ça.',
  reportFailed: 'Impossible d’envoyer ton signalement. Réessaie.',
  reportLimited: (wait: string) => `Tu as atteint la limite de signalements du jour. Réessaie dans ${wait}.`,

  myVideos: 'Mes vidéos',
  tileRendering: (dance: string) => `${dance} · en cours`,
  tileQueued: (dance: string) => `${dance} · en attente`,
  tileFailed: (dance: string) => `${dance} · échec`,
  emptyTitle: 'Pas encore de vidéo',
  emptyBody: 'Tes vidéos trend apparaîtront ici.',
  emptyCta: 'Crée ta première vidéo',
  videosError: 'Impossible de charger tes vidéos.',

  account: 'Mon compte',
  signedInAs: (email: string) => `Connecté avec ${email}`,
  coinsTitle: 'Pièces',
  weeklyPlan: 'Abonnement hebdo',
  yearlyPlan: 'Abonnement annuel',
  noPlan: 'Abonne-toi pour avoir des pièces pour tes vidéos',
  coinsDetailWeekly: (bought: number) => `180 chaque semaine · non cumulables · ${formatNumber(bought)} achetées, sans expiration`,
  coinsDetailYearly: (bought: number) => `240 chaque mois · non cumulables · ${formatNumber(bought)} achetées, sans expiration`,
  coinsDetailNoPlan: (bought: number) => `${formatNumber(bought)} achetées, sans expiration`,
  getPro: 'Passer à Bopsy Pro',
  manage: 'Gérer l’abonnement',
  manageFallback: 'Écris-nous depuis la page Support pour changer d’abonnement.',
  buyCoinsLink: 'Acheter des pièces',
  deleteMedia: 'Supprimer mes photos et vidéos',
  deleteConfirmTitle: 'Supprimer tes photos et vidéos ?',
  deleteConfirmBody: 'Toutes tes photos et vidéos seront supprimées, sans retour possible. Tes pièces et ton abonnement sont conservés.',
  deleteAction: 'Supprimer',
  deleteDone: 'Tes photos et vidéos sont supprimées.',
  deleteFailed: 'Impossible de supprimer tes photos et vidéos. Réessaie.',
  signOut: 'Se déconnecter',
  signIn: 'Se connecter',
  help: 'Aide et support',
  termsOfUse: 'Conditions d’utilisation',
  privacyPolicy: 'Politique de confidentialité',
  coinBalance: (balance: number) => frCoins(balance),

  rejection: {
    several_subjects: 'On voit plus d’une personne. Utilise une photo où tu es seul ou seule.',
    body_not_visible: 'On ne voit pas le corps entier. Essaie une photo avec tout le corps dans le cadre.',
    looks_like_child: 'Cette photo semble montrer un enfant. Utilise la photo d’un adulte.',
    unsafe_content: 'Cette photo pourrait montrer de la nudité ou de la violence. Choisis-en une autre.',
    no_subject: 'On ne trouve personne sur cette photo. Choisis-en une autre.',
    unsupported_subject: 'Utilise la photo d’une seule personne.',
  },
  reportReasons: {
    sexual: 'Sexuel ou suggestif',
    violent: 'Violent ou dangereux',
    child: 'Montre un enfant',
    no_permission: 'Utilise ma photo sans mon accord',
    other: 'Autre chose',
  },
};

/** Both dictionaries (tests check that they match). */
export const dictionaries: Record<Locale, Copy> = { en, fr };

/** The texts of the active locale. */
export const t: Copy = dictionaries[LOCALE];

/** "1 coin", "180 coins", "1,500 coins" (or "pièces"). */
export const coins = (count: number): string => t.coins(count);
export const videosCount = (count: number): string => t.videosCount(count);

export const rejectionText: Record<PhotoRejection, string> = t.rejection;
export const reportReasonText: Record<ReportReason, string> = t.reportReasons;

/** Messages for refusals the create screen shows itself (others navigate). */
export const refusalText: Partial<Record<GenerationRefusal, string>> = {
  consent_missing: t.consentMissing,
  photo_not_checked: t.recheck,
  dance_unavailable: t.danceUnavailable,
  preview_already_used: t.previewUsed,
};

/** The text of a server limit (D131) with its wait ("12 min", "3 h"). */
export function limitText(action: LimitedAction, wait: string): string {
  switch (action) {
    case 'generation':
      return t.generationLimited(wait);
    case 'photo_check':
      return t.checkLimited(wait);
    case 'photo_upload':
      return t.uploadCap(wait);
    case 'preview':
      return t.previewLimited(wait);
    case 'report':
      return t.reportLimited(wait);
  }
}
