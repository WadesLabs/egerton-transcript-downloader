// Egerton PDF Saver - page world hooks
// Built by Wades (Anome2002), Wades Innovations

(function () {
  // ---------- Helpers & de-dupe ----------
  const seen = new Set();
  const seenUrl = new Set();

  function normalizeBase64(b64) {
    if (!b64 || typeof b64 !== "string") return "";
    b64 = b64.trim();
    if (b64.startsWith("data:application/pdf;base64,")) b64 = b64.split(",")[1];
    return b64;
  }

  function emitBase64(b64) {
    b64 = normalizeBase64(b64);
    if (!b64) return;
    const key = b64.length + ":" + b64.slice(0, 64);
    if (seen.has(key)) return;
    seen.add(key);
    try { window.postMessage({ type: "EGERTON_PDF_BASE64", base64: b64 }, "*"); } catch (e) {}
  }

  function abs(u) {
    try { return new URL(u, location.href).toString(); } catch (e) { return u || ""; }
  }

  function emitUrl(u) {
    u = abs(u);
    if (!u || seenUrl.has(u)) return;
    seenUrl.add(u);
    try { window.postMessage({ type: "EGERTON_PDF_URL", url: u }, "*"); } catch (e) {}
  }

  function toBase64FromBytes(buf) {
    try {
      const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
      }
      return btoa(binary);
    } catch (e) { return ""; }
  }

  function looksLikePortalDocUrl(url) {
    return /\/ViewDocuments\/(GenerateTranscript|ProvisionalResults|ExamCard|FeeStructure|LegacyStatement|SemesterProformaInvoice|AccomodationStatement|FeeStatement|GenerateStudentAudit)/i.test(url || "");
  }

  function safeParseJson(text) { try { return JSON.parse(text); } catch { return null; } }

  function handlePossibleJson(data) {
    // { success: true, message: "<base64 or url>" }
    try {
      if (!data || !data.success) return;
      const msg = data.message;
      if (typeof msg !== "string" || msg.length < 16) return;
      if (msg.startsWith("http") || msg.startsWith("/")) emitUrl(msg);
      else emitBase64(msg);
    } catch (e) {}
  }

  // ---------- Network interception ----------
  function hookXHR() {
    try {
      const origOpen = XMLHttpRequest.prototype.open;
      const origSend = XMLHttpRequest.prototype.send;

      XMLHttpRequest.prototype.open = function (method, url) {
        this.__eg_url = abs(url);
        return origOpen.apply(this, arguments);
      };

      XMLHttpRequest.prototype.send = function (body) {
        try {
          const url = this.__eg_url || "";
          if (looksLikePortalDocUrl(url)) {
            this.addEventListener("load", () => {
              try {
                if (this.responseType === "json" && this.response) {
                  handlePossibleJson(this.response);
                } else {
                  let txt = this.responseText;
                  if (!txt && typeof this.response === "string") txt = this.response;
                  if (txt) handlePossibleJson(safeParseJson(txt));
                }
              } catch (e) {}
            });
          }
        } catch (e) {}
        return origSend.apply(this, arguments);
      };
    } catch (e) {}
  }

  function hookFetch() {
    try {
      if (!window.fetch) return;
      const origFetch = window.fetch;
      window.fetch = function (input, init) {
        const url = typeof input === "string" ? abs(input) : abs((input && input.url) || "");
        const inspect = looksLikePortalDocUrl(url);
        return origFetch.apply(this, arguments).then((resp) => {
          if (inspect) {
            try {
              const c1 = resp.clone();
              c1.json().then(handlePossibleJson).catch(() => {
                resp.clone().text().then((t) => handlePossibleJson(safeParseJson(t))).catch(() => {});
              });
            } catch (e) {}
          }
          return resp;
        });
      };
    } catch (e) {}
  }

  function hookjQueryAjax() {
    try {
      const jq = window.jQuery || window.$;
      if (!jq || !jq.ajax || jq.ajax.__egHooked) return;
      const origAjax = jq.ajax;
      function wrappedAjax(urlOrOpts, opts) {
        let url = null, options = null;
        if (typeof urlOrOpts === "string") {
          url = urlOrOpts; options = opts || {};
        } else { options = urlOrOpts || {}; url = options.url || ""; }
        const inspect = looksLikePortalDocUrl(url);
        if (inspect) {
          const origSuccess = options.success;
          options.success = function (data) {
            try { handlePossibleJson(data); } catch (e) {}
            if (typeof origSuccess === "function") return origSuccess.apply(this, arguments);
          };
        }
        return origAjax.call(this, url || options, options);
      }
      wrappedAjax.__egHooked = true;
      jq.ajax = wrappedAjax;
    } catch (e) {}
  }

  // ---------- PDF.js interception ----------
  function hookRenderPdf() {
    try {
      if (typeof window.renderPdf === "function" && !window.renderPdf.__egHooked) {
        const orig = window.renderPdf;
        function wrapped(b64) { try { emitBase64(b64); } catch (e) {} return orig.apply(this, arguments); }
        wrapped.__egHooked = true;
        window.renderPdf = wrapped;
      } else if (!Object.getOwnPropertyDescriptor(window, "renderPdf")) {
        let _val;
        Object.defineProperty(window, "renderPdf", {
          configurable: true, enumerable: true,
          get() { return _val; },
          set(v) {
            if (typeof v === "function" && !v.__egHooked) {
              const orig = v;
              _val = function () { try { emitBase64(arguments[0]); } catch (e) {} return orig.apply(this, arguments); };
              _val.__egHooked = true;
            } else { _val = v; }
          }
        });
      }
    } catch (e) {}
  }

  function hookPdfJsGetDocument() {
    try {
      if (!window.pdfjsLib || !pdfjsLib.getDocument || pdfjsLib.getDocument.__egHooked) return;
      const orig = pdfjsLib.getDocument;
      function wrapped(params) {
        try {
          if (params) {
            // Handle typed arrays/ArrayBuffer
            if (params.data instanceof Uint8Array || params.data instanceof ArrayBuffer) {
              emitBase64(toBase64FromBytes(params.data));
            }
            // Handle binary string (what the portal passes after atob(base64))
            else if (typeof params.data === "string") {
              // Re-encode raw binary string back to base64
              try { emitBase64(btoa(params.data)); } catch (e) {}
            }
            // Handle string param or { url: string }
            else if (typeof params === "string") {
              if (params.startsWith("data:application/pdf;base64,")) emitBase64(params.split(",")[1]);
              else emitUrl(params);
            } else if (params.url && typeof params.url === "string") {
              const u = params.url;
              if (u.startsWith("data:application/pdf;base64,")) emitBase64(u.split(",")[1]);
              else emitUrl(u);
            }
          }
        } catch (e) {}
        return orig.apply(this, arguments);
      }
      wrapped.__egHooked = true;
      pdfjsLib.getDocument = wrapped;
    } catch (e) {}
  }

  function hookPdfViewerApplication() {
    try {
      const P = window.PDFViewerApplication;
      if (!P || typeof P.open !== "function" || P.open.__egHooked) return;
      const orig = P.open;
      function wrapped(src) {
        try {
          if (typeof src === "string") {
            if (src.startsWith("data:application/pdf;base64,")) emitBase64(src.split(",")[1]);
            else emitUrl(src);
          } else if (src instanceof Uint8Array || src instanceof ArrayBuffer) {
            emitBase64(toBase64FromBytes(src));
          }
        } catch (e) {}
        return orig.apply(this, arguments);
      }
      wrapped.__egHooked = true;
      P.open = wrapped;
    } catch (e) {}
  }

  // Watch the known iframe too
  function hookIframe() {
    try {
      const iframe = document.getElementById("iframe");
      if (!iframe) return;
      const send = () => {
        const src = iframe.getAttribute("src");
        if (!src) return;
        if (src.startsWith("data:application/pdf;base64,")) emitBase64(src.split(",")[1]);
        else emitUrl(src);
      };
      const mo = new MutationObserver(send);
      mo.observe(iframe, { attributes: true, attributeFilter: ["src"] });
      send();
    } catch (e) {}
  }

  // ---------- Boot & rehook ----------
  function bootOnce() {
    hookXHR();
    hookFetch();
    hookjQueryAjax();
    hookRenderPdf();
    hookPdfJsGetDocument();
    hookPdfViewerApplication();
    hookIframe();
  }

  bootOnce();
  let tries = 0;
  const timer = setInterval(() => {
    tries++;
    hookjQueryAjax();
    hookRenderPdf();
    hookPdfJsGetDocument();
    hookPdfViewerApplication();
    if (tries > 20) clearInterval(timer);
  }, 1000);
})();
