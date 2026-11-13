// Site traffic from Cloudflare's GraphQL Analytics API.
// Two sources:
//  - zone HTTP analytics: every request through Cloudflare (includes bots and API calls)
//  - Web Analytics (RUM): page loads from real browsers via the beacon, with paths and referrers
// Env: CF_ANALYTICS_TOKEN (Account Analytics:Read + Zone Analytics:Read), CF_ANALYTICS_ZONE_ID,
//      CF_ANALYTICS_ACCOUNT_ID, CF_WEB_ANALYTICS_SITE_TAG (optional; RUM sections are skipped without it).

const ENDPOINT = "https://api.cloudflare.com/client/v4/graphql";

export interface DayPoint {
  date: string; // YYYY-MM-DD (UTC)
  pageViews: number;
  visits: number;
  requests: number;
}

export interface Ranked {
  label: string;
  count: number;
}

export interface SiteAnalytics {
  days: number;
  hasRum: boolean;
  totals: { pageViews: number; visits: number; requests: number; uniques: number; bytes: number; cachedPct: number };
  daily: DayPoint[];
  pages: Ranked[];
  referrers: Ranked[];
  countries: Ranked[];
  devices: Ranked[];
}

export const analyticsConfigured = () =>
  !!(process.env.CF_ANALYTICS_TOKEN && process.env.CF_ANALYTICS_ZONE_ID && process.env.CF_ANALYTICS_ACCOUNT_ID);

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CF_ANALYTICS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] | null };
  if (body.errors?.length) throw new Error(`Cloudflare analytics: ${body.errors.map((e) => e.message).join("; ")}`);
  if (!res.ok || !body.data) throw new Error(`Cloudflare analytics: HTTP ${res.status}`);
  return body.data;
}

const ZONE_QUERY = `query Zone($zone: String!, $since: Date!, $until: Date!) {
  viewer { zones(filter: { zoneTag: $zone }) {
    httpRequests1dGroups(limit: 100, filter: { date_geq: $since, date_leq: $until }, orderBy: [date_ASC]) {
      dimensions { date }
      sum { requests pageViews bytes cachedBytes countryMap { clientCountryName requests } }
      uniq { uniques }
    }
  } }
}`;

interface ZoneData {
  viewer: {
    zones: {
      httpRequests1dGroups: {
        dimensions: { date: string };
        sum: { requests: number; pageViews: number; bytes: number; cachedBytes: number; countryMap: { clientCountryName: string; requests: number }[] };
        uniq: { uniques: number };
      }[];
    }[];
  };
}

const RUM_GROUP = (alias: string, dim: string, limit: number, order = "count_DESC") =>
  `${alias}: rumPageloadEventsAdaptiveGroups(limit: ${limit}, filter: $filter, orderBy: [${order}]) { count sum { visits } dimensions { ${dim} } }`;

const RUM_QUERY = `query Rum($account: String!, $filter: AccountRumPageloadEventsAdaptiveGroupsFilter_InputObject!) {
  viewer { accounts(filter: { accountTag: $account }) {
    ${RUM_GROUP("daily", "date", 100, "date_ASC")}
    ${RUM_GROUP("pages", "requestPath", 10)}
    ${RUM_GROUP("referrers", "refererHost", 10)}
    ${RUM_GROUP("countries", "countryName", 10)}
    ${RUM_GROUP("devices", "deviceType", 5)}
  } }
}`;

type RumRow = { count: number; sum: { visits: number }; dimensions: Record<string, string> };
interface RumData {
  viewer: { accounts: { daily: RumRow[]; pages: RumRow[]; referrers: RumRow[]; countries: RumRow[]; devices: RumRow[] }[] };
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

const rank = (rows: RumRow[], dim: string, empty: string): Ranked[] =>
  rows.map((r) => ({ label: r.dimensions[dim] || empty, count: r.count }));

export async function getSiteAnalytics(days: number): Promise<SiteAnalytics> {
  const until = new Date();
  const since = new Date(until.getTime() - (days - 1) * 86_400_000);
  const siteTag = process.env.CF_WEB_ANALYTICS_SITE_TAG;

  const [zone, rum] = await Promise.all([
    gql<ZoneData>(ZONE_QUERY, { zone: process.env.CF_ANALYTICS_ZONE_ID, since: isoDate(since), until: isoDate(until) }),
    siteTag
      ? gql<RumData>(RUM_QUERY, {
          account: process.env.CF_ANALYTICS_ACCOUNT_ID,
          filter: { siteTag, datetime_geq: `${isoDate(since)}T00:00:00Z`, datetime_leq: until.toISOString(), bot: 0 },
        })
      : null,
  ]);

  const zoneDays = zone.viewer.zones[0]?.httpRequests1dGroups ?? [];
  const r = rum?.viewer.accounts[0];
  const rumByDate = new Map((r?.daily ?? []).map((d) => [d.dimensions.date, d]));

  // One point per day, including days with no traffic
  const daily: DayPoint[] = [];
  for (let i = 0; i < days; i++) {
    const date = isoDate(new Date(since.getTime() + i * 86_400_000));
    const z = zoneDays.find((d) => d.dimensions.date === date);
    const rd = rumByDate.get(date);
    daily.push({
      date,
      pageViews: r ? (rd?.count ?? 0) : (z?.sum.pageViews ?? 0),
      visits: rd?.sum.visits ?? 0,
      requests: z?.sum.requests ?? 0,
    });
  }

  const sum = (f: (d: (typeof zoneDays)[number]) => number) => zoneDays.reduce((s, d) => s + f(d), 0);
  const bytes = sum((d) => d.sum.bytes);

  // Zone countries are by request, used only when RUM isn't set up
  const zoneCountries = new Map<string, number>();
  for (const d of zoneDays)
    for (const c of d.sum.countryMap) zoneCountries.set(c.clientCountryName, (zoneCountries.get(c.clientCountryName) ?? 0) + c.requests);

  return {
    days,
    hasRum: !!r,
    totals: {
      pageViews: daily.reduce((s, d) => s + d.pageViews, 0),
      visits: daily.reduce((s, d) => s + d.visits, 0),
      requests: sum((d) => d.sum.requests),
      uniques: sum((d) => d.uniq.uniques),
      bytes,
      cachedPct: bytes ? (sum((d) => d.sum.cachedBytes) / bytes) * 100 : 0,
    },
    daily,
    pages: r ? rank(r.pages, "requestPath", "/") : [],
    referrers: r ? rank(r.referrers, "refererHost", "Direct / none") : [],
    countries: r
      ? rank(r.countries, "countryName", "Unknown")
      : [...zoneCountries].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([label, count]) => ({ label, count })),
    devices: r ? rank(r.devices, "deviceType", "Unknown") : [],
  };
}
