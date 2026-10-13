import index from "../index.html";
import fixture from "./fixture.html";

Bun.serve({ hostname: "127.0.0.1", port: 8423, development: false, routes: {
  "/": index,
  "/fixture": fixture,
} });
