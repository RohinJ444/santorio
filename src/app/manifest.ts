import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Santorio",
    short_name: "Santorio",
    description: "Energy in, energy out, and everything in between.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#03060c",
    theme_color: "#03060c",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
