// Share on the web (D108): the MP4 itself through the Web Share API when
// the browser can share files (iOS Safari, Android Chrome), else the link,
// else the link copied to the clipboard.

export type ShareOutcome = 'shared' | 'cancelled' | 'copied' | 'failed';

export interface ShareEnv {
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void>;
  writeText?: (text: string) => Promise<void>;
}

function browserEnv(): ShareEnv {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  return {
    canShare: typeof nav?.canShare === 'function' ? (data) => nav.canShare(data) : undefined,
    share: typeof nav?.share === 'function' ? (data) => nav.share(data) : undefined,
    writeText: nav?.clipboard ? (text) => nav.clipboard.writeText(text) : undefined,
  };
}

export async function shareVideo(
  input: { file: File | null; url: string; title: string },
  env: ShareEnv = browserEnv(),
): Promise<ShareOutcome> {
  const attempts: ShareData[] = [];
  if (input.file && env.canShare?.({ files: [input.file] })) attempts.push({ files: [input.file], title: input.title });
  if (env.share) attempts.push({ url: input.url, title: input.title });
  for (const data of attempts) {
    try {
      await env.share!(data);
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
      // NotAllowedError (gesture lost) or a type the target refuses: try the next way.
    }
  }
  try {
    if (!env.writeText) return 'failed';
    await env.writeText(input.url);
    return 'copied';
  } catch {
    return 'failed';
  }
}

/** "bopsy-street-bounce.mp4" */
export function downloadName(danceName: string): string {
  const slug = danceName.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `bopsy-${slug || 'dance'}.mp4`;
}
