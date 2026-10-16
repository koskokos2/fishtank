const root = import.meta.dir;
const server = Bun.serve({
  hostname: "127.0.0.1", port: 58495,
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/" || path === "/index.html") {
      return new Response(Bun.file(`${root}/index.html`), { headers: { "Cache-Control": "no-store" } });
    }
    if (path === "/contact") {
      const data = await Bun.file(`${root}/candidates.json`).json();
      const esc = (s: string) => s.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
      return new Response(`<html><title>Reference image contact sheet</title><style>body{font:14px system-ui;background:#eee;display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:12px}figure{margin:0;padding:8px;background:white}img{width:100%;height:135px;object-fit:contain}figcaption{text-align:center}</style>${data.map((c: {image:string;name:string}) => `<figure><img referrerpolicy="no-referrer" src="${esc(c.image)}"><figcaption>${esc(c.name)}</figcaption></figure>`).join("")}</html>`, { headers: { "Content-Type": "text/html" } });
    }
    return new Response("Not found", { status: 404 });
  },
});
console.log(`Fish shortlist: http://127.0.0.1:${server.port}/`);
