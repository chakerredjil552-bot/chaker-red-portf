/** The hero's words. The site is in English; the counts come from videos.js. */
export const COPY = {
  brand: "Chaker Red",
  nick: "Video portfolio",
  name: "Chaker Redjil",
  lead: "Ads, promos and motion design. Drag or scroll to turn the ring, tap a video to watch it.",
  email: "Email me",
  whatsapp: "WhatsApp",
  skip: "Skip intro",
  drag: "Drag or scroll to turn",
  loading: "Loading Reels",
  play: "Play",
  tagLeft: "Ads · Promos · Motion design",
  tagRight: "Wisdom of Miyamoto Musashi · 1645",
};

declare global {
  interface Window { CONTACT?: { email?: string; whatsapp?: string }; __dealCover?: boolean }
}
