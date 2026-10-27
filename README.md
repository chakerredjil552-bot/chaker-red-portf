# Chaker Red — video portfolio

A one-page site that shows only my videos. Each video has its own link (`#video-id`) that opens it directly.

- `index.html`: the page (no build step; works on GitHub Pages as is)
- `videos.js`: the list of videos and the contact details. **This is the only file to edit.**
- `videos/`: the video files (720×1280 H.264 + AAC, fast start, kept small for the web)
- `thumbs/`: one 540×960 cover image per video

## Add a video
1. Compress it into `videos/<id>.mp4`:
   `ffmpeg -i IN.mp4 -vf "scale=720:1280:flags=lanczos,fps=30" -c:v libx264 -preset slow -crf 25 -maxrate 1800k -bufsize 3600k -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart videos/<id>.mp4`
   For a horizontal video, use `scale=1280:720` and the cards still work (the card crops to 9:16; the player shows it whole).
2. Make its cover image: `ffmpeg -ss <seconds> -i IN.mp4 -frames:v 1 -vf scale=540:960 -q:v 3 thumbs/<id>.jpg`
3. Add an entry at the top of `window.VIDEOS` in `videos.js`.
4. Commit and push; GitHub Pages updates in about a minute.

## Contact
`window.CONTACT` in `videos.js`: `email`, and `whatsapp` (digits only, international format). An empty value hides that button.
