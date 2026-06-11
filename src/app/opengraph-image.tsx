import { renderShareImage } from "@/lib/shareImage";

export const runtime = "nodejs";
export const alt = "Aggregate — Discover your local farm group";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return renderShareImage();
}
