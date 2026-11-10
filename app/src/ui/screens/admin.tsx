// Admin dashboard (D152, #/admin): the funnel, traffic, sources and money of
// the last days, from public.analytics_dashboard() (admins only, checked by
// the server). French only: it is the owner's screen, not a customer one.
import { useEffect, useState } from 'preact/hooks';
import { LIVE } from '../../config';
import { Header } from '../components';
import { useStore } from '../hooks';
import { app } from '../app-state';

interface Step { step: string; label: string; visitors: number }
interface Dashboard {
  from: string;
  to: string;
  totals: { visitors: number; sessions: number; page_views: number; events: number };
  funnel: Step[];
  daily: { day: string; visitors: number; page_views: number; buyers: number }[];
  pages: { path: string; views: number; visitors: number }[];
  sources: { source: string; medium: string; campaign: string; visitors: number; buyers: number }[];
  devices: Record<string, number>;
  in_app: Record<string, number>;
  trends: { slug: string | null; opens: number; photos: number }[];
  accounts: { new_email_accounts: number; new_guests: number };
  videos: { started: number; ready: number; failed: number };
  money: {
    currency: string;
    revenue: number;
    new_subscriptions: number;
    renewals: number;
    coin_packs: number;
    cancellations: number;
    by_product: Record<string, number>;
    sandbox_purchases: number;
    active_subscriptions: number;
  };
}

const RANGES = [1, 7, 30, 90];
const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(n / d < 0.1 ? 1 : 0)} %` : '–');
const money = (n: number, currency: string) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: currency || 'EUR' }).format(Number(n) || 0);

function Kpi({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div class="kpi">
      <span class="kpi-label">{label}</span>
      <b class="kpi-value">{value}</b>
      {hint && <span class="kpi-hint">{hint}</span>}
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  if (rows.length === 0) return <p class="muted small">Pas encore de données.</p>;
  return (
    <div class="atable-wrap">
      <table class="atable">
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export function AdminScreen() {
  const session = useStore(app().session);
  const [days, setDays] = useState(7);
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!LIVE || !session || session.guest) return;
    let alive = true;
    setLoading(true);
    setError(null);
    void import('../../live/client')
      .then(({ supabase }) => supabase())
      .then((client) => client.rpc('analytics_dashboard', { p_days: days }))
      .then(({ data: result, error: failure }) => {
        if (!alive) return;
        if (failure) setError(/not_admin/.test(failure.message) ? 'not_admin' : failure.message);
        else setData(result as Dashboard);
      })
      .catch((e: unknown) => alive && setError(String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [days, session?.userId, session?.guest]);

  if (!LIVE) return <AdminShell><p class="muted">Le tableau de bord n’existe que sur le site en ligne.</p></AdminShell>;
  if (!session || session.guest) {
    return <AdminShell><p class="muted">Connecte-toi avec ton compte administrateur.</p><a class="btn btn-cta" href="#/login">Se connecter</a></AdminShell>;
  }
  if (error === 'not_admin') return <AdminShell><p class="muted">Ce compte n’a pas accès au tableau de bord.</p></AdminShell>;

  const d = data;
  const first = d?.funnel[0]?.visitors ?? 0;
  const buyers = d?.funnel.find((s) => s.step === 'purchase_done')?.visitors ?? 0;
  const maxDaily = Math.max(1, ...(d?.daily.map((x) => x.visitors) ?? [1]));
  const sales = d ? d.money.new_subscriptions + d.money.coin_packs + d.money.renewals : 0;

  return (
    <AdminShell>
      <div class="seg range" role="tablist" aria-label="Période">
        {RANGES.map((n) => (
          <button key={n} type="button" role="tab" aria-selected={days === n} onClick={() => setDays(n)}>
            {n === 1 ? '24 h' : `${n} j`}
          </button>
        ))}
      </div>
      {error && <p class="message error">{error}</p>}
      {loading && !d && <p class="muted">Chargement…</p>}
      {d && (
        <div class={loading ? 'admin-body loading' : 'admin-body'}>
          <section>
            <h2>Vue d’ensemble</h2>
            <div class="kpis">
              <Kpi label="Visiteurs" value={d.totals.visitors} hint={`${d.totals.sessions} sessions`} />
              <Kpi label="Pages vues" value={d.totals.page_views} />
              <Kpi label="Comptes e-mail créés" value={d.accounts.new_email_accounts} hint={`${d.accounts.new_guests} invités`} />
              <Kpi label="Chiffre d’affaires" value={money(d.money.revenue, d.money.currency)} hint={`${sales} paiements`} />
              <Kpi label="Visiteur → achat" value={pct(buyers, d.totals.visitors)} hint={`${buyers} acheteurs suivis`} />
              <Kpi label="Revenu par visiteur" value={money(d.totals.visitors ? d.money.revenue / d.totals.visitors : 0, d.money.currency)} hint="coût max par visiteur pour être rentable" />
              <Kpi label="Abonnements actifs" value={d.money.active_subscriptions} hint={`${d.money.cancellations} annulations`} />
              <Kpi label="Vidéos" value={`${d.videos.ready} prêtes`} hint={`${d.videos.failed} échecs sur ${d.videos.started}`} />
            </div>
          </section>

          <section>
            <h2>Tunnel</h2>
            <p class="muted small">Visiteurs uniques ayant atteint chaque étape. Le % de gauche compare à la 1re étape, celui de droite à l’étape d’avant.</p>
            <div class="funnel">
              {d.funnel.map((s, i) => {
                const prev = i > 0 ? d.funnel[i - 1]?.visitors ?? 0 : s.visitors;
                return (
                  <div class="funnel-row" key={s.step}>
                    <span class="funnel-label">{s.label}</span>
                    <span class="funnel-bar"><i style={{ width: first ? `${Math.max(2, (s.visitors / first) * 100)}%` : '0%' }} /></span>
                    <b>{s.visitors}</b>
                    <span class="funnel-pct">{pct(s.visitors, first)}</span>
                    <span class={i > 0 && prev > 0 && s.visitors / prev < 0.3 ? 'funnel-drop bad' : 'funnel-drop'}>{i > 0 ? pct(s.visitors, prev) : ''}</span>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <h2>Jour par jour</h2>
            <div class="daily">
              {d.daily.map((x) => (
                <div class="daily-col" key={x.day} title={`${x.day} : ${x.visitors} visiteurs, ${x.page_views} pages, ${x.buyers} acheteurs`}>
                  <i style={{ height: `${(x.visitors / maxDaily) * 100}%` }} />
                  <span>{x.day.slice(5)}</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2>Sources</h2>
            <Table head={['Source', 'Support', 'Campagne', 'Visiteurs', 'Acheteurs', 'Conversion']}
              rows={d.sources.map((s) => [s.source, s.medium, s.campaign, s.visitors, s.buyers, pct(s.buyers, s.visitors)])} />
          </section>

          <section>
            <h2>Pages les plus vues</h2>
            <Table head={['Page', 'Vues', 'Visiteurs']} rows={d.pages.map((p) => [p.path, p.views, p.visitors])} />
          </section>

          <section>
            <h2>Trends</h2>
            <Table head={['Trend', 'Ouvertures', 'Photos choisies', 'Passage']}
              rows={d.trends.map((t) => [t.slug ?? '?', t.opens, t.photos, pct(t.photos, t.opens)])} />
          </section>

          <section>
            <h2>Appareils et navigateurs</h2>
            <Table head={['Appareil', 'Visiteurs']} rows={Object.entries(d.devices).map(([k, v]) => [k, v])} />
            <Table head={['Ouvert depuis', 'Visiteurs']} rows={Object.entries(d.in_app).map(([k, v]) => [k, v])} />
          </section>

          <section>
            <h2>Ventes</h2>
            <Table head={['Produit', 'Paiements']} rows={Object.entries(d.money.by_product).map(([k, v]) => [k, v])} />
            <p class="muted small">
              {d.money.new_subscriptions} nouveaux abonnements, {d.money.renewals} renouvellements, {d.money.coin_packs} packs de pièces.
              Achats de test (sandbox) ignorés : {d.money.sandbox_purchases}. Montants TTC avant commission.
            </p>
          </section>
        </div>
      )}
    </AdminShell>
  );
}

function AdminShell({ children }: { children: preact.ComponentChildren }) {
  return (
    <>
      <Header title="Tableau de bord" back="/" right={<span />} />
      <main class="admin">{children}</main>
    </>
  );
}
