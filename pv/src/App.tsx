import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UI, detectLang, type Lang } from "./lib/i18n";
import { filesFromDrop, listShots, type Shot } from "./lib/scan";
import { readAllMeta } from "./lib/pngMeta";
import { computeStats, type Entry, type Stats } from "./lib/stats";
import { buildStoryboard, type Storyboard } from "./lib/storyboard";
import { prepareLocal, releasePhotos, type Photo } from "./lib/images";
import { buildPlan, type Aspect, type Look } from "./lib/jizura";
import { canSaveFolder, loadManifest, makeManifest, saveShareFolder, shareLink } from "./lib/share";
import { FPS, PlayerShell, type Built } from "./ui/PlayerShell";

const MIN_PHOTOS = 8;
const DAY = 86400000;
const iso = (ts: number) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const fromIso = (s: string, endOfDay = false) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0).getTime(); };

type Progress = { label: string; done: number; total: number };

export const App: React.FC = () => {
  const [lang, setLang] = useState<Lang>(detectLang);
  const T = UI[lang];
  const [shots, setShots] = useState<Shot[] | null>(null);
  const [range, setRange] = useState<{ from: string; to: string }>({ from: "", to: "" });
  const [progress, setProgress] = useState<Progress | null>(null);
  const [built, setBuilt] = useState<Built | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const [look, setLook] = useState<Look>("overlay");
  const [aspect, setAspect] = useState<Aspect>("16:9");
  const [hideNames, setHideNames] = useState(false);
  const [viewer, setViewer] = useState(false);
  const [share, setShare] = useState<{ base: string; link?: string; error?: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const stats = useRef<Stats | null>(null);
  const entries = useRef<Map<string, Entry>>(new Map());
  const cache = useRef<Record<string, Photo>>({});
  const viewerStory = useRef<Storyboard | null>(null);

  const chapterLabels = useMemo(() => ({ intro: T.chIntro, worlds: T.chWorlds, people: T.chPeople, finale: T.chFinale }), [T]);

  // ---- shared recap: ?m=<manifest url>
  useEffect(() => {
    const m = new URLSearchParams(location.search).get("m");
    if (!m) return;
    setViewer(true); setProgress({ label: T.composing, done: 0, total: 1 });
    loadManifest(m).then(async ({ manifest, photos }) => {
      viewerStory.current = manifest.story; cache.current = photos;
      setLang(manifest.lang); setSeed(manifest.seed); setLook(manifest.look); setAspect(manifest.aspect);
      const { plan, renderer } = await buildPlan(manifest.story.beats, { seed: manifest.seed, look: manifest.look, aspect: manifest.aspect, lang: manifest.lang, fps: FPS });
      setBuilt({ story: manifest.story, photos, plan, renderer });
    }).catch(() => setError(T.loadFail)).finally(() => setProgress(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const accept = useCallback((files: File[]) => {
    const list = listShots(files);
    setShots(list); setError(null);
    if (!list.length) return;
    const last = list[list.length - 1].ts, year = new Date(last).getFullYear();
    setRange({ from: iso(Math.max(list[0].ts, new Date(year, 0, 1).getTime())), to: iso(last) });
  }, []);

  const inRange = useMemo(() => {
    if (!shots || !range.from || !range.to) return [];
    const a = fromIso(range.from), b = fromIso(range.to, true);
    return shots.filter((s) => s.ts >= a && s.ts <= b);
  }, [shots, range]);

  /** storyboard → photos → JIZURA plan. Reuses whatever is already prepared. */
  const compose = useCallback(async (o: { seed: number; look: Look; aspect: Aspect; hideNames: boolean; lang: Lang }, report = false) => {
    let story: Storyboard;
    if (viewerStory.current) story = viewerStory.current;
    else {
      if (!stats.current) return;
      story = buildStoryboard(stats.current, { lang: o.lang, seed: o.seed, hideNames: o.hideNames, chapterLabels: { intro: UI[o.lang].chIntro, worlds: UI[o.lang].chWorlds, people: UI[o.lang].chPeople, finale: UI[o.lang].chFinale } });
      const missing = story.photoIds.filter((id) => !cache.current[id]).map((id) => entries.current.get(id)!).filter(Boolean);
      if (missing.length) {
        if (report) setProgress({ label: UI[o.lang].preparing, done: 0, total: missing.length });
        Object.assign(cache.current, await prepareLocal(missing, report ? (done, total) => setProgress({ label: UI[o.lang].preparing, done, total }) : undefined));
      }
    }
    if (report) setProgress({ label: UI[o.lang].composing, done: 0, total: 1 });
    const { plan, renderer } = await buildPlan(story.beats, { seed: o.seed, look: o.look, aspect: o.aspect, lang: o.lang, fps: FPS });
    setBuilt({ story, photos: { ...cache.current }, plan, renderer });
  }, []);

  const make = useCallback(async () => {
    if (inRange.length < MIN_PHOTOS) { setError(T.tooFew); return; }
    setError(null);
    try {
      setProgress({ label: T.reading, done: 0, total: inRange.length });
      const metas = await readAllMeta(inRange, (done, total) => setProgress({ label: T.reading, done, total }));
      const list: Entry[] = inRange.map((s, i) => ({ ...s, meta: metas[i] }));
      entries.current = new Map(list.map((e) => [e.id, e]));
      stats.current = computeStats(list);
      await compose({ seed, look, aspect, hideNames, lang }, true);
    } catch (e) { setError(`${T.error}: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setProgress(null); }
  }, [inRange, T, compose, seed, look, aspect, hideNames, lang]);

  const change = useCallback(async (patch: Partial<{ seed: number; look: Look; aspect: Aspect; hideNames: boolean; lang: Lang }>) => {
    const next = { seed, look, aspect, hideNames, lang, ...patch };
    if (patch.seed != null) setSeed(patch.seed);
    if (patch.look) setLook(patch.look);
    if (patch.aspect) setAspect(patch.aspect);
    if (patch.hideNames != null) setHideNames(patch.hideNames);
    if (patch.lang) setLang(patch.lang);
    if (!built) return;
    setBusy(true);
    try { await compose(next); } catch (e) { setError(`${UI[next.lang].error}: ${e instanceof Error ? e.message : String(e)}`); } finally { setBusy(false); }
  }, [seed, look, aspect, hideNames, lang, built, compose]);

  const reset = () => {
    releasePhotos(cache.current); cache.current = {}; stats.current = null; entries.current = new Map(); viewerStory.current = null;
    setBuilt(null); setShots(null); setViewer(false); setError(null); setShare(null);
    if (location.search) history.replaceState(null, "", location.pathname);
  };

  const doShare = async () => {
    if (!built || !share) return;
    try {
      const story: Storyboard = hideNames ? { ...built.story, info: Object.fromEntries(Object.entries(built.story.info).map(([k, v]) => [k, { ...v, players: [] }])) } : built.story;
      await saveShareFolder(makeManifest(story, built.photos, { seed, look, aspect, lang }), built.photos);
      setShare({ ...share, link: share.base ? shareLink(share.base) : "", error: undefined });
    } catch (e) { if ((e as { name?: string }).name !== "AbortError") setShare({ ...share, error: String(e instanceof Error ? e.message : e) }); }
  };

  const st = stats.current;
  const note = viewer || !st ? undefined : st.hasVrcx ? T.vrcxOn : st.worldCoverage < 0.3 ? T.noWorld : T.vrcxOff;
  const preset = (kind: "year" | "90" | "all") => {
    if (!shots?.length) return;
    const first = shots[0].ts, last = shots[shots.length - 1].ts;
    const from = kind === "year" ? new Date(new Date(last).getFullYear(), 0, 1).getTime() : kind === "90" ? last - 90 * DAY : first;
    setRange({ from: iso(Math.max(first, from)), to: iso(last) });
  };

  return (
    <div className="app">
      <header>
        <h1>VRC Recap <em>PV</em></h1>
        <div className="seg lang" role="group" aria-label="language">
          {(["ko", "ja", "en"] as Lang[]).map((l) => <button type="button" key={l} className={l === lang ? "on" : ""} disabled={busy || !!progress} onClick={() => void change({ lang: l })}>{l.toUpperCase()}</button>)}
        </div>
      </header>

      {error ? <p className="error" role="alert">{error}</p> : null}

      {progress ? (
        <section className="card center">
          <p>{progress.label}{progress.total > 1 ? ` ${progress.done.toLocaleString()} / ${progress.total.toLocaleString()}` : ""}</p>
          <div className="bar"><i style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></div>
        </section>
      ) : built ? (
        <PlayerShell built={built} lang={lang} look={look} aspect={aspect} hideNames={hideNames} hasPeople={!!st?.hasVrcx} busy={busy} note={note} viewer={viewer}
          onReroll={() => void change({ seed: Math.floor(Math.random() * 1e9) })} onLook={(l) => void change({ look: l })} onAspect={(a) => void change({ aspect: a })}
          onHideNames={(v) => void change({ hideNames: v })} onShare={() => setShare({ base: "" })} onBack={reset} />
      ) : !viewer && !shots ? (
        <section className={`card drop ${dragging ? "over" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); void filesFromDrop(e.dataTransfer.items).then(accept); }}>
          <p className="lead">{T.tagline}</p>
          <label className="primary big">{T.pick}
            <input type="file" multiple {...({ webkitdirectory: "" } as object)} onChange={(e) => accept(Array.from(e.target.files ?? []))} />
          </label>
          <p className="dim">{T.drop}</p>
          <p className="dim small">{T.local}</p>
        </section>
      ) : !viewer && shots ? (
        <section className="card">
          <p className="lead">{T.found(shots.length)}</p>
          <h2>{T.period}</h2>
          <div className="row">
            <button type="button" onClick={() => preset("year")}>{T.thisYear}</button>
            <button type="button" onClick={() => preset("90")}>{T.last90}</button>
            <button type="button" onClick={() => preset("all")}>{T.all}</button>
          </div>
          <div className="row dates">
            <label>{T.from}<input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></label>
            <label>{T.to}<input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></label>
          </div>
          <p className="dim">{T.inRange(inRange.length)}</p>
          <div className="row">
            <button type="button" className="primary big" disabled={inRange.length < MIN_PHOTOS} onClick={() => void make()}>{T.make}</button>
            <button type="button" onClick={reset}>{T.back}</button>
          </div>
        </section>
      ) : null}

      {share && built ? (
        <div className="lightbox" role="dialog" aria-modal="true" onClick={() => setShare(null)}>
          <div className="card sheet" onClick={(e) => e.stopPropagation()}>
            <h2>{T.shareTitle}</h2>
            <p className="dim">{T.shareBody}</p>
            <label className="stack">{T.shareBase}<input type="url" value={share.base} placeholder="https://" onChange={(e) => setShare({ ...share, base: e.target.value, link: undefined })} /></label>
            {!canSaveFolder() ? <p className="error">{T.shareNoFs}</p> : null}
            {share.error ? <p className="error">{share.error}</p> : null}
            {share.link != null ? <p className="dim">{T.shareDone} {share.link ? <a href={share.link}>{share.link}</a> : "—"}</p> : null}
            <div className="row">
              <button type="button" className="primary" disabled={!canSaveFolder()} onClick={() => void doShare()}>{T.shareSave}</button>
              <button type="button" onClick={() => setShare(null)}>{T.close}</button>
            </div>
          </div>
        </div>
      ) : null}

      <footer>Kinetic type by <a href="https://github.com/852wa/JIZURA" target="_blank" rel="noreferrer">JIZURA</a> (MIT) · video by <a href="https://www.remotion.dev" target="_blank" rel="noreferrer">Remotion</a> · images via <a href="https://wsrv.nl" target="_blank" rel="noreferrer">wsrv.nl</a></footer>
    </div>
  );
};
