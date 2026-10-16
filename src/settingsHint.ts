const SEEN_KEY = "settingsHintSeen";
const DURATION_MS = 15000;

// A local first-visit hint: it never becomes part of a shared settings URL.
export function showSettingsHint(gear: HTMLButtonElement, panelOpen: boolean) {
  const remember = () => {
    try { localStorage.setItem(SEEN_KEY, "true"); } catch { /* Storage may be unavailable. */ }
  };
  let seen = false;
  try { seen = localStorage.getItem(SEEN_KEY) === "true"; } catch { /* Show once this visit. */ }
  if (panelOpen || seen) {
    if (panelOpen) remember();
    return () => {};
  }

  const toast = document.createElement("div");
  toast.dataset.testid = "settings-hint";
  toast.style.cssText =
    "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:10;box-sizing:border-box;" +
    "width:310px;max-width:calc(100vw - 24px);padding:12px 34px 12px 14px;" +
    "background:#071c2af2;border:1px solid #7f76;border-radius:6px;" +
    "box-shadow:0 4px 20px #0005;color:#e6f7ee;font:13px/1.6 monospace";
  const message = document.createElement("div");
  message.setAttribute("role", "status");
  message.textContent = "Use ⚙ in the top-right corner to open settings and customize your tank.";
  const close = document.createElement("button");
  close.textContent = "×";
  close.setAttribute("aria-label", "dismiss settings tip");
  close.style.cssText =
    "position:absolute;right:4px;top:4px;background:none;border:0;color:#bdebc6;" +
    "font:18px monospace;padding:2px 6px;cursor:pointer";
  toast.append(message, close);
  document.body.append(toast);
  remember();

  const originalBackground = gear.style.background;
  const originalShadow = gear.style.boxShadow;
  gear.style.background = "#071c2af2";
  gear.style.boxShadow = "0 0 0 1px #7f79,0 0 16px #7f73";
  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    clearTimeout(timer);
    toast.remove();
    gear.style.background = originalBackground;
    gear.style.boxShadow = originalShadow;
  };
  const timer = setTimeout(dismiss, DURATION_MS);
  close.addEventListener("click", dismiss);
  return dismiss;
}
