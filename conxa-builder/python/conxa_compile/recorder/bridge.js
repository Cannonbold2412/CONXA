/**
 * In-page capture bridge: runs inside the browser context.
 * Serializes the active element / event target and calls the Playwright binding
 * `__skillReport` with a JSON-serializable payload.
 */
(() => {
  if (window.__SKILL_BRIDGE_V1__) return;
  window.__SKILL_BRIDGE_V1__ = true;

  const TRACE = !!(typeof window !== "undefined" && window.__SKILL_TRACE__);

  // Lightweight trace: fires only when __SKILL_TRACE__ is set.
  // Goes direct to __skillReport (or postMessage relay) — never calls report() to avoid recursion.
  function trace(kind, extra) {
    if (!TRACE) return;
    const t = { _trace: true, kind: String(kind), url: location.href, ts: Date.now() };
    if (extra) t.extra = extra;
    const fn = window["__skillReport"];
    if (typeof fn === "function") {
      try { fn(t); } catch (_e) {}
      return;
    }
    if (window !== window.top) {
      try { window.parent.postMessage({ __skillBridgeRelay__: true, payload: t }, "*"); } catch (_e) {}
    }
  }

  trace("bridge_init", { isTop: window === window.top, hasBinding: typeof window["__skillReport"] === "function" });

  // Diagnostic: list iframes that already exist when the bridge initialises in this document.
  if (TRACE) {
    try {
      const iframes = Array.from(document.querySelectorAll("iframe")).slice(0, 32).map(function(f) {
        return { src: f.getAttribute("src") || "", id: f.id || "", testId: f.getAttribute("data-test-id") || "", name: f.getAttribute("name") || "" };
      });
      trace("iframes_at_init", { count: iframes.length, items: iframes });
    } catch (_e) {}
  }

  // Diagnostic: watch for <iframe> elements added to this document after init.
  if (TRACE) {
    try {
      const mo = new MutationObserver(function(records) {
        for (var i = 0; i < records.length; i++) {
          var addedNodes = records[i].addedNodes;
          for (var j = 0; j < addedNodes.length; j++) {
            var node = addedNodes[j];
            if (node && node.nodeType === 1 && node.tagName === "IFRAME") {
              trace("iframe_added", { src: node.getAttribute("src") || "", id: node.id || "", testId: node.getAttribute("data-test-id") || "" });
            }
          }
        }
      });
      mo.observe(document.documentElement || document, { childList: true, subtree: true });
    } catch (_e) {}
  }

  // Document-scoped listener registry: HubSpot's micro-frontend pattern replaces iframe
  // document content via document.open()/write() instead of navigating a new document, which
  // means add_init_script (real-navigation-only) never re-runs and the old, wiped-out listener
  // set is gone. Collecting registrations here (instead of registering them directly at each
  // addEventListener call-site below) lets installDocumentListeners() re-attach the exact same
  // set on demand — once at initial bridge init, and again from the open/write/writeln patch
  // below every time the document's content is swapped.
  const _docListeners = [];
  function onDoc(type, handler, options) {
    _docListeners.push([type, handler, options]);
  }
  function installDocumentListeners() {
    for (const [type, handler, options] of _docListeners) {
      try { document.removeEventListener(type, handler, options); } catch (_e) {}
      document.addEventListener(type, handler, options);
    }
    // Kept for the pump loop's diagnostics/backstop (see session.py) — no longer the sole
    // signal a reinstall is needed; the prototype patch below is now primary.
    document.__SKILL_BRIDGE_DOC_V1__ = true;
    // Return value lets session.py's reinstall-backstop call confirm real listeners were
    // actually (re)attached, not just that this function ran without throwing — a frame whose
    // own onDoc(...) registrations never ran (e.g. the script errored before reaching them)
    // would otherwise report success while attaching zero listeners.
    return _docListeners.length;
  }
  // Exposed so session.py's pump-loop backstop can trigger a reinstall directly instead of
  // re-running (and silently no-oping on) the whole bridge script.
  window.__SKILL_REINSTALL_DOC__ = installDocumentListeners;

  // Always-on (not TRACE-gated): patch Document.prototype.open/write/writeln so a document
  // content swap re-attaches our listeners immediately, synchronously, in-page — no round trip,
  // no poll cadence, no race window. Patched on the prototype (not the document instance)
  // because an instance-level override is exactly what document.open() discards; the prototype
  // belongs to the persistent window realm and survives the swap.
  if (document && !document.__SKILL_OPEN_HOOKED__) {
    try {
      document.__SKILL_OPEN_HOOKED__ = true;
      const proto = Document.prototype;
      const _origOpen = proto.open;
      const _origWrite = proto.write;
      const _origWriteln = proto.writeln;
      proto.open = function () {
        trace("document_open", { url: location.href });
        const ret = _origOpen.apply(this, arguments);
        installDocumentListeners();
        return ret;
      };
      proto.write = function (s) {
        trace("document_write", { len: (s && s.length) || 0 });
        const ret = _origWrite.apply(this, arguments);
        installDocumentListeners();
        return ret;
      };
      proto.writeln = function (s) {
        trace("document_write", { len: (s && s.length) || 0 });
        const ret = _origWriteln.apply(this, arguments);
        installDocumentListeners();
        return ret;
      };
    } catch (_e) {}
  }

  // Recursive relay: every frame (not just top) listens for __skillBridgeRelay__ messages
  // from child iframes, applies that child's bbox offset, then either delivers to
  // __skillReport (top frame) or forwards to its own parent (intermediate frames).
  // This handles arbitrarily nested cross-origin iframe chains (top → A → B → …).
  window.addEventListener("message", function (ev) {
    if (!ev.data || !ev.data.__skillBridgeRelay__) return;
    const relayPayload = ev.data.payload;
    try {
      const iframes = document.querySelectorAll("iframe");
      for (const f of iframes) {
        if (f.contentWindow === ev.source) {
          const r = f.getBoundingClientRect();
          const vp = relayPayload.visual_placeholder;
          if (vp && vp.bbox) {
            vp.bbox.x = (vp.bbox.x || 0) + Math.round(r.left);
            vp.bbox.y = (vp.bbox.y || 0) + Math.round(r.top);
          }
          break;
        }
      }
    } catch (_e) {}
    if (window === window.top) {
      const fn = window["__skillReport"];
      if (typeof fn === "function") fn(relayPayload);
    } else {
      try {
        window.parent.postMessage({ __skillBridgeRelay__: true, payload: relayPayload }, "*");
      } catch (_e) {}
    }
  });

  const CAP =
    typeof window !== "undefined" && window.__SKILL_CAPTURE_PROFILE__
      ? window.__SKILL_CAPTURE_PROFILE__
      : {};
  const OPTIONS =
    typeof window !== "undefined" && window.__SKILL_CAPTURE_OPTIONS__
      ? window.__SKILL_CAPTURE_OPTIONS__
      : {};
  const captureHover = OPTIONS.capture_hover === true;
  const cssDepthMax = Number(CAP.css_path_max_depth) > 0 ? Number(CAP.css_path_max_depth) : 8;
  const xpathDepthMax = Number(CAP.xpath_max_depth) > 0 ? Number(CAP.xpath_max_depth) : 10;
  const anchorCandMax = Number(CAP.anchor_candidates_max) > 0 ? Number(CAP.anchor_candidates_max) : 40;
  const classSliceMax = Number(CAP.class_slice_max) >= 0 ? Number(CAP.class_slice_max) : 2;
  const safeTextMaxEl = Number(CAP.safe_text_max) > 0 ? Number(CAP.safe_text_max) : 120;
  const pageFpMax = Number(CAP.page_fingerprint_slice) > 0 ? Number(CAP.page_fingerprint_slice) : 4000;
  const siblingsMax = Number(CAP.siblings_summarize_max) > 0 ? Number(CAP.siblings_summarize_max) : 6;
  const inputDebounceMs = Number(CAP.input_debounce_ms) > 0 ? Number(CAP.input_debounce_ms) : 350;
  const scrollDebounceMs = Number(CAP.scroll_debounce_ms) > 0 ? Number(CAP.scroll_debounce_ms) : 220;
  const clickSettleQuietMs = Number(CAP.click_settle_quiet_ms) > 0 ? Number(CAP.click_settle_quiet_ms) : 20;
  const clickSettleMaxMs = Number(CAP.click_settle_max_ms) > 0 ? Number(CAP.click_settle_max_ms) : 250;
  function djb2(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 33) ^ str.charCodeAt(i);
    }
    return (hash >>> 0).toString(16);
  }

  function pageFingerprint() {
    const href = location.href;
    const title = document.title || "";
    const text = (document.documentElement && document.documentElement.innerText) || "";
    const norm = text.replace(/\s+/g, " ").trim().slice(0, pageFpMax);
    return `${href}|${title}|${djb2(norm)}`;
  }

  function safeText(el, maxLen) {
    if (!el || !el.innerText) return "";
    return String(el.innerText).replace(/\s+/g, " ").trim().slice(0, maxLen);
  }

  function nodeAsElement(node) {
    if (!node) return null;
    if (node.nodeType === 1) return node;
    if (node.parentElement && node.parentElement.nodeType === 1) return node.parentElement;
    if (node.host && node.host.nodeType === 1) return node.host;
    return null;
  }

  function eventTargetFromPath(ev) {
    if (ev && typeof ev.composedPath === "function") {
      const path = ev.composedPath();
      for (const node of path) {
        const el = nodeAsElement(node);
        if (el && el !== document.documentElement && el !== document.body) return el;
      }
    }
    return nodeAsElement(ev && ev.target);
  }

  function parentOrHost(el) {
    if (!el || el.nodeType !== 1) return null;
    return el.parentElement || (el.getRootNode && el.getRootNode().host) || null;
  }

  function cssEscapeIdent(s) {
    if (window.CSS && CSS.escape) return CSS.escape(s);
    return String(s).replace(/[^a-zA-Z0-9_-]/g, (c) => "\\" + c);
  }

  function nodeRole(n) {
    return ((n && n.getAttribute && n.getAttribute("role")) || "").toLowerCase();
  }

  function inputTypeOf(el) {
    return ((el && el.getAttribute && el.getAttribute("type")) || "").toLowerCase();
  }

  function isTextInputType(type) {
    const t = (type || "text").toLowerCase();
    return ["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"].indexOf(t) < 0;
  }

  function isContentEditableNode(el) {
    if (!el || !el.getAttribute) return false;
    const attr = el.getAttribute("contenteditable");
    return el.isContentEditable || attr === "" || attr === "true" || attr === "plaintext-only";
  }

  function isEditableNode(el) {
    if (!el || el.nodeType !== 1) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === "textarea" || tag === "select") return true;
    if (tag === "input") return isTextInputType(inputTypeOf(el));
    if (isContentEditableNode(el)) return true;
    const r = nodeRole(el);
    return r === "textbox" || r === "searchbox" || r === "combobox";
  }

  function findEditableDescendant(root, depth) {
    if (!root || depth > 3) return null;
    if (root.nodeType !== 1 && root.nodeType !== 11) return null;
    if (root.shadowRoot) {
      const shadowHit = findEditableDescendant(root.shadowRoot, depth + 1);
      if (shadowHit) return shadowHit;
    }
    const queryRoot = root.querySelectorAll ? root : null;
    if (!queryRoot) return null;
    const candidates = queryRoot.querySelectorAll(
      'input,textarea,select,[contenteditable],[role="textbox"],[role="searchbox"],[role="combobox"]'
    );
    for (const candidate of candidates) {
      if (isEditableNode(candidate)) return candidate;
      if (candidate.shadowRoot) {
        const shadowNested = findEditableDescendant(candidate.shadowRoot, depth + 1);
        if (shadowNested) return shadowNested;
      }
    }
    return null;
  }

  function resolveEditableTarget(el) {
    if (!el || el.nodeType !== 1) return null;
    if (isEditableNode(el)) {
      if (nodeRole(el) === "combobox") {
        return findEditableDescendant(el, 0) || el;
      }
      return el;
    }
    const direct = findEditableDescendant(el, 0);
    if (direct) return direct;
    let cur = parentOrHost(el);
    for (let depth = 0; depth < 14 && cur; depth++) {
      if (isEditableNode(cur)) {
        if (nodeRole(cur) === "combobox") {
          return findEditableDescendant(cur, 0) || cur;
        }
        return cur;
      }
      if (nodeRole(cur) === "combobox") {
        const nested = findEditableDescendant(cur, 0);
        if (nested) return nested;
      }
      const tag = cur.tagName ? cur.tagName.toLowerCase() : "";
      if (tag === "body" || tag === "html") break;
      cur = parentOrHost(cur);
    }
    return null;
  }

  function readEditableValue(el) {
    if (!el) return "";
    const nested = nodeRole(el) === "combobox" ? findEditableDescendant(el, 0) : null;
    const target = nested || el;
    if ("value" in target) return target.value == null ? "" : String(target.value);
    const ariaValue = target.getAttribute && (target.getAttribute("aria-valuetext") || target.getAttribute("aria-value"));
    if (ariaValue != null) return String(ariaValue);
    return String(target.innerText || target.textContent || "");
  }

  function isSensitiveEditable(el) {
    if (!el || !el.getAttribute) return false;
    if (inputTypeOf(el) === "password") return true;
    const haystack = [
      el.getAttribute("autocomplete"),
      el.getAttribute("name"),
      el.getAttribute("id"),
      el.getAttribute("aria-label"),
      el.getAttribute("placeholder"),
    ].join(" ").toLowerCase();
    return /\b(pass(word|code|phrase)?|otp|secret)\b/.test(haystack);
  }

  function editableComparisonValue(el) {
    const raw = readEditableValue(el);
    if (isSensitiveEditable(el)) return `sensitive:${String(raw).length}`;
    return String(raw);
  }

  function isInteractiveNode(n) {
    if (!n || n.nodeType !== 1) return false;
    const tag = n.tagName.toLowerCase();
    if (tag === "button" || tag === "a" || tag === "input" || tag === "textarea" || tag === "select") {
      return true;
    }
    const r = ((n.getAttribute && n.getAttribute("role")) || "").toLowerCase();
    if (
      ["button", "link", "textbox", "checkbox", "radio", "switch", "tab", "menuitem", "option", "combobox"].indexOf(
        r
      ) >= 0
    ) {
      return true;
    }
    if (tag === "label" && n.htmlFor) return true;
    if (isEditableNode(n)) return true;
    if (n.hasAttribute && (n.hasAttribute("onclick") || n.hasAttribute("aria-haspopup") || n.hasAttribute("aria-expanded") || n.hasAttribute("aria-controls"))) {
      return true;
    }
    const tabIndex = n.getAttribute && n.getAttribute("tabindex");
    if (tabIndex !== null && tabIndex !== "-1") return true;
    if ((tag === "div" || tag === "span") && n.getAttribute && n.getAttribute("data-action")) return true;
    return false;
  }

  /** Resolve clicks on svg/path/shallow divs to the control the user meant (button, link, input, …). */
  function resolveMeaningfulTarget(el) {
    if (!el || el.nodeType !== 1) return null;
    let cur = el;
    for (let depth = 0; depth < 14 && cur; depth++) {
      if (isInteractiveNode(cur)) return cur;
      const tag = cur.tagName ? cur.tagName.toLowerCase() : "";
      if (tag === "body" || tag === "html") break;
      cur = parentOrHost(cur);
    }
    return null;
  }

  function buildCssPath(el) {
    if (!el || el.nodeType !== 1) return "";
    const parts = [];
    let cur = el;
    let depth = 0;
    while (cur && cur.nodeType === 1 && depth < cssDepthMax) {
      let part = cur.tagName.toLowerCase();
      if (cur.id) {
        part = "#" + cssEscapeIdent(cur.id);
        parts.unshift(part);
        break;
      }
      if (cur.classList && cur.classList.length) {
        const cls = Array.from(cur.classList)
          .slice(0, classSliceMax)
          .map((c) => "." + cssEscapeIdent(c))
          .join("");
        part += cls;
      }
      const parent = cur.parentElement;
      if (parent) {
        const sameTagSiblings = Array.from(parent.children).filter(
          (n) => n.tagName === cur.tagName
        );
        if (sameTagSiblings.length > 1) {
          const idx = sameTagSiblings.indexOf(cur) + 1;
          part += `:nth-of-type(${idx})`;
        }
      }
      parts.unshift(part);
      cur = parent;
      depth++;
    }
    return parts.join(" > ");
  }

  function buildXPath(el) {
    if (!el || el.nodeType !== 1) return "";
    const segs = [];
    let node = el;
    let depth = 0;
    while (node && node.nodeType === 1 && depth < xpathDepthMax) {
      let ix = 1;
      let sib = node.previousElementSibling;
      while (sib) {
        if (sib.tagName === node.tagName) ix++;
        sib = sib.previousElementSibling;
      }
      segs.unshift(`${node.tagName.toLowerCase()}[${ix}]`);
      node = node.parentElement;
      depth++;
    }
    return "/" + segs.join("/");
  }

  function buildTextSelector(el) {
    const t = safeText(el, 80);
    if (!t) return "";
    const esc = t.replace(/"/g, '\\"');
    return `text="${esc}"`;
  }

  // Stable selector: data-testid > aria-label > name > placeholder > text
  // Priority order matches runtime fingerprint scoring weights.
  function buildStableSelector(el) {
    const testIdAttr =
      el.hasAttribute("data-testid")  ? "data-testid"  :
      el.hasAttribute("data-test-id") ? "data-test-id" :
      el.hasAttribute("data-test")    ? "data-test"    :
      el.hasAttribute("data-cy")      ? "data-cy"      : null;
    if (testIdAttr) { const testId = el.getAttribute(testIdAttr); return `[${testIdAttr}="${testId}"]`; }
    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel) return `[aria-label="${ariaLabel.replace(/"/g, '\\"')}"]`;
    const name = el.getAttribute("name");
    if (name) {
      const tag = el.tagName.toLowerCase();
      return `${tag}[name="${name.replace(/"/g, '\\"')}"]`;
    }
    return null;
  }

  function implicitAriaRole(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === "input") {
      const t = (el.getAttribute("type") || "text").toLowerCase();
      if (t === "checkbox") return "checkbox";
      if (t === "radio") return "radio";
      if (t === "range") return "slider";
      if (t === "submit" || t === "button" || t === "reset") return "button";
      if (t === "search") return "searchbox";
      if (t === "number") return "spinbutton";
      return "textbox";
    }
    if (tag === "textarea") return "textbox";
    if (tag === "select") return el.hasAttribute("multiple") ? "listbox" : "combobox";
    if (tag === "button") return "button";
    if (tag === "a" && el.hasAttribute("href")) return "link";
    return null;
  }

  function buildAriaSelector(el) {
    // Try stable selector first
    const stable = buildStableSelector(el);
    if (stable) return stable;
    const explicitRole = el.getAttribute("role");
    const nonSemanticTags = { path: 1, svg: 1, g: 1, div: 1, span: 1, input: 1, textarea: 1, select: 1 };
    const role = explicitRole || implicitAriaRole(el);
    if (!role || nonSemanticTags[role]) return null;
    // Do NOT use safeText here: CSS [name=...] matches the HTML name attribute,
    // not element text content. Using text content produced selectors like
    // [role="button"][name="New"] that never match native <button> elements
    // whose role is implicit and whose text is not a name= attribute.
    // Text-content-based resolution is handled by the text_based and role
    // signals in identity_bundle (compiler/identity_bundle.py).
    const name =
      el.getAttribute("aria-label") ||
      el.getAttribute("name") ||
      el.getAttribute("placeholder");
    if (!name) return null;
    const esc = name.replace(/"/g, '\\"');
    return `[role="${role}"][name="${esc}"]`;
  }

  function nearestForm(el) {
    let n = el;
    while (n) {
      if (n.tagName && n.tagName.toLowerCase() === "form") {
        const id = n.id ? "#" + n.id : "";
        const nm = n.getAttribute("name") || "";
        return `form${id}${nm ? "[name=" + JSON.stringify(nm) + "]" : ""}`;
      }
      n = n.parentElement;
    }
    return null;
  }

  function parentSummary(el) {
    const p = el && el.parentElement;
    if (!p) return "";
    const tag = p.tagName.toLowerCase();
    const id = p.id ? "#" + p.id : "";
    const role = p.getAttribute("role");
    const r = role ? `[role=${role}]` : "";
    return `${tag}${id}${r}`;
  }

  function siblingSummaries(el, limit) {
    const p = el && el.parentElement;
    if (!p) return [];
    const out = [];
    for (const c of p.children) {
      if (c === el) continue;
      if (c.nodeType !== 1) continue;
      const tag = c.tagName.toLowerCase();
      const tid = c.id ? "#" + c.id : "";
      const txt = safeText(c, 40);
      out.push(`${tag}${tid}:${txt}`);
      if (out.length >= limit) break;
    }
    return out;
  }

  function indexInParent(el) {
    const p = el && el.parentElement;
    if (!p) return 0;
    return Array.prototype.indexOf.call(p.children, el);
  }

  const _SKIP_INTERACTIVE = new Set(["input", "button", "select", "textarea", "a", "option"]);

  function captureAssociatedLabel(el) {
    // 1. Standard: <label for="id">
    if (el.id) {
      try {
        const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (lab) return safeText(lab, 80);
      } catch (_) {}
    }
    // 2. Element nested inside <label>
    const ancestor = el.closest("label");
    if (ancestor) return safeText(ancestor, 80);
    // 3. aria-labelledby reference
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const ref = document.getElementById(labelledBy);
      if (ref) return safeText(ref, 80);
    }
    // 4. <label> sibling in parent
    const parent = el.parentElement;
    if (parent) {
      const lab = Array.from(parent.querySelectorAll("label")).find(l => l !== el && !l.contains(el));
      if (lab) return safeText(lab, 80);
      // 5. <label> sibling in grandparent
      const gp = parent.parentElement;
      if (gp) {
        const gpLab = Array.from(gp.querySelectorAll("label")).find(l => !l.contains(el));
        if (gpLab) return safeText(gpLab, 80);
      }
    }
    // 6. Walk up 4 levels — find nearest preceding sibling with short visible text.
    // Handles apps (e.g. Pipedrive) that use <div>/<span> as visual labels instead of <label>.
    let node = el;
    for (let depth = 0; depth < 8; depth++) {
      const container = node.parentElement;
      if (!container) break;
      const children = Array.from(container.children);
      const nodeIdx = children.indexOf(node);
      for (let i = nodeIdx - 1; i >= 0; i--) {
        const sib = children[i];
        if (!sib || sib.contains(el)) continue;
        if (_SKIP_INTERACTIVE.has(sib.tagName.toLowerCase())) continue;
        const txt = safeText(sib, 80);
        if (txt && txt.length >= 2 && txt.length <= 60) return txt;
      }
      node = container;
    }
    return null;
  }

  function pickAnchors(el) {
    const anchors = [];
    const rect = el.getBoundingClientRect();
    const candidates = Array.from(
      document.querySelectorAll(
        "main,nav,header,footer,[role=main],[role=navigation],[role=dialog],[aria-modal=true],h1,h2,h3,[data-testid],[data-section-title]"
      )
    ).slice(0, anchorCandMax);
    for (const c of candidates) {
      if (!c || c === el) continue;
      const r = c.getBoundingClientRect();
      let relation = "inside";
      if (c.contains && c.contains(el)) {
        relation = "inside";
      } else if (rect.top >= r.bottom) {
        relation = "above";
      } else if (rect.bottom <= r.top) {
        relation = "below";
      } else {
        relation = "inside";
      }
      const label = (
        c.getAttribute("aria-label") ||
        safeText(c, 60) ||
        c.tagName.toLowerCase()
      ).slice(0, 120);
      anchors.push({ element: label, relation });
      if (anchors.length >= 4) break;
    }
    if (!anchors.length && el.parentElement) {
      anchors.push({ element: parentSummary(el), relation: "inside" });
    }
    return anchors;
  }

  function normalizedText(el) {
    return safeText(el, 500).toLowerCase();
  }

  // Phase 2: capture full ancestor chain up to <body> for compile-time LLM context.
  // Returns array of {tag, id, classes, outer_html} from immediate parent up.
  function captureAncestors(el, maxDepth) {
    const max = maxDepth || 32;
    const out = [];
    let cur = el && el.parentElement;
    let depth = 0;
    // Detect if we're in a cross-origin frame by trying to access parent.location
    let isCrossOrigin = false;
    try {
      void window.parent.location.href;
    } catch (_e) {
      isCrossOrigin = true;
    }
    while (cur && cur.nodeType === 1 && depth < max) {
      const tag = (cur.tagName || "").toLowerCase();
      const id = cur.id || "";
      const classes = cur.classList ? Array.from(cur.classList).slice(0, 32) : [];
      // outer_html truncated to keep payload bounded; LLM compiler can request full blob if needed.
      let oh = "";
      let outerHtmlError = null;
      try {
        oh = (cur.outerHTML || "").slice(0, 2000);
      } catch (_e) {
        outerHtmlError = `cross_origin_iframe`;
      }
      const ancestor = { tag: tag, id: id, classes: classes, outer_html: oh };
      if (isCrossOrigin && depth === 0) {
        ancestor.cross_origin = true;
      }
      if (outerHtmlError) {
        ancestor.outer_html_error = outerHtmlError;
      }
      out.push(ancestor);
      if (tag === "body" || tag === "html") break;
      cur = cur.parentElement;
      depth++;
    }
    return out;
  }

  // Phase 2: extract visible text within a pixel radius of the element bbox.
  // Used by the LLM compiler to anchor selectors against nearby labels/headers.
  function captureSurroundingText(el, radiusPx) {
    const r = radiusPx || 200;
    const rect = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    if (!rect) return "";
    const elemTop = rect.top - r;
    const elemBot = rect.bottom + r;
    const elemLeft = rect.left - r;
    const elemRight = rect.right + r;
    const elemCenterX = (rect.left + rect.right) / 2;
    const elemCenterY = (rect.top + rect.bottom) / 2;
    const maxDist = 500;
    // Walk text nodes in the document; cheap heuristic for "near" via getBoundingClientRect of parent.
    const out = [];
    const totalCharBudget = 1500;
    const maxNodes = 2000;
    let used = 0;
    let nodeCount = 0;
    try {
      const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT, null);
      let node;
      while ((node = walker.nextNode()) && used < totalCharBudget && nodeCount < maxNodes) {
        nodeCount++;
        const text = (node.nodeValue || "").trim();
        if (text.length < 2) continue;
        const parent = node.parentElement;
        if (!parent) continue;
        if (parent === el || el.contains(parent)) continue;
        let pr;
        try { pr = parent.getBoundingClientRect(); } catch (_e) { continue; }
        if (!pr || (pr.width === 0 && pr.height === 0)) continue;
        if (pr.bottom < elemTop || pr.top > elemBot) continue;
        if (pr.right < elemLeft || pr.left > elemRight) continue;
        const prCenterX = (pr.left + pr.right) / 2;
        const prCenterY = (pr.top + pr.bottom) / 2;
        const dist = Math.sqrt(Math.pow(prCenterX - elemCenterX, 2) + Math.pow(prCenterY - elemCenterY, 2));
        if (dist > maxDist) continue;
        const chunk = text.slice(0, Math.min(200, totalCharBudget - used));
        out.push(chunk);
        used += chunk.length + 1;
      }
    } catch (_e) {}
    return out.join(" | ").slice(0, totalCharBudget);
  }

  // Phase 2: stable hash of the document's interactive surface for dedup-by-state.
  // Cheap djb2 over interactiveSignature() — the Python session computes the full sha256
  // from the captured outerHTML.
  function _domSignatureHash(sig) {
    let h = 5381;
    for (let i = 0; i < sig.length; i++) {
      h = ((h << 5) + h + sig.charCodeAt(i)) | 0;
    }
    return ("00000000" + (h >>> 0).toString(16)).slice(-8);
  }

  function intentHint(tag, type, role, _text) {
    const t = (type || "").toLowerCase();
    const r = (role || "").toLowerCase();
    if (t === "submit") return "commit_form";
    if (t === "search") return "search_query";
    if (r === "link" || tag === "a") return "navigate";
    if (tag === "button" || r === "button") return "activate_control";
    if (tag === "input" || tag === "textarea" || r === "textbox" || r === "searchbox") return "provide_input";
    if (tag === "select") return "choose_option";
    if (r === "combobox") return "choose_option";
    return "interact";
  }

  // DOM diff: lightweight snapshot of interactive element signatures for post-action comparison.
  // `root` scopes the query (defaults to the whole document) — used by conditional-state
  // detection below to fingerprint just the descendants of one container.
  function interactiveSignature(root) {
    const sels = 'button,a[href],input:not([type="hidden"]),select,textarea,[role="button"],[role="link"],[data-testid],[data-test-id]';
    const scope = root || document;
    const els = Array.from(scope.querySelectorAll(sels)).slice(0, 120);
    return els.map(el => {
      const tag = el.tagName.toLowerCase();
      const tid = el.getAttribute("data-testid") || el.getAttribute("data-test-id") || "";
      const al  = el.getAttribute("aria-label") || "";
      const txt = (el.innerText || el.value || "").trim().slice(0, 60);
      return `${tag}|${tid}|${al}|${txt}`;
    }).join("\n");
  }

  function serializeTarget(el, actionKind, value) {
    const tag = (el.tagName && el.tagName.toLowerCase()) || "unknown";
    const id = el.id || null;
    const classes = el.classList ? Array.from(el.classList) : [];
    const innerText = safeText(el, 2000);
    const role = el.getAttribute("role") || implicitAriaRole(el);
    const aria = el.getAttribute("aria-label");
    const name = el.getAttribute("name");
    const inputType = el.getAttribute("type") || (isEditableNode(el) && tag !== "select" ? "text" : null);
    const rect = el.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset || 0;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const viewport = `${Math.round(window.innerWidth)}x${Math.round(window.innerHeight)}`;
    const scroll_position = `${Math.round(scrollX)},${Math.round(scrollY)}`;
    // Viewport-relative box so Python can crop the viewport screenshot deterministically.
    const bbox = {
      x: Math.max(0, Math.round(rect.left)),
      y: Math.max(0, Math.round(rect.top)),
      w: Math.max(0, Math.round(rect.width)),
      h: Math.max(0, Math.round(rect.height)),
    };
    const semantic = {
      normalized_text: normalizedText(el),
      role: role || tag,
      input_type: inputType,
      intent_hint: intentHint(tag, inputType, role, innerText.toLowerCase()),
    };
    const selectors = {
      css: buildCssPath(el),
      xpath: buildXPath(el),
      text_based: buildTextSelector(el),
      aria: buildAriaSelector(el),
    };
    const context = {
      parent: parentSummary(el),
      siblings: siblingSummaries(el, siblingsMax),
      index_in_parent: indexInParent(el),
      form_context: nearestForm(el),
    };
    const anchors = pickAnchors(el);
    const page = { url: location.href, title: document.title || "" };
    const before = pageFingerprint();
    // Conditional-state observation (recording-next-steps.md Priority 2): does this action's
    // target sit inside an optional interstitial (dialog / cookie-consent banner)? Observed only
    // — the recorder never probes for these, it just flags what it saw. Human-gated in Studio:
    // this never changes compiled behavior on its own (see build.py), only surfaces a suggestion.
    let branchHint = null;
    try { branchHint = buildBranchHint(el); } catch (_e) {}
    // Phase 2 signals (compile-time LLM input). Failures fall back to empty defaults.
    let ancestorsChain = [];
    let surroundingText = "";
    let domSigShort = "";
    try { ancestorsChain = captureAncestors(el, 24); } catch (_e) {}
    try { surroundingText = captureSurroundingText(el, 200); } catch (_e) {}
    try { domSigShort = _domSignatureHash(interactiveSignature()); } catch (_e) {}
    return {
      action: {
        action: actionKind,
        timestamp: new Date().toISOString(),
        value: value == null ? null : String(value),
      },
      target: {
        tag,
        id,
        classes,
        inner_text: innerText,
        role,
        aria_label: aria,
        name,
        placeholder: el.getAttribute("placeholder") || null,
        label_text: captureAssociatedLabel(el),
      },
      selectors,
      context,
      semantic,
      anchors,
      visual_placeholder: {
        bbox,
        viewport,
        scroll_position,
      },
      page,
      optionality: branchHint ? "stochastic" : null,
      branch_hint: branchHint,
      // Evidence for post-condition classification at finalize (finalizeStateWithAfter) — never
      // serialized: state_probe (including the raw `el` ref) is deleted before report().
      state_probe: {
        before,
        dom_before: interactiveSignature(),
        el,
        dialog_before: !!_queryOpenDialog(),
        expanded_before: el.getAttribute ? el.getAttribute("aria-expanded") : null,
      },
      // Phase 2: compile-time signals for LLM selector generation.
      ancestors: ancestorsChain,
      surrounding_text: surroundingText,
      dom_signature_short: domSigShort,
    };
  }

  function report(payload) {
    const fn = window["__skillReport"];
    if (typeof fn === "function") {
      return fn(payload);
    }
    // Fallback for iframes where the Playwright binding isn't available
    if (window !== window.top) {
      try {
        window.parent.postMessage({ __skillBridgeRelay__: true, payload }, "*");
      } catch (_e) {}
    }
  }

  function finalizeState(payload) {
    const after = pageFingerprint();
    return finalizeStateWithAfter(payload, after);
  }

  // Click (and click-family: dblclick/right_click) is the action most likely to trigger a
  // meaningful DOM change — a dropdown, panel, or dialog appearing — but the click listener runs
  // in the CAPTURE phase, before the page's own bubble-phase handler (e.g. React's delegated
  // onClick) has even fired, let alone re-rendered. Calling finalizeState() synchronously there
  // always diffs the page against itself: dom_diff comes back empty on effectively every click.
  // Wait for the DOM to go quiet (or a max ceiling, for network-driven updates that never fully
  // settle) before capturing the "after" snapshot, mirroring the existing hover/drag_drop
  // deferral pattern below but with an actual mutation-based settle instead of a fixed frame.
  let _finalizeQueue = Promise.resolve();

  function _waitForDomSettle(quietMs, maxWaitMs) {
    return new Promise((resolve) => {
      let done = false;
      let quietTimer = null;
      let mo = null;
      function finish() {
        if (done) return;
        done = true;
        if (quietTimer) clearTimeout(quietTimer);
        clearTimeout(maxTimer);
        try { mo && mo.disconnect(); } catch (_e) {}
        resolve();
      }
      function scheduleQuiet() {
        if (quietTimer) clearTimeout(quietTimer);
        quietTimer = setTimeout(finish, quietMs);
      }
      const maxTimer = setTimeout(finish, maxWaitMs);
      try {
        mo = new MutationObserver(scheduleQuiet);
        mo.observe(document.documentElement || document, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true,
        });
      } catch (_e) {
        mo = null;
      }
      scheduleQuiet();
    });
  }

  // Finalizes in submission order (not completion order) so two fast clicks in a row can never
  // have their state_change/dom_diff reported out of sequence.
  // Pending payloads are tracked so beforeunload can force-flush them (see below) — otherwise a
  // click that triggers fast navigation races the settle wait and the step is silently dropped.
  let _pendingClickPayloads = [];
  function finalizeStateAfterSettle(payload, quietMs, maxWaitMs) {
    _pendingClickPayloads.push(payload);
    _finalizeQueue = _finalizeQueue
      .then(() => _waitForDomSettle(quietMs, maxWaitMs))
      .then(() => {
        _pendingClickPayloads = _pendingClickPayloads.filter((p) => p !== payload);
        if (payload.__flushed) return;
        finalizeState(payload);
      })
      .catch(() => {});
    return _finalizeQueue;
  }

  function finalizeStateWithAfter(payload, after) {
    const domAfter = interactiveSignature();
    const domBefore = payload.state_probe && payload.state_probe.dom_before ? payload.state_probe.dom_before : "";
    payload.state_change = {
      before: payload.state_probe.before,
      after,
      // DOM diff: elements added/removed since the action fired
      dom_diff: _computeDomDiff(domBefore, domAfter),
    };
    // Feed the recent-appearance ring buffer (Priority 2) — a second consumer of this same
    // dom_diff, used by the *next* action's detectOptionalContainer to tell "just appeared" from
    // "was always there".
    _rememberDomDiffAdded(payload.state_change.dom_diff);
    // Post-condition distillation (recording-next-steps.md Priority 1): classify the delta we
    // already captured above into a small structured signal the compiler can turn into a
    // *specific* assertion (dialog opened / value committed / navigated) instead of a generic
    // state-change check. Plain DOM reads only — no LLM, no new capture pass.
    try {
      payload.post_condition = buildPostCondition(payload, payload.state_probe);
    } catch (_e) {
      payload.post_condition = null;
    }
    delete payload.state_probe;
    return report(payload);
  }

  function _computeDomDiff(before, after) {
    if (!before && !after) return null;
    const beforeSet = new Set((before || "").split("\n").filter(Boolean));
    const afterSet  = new Set((after || "").split("\n").filter(Boolean));
    const added   = Array.from(afterSet).filter(l => !beforeSet.has(l)).slice(0, 20);
    const removed = Array.from(beforeSet).filter(l => !afterSet.has(l)).slice(0, 20);
    if (!added.length && !removed.length) return null;
    return { added, removed };
  }

  function _queryOpenDialog() {
    try {
      return document.querySelector('[role="dialog"],[aria-modal="true"]');
    } catch (_e) {
      return null;
    }
  }

  // Action kinds whose direct effect is "the field now holds a committed value" — the enforced
  // post-condition for these is what the field reads back as, not the generic DOM delta.
  const _VALUE_SET_ACTIONS = ["type", "fill", "select", "select_option", "set_checkbox", "set_radio", "date_pick"];

  /** Stable, Playwright-usable selector for a dialog/interstitial container (id > stable attrs >
   * role > full CSS path) — feeds the compiler's selector_present assertion. */
  function buildDialogSignal(dialogEl) {
    if (!dialogEl || dialogEl.nodeType !== 1) return null;
    if (dialogEl.id) return "#" + cssEscapeIdent(dialogEl.id);
    const stable = buildStableSelector(dialogEl);
    if (stable) return stable;
    const role = dialogEl.getAttribute("role") || (dialogEl.getAttribute("aria-modal") === "true" ? "dialog" : null);
    if (role) return `[role="${role}"]`;
    return buildCssPath(dialogEl) || null;
  }

  /** Classify the already-captured before/after evidence into one small structured signal.
   * Priority order (single classified_effect per event, most specific first): navigation >
   * dialog open/close > aria-expanded flip > value commit > generic content change > none. */
  function buildPostCondition(payload, probe) {
    const actionKind = payload.action && payload.action.action;
    const el = probe && probe.el;
    const beforeUrl = (payload.page && payload.page.url) || "";
    const afterUrl = location.href;

    let classified_effect = "none";
    let value_readback = null;
    let url_delta = null;
    let dialog_signal = null;

    if (afterUrl !== beforeUrl) {
      classified_effect = "navigation";
      url_delta = { before: beforeUrl, after: afterUrl };
    } else {
      const dialogNow = _queryOpenDialog();
      const dialogWasOpen = !!(probe && probe.dialog_before);
      if (!!dialogNow !== dialogWasOpen) {
        classified_effect = dialogNow ? "dialog_opened" : "dialog_closed";
        if (dialogNow) {
          try { dialog_signal = buildDialogSignal(dialogNow); } catch (_e) {}
        }
      } else if (
        el && el.getAttribute && probe &&
        probe.expanded_before !== el.getAttribute("aria-expanded")
      ) {
        classified_effect = "expansion";
      } else if (_VALUE_SET_ACTIONS.indexOf(actionKind) >= 0) {
        classified_effect = "value_set";
        if (el) {
          try {
            value_readback = isSensitiveEditable(el) ? "{{REDACTED}}" : readEditableValue(el);
          } catch (_e) {}
        }
      } else if (payload.state_change && payload.state_change.dom_diff) {
        classified_effect = "content_change";
      }
    }

    return { classified_effect, value_readback, url_delta, dialog_signal };
  }

  // ─── Conditional-state observation (recording-next-steps.md Priority 2) ───────────────────
  // Ring buffer of recently-added interactive-element signatures (fed by P1's dom_diff.added,
  // one entry per finalized action) — lets a later action's container detection distinguish
  // "this banner just appeared" from "this banner was always on the page".
  const _RECENT_ADDED_MAX = 5;
  let _recentAddedSets = [];

  function _rememberDomDiffAdded(domDiff) {
    if (!domDiff || !domDiff.added || !domDiff.added.length) return;
    _recentAddedSets.push(new Set(domDiff.added));
    if (_recentAddedSets.length > _RECENT_ADDED_MAX) _recentAddedSets.shift();
  }

  // true = confirmed recently added; false = ring buffer had data but no overlap; null =
  // unconfirmable (empty buffer, e.g. first action of the session, or container has no
  // interactive descendants to fingerprint) — callers treat null like true (harmless to stamp).
  function _containerAppearedRecently(containerEl) {
    if (!_recentAddedSets.length) return null;
    let sig = "";
    try { sig = interactiveSignature(containerEl); } catch (_e) { return null; }
    const lines = sig.split("\n").filter(Boolean);
    if (!lines.length) return null;
    for (const set of _recentAddedSets) {
      for (const line of lines) {
        if (set.has(line)) return true;
      }
    }
    return false;
  }

  // Small, legible heuristic list — real-world consent/banner tooling id/class tokens.
  const _OPTIONAL_BANNER_TOKENS = /\b(cookie|consent|gdpr|onetrust|truste|banner)\b/i;

  function _optionalContainerStrength(node) {
    if (!node || node.nodeType !== 1 || !node.getAttribute) return null;
    const role = (node.getAttribute("role") || "").toLowerCase();
    const ariaModal = (node.getAttribute("aria-modal") || "").toLowerCase();
    if (role === "dialog" || ariaModal === "true") return "dialog";
    const haystack = `${node.id || ""} ${node.className || ""}`.toLowerCase();
    if (_OPTIONAL_BANNER_TOKENS.test(haystack)) return "banner";
    return null;
  }

  /** Walk up from el (bounded) looking for a dialog/consent-banner container. Returns
   * {containerEl, container_signal, strength} or null. Observation only — never probes,
   * never clicks anything; just reports what the human's own action happened to be inside of. */
  function detectOptionalContainer(el) {
    let cur = el;
    for (let depth = 0; depth < 10 && cur; depth++) {
      const strength = _optionalContainerStrength(cur);
      if (strength) {
        return { containerEl: cur, container_signal: buildDialogSignal(cur), strength };
      }
      const tag = cur.tagName ? cur.tagName.toLowerCase() : "";
      if (tag === "body" || tag === "html") break;
      cur = cur.parentElement;
    }
    return null;
  }

  /** {kind: "try_dismiss", container_signal} when the target sits inside an optional
   * interstitial, else null. `role=dialog`/`aria-modal` is high-confidence on its own; a plain
   * id/class banner-token match is confirmed against the recent-appearance ring buffer when
   * there's data to check against — unconfirmable or confirmed cases still stamp (false
   * positives are harmless: an unconfirmed hint compiles to a required step, exactly as today,
   * until a human confirms it in Human Edit — see build.py). */
  function buildBranchHint(el) {
    const found = detectOptionalContainer(el);
    if (!found) return null;
    if (found.strength === "banner" && _containerAppearedRecently(found.containerEl) === false) {
      return null;
    }
    return { kind: "try_dismiss", container_signal: found.container_signal };
  }

  let inputTimer = null;
  let lastInputEl = null;
  const lastEditableValueByElement = new WeakMap();

  function emitEditableChange(el, force) {
    const target = resolveEditableTarget(el);
    if (!target) return;
    const compareValue = editableComparisonValue(target);
    const previous = lastEditableValueByElement.get(target);
    if (!force && previous === compareValue) return;
    lastEditableValueByElement.set(target, compareValue);
    const value = isSensitiveEditable(target) ? "{{REDACTED}}" : readEditableValue(target);
    const p = serializeTarget(target, "type", value);
    p.action.value = value;
    finalizeState(p);
  }

  function scheduleInputFlush(el, force) {
    const target = resolveEditableTarget(el);
    if (!target) return;
    lastInputEl = target;
    if (inputTimer) clearTimeout(inputTimer);
    inputTimer = setTimeout(() => {
      inputTimer = null;
      const target = lastInputEl;
      if (!target) return;
      emitEditableChange(target, !!force);
    }, inputDebounceMs);
  }

  function rememberEditableBaseline(el) {
    const target = resolveEditableTarget(el);
    if (!target) return;
    lastEditableValueByElement.set(target, editableComparisonValue(target));
  }

  function deepActiveElement(root) {
    let active = (root || document).activeElement;
    for (let depth = 0; depth < 8 && active && active.shadowRoot && active.shadowRoot.activeElement; depth++) {
      active = active.shadowRoot.activeElement;
    }
    return active;
  }

  function activeEditableTarget() {
    return resolveEditableTarget(deepActiveElement(document));
  }

  onDoc(
    "click",
    (ev) => {
      trace("event", { t: "click" });
      let el = eventTargetFromPath(ev);
      if (!el || el.nodeType !== 1) return;
      const resolved = resolveMeaningfulTarget(el);
      if (resolved) {
        flushPendingHoverBeforeClick(resolved);
        const p = serializeTarget(resolved, "click", null);
        finalizeStateAfterSettle(p, clickSettleQuietMs, clickSettleMaxMs);
        return;
      }
    },
    true
  );

  onDoc(
    "change",
    (ev) => {
      const el = eventTargetFromPath(ev);
      if (!el || el.nodeType !== 1) return;
      const editable = resolveEditableTarget(el);
      const target = editable || el;
      const tag = target.tagName.toLowerCase();
      if (tag === "select") {
        const val = "value" in target ? target.value : null;
        const p = serializeTarget(target, "select", val);
        finalizeState(p);
        return;
      }
      if (tag === "input") {
        const inputType = (target.getAttribute("type") || "text").toLowerCase();
        if (inputType === "file") {
          const files = Array.from(target.files || []).map(function(f) {
            return { name: f.name, size: f.size, type: f.type };
          });
          const p = serializeTarget(target, "upload_intent", JSON.stringify(files));
          finalizeState(p);
          return;
        }
        if (inputType === "checkbox") {
          const p = serializeTarget(target, "set_checkbox", target.checked ? "true" : "false");
          finalizeState(p);
          return;
        }
        if (inputType === "radio") {
          const p = serializeTarget(target, "set_radio", target.value);
          finalizeState(p);
          return;
        }
        if (["date", "datetime-local", "time", "month", "week"].indexOf(inputType) >= 0) {
          const p = serializeTarget(target, "date_pick", target.value);
          finalizeState(p);
          return;
        }
        scheduleInputFlush(target);
        return;
      }
      if (editable) {
        scheduleInputFlush(editable);
      }
    },
    true
  );

  onDoc(
    "beforeinput",
    (ev) => {
      trace("event", { t: "beforeinput" });
      const editable = resolveEditableTarget(eventTargetFromPath(ev)) || activeEditableTarget();
      if (editable) scheduleInputFlush(editable);
    },
    true
  );

  onDoc(
    "input",
    (ev) => {
      trace("event", { t: "input" });
      const editable = resolveEditableTarget(eventTargetFromPath(ev));
      if (editable) scheduleInputFlush(editable);
    },
    true
  );

  onDoc(
    "keyup",
    () => {
      const editable = activeEditableTarget();
      if (editable) scheduleInputFlush(editable);
    },
    true
  );

  onDoc(
    "focusin",
    (ev) => {
      trace("event", { t: "focusin" });
      rememberEditableBaseline(eventTargetFromPath(ev));
    },
    true
  );

  onDoc(
    "focusout",
    (ev) => {
      trace("event", { t: "focusout" });
      const editable = resolveEditableTarget(eventTargetFromPath(ev));
      if (editable) emitEditableChange(editable, false);
    },
    true
  );

  let scrollTimer = null;
  window.addEventListener(
    "scroll",
    () => {
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        scrollTimer = null;
        const el = document.documentElement;
        const p = serializeTarget(el, "scroll", null);
        p.visual_placeholder.bbox = { x: 0, y: 0, w: 0, h: 0 };
        finalizeState(p);
      }, scrollDebounceMs);
    },
    { passive: true }
  );

  onDoc(
    "dblclick",
    (ev) => {
      let el = eventTargetFromPath(ev);
      if (!el || el.nodeType !== 1) return;
      const resolved = resolveMeaningfulTarget(el);
      if (!resolved) return;
      const p = serializeTarget(resolved, "dblclick", null);
      finalizeStateAfterSettle(p, clickSettleQuietMs, clickSettleMaxMs);
    },
    true
  );

  onDoc(
    "contextmenu",
    (ev) => {
      let el = eventTargetFromPath(ev);
      if (!el || el.nodeType !== 1) return;
      const resolved = resolveMeaningfulTarget(el) || el;
      const p = serializeTarget(resolved, "right_click", null);
      finalizeStateAfterSettle(p, clickSettleQuietMs, clickSettleMaxMs);
    },
    true
  );

  // Smart hover: record only when hovering a candidate reveals/enables actionable UI.
  const hoverDwellMs = Number(CAP.hover_dwell_ms) > 0 ? Number(CAP.hover_dwell_ms) : 400;
  const hoverActionableLimit = Number(CAP.hover_actionable_limit) > 0 ? Number(CAP.hover_actionable_limit) : 160;
  const hoverLocalLimit = Number(CAP.hover_local_limit) > 0 ? Number(CAP.hover_local_limit) : 60;
  const hoverOverlayLimit = Number(CAP.hover_overlay_limit) > 0 ? Number(CAP.hover_overlay_limit) : 80;
  const hoverActionableSelector = [
    "a[href]",
    "button",
    "input:not([type='hidden'])",
    "textarea",
    "select",
    "summary",
    "[role='button']",
    "[role='link']",
    "[role='menuitem']",
    "[role='menuitemcheckbox']",
    "[role='menuitemradio']",
    "[role='option']",
    "[role='tab']",
    "[role='treeitem']",
    "[role='combobox']",
    "[role='checkbox']",
    "[role='radio']",
    "[role='switch']",
    "[aria-haspopup]",
    "[aria-expanded]",
    "[onclick]",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");
  const hoverOverlaySelector = [
    "[role='menu']",
    "[role='menubar']",
    "[role='listbox']",
    "[role='dialog']",
    "[role='tooltip']",
    "[role='tree']",
    "[role='navigation']",
    "[aria-modal='true']",
    "[popover]",
    "aside",
    "details[open]",
  ].join(",");
  let hoverTimer = null;
  let pendingHover = null;
  let lastStableHoverSnapshot = null;
  let hoverBaselineTimer = null;

  function elementClassString(el) {
    if (!el) return "";
    if (typeof el.className === "string") return el.className;
    if (el.classList && el.classList.length) return Array.from(el.classList).join(" ");
    return "";
  }

  function elementTokenString(el) {
    if (!el || !el.getAttribute) return "";
    return [
      el.id || "",
      elementClassString(el),
      el.getAttribute("data-testid") || el.getAttribute("data-test-id") || "",
      el.getAttribute("data-test") || "",
      el.getAttribute("aria-label") || "",
      el.getAttribute("title") || "",
    ].join(" ");
  }

  function hasToken(el, pattern) {
    return pattern.test(elementTokenString(el));
  }

  function isVisibleElement(el) {
    if (!el || el.nodeType !== 1 || !el.isConnected) return false;
    const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
    if (style) {
      if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
      if (Number(style.opacity) === 0) return false;
    }
    const rects = el.getClientRects ? el.getClientRects() : [];
    if (!rects || !rects.length) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    const vw = window.innerWidth || document.documentElement.clientWidth || 0;
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    return rect.bottom >= 0 && rect.right >= 0 && rect.top <= vh && rect.left <= vw;
  }

  function isSignatureActionableNode(el) {
    if (!el || el.nodeType !== 1) return false;
    const tag = el.tagName.toLowerCase();
    if (["a", "button", "input", "textarea", "select", "summary"].indexOf(tag) >= 0) return true;
    const r = nodeRole(el);
    if (
      [
        "button",
        "link",
        "menuitem",
        "menuitemcheckbox",
        "menuitemradio",
        "option",
        "tab",
        "treeitem",
        "combobox",
        "checkbox",
        "radio",
        "switch",
      ].indexOf(r) >= 0
    ) {
      return true;
    }
    if (el.hasAttribute("aria-haspopup") || el.hasAttribute("aria-expanded")) return true;
    if (el.hasAttribute("onclick")) return true;
    const tabIndex = el.getAttribute("tabindex");
    return tabIndex !== null && tabIndex !== "-1";
  }

  function isOverlayLikeNode(el) {
    if (!el || el.nodeType !== 1) return false;
    const tag = el.tagName.toLowerCase();
    const r = nodeRole(el);
    if (["menu", "menubar", "listbox", "dialog", "tooltip", "tree", "navigation"].indexOf(r) >= 0) return true;
    if (tag === "aside" || tag === "details") return true;
    if (el.hasAttribute("popover") || el.getAttribute("aria-modal") === "true") return true;
    return hasToken(el, /\b(menu|menubar|submenu|dropdown|drop-down|popover|flyout|drawer|sidebar|side-nav|sidenav|overlay|mega-menu)\b/i);
  }

  function hoverTargetKey(el) {
    if (!el || el.nodeType !== 1) return "";
    return [
      el.tagName.toLowerCase(),
      el.id || "",
      nodeRole(el),
      el.getAttribute("aria-label") || "",
      el.getAttribute("name") || "",
      safeText(el, 80),
      buildCssPath(el),
    ].join("|");
  }

  function stableElementSignature(el) {
    if (!el || el.nodeType !== 1) return "";
    return [
      el.tagName.toLowerCase(),
      el.id ? "#" + el.id : "",
      nodeRole(el),
      el.getAttribute("aria-label") || "",
      el.getAttribute("name") || "",
      el.getAttribute("href") || "",
      safeText(el, 60),
      buildCssPath(el),
    ].join("|");
  }

  function collectVisibleMatches(root, selector, predicate, limit) {
    const out = [];
    const seen = new WeakSet();
    const push = (el) => {
      if (!el || el.nodeType !== 1 || seen.has(el) || out.length >= limit) return;
      seen.add(el);
      if (isVisibleElement(el) && (!predicate || predicate(el))) out.push(el);
    };
    const scan = (scanRoot) => {
      if (!scanRoot || out.length >= limit) return;
      if (scanRoot.nodeType === 1 && scanRoot.matches) {
        try {
          if (scanRoot.matches(selector)) push(scanRoot);
        } catch (_err) {
          return;
        }
      }
      if (scanRoot.querySelectorAll) {
        let matches = [];
        try {
          matches = Array.from(scanRoot.querySelectorAll(selector));
        } catch (_err) {
          matches = [];
        }
        for (const el of matches) {
          push(el);
          if (out.length >= limit) break;
        }
        for (const el of matches) {
          if (out.length >= limit) break;
          if (el.shadowRoot) scan(el.shadowRoot);
        }
      }
    };
    scan(root || document);
    return out;
  }

  function signatureLines(elements) {
    const lines = [];
    const seen = new Set();
    for (const el of elements) {
      const sig = stableElementSignature(el);
      if (!sig || seen.has(sig)) continue;
      seen.add(sig);
      lines.push(sig);
    }
    return lines.sort();
  }

  function lineSet(snapshotValue) {
    if (!snapshotValue) return new Set();
    return new Set(String(snapshotValue).split("\n").filter(Boolean));
  }

  function addedLines(beforeValue, afterValue) {
    const before = lineSet(beforeValue);
    return Array.from(lineSet(afterValue)).filter((line) => !before.has(line));
  }

  function controlledHoverRoots(target) {
    const roots = [];
    if (!target || !target.getAttribute) return roots;
    const raw = target.getAttribute("aria-controls") || target.getAttribute("aria-owns") || "";
    for (const id of raw.split(/\s+/).filter(Boolean)) {
      const found = document.getElementById(id);
      if (found) roots.push(found);
    }
    return roots;
  }

  function adjacentHoverRoots(target) {
    const roots = [];
    if (!target || target.nodeType !== 1) return roots;
    roots.push(target);
    for (const controlled of controlledHoverRoots(target)) roots.push(controlled);
    const parent = target.parentElement;
    if (parent) roots.push(parent);
    const grand = parent && parent.parentElement;
    if (grand && (isOverlayLikeNode(grand) || isNavigationRegion(grand))) roots.push(grand);
    if (target.nextElementSibling) roots.push(target.nextElementSibling);
    if (target.previousElementSibling) roots.push(target.previousElementSibling);
    return roots;
  }

  function localActionableSignature(target) {
    if (!target || target.nodeType !== 1) return "";
    const lines = [];
    const seen = new Set();
    for (const root of adjacentHoverRoots(target)) {
      const actionables = collectVisibleMatches(root, hoverActionableSelector, isSignatureActionableNode, hoverLocalLimit);
      for (const line of signatureLines(actionables)) {
        if (seen.has(line)) continue;
        seen.add(line);
        lines.push(line);
      }
      if (lines.length >= hoverLocalLimit) break;
    }
    return lines.sort().slice(0, hoverLocalLimit).join("\n");
  }

  function localOverlaySignature(target) {
    if (!target || target.nodeType !== 1) return "";
    const lines = [];
    const seen = new Set();
    for (const root of adjacentHoverRoots(target)) {
      const overlays = collectVisibleMatches(root, hoverOverlaySelector, isOverlayLikeNode, hoverLocalLimit);
      for (const line of signatureLines(overlays)) {
        if (seen.has(line)) continue;
        seen.add(line);
        lines.push(line);
      }
      if (lines.length >= hoverLocalLimit) break;
    }
    return lines.sort().slice(0, hoverLocalLimit).join("\n");
  }

  function pageActionableSignature() {
    return signatureLines(
      collectVisibleMatches(document, hoverActionableSelector, isSignatureActionableNode, hoverActionableLimit)
    ).join("\n");
  }

  function overlaySignature() {
    const overlays = collectVisibleMatches(document, hoverOverlaySelector, isOverlayLikeNode, hoverOverlayLimit);
    return signatureLines(overlays).join("\n");
  }

  function captureHoverSnapshot(target) {
    return {
      target_key: hoverTargetKey(target),
      aria_expanded: target && target.getAttribute ? target.getAttribute("aria-expanded") || "" : "",
      actionables: pageActionableSignature(),
      overlays: overlaySignature(),
      local_actionables: localActionableSignature(target),
      local_overlays: localOverlaySignature(target),
    };
  }

  function snapshotHasAddedLocalOrGlobal(before, after) {
    return (
      addedLines(before && before.actionables, after && after.actionables).length > 0 ||
      addedLines(before && before.local_actionables, after && after.local_actionables).length > 0 ||
      addedLines(before && before.local_overlays, after && after.local_overlays).length > 0
    );
  }

  function stableSnapshotAddedNearTarget(stableBefore, after, field, localField) {
    if (!stableBefore) return false;
    const added = addedLines(stableBefore[field], after[field]);
    if (!added.length) return false;
    const localAfter = lineSet(after[localField]);
    return added.some((line) => localAfter.has(line));
  }

  function hasMeaningfulHoverChange(before, after, stableBefore) {
    if (!before || !after) return false;
    if (before.aria_expanded !== after.aria_expanded) return true;
    if (addedLines(before.overlays, after.overlays).length > 0) return true;
    if (snapshotHasAddedLocalOrGlobal(before, after)) return true;
    if (stableBefore) {
      if (stableSnapshotAddedNearTarget(stableBefore, after, "actionables", "local_actionables")) return true;
      if (stableSnapshotAddedNearTarget(stableBefore, after, "overlays", "local_overlays")) return true;
    }
    return false;
  }

  function isNavigationRegion(el) {
    let cur = el;
    for (let depth = 0; depth < 8 && cur && cur.nodeType === 1; depth++) {
      const tag = cur.tagName.toLowerCase();
      const r = nodeRole(cur);
      if (["nav", "aside"].indexOf(tag) >= 0) return true;
      if (["navigation", "menu", "menubar", "tablist", "tree", "toolbar"].indexOf(r) >= 0) return true;
      if (hasToken(cur, /\b(nav|navigation|menu|menubar|sidebar|side-nav|sidenav|drawer|tabs?|tree|toolbar)\b/i)) return true;
      if (tag === "body" || tag === "html") break;
      cur = cur.parentElement || (cur.getRootNode && cur.getRootNode().host) || null;
    }
    return false;
  }

  function isHoverCandidateNode(el) {
    if (!el || el.nodeType !== 1 || isEditableNode(el)) return false;
    const tag = el.tagName.toLowerCase();
    const r = nodeRole(el);
    if (["a", "button", "summary"].indexOf(tag) >= 0) return true;
    if (["button", "link", "menuitem", "menuitemcheckbox", "menuitemradio", "tab", "treeitem", "option"].indexOf(r) >= 0) {
      return true;
    }
    if (el.hasAttribute("aria-haspopup") || el.hasAttribute("aria-expanded") || el.hasAttribute("aria-controls")) return true;
    if (el.title || el.hasAttribute("data-tooltip") || el.hasAttribute("data-tip") || el.hasAttribute("data-popover")) return true;
    if (hasToken(el, /\b(menu|submenu|dropdown|popover|flyout|drawer|sidebar|side-nav|sidenav|nav-item|tab|toggle)\b/i)) return true;
    return isNavigationRegion(el) && !!safeText(el, 40);
  }

  function resolveHoverCandidate(el) {
    if (!el || el.nodeType !== 1) return null;
    const meaningful = resolveMeaningfulTarget(el);
    if (meaningful && !isEditableNode(meaningful) && isHoverCandidateNode(meaningful)) return meaningful;
    let cur = el;
    for (let depth = 0; depth < 10 && cur && cur.nodeType === 1; depth++) {
      if (isHoverCandidateNode(cur)) return cur;
      const tag = cur.tagName ? cur.tagName.toLowerCase() : "";
      if (tag === "body" || tag === "html") break;
      cur = cur.parentElement || (cur.getRootNode && cur.getRootNode().host) || null;
    }
    return null;
  }

  function scheduleHoverBaselineRefresh(delay) {
    if (hoverBaselineTimer) clearTimeout(hoverBaselineTimer);
    hoverBaselineTimer = setTimeout(() => {
      hoverBaselineTimer = null;
      if (!pendingHover) lastStableHoverSnapshot = captureHoverSnapshot(null);
    }, delay == null ? 80 : delay);
  }

  function clearHoverTimer() {
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
  }

  function shouldRecordHoverTarget(target) {
    if (!target || !target.isConnected || !isVisibleElement(target)) return false;
    const rect = target.getBoundingClientRect();
    if (!rect || rect.width < 2 || rect.height < 2) return false;
    const role = (target.getAttribute("role") || "").toLowerCase();
    const text = safeText(target, 80).toLowerCase();
    if ((role === "status" || role === "progressbar") && /loading|spinner|please wait/.test(text)) return false;
    return true;
  }

  function emitPendingHover(reason) {
    const candidate = pendingHover;
    if (!candidate || candidate.emitted) return false;
    clearHoverTimer();
    const after = captureHoverSnapshot(candidate.target);
    const changed = hasMeaningfulHoverChange(candidate.before, after, candidate.stableBefore);
    candidate.emitted = true;
    pendingHover = null;
    lastStableHoverSnapshot = after;
    if (!changed) {
      scheduleHoverBaselineRefresh(80);
      return false;
    }
    if (!shouldRecordHoverTarget(candidate.target)) {
      scheduleHoverBaselineRefresh(80);
      return false;
    }
    const p = serializeTarget(candidate.target, "hover", null);
    if (reason === "before_click" || reason === "candidate_switch") {
      finalizeState(p);
    } else {
      requestAnimationFrame(() => finalizeState(p));
    }
    return true;
  }

  function startHoverCandidate(candidate) {
    if (!candidate || candidate.nodeType !== 1) return;
    if (pendingHover && pendingHover.target === candidate) return;
    if (pendingHover) emitPendingHover("candidate_switch");
    clearHoverTimer();
    pendingHover = {
      target: candidate,
      before: captureHoverSnapshot(candidate),
      stableBefore: lastStableHoverSnapshot,
      emitted: false,
      startedAt: Date.now(),
    };
    hoverTimer = setTimeout(() => emitPendingHover("dwell"), hoverDwellMs);
  }

  function flushPendingHoverBeforeClick(clickTarget) {
    if (!pendingHover || pendingHover.emitted) return;
    if (pendingHover.target === clickTarget) return;
    emitPendingHover("before_click");
  }

  if (captureHover) {
    setTimeout(() => {
      if (!lastStableHoverSnapshot) lastStableHoverSnapshot = captureHoverSnapshot(null);
    }, 0);

    onDoc(
      "mouseover",
      (ev) => {
        const el = eventTargetFromPath(ev);
        if (!el) return;
        const candidate = resolveHoverCandidate(el);
        if (!candidate) {
          if (pendingHover) emitPendingHover("candidate_switch");
          scheduleHoverBaselineRefresh(80);
          return;
        }
        const related = nodeAsElement(ev.relatedTarget);
        if (related && candidate.contains && candidate.contains(related)) {
          return;
        }
        startHoverCandidate(candidate);
      },
      { capture: true, passive: true }
    );
    onDoc("mouseout", function(ev) {
      if (!pendingHover || pendingHover.emitted) {
        scheduleHoverBaselineRefresh(80);
        return;
      }
      const to = nodeAsElement(ev.relatedTarget);
      if (to && pendingHover.target && pendingHover.target.contains && pendingHover.target.contains(to)) return;
      setTimeout(() => {
        if (!pendingHover || pendingHover.emitted) return;
        emitPendingHover("mouseout");
      }, Math.min(120, hoverDwellMs));
    }, { capture: true, passive: true });
  }

  // Drag / drop — capture source selector on dragstart, emit combined event on drop
  let _dragSrcSelectors = null;
  onDoc(
    "dragstart",
    (ev) => {
      const el = eventTargetFromPath(ev);
      if (!el) return;
      _dragSrcSelectors = { css: buildCssPath(el), xpath: buildXPath(el) };
    },
    true
  );
  onDoc(
    "drop",
    (ev) => {
      const dst = eventTargetFromPath(ev);
      if (!dst || !_dragSrcSelectors) return;
      const val = JSON.stringify({
        src_css:   _dragSrcSelectors.css,
        src_xpath: _dragSrcSelectors.xpath,
        dst_css:   buildCssPath(dst),
        dst_xpath: buildXPath(dst),
      });
      const p = serializeTarget(dst, "drag_drop", val);
      _dragSrcSelectors = null;
      requestAnimationFrame(() => finalizeState(p));
    },
    true
  );

  // Keyboard shortcuts — modifier combos and common non-printable keys
  var _KEY_ALLOWLIST = { Tab: 1, Enter: 1, Escape: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1 };
  onDoc(
    "keydown",
    (ev) => {
      const hasModifier = ev.ctrlKey || ev.metaKey || ev.altKey;
      if (!hasModifier && !_KEY_ALLOWLIST[ev.key]) return;
      if (ev.key === "Control" || ev.key === "Meta" || ev.key === "Alt" || ev.key === "Shift") return;
      const val = JSON.stringify({
        key: ev.key,
        code: ev.code,
        modifiers: { ctrl: ev.ctrlKey, shift: ev.shiftKey, alt: ev.altKey, meta: ev.metaKey },
      });
      const el = document.activeElement || document.body;
      const p = serializeTarget(el, "keyboard_shortcut", val);
      requestAnimationFrame(() => finalizeState(p));
    },
    true
  );

  // Initial installation — must run after all onDoc(...) registrations above.
  installDocumentListeners();

  // Flush pending typed input and hover before the frame unloads (e.g., form submit in iframe).
  // Also reset the window flag so the pump loop re-injects the bridge after document.open()
  // (HubSpot micro-frontend pattern: window object persists but document is replaced).
  window.addEventListener("beforeunload", function () {
    window.__SKILL_BRIDGE_V1__ = false;
    if (inputTimer) {
      clearTimeout(inputTimer);
      inputTimer = null;
      if (lastInputEl) emitEditableChange(lastInputEl, true);
    }
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
    if (_pendingClickPayloads.length) {
      const toFlush = _pendingClickPayloads;
      _pendingClickPayloads = [];
      toFlush.forEach((p) => {
        p.__flushed = true;
        finalizeState(p);
      });
    }
  }, true);
})();
