import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL(".", import.meta.url));
const types = {
  html: "text/html",
  js: "text/javascript",
  css: "text/css",
  svg: "image/svg+xml",
  png: "image/png",
  webmanifest: "application/manifest+json",
};
http
  .createServer(async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      const path = new URL(req.url, "http://localhost").pathname;
      if (path.includes("..")) throw Error();
      const file = path === "/" ? "index.html" : path.slice(1);
      if (
        ![
          "index.html",
          "style.css",
          "game.js",
          "simulation.js",
          "maps.js",
          "motion.js",
          "theme.js",
          "install.js",
          "sw.js",
          "manifest.webmanifest",
          "icons/metro.svg",
          "icons/icon-192.png",
          "icons/icon-512.png",
          "icons/apple-touch-icon.png",
        ].includes(file)
      ) {
        res.writeHead(404);
        res.end();
        return;
      }
      const body = await readFile(root + file);
      res.writeHead(200, {
        "Content-Type": types[file.split(".").pop()] + "; charset=utf-8",
      });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  })
  .listen(Number(process.env.PORT) || 3000, "0.0.0.0");
