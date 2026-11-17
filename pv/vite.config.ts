import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" keeps the build relocatable (GitHub Pages sub-path, any static host).
export default defineConfig({ base: "./", plugins: [react()] });
