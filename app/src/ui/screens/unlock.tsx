// 5. "Unlock full video": the email, asked only here (D110), and the
// 6-digit code typed in the page (in-app browsers); the magic link of the
// same email also signs in (handled at boot).
import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../../copy';
import { navigate } from '../../core/router';
import * as otp from '../../core/otp';
import { app } from '../app-state';
import { Checkbox, Header } from '../components';
import { useNow } from '../hooks';

function errorText(error: otp.OtpError): string {
  switch (error) {
    case 'invalid_email':
      return t.invalidEmail;
    case 'invalid_code':
      return t.invalidCode;
    case 'rate_limited':
      return t.rateLimited;
    case 'captcha':
      return t.captchaFailed;
    case 'network':
      return t.offline;
  }
}

export function UnlockScreen() {
  const { backend } = app().services;
  const [state, setState] = useState<otp.OtpState>(() => ({ ...otp.initialOtp, email: backend.auth.current()?.email ?? '' }));
  const now = useNow(1000);
  const [news, setNews] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (state.step === 'code' ? codeRef : emailRef).current?.focus();
  }, [state.step]);

  const send = async (event?: Event) => {
    event?.preventDefault();
    if (!otp.isValidEmail(state.email)) {
      setState((s) => otp.failed(s, 'invalid_email'));
      return;
    }
    if (state.busy) return;
    const next = otp.sending(state);
    setState(next);
    const result = await backend.auth.sendCode(next.email);
    setState((s) => (result.ok ? otp.codeSent(s, Date.now(), result.demoCode) : otp.failed(s, result.error)));
  };

  const verify = async (code: string) => {
    setState((s) => otp.verifying({ ...s, code }));
    const result = await backend.auth.verifyCode(state.email, code);
    if (!result.ok) {
      setState((s) => otp.failed(s, result.error));
      codeRef.current?.focus();
      return;
    }
    // The news box (D139): saved only when ticked; never blocks the purchase.
    if (news) void backend.auth.saveNewsletterChoice(true).catch(() => undefined);
    const flow = app().flow;
    if (flow.state.photo.kind === 'accepted' && flow.state.danceSlug) await flow.continueSignedIn(result.userChanged);
    else navigate('/account', { replace: true });
  };

  const onCode = (value: string) => {
    const next = otp.codeChanged(state, value);
    setState(next);
    if (otp.canVerify(next)) void verify(next.code);
  };

  const wait = otp.resendIn(state, now);
  return (
    <>
      <Header back="/" />
      <main class="narrow">
        {state.step === 'email' ? (
          <form onSubmit={(event) => void send(event)} noValidate>
            <h1 class="title">{t.signInTitle}</h1>
            <p class="lede">{t.signInBody}</p>
            <div class="field">
              <label for="email">{t.emailLabel}</label>
              <input
                id="email"
                ref={emailRef}
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="off"
                spellcheck={false}
                value={state.email}
                aria-invalid={state.error === 'invalid_email'}
                aria-describedby={state.error ? 'otp-error' : undefined}
                onInput={(event) => setState((s) => otp.emailChanged(s, (event.target as HTMLInputElement).value))}
              />
            </div>
            {state.error && <p id="otp-error" class="error-text" role="alert">{errorText(state.error)}</p>}
            <Checkbox id="newsletter" checked={news} onChange={setNews}>
              {t.newsletter}
            </Checkbox>
            <div class="cta-bar">
              <button type="submit" class="btn btn-cta btn-block" disabled={state.busy} aria-busy={state.busy}>
                {state.busy ? '…' : t.sendCode}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={(event) => { event.preventDefault(); if (otp.canVerify(state)) void verify(state.code); }} noValidate>
            <h1 class="title">{t.codeTitle}</h1>
            <p class="lede">{t.codeBody(state.email)}</p>
            {state.demoCode && <p class="demo-code" data-testid="demo-code">{t.demoCode(state.demoCode)}</p>}
            <div class="field">
              <label for="code">{t.codeLabel}</label>
              <input
                id="code"
                ref={codeRef}
                class="code-input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={12}
                value={state.code}
                disabled={state.busy}
                aria-invalid={state.error === 'invalid_code'}
                aria-describedby={state.error ? 'otp-error' : undefined}
                onInput={(event) => onCode((event.target as HTMLInputElement).value)}
              />
            </div>
            {state.error && <p id="otp-error" class="error-text" role="alert">{errorText(state.error)}</p>}
            <div class="link-row">
              <button type="button" class="link" disabled={!otp.canResend(state, now)} onClick={() => void send()}>
                {wait > 0 ? t.resendIn(wait) : t.resend}
              </button>
              <button type="button" class="link" onClick={() => setState((s) => otp.changeEmail(s))}>{t.changeEmail}</button>
            </div>
            <div class="cta-bar">
              <button type="submit" class="btn btn-cta btn-block" disabled={!otp.canVerify(state)} aria-busy={state.busy}>
                {state.busy ? '…' : t.verify}
              </button>
            </div>
          </form>
        )}
      </main>
    </>
  );
}
