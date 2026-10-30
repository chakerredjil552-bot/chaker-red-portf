# Chaker Red — video portfolio

A one-page site that shows only my videos. Each video has its own link (`#video-id`) that opens it directly.

- `index.html`: the page (no build step; works on GitHub Pages as is)
- `videos.js`: the list of videos and the contact details. **This is the only file to edit.**
- `videos/`: the video files (720×1280 H.264 + AAC, fast start, kept small for the web)
- `thumbs/`: one 540×960 cover image per video
- `previews/`: short 9:16 clips (and their first frames) for the hero's ring of videos
- `hero-assets/`: the built hero (`deal-hero.js`, `deal-hero.css`) and its backdrop, `musashi-panels.webp`
- `hero/`: the hero's source (React + Motion, plain CSS 3D) and `hero/art/`, which draws the Musashi manga panels

## Add a video
1. Compress it into `videos/<id>.mp4`:
   `ffmpeg -i IN.mp4 -vf "scale=720:1280:flags=lanczos,fps=30" -c:v libx264 -preset slow -crf 25 -maxrate 1800k -bufsize 3600k -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart videos/<id>.mp4`
   For a horizontal video, use `scale=1280:720` instead.
2. Make its cover image: `ffmpeg -ss <seconds> -i IN.mp4 -frames:v 1 -vf scale=540:960 -q:v 3 thumbs/<id>.jpg`
   For a horizontal video, use `scale=960:540`.
3. Add an entry at the top of `window.VIDEOS` in `videos.js`. Set `ratio: "16:9"` for a horizontal video (vertical `"9:16"` is the default).
   Each format gets its own section with cards in its real shape, and once both formats exist the page shows filter buttons (All / Vertical / Horizontal).
4. Optional, for the ring of videos at the top: pick 2–3 moments, add them as `scenes: [s1, s2, s3]` (seconds) and cut a
   3-second vertical preview for each, numbered from 1:
   `ffmpeg -ss <s> -i videos/<id>.mp4 -t 3 -an -vf "scale=360:640,fps=30" -c:v libx264 -crf 29 -pix_fmt yuv420p -movflags +faststart previews/<id>-1.mp4`
   `ffmpeg -ss <s> -i videos/<id>.mp4 -frames:v 1 -vf scale=360:640 -q:v 5 previews/<id>-1.jpg`
   For a horizontal video, put `crop=ih*9/16:ih,` in front of `scale=360:640`. Without `scenes`, the video still gets a card
   on the ring, playing its own file.
5. In `index.html`, bump the number in `videos.js?v=…` so browsers fetch the new list instead of a cached one.
6. Commit and push; GitHub Pages updates in about a minute.

## Contact
`window.CONTACT` in `videos.js`: `email`, and `whatsapp` (digits only, international format). An empty value hides that button.

## The hero
A ring of the videos where the loader and the hero are the same 3D scene: the cards are dealt round a ring on a white
page while a counter reads what has really loaded, then the camera moves inside the ring and the page clears onto a
looping black-and-white animation (`hero-assets/bg-run.mp4`, upscaled to 1920 wide, with a reversed copy
`bg-run-rev.mp4`). The page never scrolls: the wheel, a drag or swipe either way, or the arrow keys turn the ring with no
end. Down sends the cards right and the backdrop runs forward; up sends them left and it runs backward, faster the faster
you turn.
`hero/art/` still draws an alternative backdrop of original Musashi manga panels (`hero-assets/musashi-panels.webp`).
Click a card to play that video from the scene it shows. The page shows only the hero: the video grid, the contact box and the footer are hidden in `index.html` (one CSS line, `main#videos, .cta, footer { display: none; }`), and shared `#video-id` links still open their video. Escape, Tab or the Skip button end the entrance at once; with
reduced motion, or on a link to one video (`#video-id`), there is no entrance.

To change it: edit `hero/src/`, then `cd hero && npm install && npm test && npm run build` (writes `hero-assets/`) and
bump `deal-hero.js?v=…` and `deal-hero.css?v=…` in `index.html`. `hero/src/pose.ts` places every card and is unit
tested in `hero/src/pose.test.ts`.
