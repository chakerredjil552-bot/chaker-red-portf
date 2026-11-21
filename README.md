# Chaker Red — video portfolio

A one-page site that shows only my videos. Each video has its own link (`#video-id`) that opens it directly.

- `index.html`: the page (no build step; works on GitHub Pages as is)
- `videos.js`: the list of videos and the contact details. **This is the only file to edit.**
- `videos/`: the video files (720×1280 H.264 + AAC, fast start, kept small for the web)
- `thumbs/`: one 540×960 cover image per video
- `previews/`: short 9:16 clips and their first frames; the frames paper the hero's wall of screens
- `hero-assets/`: the built hero (`zoetrope.js` with three.js inside, `zoetrope.css`, `man.glb` the man on the floor); `musashi-panels.webp` is an old backdrop, not used
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
| Room | one stop per video (the page snaps to them): each one steps forward in a glowing frame and plays, the next one swapping in through vertical strips; the camera stays behind him | the video's title in big serif, its line and tag, Watch it / Open in a new tab, the counter, the index on the right |
| Exit and end | the camera rises out of the well until it is a small medallion on dark maroon | "Your video, next on the wall.", Start a project / Email me |

The top bar holds the name, **Index** (every video in a list; click one to go to it) and **Sound** (the video in front
plays with sound). Click the screen in front to watch it in the player; click any screen on the wall to bring its video
forward. The camera eases after the scroll, so it never jumps; the page only settles on a stop in the room, so on the
way down the camera stays exactly where you leave it. The wall is one instanced mesh whose pictures sit in one
texture: it goes to the GPU once, then each picture that arrives sends only its own cell, and every shader is built
before it is first seen, so nothing stalls a move. The first video only loads once the camera is on its way down. With reduced
motion the wall stops drifting and the camera follows the scroll at once. Without WebGL the page shows the plain grid
of videos instead. Shared `#video-id` links still open their video in the player.

**The man** (`hero/src/zt/man.ts`) is a real human figure, all black: the mannequin of the
[Universal Animation Library](https://quaternius.com) by Quaternius (CC0), dressed by `hero/tools/man.ts`
(`hero/src/zt/dress.ts`) in a long coat to the calves, sleeves to the wrist, a raised collar and short hair, all cut to
his body and skinned to his bones. The floor's light catches his edges, and so does the screen in front of him, in its
colour. His long shadow is the same skinned mesh flattened onto the floor along the light.

**Like the man in the reel, he never moves from his spot** (`hero/src/zt/choreo.ts`): seen from above while the camera
sinks, from behind once it tilts up, small in the middle as it rises out. He breathes and shifts his weight, his arms
hanging at his sides, and looks round slowly, wondering where he is: to his left, to his right, on round over his
right shoulder to look behind him, then over his left shoulder, holding each look briefly (each turn takes under half a second). His upper body turns with his
head, a moment later. Now and then he lifts a hand in front of his face, the right one, then a few seconds later the left, as if against a wind or a strong light that is not there. He never looks at or reaches for the screens, and the screen in front always sits above his
head, so he never covers the video. (The model can also walk, feet planted, but the hero does not use it.)

To rebuild the model (`hero-assets/man.glb`, about 600 KB): clone
`https://github.com/j-ponzo/gltf-universal-animation-library`, then
`cd hero && npm run man -- <clone>/glTF/AnimationLibrary_Godot_Standard.gltf`.

**The camera** spirals a sixth of a turn on the way down, sways a little as if held by hand (more while it moves) and
leans in each time a new video comes forward; in the room it stays behind him. **The light** (`post.ts`): bright screens bloom, fast moves streak
toward the centre, colours split slightly at the edges, the corners darken and a fine grain runs over the picture; the
screens on the wall flicker gently. **Dust** (`dust.ts`): small white specks float in the air of the well, a few
brighter than the rest; they are real points in the room, so they slide past as the camera moves and drift slowly,
each its own way, when it rests on him. A slow device lowers its resolution, then drops the glow, to keep moving smoothly.
The glow colour of each video is taken from its cover.

To change it: edit `hero/src/zt/`, then `cd hero && npm install && npm test && npm run build` (writes `hero-assets/`) and
bump `zoetrope.js?v=…` and `zoetrope.css?v=…` in `index.html`. The words are in `hero/src/zt/ui.ts`; the stages, the
wall, the camera path and the figure's path (`plan.ts`, `wall.ts`, `cam.ts`, `choreo.ts`) are unit tested in
`hero/src/zt/zt.test.ts`; the man (looking round, shoulders following, hanging arms) in `hero/src/zt/man.test.ts`.
