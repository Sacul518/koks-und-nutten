import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

// Im Dev-Server /admin auf /admin.html umbiegen (in Produktion macht das Express).
function adminRewrite(): Plugin {
  return {
    name: "admin-rewrite",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === "/admin" || req.url === "/admin/") req.url = "/admin.html";
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [adminRewrite()],
  server: {
    host: true,
    proxy: {
      "/ws": { target: "ws://localhost:3000", ws: true },
      "/api": { target: "http://localhost:3000" },
    },
  },
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("index.html", import.meta.url)),
        admin: fileURLToPath(new URL("admin.html", import.meta.url)),
      },
    },
  },
});
