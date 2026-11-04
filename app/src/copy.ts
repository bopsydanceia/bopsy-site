// Interface texts. Wording taken from the app (lib/l10n/app_en.arb of the
// Flutter repo, key in the comment); lines marked NEW are web-only texts in
// the same tone, to validate (same rule as D04).
import type { GenerationRefusal, PhotoRejection, ReportReason } from './core/types';

const number = new Intl.NumberFormat('en-US');

/** "1 coin", "180 coins", "1,500 coins". */
export function coins(count: number): string {
  return count === 1 ? '1 coin' : `${number.format(count)} coins`;
}

export function videosCount(count: number): string {
  return count === 1 ? '1 video' : `${count} videos`;
}

export const t = {
  wordmark: 'bopsy', // commonWordmark
  demoBadge: 'Demo', // NEW
  pickDance: 'Choose a dance', // createPickDanceTitle
  pickDanceBody: 'One photo. Any trend. Ready in about', // story1Body (first part)
  catalogError: "We couldn't load the dances.", // homeCatalogError
  catalogEmpty: 'New dances are on the way. Check back soon.', // homeCatalogEmpty
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
  close: 'Close', // a11yClose
  cancel: 'Cancel', // commonCancel
  continue: 'Continue', // commonContinue

  createTitle: 'Create a dance', // createTitle
  danceLabel: 'Dance', // createDanceLabel
  danceMeta: (seconds: number, cost: number) => `${seconds} s · ${coins(cost)}`, // createDanceMeta
  change: 'Change', // createChangeDance
  addPhotoTitle: 'Add a photo', // createAddPhotoTitle
  addPhotoBody: 'Whole body in the frame. One person or one pet.', // createAddPhotoBody
  camera: 'Camera', // createCamera
  gallery: 'Gallery', // createGallery
  tipsTitle: 'Photo tips', // photoTipsTitle
  tipWholeBody: 'Whole body in the frame', // photoTipsRuleWholeBody
  tipOneSubject: 'One adult, one dog or one cat', // NEW (photoTipsRuleOneSubject aligned on C8)
  tipSharp: 'Sharp photo, good light', // photoTipsRuleSharp
  tipsWontWork: "Won't work", // photoTipsWontWork
  tipsFaceOnly: 'Face only', // photoTipsFaceOnly
  tipsGroup: 'Group photo', // photoTipsGroupPhoto
  tipsKids: 'Kids or nudity', // photoTipsKidsOrNudity
  samplesLabel: 'No photo at hand? Try a sample:', // NEW (demo only)
  yourPhoto: 'Your photo', // a11yCreateReadyPhoto
  replace: 'Replace', // createReadyReplace
  notSent: 'Not sent yet', // createReadyNotSent
  checking: 'Checking your photo…', // createReadyChecking
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
  rendering: (count: number) => `${videosCount(count)} rendering`, // createReadyTooManyInProgress
  generateFreePreview: 'Generate free preview', // createPreviewGenerate
  generate: (cost: number) => `Generate · ${coins(cost)}`, // createGenerate
  danceUnavailable: "This dance isn't available anymore.", // danceDetailNotFound
  pickAnother: 'Pick another dance', // danceDetailPickAnother

  previewTitle: 'Your free preview', // previewTitle
  previewTag: (seconds: number) => `PREVIEW · ${seconds} S`, // previewTag
  previewMaking: 'Making your preview', // generatingPreviewTitle
  previewPitchLead: 'Looks good?', // previewPitchLead
  previewPitchBody: (seconds: number) => `Get the full ${seconds}-second video in HD, no watermark.`, // previewPitchBody
  unlock: 'Unlock full video', // previewUnlock
  unlockSubtitle: (minutes: number) => `HD · no watermark · ready in about ${minutes} min`, // previewUnlockSubtitle
  previewUsed: 'You already used your free preview.', // NEW (previewAlreadyUsed without "on this device")
  previewFailed: "Your preview didn't render. Unlock the full video to try again.", // previewFailedBody
  previewFailedNoBody: "We couldn't see the whole body in this photo. Unlock the full video and try another photo.", // previewFailedNoFullBody
  videoFailedQ: 'Video failed?', // commonVideoFailedQuestion
  coinsComeBack: 'Your coins come back automatically.', // commonCoinsComeBack

  signInTitle: 'Where should we send your video?', // NEW
  signInBody: "Enter your email. We'll send you a 6-digit code. Use the same email in the Bopsy app to find your videos and coins.", // NEW
  emailLabel: 'Email', // NEW
  sendCode: 'Send code', // NEW
  codeTitle: 'Enter your code', // NEW
  codeBody: (email: string) => `We sent a 6-digit code to ${email}. You can also tap the link in the email.`, // NEW
  codeLabel: '6-digit code', // NEW
  verify: 'Verify', // NEW
  resend: 'Resend code', // NEW
  resendIn: (seconds: number) => `Resend code in ${seconds} s`, // NEW
  changeEmail: 'Use another email', // NEW
  demoCode: (code: string) => `Demo: your code is ${code}`, // NEW
  invalidEmail: 'Enter a valid email address.', // NEW
  invalidCode: "That code didn't work. Check it or ask for a new one.", // NEW
  rateLimited: 'Too many tries. Wait a minute and try again.', // NEW

  paywallTitle: 'Unlock Bopsy', // paywallTitle
  coinLine: (weekly: number, cost: number) => `${coins(weekly)} every week · 1 dance = ${coins(cost)}`, // paywallCoinLine
  launchOffer: 'LAUNCH OFFER', // paywallBadgeLaunchOffer
  saveBadge: (percent: number) => `Save ${percent}%`, // paywallAnnualSaveBadge
  whatAreCoins: 'What are coins?', // paywallWhatAreCoins
  paywallLoadError: "We couldn't load the plans. Check your connection.", // paywallLoadError
  purchaseFailed: "The purchase didn't go through. Try again.", // commonPurchaseFailed
  waiver: 'I want my video now and I give up my 14-day right of withdrawal for this digital content.', // NEW (D115)
  activating: 'Your plan is being activated…', // NEW
  needCoins: (cost: number) => `You need ${coins(cost)}`, // outOfCoinsTitle
  balance: (balance: number) => `You have ${coins(balance)}.`, // outOfCoinsBalance
  packTitle: (count: number) => coins(count), // outOfCoinsPackTitle
  packSubtitle: (videos: number) => `${videosCount(videos)} · never expire`, // outOfCoinsPackSubtitle
  bestValue: 'Best value', // outOfCoinsBestValue
  buyCoins: (count: number) => `Buy ${coins(count)}`, // outOfCoinsBuy
  packLoadError: "We couldn't load the coin packs. Check your connection.", // outOfCoinsPackLoadError
  packTerms: 'One-time purchase. Bought coins never expire.', // NEW
  coinsInfoCard: (cost: number) => `1 dance video = ${coins(cost)}`, // coinsInfoCardTitle
  coinsInfoBody: 'Coins pay for each video you make.', // coinsInfoCardBody
  coinsInfoWeekly: (weekly: number, videos: number) =>
    `${coins(weekly)} every week, enough for ${videosCount(videos)}. Plan coins reset each week.`, // coinsInfoWeeklyBody
  coinsInfoYearly: (monthly: number, videos: number) => `${coins(monthly)} every month, enough for ${videosCount(videos)}.`, // coinsInfoYearlyBody
  coinsInfoPacks: (count: number, price: string) => `(subscribers): ${coins(count)} for ${price}. Bought coins never expire.`, // coinsInfoPacksBody
  gotIt: 'Got it', // coinsInfoGotIt
  checkoutDemoTitle: 'Demo checkout', // NEW (demo only)
  checkoutDemoBody: 'No card is charged in demo mode.', // NEW (demo only)
  pay: (price: string) => `Pay ${price}`, // NEW (demo only)

  generatingTitle: 'Making your video', // generatingTitle
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
  resultMeta: (dance: string, seconds: number) => `${dance} · ${seconds} s · HD`, // resultMeta
  coinsLeft: (balance: number) => `${number.format(balance)} left`, // resultCoinsLeft
  download: 'Download', // NEW (resultSave on the web)
  share: 'Share', // resultShare
  hint: 'Post it, then add the trending sound in the app.', // resultHint
  makeAnother: 'Make another', // resultMakeAnother
  linkCopied: 'Link copied. It works for 7 days.', // NEW
  shareFailed: "We couldn't share your video. Try Download.", // NEW
  videoLoadError: "We couldn't load your video. Check your connection.", // resultVideoLoadError
  notReady: "Your video is still dancing its way here. It shows up as soon as it's ready.", // resultNotReady
  unavailable: "This video isn't available anymore.", // resultUnavailable
  failedTitle: "This one didn't work", // failedTitle
  failedNoBody: "We couldn't see the whole body in this photo, so the dance didn't render.", // failedCauseNoFullBody
  failedTimeout: 'Rendering took too long, so we stopped it.', // failedCauseTimeout
  failedServer: "Something went wrong on our side, so the dance didn't render.", // failedCauseServerError
  failedRefund: (refund: number, balance: number | null) =>
    balance === null
      ? `${refund === 1 ? '1 coin is back.' : `${refund} coins are back.`}` // failedRefundNoBalance
      : `${refund === 1 ? '1 coin is back' : `${refund} coins are back`}. You have ${number.format(balance)}.`, // failedRefund
  tryAnotherPhoto: 'Try another photo', // failedTryAnotherPhoto
  contactSupport: 'Contact support', // failedContactSupport

  reportTitle: 'Report this video', // resultReportTitle
  reportNote: 'Add a note (optional)', // resultReportNoteHint
  reportSubmit: 'Send report', // resultReportSubmit
  reportThanks: "Thanks for letting us know. We'll take a look.", // resultReportThanks
  reportFailed: "We couldn't send your report. Try again.", // resultReportFailed

  myVideos: 'My videos', // myVideosTitle
  tileRendering: (dance: string) => `${dance} · rendering`, // myVideosTileRendering
  tileQueued: (dance: string) => `${dance} · queued`, // myVideosTileQueued
  tileFailed: (dance: string) => `${dance} · failed`, // myVideosTileFailed
  emptyTitle: 'No videos yet', // myVideosEmptyTitle
  emptyBody: 'Your dance videos will show up here.', // myVideosEmptyBody
  emptyCta: 'Make your first video', // myVideosEmptyCta
  videosError: "We couldn't load your videos.", // myVideosLoadError

  account: 'My account', // NEW
  signedInAs: (email: string) => `Signed in as ${email}`, // NEW
  coinsTitle: 'Coins', // settingsCoins
  weeklyPlan: 'Weekly plan', // settingsWeeklyPlan
  yearlyPlan: 'Yearly plan', // settingsYearlyPlan
  noPlan: 'Subscribe to get coins for your videos', // settingsNoPlanDetail
  coinsDetailWeekly: (bought: number) => `180 every week · unused coins don't roll over · ${number.format(bought)} bought, never expire`, // settingsCoinsDetail
  coinsDetailYearly: (bought: number) => `240 every month · unused coins don't roll over · ${number.format(bought)} bought, never expire`, // settingsCoinsDetailYearly
  coinsDetailNoPlan: (bought: number) => `${number.format(bought)} bought, never expire`, // settingsCoinsDetailNoPlan
  getPro: 'Get Bopsy Pro', // settingsGetPro
  manage: 'Manage subscription', // NEW (settingsManage)
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
  coinBalance: (balance: number) => coins(balance), // a11yCoinBalance
};

export const rejectionText: Record<PhotoRejection, string> = {
  several_subjects: 'We found more than one person or pet. Use a photo with just one.', // createReadyRejectMultiple
  body_not_visible: "We couldn't see the whole body. Try a photo with the whole body in the frame.", // createReadyRejectNotFullBody
  looks_like_child: 'This photo looks like it shows a child. Use a photo of an adult, a dog or a cat.', // createReadyRejectChild
  unsafe_content: 'This photo may show nudity or violence. Choose another one.', // createReadyRejectUnsafe
  no_subject: "We couldn't find a person, a dog or a cat in this photo. Choose another one.", // createReadyRejectNoSubject
  unsupported_subject: 'Use a photo of a person, a dog or a cat.', // createReadyRejectUnsupportedSubject
};

export const reportReasonText: Record<ReportReason, string> = {
  sexual: 'Sexual or suggestive', // resultReportReasonSexual
  violent: 'Violent or harmful', // resultReportReasonViolent
  child: 'Shows a child', // resultReportReasonChild
  no_permission: 'Uses my photo without permission', // resultReportReasonNoPermission
  other: 'Something else', // resultReportReasonOther
};

/** Messages for refusals the create screen shows itself (others navigate). */
export const refusalText: Partial<Record<GenerationRefusal, string>> = {
  consent_missing: t.consentMissing,
  photo_not_checked: t.recheck,
  dance_unavailable: t.danceUnavailable,
  preview_already_used: t.previewUsed,
};
