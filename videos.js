// The videos on the site, newest first. To add one:
//   1. put the file in videos/ (720x1280 H.264 + AAC, "-movflags +faststart") and a 540x960 cover in thumbs/
//   2. add an entry below (socialLikes = its real like count on social media, or 0); `id` is the video's own link: https://<site>/#<id>
//   ratio: "9:16" (vertical, the default) or "16:9" (horizontal); each format gets its own section and filter button
window.VIDEOS = [
  {
    id: "golden-angle-film",
    title: "137.5° — the golden angle",
    tag: "Explainer · Motion graphics",
    ratio: "16:9",
    duration: "1:30",
    socialLikes: 160, // real likes this video got on social media; site likes add on top
    file: "videos/golden-angle-film.mp4",
    thumb: "thumbs/golden-angle-film.jpg",
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
  },
  {
    id: "tina-beauty-ad",
    title: "Tîna Beauty — Reel ad",
    tag: "Ad · Motion design",
    duration: "1:09",
    socialLikes: 526, // real likes this video got on social media; site likes add on top
    file: "videos/tina-beauty-ad.mp4",
    thumb: "thumbs/tina-beauty-ad.jpg",
  },
  {
    id: "duo-chocolate",
    title: "DUO Chocolate — animated ad",
    tag: "Ad · Character animation",
    duration: "0:20",
    socialLikes: 210, // real likes this video got on social media; site likes add on top
    file: "videos/duo-chocolate.mp4",
    thumb: "thumbs/duo-chocolate.jpg",
  },
  {
    id: "bushra-school-website",
    title: "Bushra's School — website promo",
    tag: "Promo · Motion design",
    duration: "0:50",
    socialLikes: 890, // real likes this video got on social media; site likes add on top
    file: "videos/bushra-school-website.mp4",
    thumb: "thumbs/bushra-school-website.jpg",
  },
  {
    id: "bushra-school-ad",
    title: "Bushra's School — enrolment ad",
    tag: "Ad · Motion design",
    duration: "1:15",
    socialLikes: 1500, // real likes this video got on social media; site likes add on top
    file: "videos/bushra-school-ad.mp4",
    thumb: "thumbs/bushra-school-ad.jpg",
  },
];

// Contact shown in the header and footer. Leave a value empty ("") to hide it.
window.CONTACT = {
  email: "chakerredjil552@gmail.com",
  whatsapp: "213559709603", // international format, digits only
};
