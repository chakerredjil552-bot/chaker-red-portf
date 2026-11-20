# Chaker Red — video portfolio

A one-page site that shows only my videos. Each video has its own link (`#video-id`) that opens it directly.

- `index.html`: the page (no build step; works on GitHub Pages as is)
- `videos.js`: the list of videos and the contact details. **This is the only file to edit.**
- `videos/`: the video files (720×1280 H.264 + AAC, fast start, kept small for the web)
- `thumbs/`: one 540×960 cover image per video
- `previews/`: short 9:16 clips and their first frames; the frames paper the hero's wall of screens
- `hero-assets/`: the built hero (`zoetrope.js` with three.js inside, `zoetrope.css`); `musashi-panels.webp` is an old backdrop, not used
- `hero/`: the hero's source (TypeScript + three.js, in `hero/src/zt/`); `hero/art/` drew the old Musashi panels

## Add a video
1. Compress it into `videos/<id>.mp4`:
   `ffmpeg -i IN.mp4 -vf "scale=720:1280:flags=lanczos,fps=30" -c:v libx264 -preset slow -crf 25 -maxrate 1800k -bufsize 3600k -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart videos/<id>.mp4`
   For a horizontal video, use `scale=1280:720` instead.
2. Make its cover image: `ffmpeg -ss <seconds> -i IN.mp4 -frames:v 1 -vf scale=540:960 -q:v 3 thumbs/<id>.jpg`
   For a horizontal video, use `scale=960:540`.
3. Add an entry at the top of `window.VIDEOS` in `videos.js`. Set `ratio: "16:9"` for a horizontal video (vertical `"9:16"` is the default).
   Each format gets its own section with cards in its real shape, and once both formats exist the page shows filter buttons (All / Vertical / Horizontal).
4. Optional, for the wall of screens at the top: pick 2–3 moments, add them as `scenes: [s1, s2, s3]` (seconds) and cut a
   3-second vertical preview for each, numbered from 1:
   `ffmpeg -ss <s> -i videos/<id>.mp4 -t 3 -an -vf "scale=360:640,fps=30" -c:v libx264 -crf 29 -pix_fmt yuv420p -movflags +faststart previews/<id>-1.mp4`
   `ffmpeg -ss <s> -i videos/<id>.mp4 -frames:v 1 -vf scale=360:640 -q:v 5 previews/<id>-1.jpg`
   For a horizontal video, put `crop=ih*9/16:ih,` in front of `scale=360:640`. Without `scenes`, the video still gets a card
   on the wall, showing its cover.
5. In `index.html`, bump the number in `videos.js?v=…` so browsers fetch the new list instead of a cached one.
6. Commit and push; GitHub Pages updates in about a minute.

## Contact
`window.CONTACT` in `videos.js`: `email`, and `whatsapp` (digits only, international format). An empty value hides that button.

## The hero
The page is one long scroll over a WebGL scene, a zoetrope: a round well whose wall is papered with the videos.
`hero/src/zt/plan.ts` cuts the scroll into stages:

| Stage | What you see | Words |
|---|---|---|
| Intro | looking straight down the well: rings of screens round a blue floor, a figure on it | "Chaker Red presents · Moving Pictures", Enter with sound / Enter quietly, Scroll to descend |
| Descent | the camera sinks down the well; neighbouring rows turn opposite ways as you scroll | two notes, one on each side |
| Land | the camera tilts up into the round room; the first video comes off the bottom row and floats forward | "02 · Pull one off the wall." |
| Room | one stop per video (the page snaps to them): each one steps forward in a glowing frame and plays, the next one swapping in through vertical strips; the camera turns a little each time | the video's title in big serif, its line and tag, Watch it / Open in a new tab, the counter, the index on the right |
| Exit and end | the camera rises out of the well until it is a small medallion on dark maroon | "Your video, next on the wall.", Start a project / Email me |

The top bar holds the name, **Index** (every video in a list; click one to go to it) and **Sound** (the video in front
plays with sound). Click the screen in front to watch it in the player; click any screen on the wall to bring its video
forward. The camera eases after the scroll, so it never snaps. The wall is one instanced mesh whose pictures sit in
one texture, filled in as the frames load; the first video only loads once the camera is on its way down. With reduced
motion the wall stops drifting and the camera follows the scroll at once. Without WebGL the page shows the plain grid
of videos instead. Shared `#video-id` links still open their video in the player.

The figure is built from simple shapes and shaded as a silhouette lit by the floor; the glow colour of each video is
taken from its cover.

To change it: edit `hero/src/zt/`, then `cd hero && npm install && npm test && npm run build` (writes `hero-assets/`) and
bump `zoetrope.js?v=…` and `zoetrope.css?v=…` in `index.html`. The words are in `hero/src/zt/ui.ts`; the stages, the
wall and the camera path (`plan.ts`, `wall.ts`, `cam.ts`) are unit tested in `hero/src/zt/zt.test.ts`.
