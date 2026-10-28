# Chaker Red — video portfolio

A one-page site that shows only my videos. Each video has its own link (`#video-id`) that opens it directly.

- `index.html`: the page (no build step; works on GitHub Pages as is)
- `videos.js`: the list of videos and the contact details. **This is the only file to edit.**
- `videos/`: the video files (720×1280 H.264 + AAC, fast start, kept small for the web)
- `thumbs/`: one 540×960 cover image per video

## Add a video
1. Compress it into `videos/<id>.mp4`:
   `ffmpeg -i IN.mp4 -vf "scale=720:1280:flags=lanczos,fps=30" -c:v libx264 -preset slow -crf 25 -maxrate 1800k -bufsize 3600k -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart videos/<id>.mp4`
   For a horizontal video, use `scale=1280:720` instead.
2. Make its cover image: `ffmpeg -ss <seconds> -i IN.mp4 -frames:v 1 -vf scale=540:960 -q:v 3 thumbs/<id>.jpg`
   For a horizontal video, use `scale=960:540`.
3. Add an entry at the top of `window.VIDEOS` in `videos.js`. Set `ratio: "16:9"` for a horizontal video (vertical `"9:16"` is the default).
   Each format gets its own section with cards in its real shape, and once both formats exist the page shows filter buttons (All / Vertical / Horizontal).
4. In `index.html`, bump the number in `videos.js?v=…` so browsers fetch the new list instead of a cached one.
5. Commit and push; GitHub Pages updates in about a minute.

## Contact
`window.CONTACT` in `videos.js`: `email`, and `whatsapp` (digits only, international format). An empty value hides that button.
