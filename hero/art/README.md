# Musashi manga panels

`art.js` draws the hero's backdrop on a 3600×1200 canvas: eight original panels, brush strokes, ink wash, screentone and
lettering, with Musashi's words (Dokkōdō and Gorin no Sho, 1645). The strip tiles sideways.

```
npm install                      # the fonts: Shippori Mincho B1, Yuji Syuku, Bangers (SIL Open Font License)
npx http-server -p 8770 .        # or any static server on port 8770
node render.js                   # writes strip.png
ffmpeg -i strip.png -c:v libwebp -quality 72 ../../hero-assets/musashi-panels.webp
```
