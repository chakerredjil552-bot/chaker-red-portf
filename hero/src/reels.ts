/** One card's worth of video: a short looping preview, its cover, and where it leads. */
export interface Reel {
  key: string;     // unique per scene
  videoId: string; // the video's own link on the site: #videoId
  src: string;     // looping preview, 9:16, no sound
  cover: string;   // its first frame
  at: number;      // where this scene starts in the whole video, s
  client: string;
  title: string;
}

/** An entry of window.VIDEOS in videos.js. */
interface Video {
  id: string;
  title: string;
  tag?: string;
  file: string;
  thumb: string;
  scenes?: number[];
}

declare global {
  interface Window { VIDEOS?: Video[]; openVideo?: (id: string, at?: number) => void }
}

/**
 * The reels, read from videos.js. A video with `scenes` gets one reel per scene, cut to previews/<id>-<n>.mp4 and
 * .jpg; a video without them still gets a card, playing its own file from the start. The scenes of all the videos are
 * dealt round in turn, so neighbours on the ring come from different videos.
 */
export function reelsFrom(videos: Video[]): Reel[] {
  const per = videos.map((v) =>
    v.scenes?.length
      ? v.scenes.map((at, i) => ({ key: `${v.id}-${i + 1}`, videoId: v.id, src: `previews/${v.id}-${i + 1}.mp4`, cover: `previews/${v.id}-${i + 1}.jpg`, at, client: v.tag ?? "", title: v.title }))
      : [{ key: v.id, videoId: v.id, src: v.file, cover: v.thumb, at: 0, client: v.tag ?? "", title: v.title }],
  );
  const out: Reel[] = [];
  for (let round = 0; out.length < per.reduce((n, p) => n + p.length, 0); round++)
    per.forEach((p) => { if (p[round]) out.push(p[round]); });
  return out;
}

export const REELS: Reel[] = reelsFrom(window.VIDEOS ?? []);
