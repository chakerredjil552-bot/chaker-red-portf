/** The hero's words, one block per beat of the scroll story. The site is in English; the counts come from videos.js. */
export const COPY = {
  brand: "Chaker Red",
  first: "Chaker",
  last: "Red",
  name: "Chaker Redjil",
  role: "Video editor · Motion designer",
  lead: "Ads, promos and motion design people can't stop watching.",
  hint: "Scroll to play",
  touch: "Drag to turn",
  email: "Email me",
  whatsapp: "WhatsApp",
  watch: "Watch the reel",
  skip: "Skip intro",
  loading: "Loading Reels",
  play: "Play",
  portfolio: "Video portfolio",
  beats: {
    hero: { no: "00", label: "Video portfolio" },
    craft: {
      no: "01", label: "The craft", head: ["Cut on the ", "beat", "."],
      body: "Every cut lands on the music. Every move is eased by hand, frame by frame.", now: "Now playing",
    },
    inside: {
      no: "02", label: "What's inside", head: ["Idea to ", "final cut", "."],
      steps: ["Idea & script", "Edit & rhythm", "Motion & 3D", "Sound design", "Colour & finish"],
    },
    work: {
      no: "03", label: "The work", head: ["{n} videos, ", "one", " eye."],
      body: "Ads, reels and short films, vertical and wide. Tap any card to watch it.",
    },
    talk: {
      no: "04", label: "Let's talk", head: ["Your ", "next video", " starts here."],
      body: "Tell me about your product, and let's make it move.",
    },
  },
};

declare global {
  interface Window { CONTACT?: { email?: string; whatsapp?: string }; __dealCover?: boolean }
}
