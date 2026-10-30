// Serve MediaPipe's WASM runtime from our own origin (pinned with the npm package), not a third-party CDN.
import { cpSync } from "node:fs";

cpSync("node_modules/@mediapipe/tasks-vision/wasm", "public/mediapipe/wasm", { recursive: true });
