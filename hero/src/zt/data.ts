/** The videos, read from videos.js, and the pictures the wall is papered with. */

export interface Video {
  id: string;
  title: string;
  tag?: string;
  duration?: string;
  ratio?: "9:16" | "16:9";
  file: string;
  thumb: string;
  scenes?: number[];
}

declare global {
  interface Window {
    VIDEOS?: Video[];
    CONTACT?: { email?: string; whatsapp?: string };
    openVideo?: (id: string, at?: number) => void;
  }
}

export const VIDEOS: Video[] = window.VIDEOS ?? [];
export const isWide = (v: Video): boolean => v.ratio === "16:9";

/**
 * One picture per scene of every video (previews/<id>-<n>.jpg, 9:16), or its cover when it has no scenes. The
 * videos take turns, so pictures next to each other on the wall come from different videos.
 */
export function wallPictures(videos: Video[]): string[] {
  const per = videos.map((v) => (v.scenes?.length ? v.scenes.map((_, i) => `previews/${v.id}-${i + 1}.jpg`) : [v.thumb]));
  const out: string[] = [];
  const most = Math.max(0, ...per.map((p) => p.length));
  for (let round = 0; round < most; round++) per.forEach((p) => { if (p[round]) out.push(p[round]); });
  return out;
}

/** The picture of a video's first scene, the one its screen shows on the wall. */
export const firstPicture = (v: Video): string => (v.scenes?.length ? `previews/${v.id}-1.jpg` : v.thumb);
