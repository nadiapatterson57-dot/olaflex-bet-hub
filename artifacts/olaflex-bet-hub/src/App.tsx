import { type ReactNode, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  getGetAdminSummaryQueryKey, getGetBlogPostQueryKey,
  getExportBackupQueryKey, getGetAdminAccessQueryKey, getGetPredictionQueryKey, getGetPublicSettingsQueryKey, getGetResultsQueryKey,
  getListAdminBlogPostsQueryKey, getListAdminPredictionsQueryKey, getListBlogPostsQueryKey,
  getListPredictionsQueryKey, useCreateBlogPost, useCreatePrediction, useDeleteBlogPost,
  useDeletePrediction, useExportBackup, useGetAdminAccess, useGetAdminSummary,
  useGetBlogPost, useGetPrediction, useGetPublicSettings, useGetResults,
  useImportBackup, useListAdminBlogPosts, useListAdminContactMessages, useListAdminPredictions, useListBlogPosts,
  useListPredictions, useRequestUploadUrl, useSendContactMessage, useUpdateBlogPost,
  useUpdatePrediction, useUpdateSiteSettings,
} from '@workspace/api-client-react';
import type {
  AdminContactMessages, Backup, BlogPost, BlogPostInput, ContactMessageInput, GetResultsParams, ListPredictionsParams,
  Prediction, PredictionInput, PredictionMatchInput, SiteSettingsInput,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { ArrowDownRight, ArrowLeft, ArrowRight, BarChart3, BookOpen, Check, CircleHelp, Clock3, Copy, FileUp, Filter, Goal, ImagePlus, LayoutDashboard, LockKeyhole, LogOut, Menu, Search, ShieldCheck, Sparkles, Upload, X } from 'lucide-react';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 25_000, retry: 1 } } });
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

const dateLabel = (value?: string | null) => value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not scheduled';
const dateTimeLabel = (value?: string | null) => value ? new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Kickoff TBC';
const localDateTimeInput = (value: string) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); };
const imageUrl = (path?: string | null) => path ? `/api/storage${path}` : '';
const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const emptyMatch: PredictionMatchInput = { homeTeam: '', awayTeam: '', competition: '', market: '', selection: '', odds: 1.5, kickoffAt: '' };
const emptyPrediction = (): PredictionInput => ({ title: '', slug: '', category: 'free', risk: 'medium', status: 'draft', result: 'pending', bookingCode: null, analysis: null, imagePath: null, combinedOddsOverride: null, matches: [{ ...emptyMatch }] });

function AuthPage({ type }: { type: 'in' | 'up' }) {
  return <div className="min-h-[100dvh] bg-[#0d1118] flex flex-col">
    <header className="shell h-[76px] flex items-center"><Link href="/" className="flex items-center gap-3"><Brand /><span className="display-font text-xl font-bold tracking-wide">OLAFLEX <span className="text-[#54dd89]">BET HUB</span></span></Link></header>
    <div className="flex-1 flex flex-col items-center justify-center p-5 gap-7"><div className="text-center"><p className="eyebrow mb-3">The match, measured.</p><h1 className="display-font text-4xl font-bold">A sharper way to follow football.</h1><p className="text-sm text-slate-400 mt-2">Sign in to continue to OlaFlex.</p></div>{type === 'in' ? <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /> : <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />}</div>
  </div>;
}

function Brand() { return <div className="w-10 h-10 rounded-xl bg-[#51d987] text-[#0c1711] grid place-items-center"><Goal size={24} strokeWidth={2.5} /></div>; }
function PublicLayout({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState(false);
  const [path] = useLocation();
  const settings = useGetPublicSettings();
  const nav = [['/', 'Overview'], ['/today', 'Today'], ['/free-tips', 'Free tips'], ['/premium-tips', 'Premium'], ['/results', 'Results'], ['/blog', 'Journal']];
  return <div className="min-h-[100dvh] bg-[#0d1118] text-[#e8edf1]">
    {settings.data?.announcement && <div className="border-b border-[#3a4d43] bg-[#13211a]"><div className="shell py-2 text-xs text-[#a8e8bd] flex items-center gap-2"><Sparkles size={14}/>{settings.data.announcement}</div></div>}
    <div className="border-b border-[#222a34] bg-[#0a0e14]"><div className="shell min-h-[72px] flex items-center justify-between gap-5">
      <Link href="/" className="flex items-center gap-3 shrink-0"><Brand /><span className="display-font text-xl font-bold tracking-wide">OLAFLEX <span className="text-[#55dc89]">BET HUB</span></span></Link>
      <nav className="hidden lg:flex items-center gap-7">{nav.map(([href, label]) => <Link key={href} href={href} className={`text-[13px] transition-colors ${path === href ? 'text-[#59df8d]' : 'text-slate-400 hover:text-white'}`}>{label}</Link>)}</nav>
      <div className="hidden md:flex items-center gap-3"><Link href="/contact" className="text-sm text-slate-400 hover:text-white">Contact</Link><Link href="/sign-in" className="button-primary">Sign in</Link><Link href="/admin" className="text-slate-500 hover:text-[#57dd8a]" aria-label="Admin dashboard"><LayoutDashboard size={18}/></Link></div>
      <button className="md:hidden p-2 text-slate-300" onClick={() => setMenu(!menu)} aria-label="Toggle navigation" data-testid="button-mobile-menu">{menu ? <X/> : <Menu/>}</button>
    </div>{menu && <div className="lg:hidden border-t border-[#222a34] px-5 py-3 grid grid-cols-2 gap-2">{nav.map(([href,label]) => <Link onClick={() => setMenu(false)} key={href} href={href} className="rounded-lg p-3 text-sm text-slate-300 hover:bg-[#171e27]">{label}</Link>)}<Link href="/contact" className="rounded-lg p-3 text-sm text-slate-300">Contact</Link></div>}</div>
    {children}
    <footer className="border-t border-[#232b35] mt-20 bg-[#0a0e14]"><div className="shell py-9 grid sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr] gap-7 items-start">
      <div className="flex items-center gap-3"><Brand/><div><div className="display-font font-bold text-lg">OLAFLEX BET HUB</div><div className="text-xs text-slate-500">Football, with the details in focus.</div></div></div>
      <div className="flex flex-wrap gap-x-5 gap-y-3 text-xs text-slate-400">{[['/privacy-policy','Privacy'],['/terms','Terms'],['/responsible-gambling','Responsible gambling'],['/contact','Contact']].map(([h,l])=><Link key={h} href={h} className="hover:text-[#58dc8b]">{l}</Link>)}</div>
      <div className="text-xs text-slate-500 space-y-2">{settings.data?.contactEmail&&<a href={`mailto:${settings.data.contactEmail}`} className="block hover:text-[#60dc8e]">{settings.data.contactEmail}</a>}{settings.data?.contactPhone&&<a href={`tel:${settings.data.contactPhone}`} className="block hover:text-[#60dc8e]">{settings.data.contactPhone}</a>}{settings.data?.whatsappNumber&&<a href={`https://wa.me/${settings.data.whatsappNumber.replace(/[^0-9]/g,'')}`} target="_blank" rel="noreferrer" className="block hover:text-[#60dc8e]">WhatsApp</a>}<div className="flex gap-3 pt-1">{[['Instagram',settings.data?.instagramUrl],['Facebook',settings.data?.facebookUrl],['X',settings.data?.xUrl]].filter((entry):entry is [string,string]=>Boolean(entry[1])).map(([name,url])=><a key={name} href={url} target="_blank" rel="noreferrer" className="hover:text-[#60dc8e]">{name}</a>)}</div>{settings.data?.sportyBetUrl&&<a href={settings.data.sportyBetUrl} target="_blank" rel="noreferrer" className="inline-block pt-1 text-[#60dc8e]">Open bookmaker website ↗</a>}</div>
      <p className="sm:col-span-2 lg:col-span-3 text-[11px] text-slate-600">For information and entertainment. Bet responsibly.</p>
    </div></footer>
  </div>;
}
function QueryStatus({ loading, error, retry, label = 'the data' }: { loading: boolean; error: boolean; retry: () => void; label?: string }) {
  if (loading) return <div className="panel p-7 animate-pulse"><div className="h-3 w-32 rounded bg-[#26303b] mb-4"/><div className="h-6 w-2/3 rounded bg-[#26303b]"/></div>;
  if (error) return <div className="panel p-8 text-center"><CircleHelp className="mx-auto text-[#e4b960]" /><p className="mt-3 text-sm text-slate-300">We couldn’t load {label}.</p><button className="button-quiet mt-4" onClick={retry}>Try again</button></div>;
  return null;
}
function PredictionCard({ item }: { item: Prediction }) {
  const hidden = item.isLocked;
  return <article className="panel overflow-hidden hover:border-[#3c6650] transition-colors" data-testid={`card-prediction-${item.id}`}>
    {item.imagePath && <img src={imageUrl(item.imagePath)} alt="" className="w-full h-40 object-cover"/>}
    <div className="p-5">
      <div className="flex justify-between items-center gap-2 mb-4"><span className={`text-[10px] uppercase tracking-[.13em] font-bold px-2 py-1 rounded ${item.category === 'premium' ? 'bg-[#3b2b15] text-[#efc66d]' : 'bg-[#193225] text-[#67e69d]'}`}>{item.category} pick</span><span className="text-xs text-slate-500">{dateLabel(item.publishedAt)}</span></div>
      <Link href={`/prediction/${item.slug}`} className="display-font block text-[24px] leading-[1.05] font-bold hover:text-[#5de090]">{item.title}</Link>
      {item.matches?.length ? <div className="mt-4 space-y-2">{item.matches.slice(0,2).map((m,i)=><div key={m.id || i} className="rounded-lg bg-[#0d131a] px-3 py-3 flex items-center justify-between gap-3"><div className="min-w-0"><div className="text-sm font-medium truncate">{hidden ? 'Match details locked' : `${m.homeTeam} vs ${m.awayTeam}`}</div><div className="text-[11px] text-slate-500 mt-1">{hidden ? 'Premium analysis' : `${m.competition} · ${dateTimeLabel(m.kickoffAt)}`}</div></div><div className="text-right shrink-0"><div className="text-[10px] text-slate-500">{hidden ? 'Selection' : m.market}</div><div className="text-xs text-[#71e39b]">{hidden ? 'Locked' : m.selection}</div></div></div>)}</div> : <div className="mt-4 rounded-lg bg-[#0d131a] p-4 text-xs text-slate-500">Match information has not been added.</div>}
      <div className="mt-4 flex justify-between items-center text-xs border-t border-[#252e38] pt-4"><span className="text-slate-500">{item.isAccumulator ? 'Accumulator' : 'Single'} · {item.risk} risk</span><span className="mono text-[#c5e5d1]">{hidden ? '••••' : item.combinedOddsOverride ?? item.combinedOdds} odds</span></div>
      {item.category === 'premium' && <div className="mt-3 flex gap-2 text-[11px] text-[#e3c375] items-center"><LockKeyhole size={13}/>{hidden ? 'Premium booking code locked' : item.bookingCode ? `Code · ${item.bookingCode}` : 'No booking code attached'}</div>}
    </div>
  </article>;
}
function ListingSection({ items, emptyTitle = 'No published tips yet', emptyText = 'When tips are published, they will appear here. No predictions are made up.' }: { items: Prediction[]; emptyTitle?: string; emptyText?: string }) {
  return items.length ? <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{items.map(p => <PredictionCard key={p.id} item={p}/>)}</div> : <div className="panel p-10 text-center"><div className="w-12 h-12 mx-auto rounded-full bg-[#1c2822] text-[#57dc89] grid place-items-center"><Goal/></div><h3 className="display-font font-bold text-2xl mt-4">{emptyTitle}</h3><p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">{emptyText}</p></div>;
}
function PageHeading({ tag, title, subtitle }: { tag: string; title: string; subtitle: string }) { return <div className="mb-9"><div className="eyebrow mb-3">{tag}</div><h1 className="display-font text-[42px] md:text-[54px] leading-none font-bold tracking-tight">{title}</h1><p className="text-sm text-slate-400 mt-3 max-w-2xl">{subtitle}</p></div>; }
function HomePage() {
  const predictions = useListPredictions({ page: 1, pageSize: 6 });
  return <PublicLayout><main className="shell">
    <section className="relative overflow-hidden rounded-2xl border border-[#2b3c32] mt-8 mb-12 bg-[#111a17] min-h-[360px] flex items-center">
      <div className="absolute inset-0 header-noise pointer-events-none"/><div className="absolute right-[-30px] top-[-130px] w-[420px] h-[420px] rounded-full border border-[#356047]/30"/><div className="absolute right-[30px] top-[-70px] w-[300px] h-[300px] rounded-full border border-[#356047]/30"/><div className="absolute right-[85px] top-[-15px] w-[190px] h-[190px] rounded-full border border-[#356047]/30"/>
      <div className="relative px-7 py-12 md:px-14 md:py-16 max-w-[760px] rise"><div className="eyebrow flex gap-2 items-center"><span className="w-2 h-2 rounded-full bg-[#56df8b] animate-pulse"/> Football analysis, made clear</div><h1 className="display-font text-[54px] sm:text-[72px] leading-[.9] font-bold mt-5 tracking-tight">READ THE GAME.<br/><span className="text-[#5bdd8c]">KNOW THE PICK.</span></h1><p className="mt-5 max-w-[500px] leading-7 text-slate-300 text-sm">Published tips, real results and match context — all in one place. Every selection is clearly marked, and locked premium details stay locked.</p><div className="mt-7 flex flex-wrap gap-3"><Link href="/today" className="button-primary inline-flex items-center gap-2">Browse today’s tips <ArrowRight size={16}/></Link><Link href="/results" className="button-quiet inline-flex items-center gap-2">View the record <BarChart3 size={15}/></Link></div>
        <div className="mt-7 flex items-center gap-5 text-[11px] text-slate-500"><span className="flex items-center gap-1.5"><ShieldCheck size={14} className="text-[#55d885]"/>Published, not promised</span><span className="flex items-center gap-1.5"><Clock3 size={14}/>Time-stamped selections</span></div>
      </div>
      <div className="hidden lg:block absolute right-[8%] bottom-10 w-[220px] rotate-[-8deg]"><div className="panel p-4 shadow-2xl border-[#375441]"><div className="eyebrow">Match intelligence</div><div className="mt-4 flex items-center gap-3"><div className="w-9 h-9 rounded-full bg-[#202a33] grid place-items-center text-xs">FC</div><div className="text-sm font-semibold">Analysis first</div></div><div className="h-px bg-[#2a343e] my-4"/><div className="flex items-end justify-between"><div><div className="text-[10px] text-slate-500">Published picks</div><div className="mono text-xl text-[#64dc90]">LIVE</div></div><ArrowDownRight className="text-[#57dc89]"/></div></div></div>
    </section>
    <div className="flex flex-col md:flex-row md:items-end justify-between mb-5 gap-4"><div><div className="eyebrow">The latest board</div><h2 className="display-font text-3xl font-bold mt-2">Active tips</h2></div><Link href="/free-tips" className="text-sm text-[#60dc8e] flex items-center gap-2">See all tips <ArrowRight size={15}/></Link></div>
    <QueryStatus loading={predictions.isLoading} error={predictions.isError} retry={() => predictions.refetch()} label="active tips"/>
    {!predictions.isLoading && !predictions.isError && <ListingSection items={predictions.data?.items ?? []}/>}
    <div className="grid md:grid-cols-[1fr_1fr] gap-5 mt-16">
      <Link href="/results" className="panel p-7 md:p-9 flex items-center justify-between group"><div><div className="eyebrow">Accountability matters</div><h3 className="display-font text-3xl font-bold mt-2">The results desk</h3><p className="text-sm text-slate-400 mt-2 max-w-sm">See recorded outcomes and the actual numbers behind published picks.</p></div><div className="rounded-full w-12 h-12 bg-[#1d3026] text-[#64df91] grid place-items-center group-hover:translate-x-1 transition-transform"><ArrowRight/></div></Link>
      <div className="panel p-7 md:p-9"><div className="eyebrow">OlaFlex notes</div><h3 className="display-font text-3xl font-bold mt-2">A little more context.</h3><p className="text-sm text-slate-400 mt-2">Read the latest from the team: match previews, market explainers and notes on how we work.</p><Link href="/blog" className="inline-flex items-center gap-2 text-sm text-[#61dc8f] mt-5">Read the journal <ArrowRight size={15}/></Link></div>
    </div>
    <div className="mt-14 panel px-6 py-5 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between"><p className="text-sm text-slate-400 flex gap-2"><CircleHelp size={17} className="text-[#5bdd8c] shrink-0"/>Predictions are for information and entertainment only. There are no guaranteed outcomes.</p><Link href="/responsible-gambling" className="text-xs text-[#5bdd8c] shrink-0">Play responsibly →</Link></div>
  </main></PublicLayout>;
}
function PredictionListing({ title, subtitle, category, presetToday=false }: { title: string; subtitle: string; category?: 'free'|'premium'; presetToday?:boolean }) {
  const [search, setSearch] = useState(''); const [league, setLeague] = useState(''); const [page, setPage] = useState(1); const [date, setDate] = useState(()=>presetToday?new Date(Date.now()-new Date().getTimezoneOffset()*60_000).toISOString().slice(0,10):'');
  const params: ListPredictionsParams = { page, pageSize: 9, ...(category ? { category } : {}), ...(search ? { search } : {}), ...(league ? { league } : {}), ...(date ? { date } : {}) };
  const q = useListPredictions(params);
  return <PublicLayout><main className="shell py-12"><PageHeading tag="Published analysis" title={title} subtitle={subtitle}/>
    <div className="panel p-4 mb-6 grid sm:grid-cols-[1fr_200px_190px] gap-3"><div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/><input className="field pl-10" placeholder="Search published tips" value={search} onChange={e => {setSearch(e.target.value);setPage(1)}} aria-label="Search tips" data-testid="input-search-tips"/></div><input className="field" placeholder="Filter by league" value={league} onChange={e => {setLeague(e.target.value);setPage(1)}} aria-label="Filter by league"/><label className="flex items-center gap-2 text-xs text-slate-400"><Filter size={15}/><input aria-label="Filter by date" className="field" type="date" value={date} onChange={e => setDate(e.target.value)}/></label></div>
    <QueryStatus loading={q.isLoading} error={q.isError} retry={() => q.refetch()} label="tips"/>
    {!q.isLoading && !q.isError && <><ListingSection items={q.data?.items ?? []}/><Pager page={page} pageSize={q.data?.pageSize ?? 9} total={q.data?.total ?? 0} change={setPage}/></>}
  </main></PublicLayout>;
}
function Pager({ page, pageSize, total, change }: { page: number; pageSize: number; total: number; change: (n:number)=>void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return total > pageSize ? <div className="flex items-center justify-center gap-4 mt-8"><button className="button-quiet" disabled={page <= 1} onClick={() => change(page-1)}>Previous</button><span className="mono text-xs text-slate-500">Page {page} of {pages}</span><button className="button-quiet" disabled={page >= pages} onClick={() => change(page+1)}>Next</button></div> : null;
}
function PredictionDetail() {
  const [path] = useLocation(); const slug = path.split('/').pop() || ''; const q = useGetPrediction(slug);
  const [copied, setCopied] = useState(false); const p = q.data;
  return <PublicLayout><main className="shell py-12 max-w-[920px]"><Link href="/today" className="text-xs text-slate-500 flex items-center gap-2 mb-7"><ArrowLeft size={14}/>Back to tips</Link><QueryStatus loading={q.isLoading} error={q.isError} retry={() => q.refetch()} label="this prediction"/>
    {p && <><div className="eyebrow">{p.category} · {p.risk} risk · {dateLabel(p.publishedAt)}</div><h1 className="display-font text-5xl md:text-6xl font-bold mt-3">{p.title}</h1><p className="text-sm text-slate-400 mt-3">{p.isAccumulator ? 'Accumulator' : 'Single selection'} · {p.result === 'pending' ? 'Awaiting result' : `Result: ${p.result}`}</p>
      {p.imagePath && <img src={imageUrl(p.imagePath)} alt="" className="mt-7 rounded-xl w-full max-h-[420px] object-cover"/>}
      <div className="panel mt-7 overflow-hidden"><div className="grid grid-cols-[1fr_auto] px-5 py-4 border-b border-[#28313a] text-[10px] uppercase tracking-wider text-slate-500"><span>Match & market</span><span>Odds</span></div>
        {p.matches?.length ? p.matches.map((m,i)=><div key={m.id || i} className="px-5 py-4 border-b last:border-0 border-[#252e38] grid md:grid-cols-[1fr_190px_60px] gap-3 items-center"><div><div className="text-sm font-semibold">{p.isLocked ? 'Premium match details locked' : `${m.homeTeam} vs ${m.awayTeam}`}</div><div className="text-xs text-slate-500 mt-1">{p.isLocked ? 'Unlock access to view the match' : `${m.competition} · ${dateTimeLabel(m.kickoffAt)}`}</div></div><div><div className="text-[10px] text-slate-500">{p.isLocked ? 'Selection locked' : m.market}</div><div className="text-sm text-[#63df91]">{p.isLocked ? '••••••' : m.selection}</div></div><span className="mono text-xs text-right">{p.isLocked ? '—' : m.odds}</span></div>) : <p className="p-6 text-sm text-slate-500">No match details have been published.</p>}
        <div className="bg-[#0f151c] px-5 py-4 flex justify-between"><span className="text-sm text-slate-400">Combined odds</span><span className="mono text-[#61dd8d]">{p.isLocked ? 'Locked' : p.combinedOddsOverride ?? p.combinedOdds}</span></div>
      </div>
       <div className="mt-5 flex flex-wrap gap-3"><a className="button-quiet inline-flex items-center gap-2" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`${p.title} · ${window.location.href}`)}`}>Share on WhatsApp <ArrowRight size={14}/></a><button className="button-quiet" onClick={() => navigator.clipboard.writeText(window.location.href)}>Copy link</button></div>
       {(p.category === 'premium' || p.bookingCode) && <div className="panel p-5 mt-5 flex justify-between items-center gap-4"><div className="flex gap-3 items-center">{p.isLocked ? <LockKeyhole className="text-[#ecc76d]"/> : <ShieldCheck className="text-[#61dd8e]"/>}<div><div className="text-sm font-semibold">{p.category === 'premium' ? 'Premium booking code' : 'Booking code'}</div><div className="text-xs text-slate-500 mt-1">{p.isLocked ? 'The backend has restricted this information.' : p.bookingCode || 'No booking code attached.'}</div></div></div>{!p.isLocked && p.bookingCode && <button className="button-quiet flex gap-2 items-center" onClick={() => {navigator.clipboard.writeText(p.bookingCode || '');setCopied(true)}}>{copied ? <Check size={15}/> : <Copy size={15}/>} {copied ? 'Copied' : 'Copy code'}</button>}</div>}
      {p.analysis && !p.isLocked && <article className="prose prose-invert max-w-none mt-8"><h2 className="display-font">Analysis</h2><p className="whitespace-pre-wrap">{p.analysis}</p></article>}
    </>}
  </main></PublicLayout>;
}
function ResultsPage() {
  const [page,setPage]=useState(1); const [result,setResult]=useState<GetResultsParams['result'] | ''>('');
  const params: GetResultsParams={page,pageSize:10,...(result ? {result}: {})}; const q=useGetResults(params); const r=q.data;
  return <PublicLayout><main className="shell py-12"><PageHeading tag="The record" title="Results, on record." subtitle="Published prediction outcomes and the real counts supplied by the OlaFlex database."/>
    <QueryStatus loading={q.isLoading} error={q.isError} retry={()=>q.refetch()} label="results"/>
    {r && <><div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-8">{[['Settled',r.statistics.settled],['Won',r.statistics.won],['Lost',r.statistics.lost],['Void',r.statistics.void],['Win rate',`${r.statistics.winRate}%`]].map(([n,v])=><div key={String(n)} className="panel p-5"><div className="text-xs text-slate-500">{n}</div><div className="display-font text-3xl font-bold mt-2">{v}</div></div>)}</div>
      <div className="flex justify-between items-center mb-5"><div className="eyebrow">Settled history</div><select className="field w-auto" value={result} onChange={e=>{setResult(e.target.value as typeof result);setPage(1)}} aria-label="Filter by result"><option value="">Every result</option><option value="won">Won</option><option value="lost">Lost</option><option value="void">Void</option><option value="pending">Pending</option></select></div>
      <ListingSection items={r.predictions} emptyTitle="No results to show" emptyText="There are no matching prediction records in the database."/>
      <Pager page={page} pageSize={r.pageSize} total={r.total} change={setPage}/>
    </>}
  </main></PublicLayout>;
}
function BlogPage() {
  const q=useListBlogPosts();
  return <PublicLayout><main className="shell py-12"><PageHeading tag="OlaFlex journal" title="Between the fixtures." subtitle="Match notes, market explainers and ideas from the OlaFlex team."/><QueryStatus loading={q.isLoading} error={q.isError} retry={()=>q.refetch()} label="journal posts"/>
    {!q.isLoading&&!q.isError && (q.data?.length ? <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">{q.data.map((post,i)=><BlogCard post={post} key={post.id} featured={i===0}/>)}</div> : <EmptyState title="Nothing published yet" detail="The journal will show posts here once the OlaFlex team publishes them."/>)}
  </main></PublicLayout>;
}
function BlogCard({post,featured=false}:{post:BlogPost;featured?:boolean}) {
  return <Link href={`/blog/${post.slug}`} className={`panel overflow-hidden block group ${featured?'md:col-span-2':''}`}><div className={`bg-[#17231d] ${featured?'h-64':'h-44'} overflow-hidden`}>{post.coverImagePath ? <img src={imageUrl(post.coverImagePath)} alt="" className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform"/> : <div className="h-full grid place-items-center text-[#3d7653]"><BookOpen size={42} strokeWidth={1}/></div>}</div><div className="p-5"><div className="eyebrow">{dateLabel(post.publishedAt)} · OlaFlex journal</div><h2 className="display-font text-3xl font-bold mt-2 group-hover:text-[#58dd8b]">{post.title}</h2><p className="text-sm leading-6 text-slate-400 mt-2 line-clamp-3">{post.excerpt}</p><span className="inline-flex text-sm text-[#61df90] gap-2 items-center mt-4">Read article <ArrowRight size={14}/></span></div></Link>;
}
function BlogDetail() {
  const [path]=useLocation(); const slug=path.split('/').pop()||''; const q=useGetBlogPost(slug); const post=q.data;
  return <PublicLayout><main className="shell py-12 max-w-[850px]"><Link href="/blog" className="text-xs text-slate-500 flex items-center gap-2 mb-7"><ArrowLeft size={14}/>Back to journal</Link><QueryStatus loading={q.isLoading} error={q.isError} retry={()=>q.refetch()} label="this article"/>
    {post&&<article>{post.coverImagePath&&<img src={imageUrl(post.coverImagePath)} className="w-full max-h-[420px] object-cover rounded-2xl mb-8" alt=""/>}<div className="eyebrow">OlaFlex journal · {dateLabel(post.publishedAt)}</div><h1 className="display-font text-5xl md:text-6xl font-bold mt-3">{post.title}</h1><p className="text-lg text-slate-400 mt-4">{post.excerpt}</p><div className="prose prose-invert max-w-none mt-9 whitespace-pre-wrap">{post.content}</div></article>}
  </main></PublicLayout>;
}
function ContactPage() {
  const mutation=useSendContactMessage(); const [sent,setSent]=useState(false);
  function submit(e:React.FormEvent<HTMLFormElement>) { e.preventDefault(); const element=e.currentTarget; const d=new FormData(element); const data={name:String(d.get('name')),email:String(d.get('email')),subject:String(d.get('subject')),message:String(d.get('message')),website:String(d.get('website'))} satisfies ContactMessageInput; mutation.mutate({data},{onSuccess:()=>{setSent(true);element.reset()}}); }
  return <PublicLayout><main className="shell py-12 max-w-[900px]"><PageHeading tag="Talk to us" title="Contact OlaFlex." subtitle="Questions about published tips, results or the site? Send a note to the team."/><div className="grid md:grid-cols-[.75fr_1.25fr] gap-5"><div className="panel p-6"><div className="eyebrow">The team</div><h2 className="display-font text-3xl font-bold mt-2">We’re listening.</h2><p className="text-sm leading-6 text-slate-400 mt-3">Use the form to get in touch. We’ll respond using the email address you provide.</p><div className="mt-7 border-t border-[#28313a] pt-5 text-xs text-slate-500">For betting support, contact your bookmaker directly. OlaFlex is an independent information service.</div></div>
      <form className="panel p-6 space-y-4" onSubmit={submit}><div className="grid sm:grid-cols-2 gap-3"><Field label="Your name" name="name" required/><Field label="Email address" name="email" type="email" required/></div><Field label="Subject" name="subject" required/><label className="block text-xs text-slate-400">Message<textarea className="field mt-2 min-h-36 resize-y" name="message" minLength={10} required placeholder="How can we help?"/></label><input className="hidden" tabIndex={-1} autoComplete="off" name="website"/>{sent&&<p className="text-sm text-[#65df92] flex gap-2"><Check size={16}/>Your message has been sent.</p>}{mutation.isError&&<p className="text-sm text-red-300">Message couldn’t be sent. Please try again.</p>}<button className="button-primary" disabled={mutation.isPending}>{mutation.isPending?'Sending…':'Send message'}</button></form>
    </div></main></PublicLayout>;
}
function Field({label,name,type='text',required=false,value,onChange,placeholder}:{label:string;name:string;type?:string;required?:boolean;value?:string|number;onChange?:(e:React.ChangeEvent<HTMLInputElement>)=>void;placeholder?:string}) {
  return <label className="block text-xs text-slate-400">{label}<input className="field mt-2" name={name} type={type} required={required} value={value} onChange={onChange} placeholder={placeholder}/></label>;
}
function EmptyState({title,detail}:{title:string;detail:string}) { return <div className="panel p-10 text-center"><div className="mx-auto w-12 h-12 rounded-full bg-[#1b2821] text-[#5add8b] grid place-items-center"><BookOpen/></div><h3 className="display-font text-2xl font-bold mt-4">{title}</h3><p className="text-sm text-slate-500 max-w-md mx-auto mt-2">{detail}</p></div>; }
function PolicyPage({title}:{title:string}) { return <PublicLayout><main className="shell py-12 max-w-[820px]"><PageHeading tag="OlaFlex information" title={title} subtitle="Clear and responsible use of OlaFlex Bet Hub."/><div className="panel p-7 space-y-6 text-sm leading-7 text-slate-400"><section><h2 className="text-white font-semibold">Our service</h2><p className="mt-2">OlaFlex Bet Hub publishes football analysis, selections and recorded results. Information is provided for general informational and entertainment purposes only and does not constitute financial advice or a guarantee of an outcome.</p></section><section><h2 className="text-white font-semibold">Your choices</h2><p className="mt-2">You are responsible for your own decisions. Betting involves risk; only participate where legal and never stake money you cannot afford to lose. If gambling stops being enjoyable, take a break and seek support.</p></section><section><h2 className="text-white font-semibold">Accuracy and privacy</h2><p className="mt-2">We aim to display information returned by our publishing system accurately. Results reflect recorded outcomes, not future performance. Messages submitted through contact forms are used to respond to your enquiry.</p></section><section><h2 className="text-white font-semibold">Questions?</h2><p className="mt-2">Contact the OlaFlex team through the <Link href="/contact" className="text-[#5cdd8c]">contact page</Link>.</p></section></div></main></PublicLayout>; }
function ResponsiblePage() { return <PublicLayout><main className="shell py-12 max-w-[850px]"><PageHeading tag="A necessary reminder" title="Bet within your limits." subtitle="Football should stay enjoyable. Your wellbeing comes before any wager."/><div className="panel p-7 md:p-9 space-y-5 text-sm leading-7 text-slate-300"><p>OlaFlex provides football predictions and analysis for information and entertainment. Predictions are not guarantees. You can lose some or all of the money you stake.</p><div className="grid sm:grid-cols-2 gap-3">{['Only bet what you can afford to lose.','Set a time and spending limit before you play.','Never chase losses or borrow to gamble.','Take a break if betting stops feeling fun.'].map((s,i)=><div key={s} className="bg-[#0d131a] border border-[#27313a] rounded-lg p-4 flex gap-3"><span className="mono text-[#61de90]">0{i+1}</span><span>{s}</span></div>)}</div><p className="text-slate-400">If you are concerned about your gambling or someone close to you, contact a locally recognised gambling-support organisation. If you are under the legal age to gamble in your region, do not use betting services.</p></div></main></PublicLayout>; }

function AdminGuard({ children }: { children: ReactNode }) {
  const { isSignedIn, isLoaded } = useAuth();
  const access = useGetAdminAccess({query:{enabled:isLoaded&&!!isSignedIn,queryKey:getGetAdminAccessQueryKey()}});
  if (!isLoaded || (isSignedIn&&access.isLoading)) return <AdminLoading/>;
  if (!isSignedIn) return <AdminDenied signIn/>;
  if (access.isError) return <AdminDenied error retry={() => access.refetch()}/>;
  if (!access.data?.isAdmin) return <AdminDenied email={access.data?.email}/>;
  return <AdminFrame>{children}</AdminFrame>;
}
function AdminLoading() { return <div className="min-h-[100dvh] bg-[#0d1118] p-7"><div className="shell"><div className="h-10 w-52 rounded bg-[#1d2630] animate-pulse"/><div className="h-64 panel mt-8 animate-pulse"/></div></div>; }
function AdminDenied({ signIn=false, error=false, email, retry }: {signIn?:boolean;error?:boolean;email?:string;retry?:()=>void}) {
  return <div className="min-h-[100dvh] bg-[#0d1118] grid place-items-center p-5"><div className="panel p-8 max-w-md text-center"><div className="mx-auto w-12 h-12 rounded-full bg-[#1b2821] text-[#5add8b] grid place-items-center"><ShieldCheck/></div><h1 className="display-font text-3xl font-bold mt-4">{signIn?'Administrator sign-in required':error?'Access check unavailable':'Restricted workspace'}</h1><p className="text-sm text-slate-400 mt-2">{signIn?'Sign in with your OlaFlex administrator account.':error?'We could not verify administrator access. Please retry.':`This dashboard is restricted to the configured administrator${email?` (${email})`:''}.`}</p>{signIn?<Link className="button-primary inline-block mt-5" href="/sign-in">Continue to sign in</Link>:error&&<button className="button-quiet mt-5" onClick={retry}>Retry access check</button>}<Link href="/" className="block text-xs text-slate-500 mt-5">Return to public site</Link></div></div>;
}
function AdminFrame({children}:{children:ReactNode}) {
  const {signOut}=useClerk(); const [loc]=useLocation(); const [menu,setMenu]=useState(false);
  const links=[['/admin','Overview'],['/admin/predictions/new','New prediction'],['/admin/content','Content & settings']];
  return <div className="min-h-[100dvh] bg-[#0d1118] text-[#e8edf1]">
    <header className="h-[70px] border-b border-[#252e38] bg-[#0b1016] flex items-center"><div className="shell flex items-center justify-between"><Link href="/" className="flex items-center gap-3"><Brand/><div className="display-font font-bold">OLAFLEX <span className="text-[#5cdd8c]">ADMIN</span></div></Link><div className="flex items-center gap-3"><span className="hidden sm:block text-xs text-slate-500">Publishing workspace</span><button className="button-quiet flex gap-2 items-center" onClick={()=>signOut({redirectUrl:basePath||'/'})}><LogOut size={15}/> Sign out</button><button className="md:hidden p-2" onClick={()=>setMenu(!menu)} aria-label="Toggle admin menu"><Menu size={19}/></button></div></div></header>
    <div className="shell grid md:grid-cols-[210px_1fr] gap-8 py-7">
      <aside className={`${menu?'block':'hidden'} md:block`}><div className="panel p-2 sticky top-4"><div className="eyebrow px-3 py-3">Workspace</div>{links.map(([href,label])=><Link key={href} href={href} className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm ${loc===href?'bg-[#1a2b21] text-[#65df91]':'text-slate-400 hover:text-white hover:bg-[#171e27]'}`}><span className="w-1 h-1 rounded-full bg-current"/>{label}</Link>)}<div className="border-t border-[#28313a] mt-2 pt-2"><Link href="/" className="block px-3 py-3 text-xs text-slate-500">← Public website</Link></div></div></aside>
      <section className="min-w-0">{children}</section>
    </div>
  </div>;
}
function AdminDashboard() {
  const summary=useGetAdminSummary(); const [page,setPage]=useState(1); const [search,setSearch]=useState(''); const [status,setStatus]=useState<''|'draft'|'published'|'archived'>('');
  const params={page,pageSize:10,...(search?{search}:{}),...(status?{status}:{})}; const list=useListAdminPredictions(params); const client=useQueryClient(); const del=useDeletePrediction();
  const refresh=(slug?:string)=>{client.invalidateQueries({queryKey:getGetAdminSummaryQueryKey()});client.invalidateQueries({queryKey:getListAdminPredictionsQueryKey()});client.invalidateQueries({queryKey:getListPredictionsQueryKey()});client.invalidateQueries({queryKey:getGetResultsQueryKey()});if(slug)client.invalidateQueries({queryKey:getGetPredictionQueryKey(slug)})};
  return <><div className="flex flex-wrap items-end justify-between gap-3 mb-7"><div><div className="eyebrow">Publishing desk</div><h1 className="display-font text-4xl font-bold mt-1">Overview</h1></div><Link href="/admin/predictions/new" className="button-primary inline-flex gap-2 items-center"><span>+</span> New prediction</Link></div>
    <QueryStatus loading={summary.isLoading} error={summary.isError} retry={()=>summary.refetch()} label="dashboard summary"/>
    {summary.data&&<div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-7">{[['All predictions',summary.data.total],['Published',summary.data.published],['Drafts',summary.data.drafts],['Win rate',`${summary.data.winRate}%`],['Pending',summary.data.pending],['Won',summary.data.won],['Lost',summary.data.lost],['Void',summary.data.void]].map(([k,v])=><div key={String(k)} className="panel p-4"><div className="text-xs text-slate-500">{k}</div><div className="display-font text-3xl font-bold mt-1">{v}</div></div>)}</div>}
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3"><h2 className="display-font text-2xl font-bold">Predictions</h2><Link className="text-xs text-[#61dd8e]" href="/admin/content">Manage content →</Link></div>
    <div className="panel p-3 mb-4 flex flex-col sm:flex-row gap-3"><label className="relative flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/><input data-testid="input-admin-search" aria-label="Search predictions" className="field pl-9" placeholder="Search titles" value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}}/></label><select aria-label="Filter publication status" className="field sm:w-44" value={status} onChange={e=>{setStatus(e.target.value as typeof status);setPage(1)}}><option value="">Every status</option><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></div>
    <QueryStatus loading={list.isLoading} error={list.isError} retry={()=>list.refetch()} label="predictions"/>
    {!list.isLoading&&!list.isError&&<><div className="panel overflow-hidden"><div className="divide-y divide-[#27303a]">{list.data?.items?.map(p=><div key={p.id} className="p-4 flex flex-col sm:flex-row gap-3 justify-between sm:items-center"><div><div className="font-medium text-sm">{p.title}</div><div className="text-xs text-slate-500 mt-1">{p.category} · {p.status} · {p.result}</div></div><div className="flex gap-2"><Link href={`/admin/predictions/${p.id}/edit`} className="button-quiet text-xs">Edit</Link><button className="button-quiet text-xs text-red-300" disabled={del.isPending} onClick={()=>{if(window.confirm(`Delete “${p.title}”? This cannot be undone.`))del.mutate({id:p.id},{onSuccess:()=>refresh(p.slug)})}}>Delete</button></div></div>)}
      {!list.data?.items?.length&&<EmptyState title="No predictions yet" detail="Create the first record when your analysis is ready to publish."/>}
    </div></div><Pager page={page} pageSize={list.data?.pageSize??10} total={list.data?.total??0} change={setPage}/></>}
  </>;
}
function PredictionEditor() {
  const [path]=useLocation(); const id=path.match(/\/admin\/predictions\/([^/]+)\/edit/)?.[1]; const client=useQueryClient();
  const list=useListAdminPredictions({page:1,pageSize:100}); const existing=list.data?.items.find(p=>p.id===id);
  const [form,setForm]=useState<PredictionInput>(emptyPrediction); const [initialized,setInitialized]=useState(false); const create=useCreatePrediction(); const update=useUpdatePrediction();
  useEffect(()=>{if(existing&&!initialized){setForm({title:existing.title,slug:existing.slug,category:existing.category,risk:existing.risk,status:existing.status,result:existing.result,bookingCode:existing.bookingCode,imagePath:existing.imagePath,analysis:existing.analysis,combinedOddsOverride:existing.combinedOddsOverride,matches:existing.matches.map(m=>({homeTeam:m.homeTeam,awayTeam:m.awayTeam,homeLogoUrl:m.homeLogoUrl,awayLogoUrl:m.awayLogoUrl,competition:m.competition,market:m.market,selection:m.selection,odds:m.odds,kickoffAt:localDateTimeInput(m.kickoffAt)}))});setInitialized(true)}},[existing,initialized]);
  const [saved,setSaved]=useState(false); const saving=create.isPending||update.isPending;
  const patch=(key:keyof PredictionInput,value:unknown)=>setForm(f=>({...f,[key]:value}));
  const patchMatch=(i:number,key:keyof PredictionMatchInput,value:unknown)=>setForm(f=>({...f,matches:f.matches.map((m,index)=>index===i?{...m,[key]:value}:m)}));
  function submit(e:React.FormEvent){e.preventDefault();const data={...form,combinedOddsOverride:form.combinedOddsOverride==null?null:Number(form.combinedOddsOverride),matches:form.matches.map(m=>({...m,odds:Number(m.odds),kickoffAt:new Date(m.kickoffAt).toISOString()}))};const done=()=>{setSaved(true);client.invalidateQueries({queryKey:getListAdminPredictionsQueryKey()});client.invalidateQueries({queryKey:getListPredictionsQueryKey()});client.invalidateQueries({queryKey:getGetResultsQueryKey()});client.invalidateQueries({queryKey:getGetAdminSummaryQueryKey()});if(existing)client.invalidateQueries({queryKey:getGetPredictionQueryKey(existing.slug)});}; if(id) update.mutate({id,data},{onSuccess:done});else create.mutate({data},{onSuccess:done});}
  const upload=useImageUpload(path=>patch('imagePath',path));
  if(id&&list.isLoading)return <QueryStatus loading error={false} retry={()=>list.refetch()}/>;
  if(id&&!existing&&!list.isLoading)return <EmptyState title="Prediction not found" detail="This record may have been removed or may not be on the current page."/>
  return <><Link href="/admin" className="text-xs text-slate-500 flex items-center gap-2 mb-5"><ArrowLeft size={14}/>Dashboard</Link><div className="eyebrow">{id?'Edit record':'New record'}</div><h1 className="display-font text-4xl font-bold mt-1 mb-6">{id?'Edit prediction':'Publish a prediction'}</h1>
    <form onSubmit={submit} className="space-y-5">
      <div className="panel p-5 md:p-6"><h2 className="display-font text-2xl font-bold mb-4">Publication details</h2><div className="grid md:grid-cols-2 gap-4">
        <label className="block text-xs text-slate-400 md:col-span-2">Title<input className="field mt-2" required minLength={3} maxLength={180} value={form.title} onChange={e=>{patch('title',e.target.value);if(!id)patch('slug',slugify(e.target.value))}} placeholder="A clear name for this prediction"/></label>
        <Field label="URL slug" name="slug" required value={form.slug} onChange={e=>patch('slug',slugify(e.target.value))}/>
        <label className="block text-xs text-slate-400">Category<select className="field mt-2" value={form.category} onChange={e=>patch('category',e.target.value)}><option value="free">Free</option><option value="premium">Premium</option></select></label>
        <label className="block text-xs text-slate-400">Risk<select className="field mt-2" value={form.risk} onChange={e=>patch('risk',e.target.value)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
        <label className="block text-xs text-slate-400">Publication status<select className="field mt-2" value={form.status} onChange={e=>patch('status',e.target.value)}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label>
        <label className="block text-xs text-slate-400">Result<select className="field mt-2" value={form.result} onChange={e=>patch('result',e.target.value)}><option value="pending">Pending</option><option value="won">Won</option><option value="lost">Lost</option><option value="void">Void</option></select></label>
        <Field label="Combined odds override (optional)" name="combinedOddsOverride" type="number" value={form.combinedOddsOverride??''} onChange={e=>patch('combinedOddsOverride',e.target.value===''?null:Number(e.target.value))}/>
        <Field label="Booking code (leave blank to omit)" name="bookingCode" value={form.bookingCode??''} onChange={e=>patch('bookingCode',e.target.value||null)}/>
      </div>
      <label className="block text-xs text-slate-400 mt-4">Analysis<textarea className="field mt-2 min-h-28" maxLength={12000} value={form.analysis??''} onChange={e=>patch('analysis',e.target.value||null)} placeholder="Add analysis, or leave empty."/></label>
      <div className="mt-4"><div className="text-xs text-slate-400 mb-2">Feature image</div><div className="flex flex-col sm:flex-row gap-3 items-start"><button type="button" className="button-quiet flex gap-2 items-center" onClick={()=>document.getElementById('prediction-image')?.click()} disabled={upload.pending}><ImagePlus size={15}/>{upload.pending?'Uploading…':'Upload image'}</button><input id="prediction-image" className="hidden" type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={upload.select}/>{form.imagePath&&<img src={imageUrl(form.imagePath)} alt="Uploaded prediction" className="h-16 w-28 rounded object-cover"/>}{upload.error&&<span className="text-xs text-red-300">{upload.error}</span>}</div></div></div>
      <div className="panel p-5 md:p-6"><div className="flex justify-between items-center mb-4"><h2 className="display-font text-2xl font-bold">Matches</h2><button type="button" className="button-quiet text-xs" onClick={()=>patch('matches',[...form.matches,{...emptyMatch}])}>Add match</button></div>{form.matches.map((m,i)=><div key={i} className="border border-[#29333d] rounded-xl p-4 mb-3 last:mb-0"><div className="flex justify-between mb-3"><span className="eyebrow">Match {String(i+1).padStart(2,'0')}</span>{form.matches.length>1&&<button type="button" onClick={()=>patch('matches',form.matches.filter((_,index)=>index!==i))} className="text-xs text-red-300">Remove</button>}</div><div className="grid sm:grid-cols-2 gap-3">
        {(['homeTeam','awayTeam','competition','market','selection'] as const).map(k=><Field key={k} label={{homeTeam:'Home team',awayTeam:'Away team',competition:'Competition',market:'Market',selection:'Selection'}[k]} name={k} required value={m[k]} onChange={e=>patchMatch(i,k,e.target.value)}/>)}
        <Field label="Odds" name="odds" type="number" required value={m.odds} onChange={e=>patchMatch(i,'odds',Number(e.target.value))}/>
        <Field label="Kickoff time" name="kickoffAt" type="datetime-local" required value={m.kickoffAt} onChange={e=>patchMatch(i,'kickoffAt',e.target.value)}/>
        <Field label="Home logo URL (optional)" name="homeLogoUrl" value={m.homeLogoUrl??''} onChange={e=>patchMatch(i,'homeLogoUrl',e.target.value||null)}/>
        <Field label="Away logo URL (optional)" name="awayLogoUrl" value={m.awayLogoUrl??''} onChange={e=>patchMatch(i,'awayLogoUrl',e.target.value||null)}/>
      </div></div>)}</div>
      {saved&&<div className="text-sm text-[#66df92] flex items-center gap-2"><Check size={16}/>Prediction saved.</div>}
      {(create.isError||update.isError)&&<div className="text-sm text-red-300">Save failed. Check the form and try again.</div>}
      <div className="flex gap-3"><button className="button-primary" disabled={saving||upload.pending}>{saving?'Saving…':id?'Save changes':'Save prediction'}</button><Link href="/admin" className="button-quiet">Cancel</Link></div>
    </form>
  </>;
}

function useImageUpload(onUploaded:(path:string)=>void) {
  const uploadUrl=useRequestUploadUrl(); const [pending,setPending]=useState(false); const [error,setError]=useState('');
  async function select(e:React.ChangeEvent<HTMLInputElement>) {
    const file=e.target.files?.[0]; if(!file)return;setError('');
    const types=['image/jpeg','image/png','image/webp','image/avif'];
    if(!types.includes(file.type)||file.size>5*1024*1024){setError('Choose JPEG, PNG, WebP or AVIF up to 5 MB.');e.target.value='';return;}
    setPending(true);
    try { const response=await uploadUrl.mutateAsync({data:{name:file.name,size:file.size,contentType:file.type as 'image/jpeg'|'image/png'|'image/webp'|'image/avif'}}); const put=await fetch(response.uploadURL,{method:'PUT',headers:{'Content-Type':file.type},body:file});if(!put.ok)throw new Error('Upload failed');onUploaded(response.objectPath); }
    catch { setError('Image upload failed. Please try again.'); } finally { setPending(false);e.target.value=''; }
  }
  return {select,pending,error};
}

function AdminContent() {
  const [tab,setTab]=useState<'settings'|'blog'|'backup'|'inbox'>('settings');
  return <><div className="eyebrow">Site management</div><h1 className="display-font text-4xl font-bold mt-1 mb-6">Content & settings</h1>
    <div className="flex gap-2 border-b border-[#27313a] mb-6 overflow-x-auto">{([['settings','Settings'],['blog','Journal'],['inbox','Inbox'],['backup','Backup']] as const).map(([key,label])=><button key={key} onClick={()=>setTab(key)} className={`px-4 py-3 text-sm whitespace-nowrap border-b-2 ${tab===key?'text-[#61dd8e] border-[#51d987]':'text-slate-500 border-transparent'}`}>{label}</button>)}</div>
    {tab==='settings'&&<SettingsPanel/>}{tab==='blog'&&<BlogManager/>}{tab==='inbox'&&<ContactInbox/>}{tab==='backup'&&<BackupManager/>}
  </>;
}
function ContactInbox() {
  const q=useListAdminContactMessages();
  return <div className="space-y-4"><div><h2 className="display-font text-2xl font-bold">Contact messages</h2><p className="text-xs text-slate-500 mt-1">Recent messages submitted through the public contact form.</p></div><QueryStatus loading={q.isLoading} error={q.isError} retry={()=>q.refetch()} label="contact messages"/>
    {!q.isLoading&&!q.isError&&(q.data?.length?<div className="space-y-3">{q.data.map((message:AdminContactMessages[number])=><article key={message.id} className="panel p-5" data-testid={`contact-message-${message.id}`}><div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2"><div><h3 className="font-semibold">{message.subject}</h3><div className="text-xs text-slate-400 mt-1">{message.name} · <a className="text-[#61dd8e]" href={`mailto:${message.email}`}>{message.email}</a></div></div><time className="text-xs text-slate-500">{dateTimeLabel(message.createdAt)}</time></div><p className="text-sm leading-6 text-slate-300 whitespace-pre-wrap mt-4">{message.message}</p></article>)}</div>:<EmptyState title="No messages yet" detail="Messages sent through the contact page will appear here."/>)}
  </div>;
}
function SettingsPanel() {
  const q=useGetPublicSettings(); const mutation=useUpdateSiteSettings(); const client=useQueryClient();
  const [form,setForm]=useState<SiteSettingsInput>({contactEmail:'',contactPhone:'',whatsappNumber:'',instagramUrl:'',facebookUrl:'',xUrl:'',announcement:'',sportyBetUrl:''});
  const [ready,setReady]=useState(false); const [saved,setSaved]=useState(false);
  useEffect(()=>{if(q.data&&!ready){setForm({...q.data});setReady(true)}},[q.data,ready]);
  function submit(e:React.FormEvent){e.preventDefault();mutation.mutate({data:form},{onSuccess:(settings)=>{setForm(settings);setSaved(true);client.invalidateQueries({queryKey:getGetPublicSettingsQueryKey()})}})}
  if(q.isLoading)return <QueryStatus loading error={false} retry={()=>q.refetch()}/>;
  if(q.isError)return <QueryStatus loading={false} error retry={()=>q.refetch()} label="site settings"/>;
  return <form className="panel p-5 md:p-6 space-y-4" onSubmit={submit}><div><h2 className="display-font text-2xl font-bold">Public site details</h2><p className="text-xs text-slate-500 mt-1">These values are used only where the public site has configured them.</p></div>
    <div className="grid sm:grid-cols-2 gap-4"><Field label="Contact email" name="contactEmail" type="email" value={form.contactEmail} onChange={e=>setForm({...form,contactEmail:e.target.value})}/><Field label="Contact phone" name="contactPhone" value={form.contactPhone} onChange={e=>setForm({...form,contactPhone:e.target.value})}/><Field label="WhatsApp number" name="whatsappNumber" value={form.whatsappNumber} onChange={e=>setForm({...form,whatsappNumber:e.target.value})}/><Field label="SportyBet URL" name="sportyBetUrl" value={form.sportyBetUrl} onChange={e=>setForm({...form,sportyBetUrl:e.target.value})}/><Field label="Instagram URL" name="instagramUrl" value={form.instagramUrl} onChange={e=>setForm({...form,instagramUrl:e.target.value})}/><Field label="Facebook URL" name="facebookUrl" value={form.facebookUrl} onChange={e=>setForm({...form,facebookUrl:e.target.value})}/><Field label="X URL" name="xUrl" value={form.xUrl} onChange={e=>setForm({...form,xUrl:e.target.value})}/></div>
    <label className="block text-xs text-slate-400">Site announcement<textarea className="field mt-2 min-h-24" maxLength={500} value={form.announcement} onChange={e=>setForm({...form,announcement:e.target.value})} placeholder="Leave empty to hide the announcement."/></label>
    {saved&&<span className="text-sm text-[#66df92] flex items-center gap-2"><Check size={15}/>Settings saved.</span>}{mutation.isError&&<span className="text-sm text-red-300">Settings could not be saved.</span>}
    <button className="button-primary" disabled={mutation.isPending}>{mutation.isPending?'Saving…':'Save settings'}</button>
  </form>;
}
function BlogManager() {
  const q=useListAdminBlogPosts(); const create=useCreateBlogPost(); const update=useUpdateBlogPost(); const remove=useDeleteBlogPost(); const client=useQueryClient();
  const [editing,setEditing]=useState<BlogPost|null>(null); const [creating,setCreating]=useState(false); const [saved,setSaved]=useState(false);
  const initial=():BlogPostInput=>({title:'',slug:'',excerpt:'',content:'',status:'draft',coverImagePath:null});
  const [form,setForm]=useState<BlogPostInput>(initial);
  const refresh=(slug?:string)=>{client.invalidateQueries({queryKey:getListAdminBlogPostsQueryKey()});client.invalidateQueries({queryKey:getListBlogPostsQueryKey()});if(slug)client.invalidateQueries({queryKey:getGetBlogPostQueryKey(slug)})};
  function newPost(){setEditing(null);setForm(initial());setCreating(true);setSaved(false)}
  function edit(post:BlogPost){setEditing(post);setForm({title:post.title,slug:post.slug,excerpt:post.excerpt,content:post.content,status:post.status,coverImagePath:post.coverImagePath});setCreating(true);setSaved(false)}
  function submit(e:React.FormEvent){e.preventDefault();const done=()=>{refresh(form.slug);if(editing&&editing.slug!==form.slug)refresh(editing.slug);setSaved(true)};if(editing)update.mutate({id:editing.id,data:form},{onSuccess:done});else create.mutate({data:form},{onSuccess:done})}
  const upload=useImageUpload(path=>setForm(f=>({...f,coverImagePath:path})));
  return <div className="space-y-4"><div className="flex items-center justify-between gap-3"><div><h2 className="display-font text-2xl font-bold">Journal posts</h2><p className="text-xs text-slate-500 mt-1">Manage published and draft articles.</p></div><button className="button-primary" onClick={newPost}>New post</button></div>
    {creating&&<form className="panel p-5 space-y-4" onSubmit={submit}><div className="flex justify-between"><h3 className="display-font text-xl font-bold">{editing?'Edit article':'New article'}</h3><button type="button" className="text-slate-500" onClick={()=>setCreating(false)} aria-label="Close editor"><X size={18}/></button></div>
      <div className="grid sm:grid-cols-2 gap-3"><label className="block text-xs text-slate-400">Title<input className="field mt-2" required minLength={3} value={form.title} onChange={e=>{const title=e.target.value;setForm(f=>({...f,title,...(!editing?{slug:slugify(title)}:{})}))}}/></label><Field label="Slug" name="slug" required value={form.slug} onChange={e=>setForm({...form,slug:slugify(e.target.value)})}/></div>
      <label className="block text-xs text-slate-400">Excerpt<textarea className="field mt-2 min-h-20" maxLength={500} value={form.excerpt} onChange={e=>setForm({...form,excerpt:e.target.value})}/></label>
      <label className="block text-xs text-slate-400">Article content<textarea className="field mt-2 min-h-52" required minLength={1} maxLength={30000} value={form.content} onChange={e=>setForm({...form,content:e.target.value})}/></label>
      <div className="grid sm:grid-cols-2 gap-3"><label className="block text-xs text-slate-400">Status<select className="field mt-2" value={form.status} onChange={e=>setForm({...form,status:e.target.value as BlogPostInput['status']})}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label><div><div className="text-xs text-slate-400 mb-2">Cover image</div><button className="button-quiet flex items-center gap-2" type="button" onClick={()=>document.getElementById('blog-image')?.click()} disabled={upload.pending}><Upload size={14}/>{upload.pending?'Uploading…':'Upload image'}</button><input className="hidden" id="blog-image" type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={upload.select}/>{form.coverImagePath&&<img src={imageUrl(form.coverImagePath)} className="mt-2 h-16 rounded object-cover" alt="Cover preview"/>}{upload.error&&<p className="text-xs text-red-300 mt-1">{upload.error}</p>}</div></div>
      {saved&&<p className="text-sm text-[#66df92]">Article saved.</p>}{(create.isError||update.isError)&&<p className="text-sm text-red-300">Could not save this article.</p>}<button className="button-primary" disabled={create.isPending||update.isPending||upload.pending}>{create.isPending||update.isPending?'Saving…':'Save article'}</button>
    </form>}
    <QueryStatus loading={q.isLoading} error={q.isError} retry={()=>q.refetch()} label="journal posts"/>
    {!q.isLoading&&!q.isError&&<div className="panel divide-y divide-[#27313a]">{q.data?.map(post=><div key={post.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><div className="font-medium text-sm">{post.title}</div><div className="text-xs text-slate-500 mt-1">{post.status} · {post.slug}</div></div><div className="flex gap-2"><button onClick={()=>edit(post)} className="button-quiet text-xs">Edit</button><button onClick={()=>{if(window.confirm(`Delete “${post.title}”?`))remove.mutate({id:post.id},{onSuccess:()=>refresh(post.slug)})}} className="button-quiet text-xs text-red-300">Delete</button></div></div>)}{!q.data?.length&&<div className="p-5"><EmptyState title="No journal posts" detail="Create an article when you have something to share."/></div>}</div>}
  </div>;
}
function BackupManager() {
  const backup=useExportBackup({query:{enabled:false,queryKey:getExportBackupQueryKey()}}); const imp=useImportBackup(); const [message,setMessage]=useState(''); const input=useRef<HTMLInputElement>(null); const client=useQueryClient();
  function download(){backup.refetch().then(result=>{if(result.data){const blob=new Blob([JSON.stringify(result.data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`olaflex-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(url);setMessage('Backup downloaded.')}})}
  async function importFile(e:React.ChangeEvent<HTMLInputElement>){const f=e.target.files?.[0];if(!f)return;try{const parsed=JSON.parse(await f.text()) as Backup;if(parsed.version!==1||!parsed.settings||!Array.isArray(parsed.predictions)||!Array.isArray(parsed.blogPosts))throw new Error('Invalid backup');if(!window.confirm(`This will replace all current predictions, journal posts, and site settings with ${parsed.predictions.length} predictions and ${parsed.blogPosts.length} posts from this backup. This cannot be undone. Continue?`))return;imp.mutate({data:parsed},{onSuccess:r=>{setMessage(r.message);client.invalidateQueries();}})}catch{setMessage('That file is not a valid OlaFlex backup.')}finally{e.target.value=''}}
  return <div className="space-y-4"><div><h2 className="display-font text-2xl font-bold">Database backup</h2><p className="text-xs text-slate-500 mt-1">Export and import the backup provided by the OlaFlex API.</p></div><div className="panel p-6"><div className="flex gap-4"><div className="w-10 h-10 bg-[#1d3026] text-[#61dd8e] rounded-xl grid place-items-center"><FileUp/></div><div><h3 className="font-semibold text-sm">Export content</h3><p className="text-xs text-slate-500 mt-1">Download the current database backup as a JSON file.</p><button className="button-primary mt-4" onClick={download} disabled={backup.isFetching}>{backup.isFetching?'Preparing…':'Download backup'}</button></div></div></div>
    <div className="panel p-6"><div className="flex gap-4"><div className="w-10 h-10 bg-[#1d3026] text-[#61dd8e] rounded-xl grid place-items-center"><Upload/></div><div><h3 className="font-semibold text-sm">Import backup</h3><p className="text-xs text-slate-500 mt-1">Import a previous OlaFlex JSON backup. This updates records in the connected database.</p><button className="button-quiet mt-4" onClick={()=>input.current?.click()} disabled={imp.isPending}>{imp.isPending?'Importing…':'Choose backup file'}</button><input ref={input} type="file" accept="application/json,.json" onChange={importFile} className="hidden"/></div></div></div>
    {(message||imp.isError||backup.isError)&&<div className={`panel p-4 text-sm ${imp.isError||backup.isError?'text-red-300':'text-[#65df91]'}`}>{imp.isError?'Backup import failed.':backup.isError?'Backup export failed.':message}</div>}
  </div>;
}

function ClerkCacheInvalidator() {
  const {addListener}=useClerk();const client=useQueryClient();const previous=useRef<string|null|undefined>(undefined);
  useEffect(()=>addListener(({user})=>{const id=user?.id??null;if(previous.current!==undefined&&previous.current!==id)client.clear();previous.current=id}),[addListener,client]);
  return null;
}
function ClerkRoutes() {
  const [,setLocation]=useLocation();
  return <ClerkProvider
    publishableKey={clerkPubKey}
    proxyUrl={clerkProxyUrl}
    appearance={{
      theme: shadcn, cssLayerName:'clerk',
      options:{logoPlacement:'inside',logoLinkUrl:basePath||'/',logoImageUrl:`${window.location.origin}${basePath}/logo.svg`},
      variables:{colorPrimary:'#50d987',colorForeground:'#edf2f3',colorMutedForeground:'#9ba8b4',colorDanger:'#ef6565',colorBackground:'#121821',colorInput:'#0d131a',colorInputForeground:'#edf2f3',colorNeutral:'#303944',fontFamily:'DM Sans',borderRadius:'0.7rem'},
      elements:{rootBox:'w-full flex justify-center',cardBox:'bg-[#121821] rounded-2xl w-[440px] max-w-full overflow-hidden',card:'!shadow-none !border-0 !bg-transparent !rounded-none',footer:'!shadow-none !border-0 !bg-transparent !rounded-none',headerTitle:'text-white',headerSubtitle:'text-slate-300',socialButtonsBlockButtonText:'text-slate-100',formFieldLabel:'text-slate-200',footerActionLink:'text-[#50d987]',footerActionText:'text-slate-300',dividerText:'text-slate-300',identityPreviewEditButton:'text-[#50d987]',formFieldSuccessText:'text-emerald-400',alertText:'text-slate-100',logoBox:'mb-3',logoImage:'max-h-10',socialButtonsBlockButton:'border border-slate-700 bg-slate-900',formButtonPrimary:'bg-[#50d987] text-[#0c1711]',formFieldInput:'bg-[#0d131a] border-slate-700 text-white',footerAction:'border-t border-slate-800',dividerLine:'bg-slate-700',alert:'bg-slate-900 border-slate-700',otpCodeFieldInput:'bg-slate-900 border-slate-700 text-white',formFieldRow:'gap-2',main:'text-slate-100'}
    }}
    signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}
    localization={{signIn:{start:{title:'Welcome back',subtitle:'Sign in to your OlaFlex workspace'}},signUp:{start:{title:'Join OlaFlex',subtitle:'Create your account to continue'}}}}
    routerPush={to=>setLocation(stripBase(to))} routerReplace={to=>setLocation(stripBase(to),{replace:true})}
  >
    <ClerkCacheInvalidator/>
    <Switch>
      <Route path="/sign-in/*?" component={()=><AuthPage type="in"/>}/>
      <Route path="/sign-up/*?" component={()=><AuthPage type="up"/>}/>
      <Route path="/admin/predictions/new" component={()=><AdminGuard><PredictionEditor/></AdminGuard>}/>
      <Route path="/admin/predictions/:id/edit" component={()=><AdminGuard><PredictionEditor/></AdminGuard>}/>
      <Route path="/admin/content" component={()=><AdminGuard><AdminContent/></AdminGuard>}/>
      <Route path="/admin" component={()=><AdminGuard><AdminDashboard/></AdminGuard>}/>
      <Route path="/today" component={()=><PredictionListing title="Today’s tips" subtitle="Today’s published match analysis, in one clear view." presetToday/>}/>
      <Route path="/free-tips" component={()=><PredictionListing title="Free tips" subtitle="Published selections open for everyone to inspect." category="free"/>}/>
      <Route path="/premium-tips" component={()=><PredictionListing title="Premium tips" subtitle="Premium selections are clearly marked. Locked details remain private." category="premium"/>}/>
      <Route path="/results" component={ResultsPage}/><Route path="/prediction/:slug" component={PredictionDetail}/>
      <Route path="/blog/:slug" component={BlogDetail}/><Route path="/blog" component={BlogPage}/>
      <Route path="/contact" component={ContactPage}/><Route path="/privacy-policy" component={()=><PolicyPage title="Privacy policy"/>}/>
      <Route path="/terms" component={()=><PolicyPage title="Terms of use"/>}/><Route path="/responsible-gambling" component={ResponsiblePage}/>
      <Route path="/" component={HomePage}/><Route component={NotFound}/>
    </Switch>
  </ClerkProvider>;
}
function App() {
  if(!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={basePath}><ErrorBoundary><ClerkRoutes/></ErrorBoundary></WouterRouter><Toaster/></TooltipProvider></QueryClientProvider>;
}

export default App;
