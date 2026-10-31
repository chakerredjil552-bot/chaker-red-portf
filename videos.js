// The videos on the site, newest first. To add one:
//   1. put the file in videos/ (720x1280 H.264 + AAC, "-movflags +faststart") and a 540x960 cover in thumbs/
//   2. add an entry below (socialLikes = its real like count on social media, or 0); `id` is the video's own link: https://<site>/#<id>
//   ratio: "9:16" (vertical, the default) or "16:9" (horizontal); each format gets its own section and filter button
//   scenes (optional): where the short previews on the hero's ring start, in seconds; cut each one to
//   previews/<id>-<n>.mp4 and .jpg (see README). Without scenes the video still gets a card on the ring.
window.VIDEOS = [
  {
    id: "bushra-school-timetable",
    title: "Bushra's School — weekly timetable promo",
    tag: "Promo · Motion design",
    duration: "0:32",
    socialLikes: 0, // real likes this video got on social media; site likes add on top
    file: "videos/bushra-school-timetable.mp4",
    thumb: "thumbs/bushra-school-timetable.jpg",
  },
  {
    id: "wasfati-ad",
    title: "Wasfati — وصفتي · app launch ad",
    tag: "Ad · Motion design",
    ratio: "16:9",
    duration: "0:38",
    socialLikes: 0, // real likes this video got on social media; site likes add on top
    file: "videos/wasfati-ad.mp4",
    thumb: "thumbs/wasfati-ad.jpg",
    scenes: [3.2, 7.9, 34.5], // seconds where the hero's preview clips start: previews/wasfati-ad-1.mp4 …
  },
  {
    id: "golden-angle-film",
    title: "137.5° — the golden angle",
    tag: "Explainer · Motion graphics",
    ratio: "16:9",
    duration: "1:30",
    socialLikes: 160, // real likes this video got on social media; site likes add on top
    file: "videos/golden-angle-film.mp4",
    thumb: "thumbs/golden-angle-film.jpg",
    scenes: [7.5, 22.5, 52.9], // seconds where the hero's preview clips start: previews/golden-angle-film-1.mp4 …
  },
  {
    id: "pi-motion-film",
    title: "π — a motion film",
    tag: "Explainer · Motion graphics",
    ratio: "16:9",
    duration: "1:30",
    socialLikes: 160, // real likes this video got on social media; site likes add on top
    file: "videos/pi-motion-film.mp4",
    thumb: "thumbs/pi-motion-film.jpg",
    scenes: [22.5, 30, 75], // seconds where the hero's preview clips start: previews/pi-motion-film-1.mp4 …
  },
  {
    id: "bushra-school-channel",
    title: "Bushra's School — join our Instagram channel",
    tag: "Reel · Motion design",
    duration: "0:40",
    socialLikes: 0, // real likes this video got on social media; site likes add on top
    file: "videos/bushra-school-channel.mp4",
    thumb: "thumbs/bushra-school-channel.jpg",
    scenes: [3.3, 13.2, 23], // seconds where the hero's preview clips start: previews/bushra-school-channel-1.mp4 …
  },
  {
    id: "tina-beauty-ad",
    title: "Tîna Beauty — Reel ad",
    tag: "Ad · Motion design",
    duration: "1:09",
    socialLikes: 526, // real likes this video got on social media; site likes add on top
    file: "videos/tina-beauty-ad.mp4",
    thumb: "thumbs/tina-beauty-ad.jpg",
    scenes: [5.7, 22.9, 51.6], // seconds where the hero's preview clips start: previews/tina-beauty-ad-1.mp4 …
  },
  {
    id: "duo-chocolate",
    title: "DUO Chocolate — animated ad",
    tag: "Ad · Character animation",
    duration: "0:20",
    socialLikes: 210, // real likes this video got on social media; site likes add on top
    file: "videos/duo-chocolate.mp4",
    thumb: "thumbs/duo-chocolate.jpg",
    scenes: [0.05, 7.45, 13], // seconds where the hero's preview clips start: previews/duo-chocolate-1.mp4 …
  },
  {
    id: "bushra-school-website",
    title: "Bushra's School — website promo",
    tag: "Promo · Motion design",
    duration: "0:50",
    socialLikes: 890, // real likes this video got on social media; site likes add on top
    file: "videos/bushra-school-website.mp4",
    thumb: "thumbs/bushra-school-website.jpg",
    scenes: [1, 13, 30.6], // seconds where the hero's preview clips start: previews/bushra-school-website-1.mp4 …
  },
  {
    id: "bushra-school-ad",
    title: "Bushra's School — enrolment ad",
    tag: "Ad · Motion design",
    duration: "1:15",
    socialLikes: 1500, // real likes this video got on social media; site likes add on top
    file: "videos/bushra-school-ad.mp4",
    thumb: "thumbs/bushra-school-ad.jpg",
    scenes: [6, 24.5, 37.2], // seconds where the hero's preview clips start: previews/bushra-school-ad-1.mp4 …
  },
];

// Contact shown in the header and footer. Leave a value empty ("") to hide it.
window.CONTACT = {
  email: "chakerredjil552@gmail.com",
  whatsapp: "213559709603", // international format, digits only
};
