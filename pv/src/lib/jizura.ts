// Thin wrapper around the JIZURA engine (https://github.com/852wa/JIZURA, MIT).
// The engine is one classic script that defines window.J; it plans a lyric video from text and
// draws any moment of it onto a canvas, which is exactly what a Remotion frame needs.
import type { Beat } from "./storyboard";
import type { Lang } from "./i18n";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type JPlan = { W: number; H: number; duration: number; fps: number; cuts: Array<{ text: string; start: number; end: number; line: number }>; [k: string]: any };
export type JRenderer = { frame: (ctx: CanvasRenderingContext2D, plan: JPlan, t: number, opt?: { scale?: number; transparent?: boolean; fast?: boolean }) => void };
type JEngine = {
  defaultProject: () => any;
  plan: (project: any, audio: null) => JPlan;
  ensureFonts: (text: string, keys: string[] | null) => Promise<void>;
  fontsOfPlan: (plan: JPlan) => string[];
  Renderer: new () => JRenderer;
  STYLES: Record<string, { schemes: Array<{ bg: string }> }>;
  STYLE_ORDER: string[];
};

export type Look = "overlay" | "invert";
export type Aspect = "16:9" | "9:16";

let loading: Promise<JEngine> | null = null;
export function loadEngine(): Promise<JEngine> {
  const w = window as unknown as { J?: JEngine };
  if (w.J?.Renderer) return Promise.resolve(w.J);
  loading ??= new Promise<JEngine>((ok, err) => {
    const s = document.createElement("script");
    s.src = new URL("jizura-engine.js", document.baseURI).href;
    s.onload = () => (w.J?.Renderer ? ok(w.J) : err(new Error("JIZURA engine did not initialise")));
    s.onerror = () => err(new Error("Could not load jizura-engine.js"));
    document.head.appendChild(s);
  });
  return loading;
}

const lrc = (t: number) => `[${String(Math.floor(t / 60)).padStart(2, "0")}:${(t % 60).toFixed(2).padStart(5, "0")}]`;

function luminance(hex: string): number {
  const m = hex.replace("#", "");
  const v = m.length === 3 ? m.split("").map((c) => parseInt(c + c, 16)) : [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16));
  return (0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]) / 255;
}

/** Styles whose main scheme is light-on-dark: their text stays readable on top of a dimmed photo. */
function darkStyles(J: JEngine): string[] {
  const list = J.STYLE_ORDER.filter((k) => J.STYLES[k] && luminance(J.STYLES[k].schemes[0].bg) < 0.22);
  return list.length ? list : ["noir"];
}

export type PlanOptions = { seed: number; look: Look; aspect: Aspect; lang: Lang; fps: number };

export async function buildPlan(beats: Beat[], opt: PlanOptions): Promise<{ plan: JPlan; renderer: JRenderer; style: string }> {
  const J = await loadEngine();
  const project = J.defaultProject();
  const styles = darkStyles(J);
  project.lyrics = beats.map((b) => lrc(b.start) + b.line).join("\n");
  project.title = ""; project.artist = "";
  project.seed = opt.seed;
  project.style = opt.look === "invert" ? "mono" : styles[Math.abs(opt.seed) % styles.length];
  if (!J.STYLES[project.style]) project.style = "noir";
  project.aspect = opt.aspect;
  project.fps = opt.fps;
  project.lang = opt.lang === "ko" ? "ko" : opt.lang === "ja" ? "ja" : "auto";
  project.keyBg = opt.look === "invert" ? "black" : "off";       // white-on-black matte for the difference blend
  project.fx = { ...project.fx, bgSwitch: 0, hud: "off" };       // one scheme throughout: the photo is the background
  project.timing = { ...project.timing, offset: 0, tail: 0.6 };
  const plan = J.plan(project, null);
  // Web fonts come from Google Fonts; never let a slow or blocked network hold the video back.
  await Promise.race([J.ensureFonts(project.lyrics, J.fontsOfPlan(plan)).catch(() => undefined), new Promise((r) => setTimeout(r, 4000))]);
  return { plan, renderer: new J.Renderer(), style: project.style };
}
