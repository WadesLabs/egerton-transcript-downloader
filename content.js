// Egerton PDF Saver - content script
// Built by Wades (Anome2002), Wades Innovations

(function () {
  let capturedBase64 = null;
  let capturedDataUrl = null;
  let capturedUrl = null;
  let settings = { autoCapture: false, filenamePattern: "{doctype}-{name}-{yyyy}{mm}{dd}-{time}.pdf" };
  let autoTriggered = false;

  const BRAND_LINE = "by Wades Innovations";

  // ---- Safe chrome helpers ----
  const runtimeAvailable = () => typeof chrome !== "undefined" && !!(chrome.runtime && chrome.runtime.id);
  function safeSendMessage(message, cb) {
    if (!runtimeAvailable()) return;
    try {
      chrome.runtime.sendMessage(message, (res) => {
        if (chrome.runtime && chrome.runtime.lastError) return;
        if (typeof cb === "function") cb(res);
      });
    } catch (_) {}
  }

  // Load settings directly
  try {
    if (chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get("settings", ({ settings: s }) => {
        if (s && typeof s === "object") settings = Object.assign({}, settings, s);
      });
    }
  } catch (_) {}

  // ---- Utilities ----
  function sanitize(s) {
    return (s || "").replace(/\s+/g, " ").trim().replace(/[\\/:*?"<>|]+/g, "_");
  }
  function getStudentName() {
    try {
      const top = document.querySelector(".pro-user-name");
      if (top && top.textContent) return sanitize(top.textContent.replace(/\s*\(.+\)\s*$/, "").replace(/\s+$/, ""));
      const side = document.querySelector(".user-box .dropdown-toggle.h5");
      if (side && side.textContent) return sanitize(side.textContent);
    } catch (e) {}
    return "student";
  }
  function getDocTypeRaw() {
    const p = new URLSearchParams(location.search);
    return (p.get("DocT") || "document").toUpperCase();
  }
  function getDocTypePretty() {
    const map = {
      EXAMCARD: "examcard",
      RESULTS: "results",
      STDAUDIT: "student-audit",
      LEGST: "legacy-statement",
      FEESTRUCTURE: "fee-structure",
      FEESTATEMENT: "fee-statement",
      ACCOMODATIONSTMT: "accommodation-statement",
      SEMPROFINV: "semester-proforma-invoice",
      TRANSCRIPT: "transcript",
      DOCUMENT: "document"
    };
    return map[getDocTypeRaw()] || "document";
  }
  function fmtDateParts(d = new Date()) {
    const yyyy = d.getFullYear().toString();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).toString().padStart(2, "0");
    const hh = String(d.getHours()).toString().padStart(2, "0");
    const mi = String(d.getMinutes()).toString().padStart(2, "0");
    const ss = String(d.getSeconds()).toString().padStart(2, "0");
    return { yyyy, mm, dd, time: `${hh}${mi}${ss}` };
  }
  function buildFilename() {
    const name = getStudentName().toLowerCase().replace(/\s+/g, "-");
    const doctype = getDocTypePretty();
    const { yyyy, mm, dd, time } = fmtDateParts();
    const pattern = settings.filenamePattern || "{doctype}-{name}-{yyyy}{mm}{dd}-{time}.pdf";
    const file = pattern
      .replace(/\{name\}/g, name)
      .replace(/\{doctype\}/g, doctype)
      .replace(/\{yyyy\}/g, yyyy)
      .replace(/\{mm\}/g, mm)
      .replace(/\{dd\}/g, dd)
      .replace(/\{time\}/g, time);
    return sanitize(file);
  }

  // ---- UI ----
  function addOverlayButton() {
    if (document.getElementById("egerton-pdf-saver-btn")) return;
    const wrap = document.createElement("div");
    wrap.id = "egerton-pdf-saver-wrap";
    Object.assign(wrap.style, {
      position: "fixed", right: "16px", bottom: "16px", zIndex: "2147483647",
      display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px",
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif"
    });

    const btn = document.createElement("button");
    btn.id = "egerton-pdf-saver-btn";
    btn.textContent = "Download PDF";
    Object.assign(btn.style, {
      padding: "10px 14px", background: "#1f6feb", color: "#fff", border: "none",
      borderRadius: "10px", boxShadow: "0 2px 10px rgba(0,0,0,0.25)", cursor: "pointer",
      fontSize: "14px", fontWeight: "600"
    });
    btn.onclick = tryDownload;

    const credit = document.createElement("div");
    credit.textContent = "by Wades Innovations";
    Object.assign(credit.style, {
      fontSize: "11px", color: "#334155", background: "rgba(255,255,255,0.9)",
      padding: "4px 8px", borderRadius: "8px", boxShadow: "0 1px 4px rgba(0,0,0,0.1)"
    });

    wrap.appendChild(btn);
    wrap.appendChild(credit);
    document.documentElement.appendChild(wrap);
  }

  // ---- Detect PDFs pushed to the DOM or via hooks ----
  function watchIframe() {
    const iframe = document.getElementById("iframe");
    if (!iframe) return;
    const report = () => {
      const src = iframe.getAttribute("src");
      if (!src) return;
      if (src.startsWith("data:application/pdf;base64,")) {
        capturedDataUrl = src; capturedBase64 = src.split(",")[1]; capturedUrl = null;
        if (settings?.autoCapture && !autoTriggered) { autoTriggered = true; doDownload(); }
      } else if (/^https?:\/\//i.test(src) || src.startsWith("/")) {
        capturedUrl = new URL(src, location.href).toString(); capturedBase64 = null; capturedDataUrl = null;
        if (settings?.autoCapture && !autoTriggered) { autoTriggered = true; doDownload(); }
      }
    };
    const mo = new MutationObserver(report);
    mo.observe(iframe, { attributes: true, attributeFilter: ["src"] });
    report();
  }

  window.addEventListener("message", (e) => {
    if (e.source !== window) return;
    const d = e.data || {};
    if (d.type === "EGERTON_PDF_BASE64" && typeof d.base64 === "string" && d.base64.length > 0) {
      capturedBase64 = d.base64; capturedDataUrl = `data:application/pdf;base64,${d.base64}`; capturedUrl = null;
      if (settings?.autoCapture && !autoTriggered) { autoTriggered = true; doDownload(); }
    } else if (d.type === "EGERTON_PDF_URL" && typeof d.url === "string") {
      capturedUrl = new URL(d.url, location.href).toString(); capturedBase64 = null; capturedDataUrl = null;
      if (settings?.autoCapture && !autoTriggered) { autoTriggered = true; doDownload(); }
    }
  });

  // ---- Robust injection of hooks ----
  let lastInject = 0;
  function injectHooks() {
    const now = Date.now();
    if (now - lastInject < 500) return;
    lastInject = now;
    try {
      if (runtimeAvailable()) {
        const url = chrome.runtime.getURL("inject.js");
        const s = document.createElement("script");
        s.src = url; s.onload = () => s.remove();
        (document.head || document.documentElement).appendChild(s);
      }
    } catch (_) {}
    safeSendMessage({ type: "injectMainWorld" });
  }

  // ---- Late fallback: directly POST the same endpoint if nothing captured ----
  async function fallbackFetchIfNeeded() {
    if (capturedBase64 || capturedDataUrl || capturedUrl) return true;

    const Map = {
      TRANSCRIPT: "/ViewDocuments/GenerateTranscript",
      EXAMCARD: "/ViewDocuments/ExamCard",
      RESULTS: "/ViewDocuments/ProvisionalResults",
      FEESTRUCTURE: "/ViewDocuments/FeeStructure",
      SEMPROFINV: "/ViewDocuments/SemesterProformaInvoice",
      LEGST: "/ViewDocuments/LegacyStatement",
      FEESTATEMENT: "/ViewDocuments/FeeStatement",
      ACCOMODATIONSTMT: "/ViewDocuments/AccomodationStatement"
      // STDAUDIT requires a Prog parameter – skipping here.
    };
    const docT = getDocTypeRaw();
    const endpoint = Map[docT];
    if (!endpoint) return false;

    try {
      const resp = await fetch(endpoint, { method: "POST", credentials: "include" });
      const ct = resp.headers.get("content-type") || "";
      if (!resp.ok) return false;
      if (ct.includes("application/json")) {
        const data = await resp.json();
        if (data && data.success && typeof data.message === "string") {
          if (data.message.startsWith("http") || data.message.startsWith("/")) {
            capturedUrl = new URL(data.message, location.href).toString();
          } else {
            capturedBase64 = data.message;
            capturedDataUrl = `data:application/pdf;base64,${capturedBase64}`;
          }
          return true;
        }
      } else if (ct.includes("application/pdf")) {
        // Some endpoints might return raw PDF – create a blob URL
        const blob = await resp.blob();
        capturedUrl = URL.createObjectURL(blob);
        return true;
      }
    } catch (_) {}
    return false;
  }

  function tryDownload() {
    if (!capturedBase64 && !capturedDataUrl && !capturedUrl) {
      injectHooks();
      // Give hooks a moment; then fall back to direct fetch
      setTimeout(async () => {
        if (!capturedBase64 && !capturedDataUrl && !capturedUrl) {
          const ok = await fallbackFetchIfNeeded();
          if (!ok) {
            alert("No PDF detected yet. Re-open the document or press the button again.");
            return;
          }
        }
        doDownload();
      }, 500);
    } else {
      doDownload();
    }
  }

  function doDownload() {
    const filename = buildFilename();
    if (!runtimeAvailable()) {
      alert("Extension context not ready. Refresh the page and try again.");
      return;
    }
    if (capturedBase64) {
      safeSendMessage({ type: "download-data-url", dataUrl: `data:application/pdf;base64,${capturedBase64}`, filename });
      return;
    }
    if (capturedDataUrl) {
      safeSendMessage({ type: "download-data-url", dataUrl: capturedDataUrl, filename });
      return;
    }
    if (capturedUrl) {
      safeSendMessage({ type: "download-url", url: capturedUrl, filename });
      return;
    }
    alert("No PDF detected yet. Re-open the document or press the button again.");
  }

  // Let popup trigger without warnings
  if (runtimeAvailable()) {
    try {
      chrome.runtime.onMessage.addListener((msg) => {
        if (msg?.type === "prompt-download") {
          tryDownload();
        } else if (msg?.type === "refresh-settings") {
          if (chrome.storage && chrome.storage.sync) {
            chrome.storage.sync.get("settings", ({ settings: s }) => {
              if (s && typeof s === "object") settings = Object.assign({}, settings, s);
            });
          }
        }
      });
    } catch (_) {}
  }

  window.addEventListener("pageshow", () => injectHooks());
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") injectHooks(); });

  // ---- Boot ----
  addOverlayButton();
  watchIframe();
  injectHooks();
})();
