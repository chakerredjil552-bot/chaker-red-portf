/** The words over the scene. All real HTML: the intro, three notes on the way down, each video's caption with the
 *  counter and the index, the last line, and the Index and Sound buttons in the top bar. */

import type { Video } from "./data.ts";

export const COPY = {
  presents: "Chaker Red presents",
  title: "Moving Pictures",
  sub: (n: number) => `${n} videos, spinning on one wall.`,
  withSound: "Enter with sound",
  quietly: "Enter quietly",
  descend: "Scroll to descend",
  b1: { head: "Every screen is a real video.", body: "Ads, promos and short films I cut, playing on the wall. Nothing here is a mock-up." },
  b2: { head: "Scroll, and the rows turn with you.", body: "Each ring spins its own way. Stop scrolling and the wall slows to a drift." },
  b3: { no: "02", head: "Pull one off the wall.", body: "Each video steps forward in turn. Click a screen to watch it; the whole list waits on the right." },
  watch: "Watch it",
  newTab: "Open in a new tab",
  end: { head: "Your video, next on the wall.", sub: "Chaker Red edits ads, promos and motion design that move.", cta: "Start a project", email: "Email me" },
  index: "Index",
  soundOff: "Sound off",
  soundOn: "Sound on",
  close: "Close",
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const pad = (n: number) => String(n).padStart(2, "0");

export interface Weights { intro: number; hint: number; b1: number; b2: number; b3: number; room: number; end: number }

interface Handlers {
  enter: (sound: boolean) => void;
  goTo: (k: number) => void;
  play: (k: number) => void;
  sound: () => void;
}

export class UI {
  private readonly el: Record<keyof Weights, HTMLElement>;
  private readonly caption: HTMLElement;
  private readonly list: HTMLOListElement;
  private readonly counter: HTMLElement;
  private readonly soundBtn: HTMLButtonElement;
  private readonly overlay: HTMLElement;
  private readonly shown: Partial<Record<keyof Weights, number>> = {};
  private active = -1;

  constructor(host: HTMLElement, private readonly videos: Video[], private readonly on: Handlers) {
    const wa = window.CONTACT?.whatsapp, email = window.CONTACT?.email;
    const start = wa ? `https://wa.me/${wa}?text=${encodeURIComponent("Hi Chaker, I'd like to talk about a video.")}` : email ? `mailto:${email}` : "#";
    host.insertAdjacentHTML("beforeend", `
      <div class="zt-ui">
        <section class="zt-intro" data-w="intro">
          <p class="zt-presents">${esc(COPY.presents)}</p>
          <h1 class="zt-title">${esc(COPY.title)}</h1>
          <p class="zt-sub">${esc(COPY.sub(videos.length))}</p>
          <span class="zt-rule"></span>
          <p class="zt-enter">
            <button type="button" data-enter="1">${esc(COPY.withSound)}</button>
            <button type="button" data-enter="0">${esc(COPY.quietly)}</button>
          </p>
        </section>
        <p class="zt-hint" data-w="hint">${esc(COPY.descend)}</p>
        <section class="zt-note zt-b1" data-w="b1"><h2>${esc(COPY.b1.head)}</h2><p>${esc(COPY.b1.body)}</p></section>
        <section class="zt-note zt-b2" data-w="b2"><h2>${esc(COPY.b2.head)}</h2><p>${esc(COPY.b2.body)}</p></section>
        <section class="zt-note zt-b3" data-w="b3"><span class="zt-no">${esc(COPY.b3.no)}</span><h2>${esc(COPY.b3.head)}</h2><p>${esc(COPY.b3.body)}</p></section>
        <div class="zt-room" data-w="room">
          <section class="zt-caption" aria-live="polite"></section>
          <p class="zt-counter"><i></i><b></b><span>/ ${pad(videos.length)}</span></p>
          <nav class="zt-list" aria-label="Videos"><ol></ol></nav>
        </div>
        <section class="zt-end" data-w="end">
          <h2>${esc(COPY.end.head)}</h2>
          <p>${esc(COPY.end.sub)}</p>
          <p class="zt-cta">
            <a href="${start}" ${wa ? 'target="_blank" rel="noopener"' : ""}>${esc(COPY.end.cta)} <span aria-hidden="true">→</span></a>
            ${wa && email ? `<a href="mailto:${esc(email)}">${esc(COPY.end.email)}</a>` : ""}
          </p>
        </section>
      </div>
      <div class="zt-index" role="dialog" aria-modal="true" aria-label="${esc(COPY.index)}" hidden>
        <button type="button" class="zt-index-close">${esc(COPY.close)}</button>
        <ol>${videos.map((v, k) => `
          <li><button type="button" data-k="${k}"><b>${pad(k + 1)}</b><span class="t">${esc(v.title)}</span><span class="g">${esc(v.tag ?? "")}</span><span class="d">${esc(v.duration ?? "")}</span></button></li>`).join("")}
        </ol>
      </div>`);
    const q = <T extends HTMLElement>(s: string) => host.querySelector<T>(s)!;
    this.el = {
      intro: q(".zt-intro"), hint: q(".zt-hint"), b1: q(".zt-b1"), b2: q(".zt-b2"), b3: q(".zt-b3"), room: q(".zt-room"), end: q(".zt-end"),
    };
    this.caption = q(".zt-caption");
    this.counter = q(".zt-counter b");
    this.list = q(".zt-list ol");
    this.overlay = q(".zt-index");
    this.list.innerHTML = videos.map((v, k) => `<li><button type="button" data-k="${k}">${esc(v.title.split(" — ")[0])}<i></i></button></li>`).join("");

    host.querySelectorAll<HTMLButtonElement>("[data-enter]").forEach((b) => b.addEventListener("click", () => on.enter(b.dataset.enter === "1")));
    this.list.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-k]");
      if (b) on.goTo(Number(b.dataset.k));
    });
    this.caption.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-play]");
      if (b) { e.preventDefault(); on.play(Number(b.dataset.play)); }
    });
    this.overlay.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-k]");
      if (b) { this.index(false); on.goTo(Number(b.dataset.k)); }
      else if ((e.target as HTMLElement).closest(".zt-index-close") || e.target === this.overlay) this.index(false);
    });
    addEventListener("keydown", (e) => { if (e.key === "Escape" && !this.overlay.hidden) this.index(false); });

    // Index and Sound live in the page's top bar, where the contact buttons were
    const bar = document.querySelector(".topbar .tb-right") ?? host;
    bar.insertAdjacentHTML("beforeend", `
      <button type="button" class="zt-tb" data-index>${esc(COPY.index)}</button>
      <button type="button" class="zt-tb zt-sound" aria-pressed="false"><i aria-hidden="true"></i><span>${esc(COPY.soundOff)}</span></button>`);
    bar.querySelector("[data-index]")!.addEventListener("click", () => this.index(true));
    this.soundBtn = bar.querySelector<HTMLButtonElement>(".zt-sound")!;
    this.soundBtn.addEventListener("click", () => on.sound());
  }

  index(open: boolean) {
    this.overlay.hidden = !open;
    document.documentElement.classList.toggle("zt-index-open", open);
    if (open) this.overlay.querySelector<HTMLButtonElement>("button[data-k]")?.focus();
  }

  setSound(on: boolean) {
    this.soundBtn.setAttribute("aria-pressed", String(on));
    this.soundBtn.querySelector("span")!.textContent = on ? COPY.soundOn : COPY.soundOff;
  }

  /** The video in front: its caption, the counter, its line in the list, its glow colour on the counter. */
  setActive(k: number, color: string) {
    if (k === this.active) return;
    this.active = k;
    const v = this.videos[k];
    const parts = v.title.split(" — ");
    this.caption.innerHTML = `
      <p class="zt-kicker">№ ${pad(k + 1)}${v.duration ? ` · ${esc(v.duration)}` : ""}</p>
      <h2>${esc(parts[0])}</h2>
      ${parts[1] ? `<p class="zt-line">“${esc(parts.slice(1).join(" — "))}”</p>` : ""}
      <p class="zt-tag">${esc(v.tag ?? "")}</p>
      <p class="zt-links"><a href="#${esc(v.id)}" data-play="${k}">${esc(COPY.watch)} <span aria-hidden="true">→</span></a>
        <a href="${location.pathname}#${esc(v.id)}" target="_blank" rel="noopener">${esc(COPY.newTab)}</a></p>`;
    this.caption.classList.remove("in");
    void this.caption.offsetWidth; // restart the fade
    this.caption.classList.add("in");
    this.counter.textContent = pad(k + 1);
    this.el.room.style.setProperty("--hue", color);
    this.list.querySelectorAll("button").forEach((b, i) => b.classList.toggle("on", i === k));
  }

  /** Shows each block by its weight, 0..1. */
  frame(w: Weights) {
    (Object.keys(w) as (keyof Weights)[]).forEach((key) => {
      const v = Math.round(w[key] * 100) / 100;
      if (this.shown[key] === v) return;
      this.shown[key] = v;
      const el = this.el[key];
      el.style.opacity = String(v);
      el.style.visibility = v > 0 ? "visible" : "hidden";
      el.style.setProperty("--in", String(v));
      el.classList.toggle("live", v > 0.5);
    });
  }
}
