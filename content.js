/**
 * eAMF -> Business Central Bridge
 * Content Script (Injected on eamf.lv)
 */

(function () {
  if (window.__bcBridgeInjected) return;
  window.__bcBridgeInjected = true;

  // --------------------------------------------------------------------------
  // Application Constants & State
  // --------------------------------------------------------------------------
  const GITHUB_REPO = "kaspars1985/BC-Helperis";
  const CURRENT_VERSION = (chrome.runtime && chrome.runtime.getManifest) ? chrome.runtime.getManifest().version : "1.1.0";

  let state = {
    buffer: [],
    settings: {
      formatPreset: "lv_std", // 'lv_std', 'en_std', 'compact', 'custom'
      customTemplate: "{Type}\t{No}\t\t{Qty}",
      lastTargetTabId: null
    },
    drawerOpen: false,
    modalOpen: false
  };

  // --------------------------------------------------------------------------
  // Initialization
  // --------------------------------------------------------------------------
  async function init() {
    await loadStateFromStorage();
    setupStorageListener();
    injectFloatingWidget();
    injectDrawer();
    injectTabModal();
    injectSettingsModal();
    scanAndInjectButtons();
    setupSearchInputListener();
    setupMutationObserver();
    setupMessageListener();
    checkForUpdates();
  }

  async function loadStateFromStorage() {
    try {
      const data = await chrome.storage.local.get(["bc_buffer", "bc_settings"]);
      if (data.bc_buffer && Array.isArray(data.bc_buffer)) {
        state.buffer = data.bc_buffer;
      }
      if (data.bc_settings) {
        state.settings = { ...state.settings, ...data.bc_settings };
      }
      updateWidgetBadge();
    } catch (e) {
      console.warn("[BC Bridge] Storage ielādes kļūda:", e);
    }
  }

  function setupStorageListener() {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local") {
        if (changes.bc_buffer) {
          state.buffer = changes.bc_buffer.newValue || [];
          updateWidgetBadge();
          if (state.drawerOpen) renderDrawerList();
        }
        if (changes.bc_settings) {
          state.settings = { ...state.settings, ...changes.bc_settings.newValue };
        }
      }
    });
  }

  async function saveBuffer() {
    try {
      await chrome.storage.local.set({ bc_buffer: state.buffer });
      updateWidgetBadge();
    } catch (e) {
      console.error("[BC Bridge] Kļūda saglabājot buferi:", e);
    }
  }

  async function saveSettings() {
    try {
      await chrome.storage.local.set({ bc_settings: state.settings });
    } catch (e) {
      console.error("[BC Bridge] Kļūda saglabājot iestatījumus:", e);
    }
  }

  // --------------------------------------------------------------------------
  // Article Detection & Button Injection on eamf.lv
  // --------------------------------------------------------------------------
  // Article regex patterns for furniture hardware (Blum, Hafele, AMF etc.)
  const ARTICLE_REGEX = /\b([A-Z0-9]{1,4}\.[0-9A-Z\.]+|[0-9]{3}\.[0-9]{2}\.[0-9]{3}|[A-Z]{1,3}\d{4,8}|K\.\d{3}\.\d{3}\.\d)\b/i;

  function scanAndInjectButtons() {
    // 1. Scan Product Cards in Lists/Grids (PLP)
    // Only target top-level cards to prevent multiple nested injections
    const productCards = document.querySelectorAll(
      "li.product-item, .products-grid .product-item, .products-list .product-item"
    );

    const cardsToProcess = productCards.length > 0 
      ? productCards 
      : document.querySelectorAll(".product-item-info");

    cardsToProcess.forEach((card) => {
      // DEDUPLICATION: Remove any duplicate buttons if previously injected
      const existingBtns = card.querySelectorAll(".bc-bridge-btn-add");
      if (existingBtns.length > 1) {
        for (let i = 1; i < existingBtns.length; i++) existingBtns[i].remove();
        return;
      }
      if (existingBtns.length === 1) return;

      const productData = extractProductFromCard(card);
      if (productData && productData.code) {
        // Find the action container (where 'PIEVIENOT GROZAM' is)
        const actionsContainer = card.querySelector(
          ".actions-primary, .product-item-actions, form[data-role='tocart-form'], .product-item-inner .actions-primary"
        ) || card;

        if (actionsContainer.querySelector(".bc-bridge-btn-add")) return;

        const btn = createAddButton(productData, card, false);
        actionsContainer.appendChild(btn);
      }
    });

    // 2. Scan Single Product View (PDP)
    const pdpMain = document.querySelector(".product-info-main, .product-view");
    if (pdpMain) {
      const existingPdpBtns = pdpMain.querySelectorAll(".bc-bridge-btn-add");
      if (existingPdpBtns.length > 1) {
        for (let i = 1; i < existingPdpBtns.length; i++) existingPdpBtns[i].remove();
        return;
      }
      if (existingPdpBtns.length === 1) return;

      const pdpData = extractProductFromPDP(pdpMain);
      if (pdpData && pdpData.code) {
        const targetContainer = pdpMain.querySelector(
          ".box-tocart .actions, .box-tocart, .product-add-form"
        ) || pdpMain;

        if (!targetContainer.querySelector(".bc-bridge-btn-add")) {
          const btn = createAddButton(pdpData, pdpMain, true);
          targetContainer.appendChild(btn);
        }
      }
    }

    // 3. Scan Search Autocomplete Popup (Amasty Xsearch / Quicksearch)
    scanSearchAutocomplete();
  }

  function scanSearchAutocomplete() {
    // Target all search result item cards (handles Amasty Xsearch and native Magento autocomplete)
    const searchItems = document.querySelectorAll(
      ".product-item-details, .amsearch-autocomplete .product-item, .search-autocomplete .product-item, [class*='amsearch'] .product-item-info"
    );

    searchItems.forEach((container) => {
      // Find SKU element
      const skuLink = container.querySelector(
        ".amasty-xsearch-product-item-link, .product-item-sku a, .product-item-sku"
      );
      if (!skuLink) return;

      // Deduplication: skip if a helper button already exists in this item
      if (container.querySelector(".bc-bridge-btn-add, .bc-bridge-btn-choose-variant")) return;

      const rawCode = (skuLink.getAttribute("title") || skuLink.innerText || "").trim();
      const code = cleanArticleCode(rawCode);
      if (!code) return;

      // Find Name & Product Link
      const nameEl = container.querySelector(".product-item-link, a[class*='product-item-link']");
      const name = nameEl ? (nameEl.getAttribute("title") || nameEl.innerText || "").trim() : "";
      const productUrl = nameEl ? (nameEl.getAttribute("href") || skuLink.getAttribute("href") || "#") : "#";

      // Find Price
      const priceEl = container.querySelector(".price-box .price, .price");
      const price = priceEl ? priceEl.innerText.trim() : "";

      // Target wrapper: inside .amsearch-wrapper-inner if available, or container
      const wrapper = container.querySelector(".amsearch-wrapper-inner") || container;

      // Check if code ends in .00 (configurable / placeholder matrix code)
      const isPlaceholder = /\.00$/i.test(code);

      if (isPlaceholder) {
        const chooseBtn = document.createElement("a");
        chooseBtn.className = "bc-bridge-btn-choose-variant";
        chooseBtn.href = productUrl;
        chooseBtn.innerHTML = `<span>Izvēlēties izmēru ➔</span>`;
        chooseBtn.title = `Atvērt ${name || 'preci'}, lai izvēlētos konkrētu izmēru pirms pievienošanas`;
        wrapper.appendChild(chooseBtn);
      } else {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "bc-bridge-btn-add bc-bridge-search-btn";
        btn.title = `Pievienot 1 gab. (${code}) BC helperim`;
        btn.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
          </svg>
          <span>+ BC</span>
        `;

        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();

          addItemToBuffer(code, name, 1, price);

          btn.classList.add("bc-bridge-btn-added-animate");
          const span = btn.querySelector("span");
          if (span) span.innerText = "✓ Pievienots!";
          setTimeout(() => {
            btn.classList.remove("bc-bridge-btn-added-animate");
            if (span) span.innerText = "+ BC";
          }, 1200);
        });

        wrapper.appendChild(btn);
      }
    });
  }

  function extractProductFromCard(card) {
    let code = "";
    let name = "";
    let price = "";

    // Title / Name
    const linkEl = card.querySelector(".product-item-link, a[class*='title'], h2 a, h3 a");
    if (linkEl) {
      name = linkEl.innerText.trim();
    }

    // 1. Highest priority: Visible "Artikuls [KODS]" in text!
    // On eamf.lv, the displayed card text shows: "Artikuls 76.W1000.ST76.92".
    // When the user clicks a swatch (e.g. 600 mm vs 920 mm), eamf updates this exact text.
    const allText = card.innerText || "";
    const artikulsMatch = allText.match(/artikuls[:\s]+([A-Z0-9\.\-\/]+)/i);
    if (artikulsMatch && artikulsMatch[1]) {
      code = artikulsMatch[1].trim();
    }

    // 2. Second priority: Specific SKU elements (excluding data-product-sku which has parent matrix SKU)
    if (!code) {
      const skuEl = card.querySelector(".product-item-sku, .sku .value, .sku");
      if (skuEl) {
        code = skuEl.innerText.replace(/artikuls[:\s]*/i, "").trim();
      }
    }

    // 3. Third priority: Furniture article regex pattern
    if (!code) {
      const match = allText.match(ARTICLE_REGEX);
      if (match) {
        code = match[1];
      }
    }

    // 4. Fallback: data-product-sku attribute
    if (!code) {
      const dataSkuEl = card.querySelector("[data-product-sku]");
      if (dataSkuEl) {
        code = dataSkuEl.getAttribute("data-product-sku") || dataSkuEl.innerText.trim();
      }
    }

    // Price
    const priceEl = card.querySelector(".price-box .price, .price");
    if (priceEl) {
      price = priceEl.innerText.trim();
    }

    return { code: cleanArticleCode(code), name, price };
  }

  function extractProductFromPDP(container) {
    let code = "";
    let name = "";
    let price = "";

    // Title
    const titleEl = container.querySelector(".page-title span, h1");
    if (titleEl) {
      name = titleEl.innerText.trim();
    }

    // 1. Highest priority: Visible Artikuls text
    const allText = container.innerText || "";
    const artikulsMatch = allText.match(/artikuls[:\s]+([A-Z0-9\.\-\/]+)/i);
    if (artikulsMatch && artikulsMatch[1]) {
      code = artikulsMatch[1].trim();
    }

    // 2. Specific SKU element
    if (!code) {
      const skuEl = container.querySelector(".sku .value, [itemprop='sku'], .product.attribute.sku, .sku");
      if (skuEl) {
        code = skuEl.innerText.trim();
      }
    }

    // 3. Furniture article regex
    if (!code) {
      const match = allText.match(ARTICLE_REGEX);
      if (match) code = match[1];
    }

    // 4. Fallback: data-product-sku
    if (!code) {
      const dataSkuEl = container.querySelector("[data-product-sku]");
      if (dataSkuEl) {
        code = dataSkuEl.getAttribute("data-product-sku") || "";
      }
    }

    // Price
    const priceEl = container.querySelector(".price-box .price, .final-price .price");
    if (priceEl) price = priceEl.innerText.trim();

    return { code: cleanArticleCode(code), name, price };
  }

  function cleanArticleCode(code) {
    if (!code) return "";
    return code
      .replace(/^(artikuls|kods|sku)[:\s]*/i, "")
      .replace(/[\r\n\t]/g, "")
      .replace(/[,;]+$/g, "")
      .trim();
  }

  function createAddButton(productData, parentContainer, isPDP = false) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bc-bridge-btn-add";
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
        <path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
      </svg>
      <span>+ BC</span>
    `;
    btn.title = `Pievienot Business Central buferim`;

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      // DYNAMIC RE-EXTRACTION AT CLICK TIME:
      // When the user selects a swatch or size (e.g. 600 mm vs 920 mm), eamf updates the text.
      // Re-extracting here captures the active, currently selected variant instead of stale load-time SKU!
      const currentData = isPDP ? extractProductFromPDP(parentContainer) : extractProductFromCard(parentContainer);
      const codeToUse = (currentData && currentData.code) ? currentData.code : productData.code;
      const nameToUse = (currentData && currentData.name) ? currentData.name : productData.name;
      const priceToUse = (currentData && currentData.price) ? currentData.price : productData.price;

      // Read current quantity from input in that card/container (supports decimal e.g. 0.5, 2.5)
      let qty = 1;
      const qtyInput = parentContainer.querySelector('input.qty, input[name="qty"], #qty, [name="qty"]');
      if (qtyInput && qtyInput.value) {
        const parsed = parseFloat(qtyInput.value.replace(",", "."));
        if (!isNaN(parsed) && parsed > 0) qty = parsed;
      }

      addItemToBuffer(codeToUse, nameToUse, qty, priceToUse);

      // Visual feedback on button
      btn.classList.add("bc-bridge-btn-added-animate");
      const span = btn.querySelector("span");
      const prevText = span ? span.innerText : "+ BC";
      if (span) span.innerText = "✓ Pievienots!";
      setTimeout(() => {
        btn.classList.remove("bc-bridge-btn-added-animate");
        if (span) span.innerText = prevText;
      }, 1000);
    });

    return btn;
  }

  function setupSearchInputListener() {
    const bindSearch = () => {
      const inputs = document.querySelectorAll("#search, input[name='q'], .search-autocomplete input, .minisearch input");
      inputs.forEach((input) => {
        if (input.__bcSearchBound) return;
        input.__bcSearchBound = true;
        ["input", "keyup", "focus"].forEach((evt) => {
          input.addEventListener(evt, () => {
            setTimeout(scanSearchAutocomplete, 150);
            setTimeout(scanSearchAutocomplete, 450);
          });
        });
      });
    };
    bindSearch();
    setTimeout(bindSearch, 1500);
  }

  function setupMutationObserver() {
    let timeout = null;
    const observer = new MutationObserver(() => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        scanAndInjectButtons();
      }, 200);
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // --------------------------------------------------------------------------
  // Buffer Operations
  // --------------------------------------------------------------------------
  function addItemToBuffer(code, name, qty = 1, price = "") {
    if (!code) return;

    const existingIndex = state.buffer.findIndex(
      (i) => i.code.toLowerCase() === code.toLowerCase()
    );

    if (existingIndex >= 0) {
      const prevQty = parseFloat(state.buffer[existingIndex].qty) || 0;
      state.buffer[existingIndex].qty = Math.round((prevQty + qty) * 100) / 100;
      if (name && !state.buffer[existingIndex].name) state.buffer[existingIndex].name = name;
      if (price && !state.buffer[existingIndex].price) state.buffer[existingIndex].price = price;
    } else {
      state.buffer.push({
        id: "item_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
        code: code,
        name: name || "Furnitūras prece",
        qty: qty,
        price: price || "",
        addedAt: new Date().toISOString()
      });
    }

    saveBuffer();
    showToast(`Pievienots BC buferim: ${code} (${qty} gab.)`, "success");
    animateWidget();
  }

  function updateItemQty(id, delta) {
    const item = state.buffer.find((i) => i.id === id);
    if (!item) return;

    const current = parseFloat(item.qty) || 1;
    // For smaller values (< 1), step by 0.5
    const step = current < 1 ? 0.5 : 1;
    const newQty = Math.max(0.01, Math.round((current + delta * step) * 100) / 100);
    item.qty = newQty;
    saveBuffer();
    renderDrawerList();
  }

  function setItemQty(id, newQty) {
    const item = state.buffer.find((i) => i.id === id);
    if (!item) return;

    const parsed = parseFloat(String(newQty).replace(",", "."));
    if (!isNaN(parsed) && parsed > 0) {
      item.qty = Math.round(parsed * 100) / 100;
      saveBuffer();
      renderDrawerList();
    }
  }

  function removeItem(id) {
    state.buffer = state.buffer.filter((i) => i.id !== id);
    saveBuffer();
    renderDrawerList();
  }

  function clearAllItems() {
    if (!state.buffer.length) return;
    if (confirm("Vai tiešām vēlaties dzēst visus artikulus no BC bufera?")) {
      state.buffer = [];
      saveBuffer();
      renderDrawerList();
      showToast("BC buferis ir notīrīts", "warn");
    }
  }

  // --------------------------------------------------------------------------
  // Message Handling (Context Menu & Background)
  // --------------------------------------------------------------------------
  function setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "ADD_ITEM_FROM_SELECTION") {
        const cleanCode = cleanArticleCode(request.code);
        if (cleanCode) {
          addItemToBuffer(cleanCode, "Iezīmētais artikuls", 1);
        }
        sendResponse({ success: true });
      }
    });
  }

  // --------------------------------------------------------------------------
  // Floating Widget (Bottom-Right Badge)
  // --------------------------------------------------------------------------
  function injectFloatingWidget() {
    if (document.getElementById("bc-bridge-widget")) return;

    const widget = document.createElement("div");
    widget.id = "bc-bridge-widget";
    widget.className = "bc-bridge-floating-widget";
    const iconUrl = chrome.runtime.getURL("icons/icon48.png");
    widget.innerHTML = `
      <div class="bc-bridge-badge-icon">
        <img src="${iconUrl}" alt="BC helperis">
        <div class="bc-bridge-badge-counter" id="bc-bridge-counter">0</div>
      </div>
      <div class="bc-bridge-badge-text">
        <span>BC helperis</span>
        <span class="bc-bridge-badge-sub" id="bc-bridge-badge-status">0 preces</span>
      </div>
    `;

    widget.addEventListener("click", () => {
      toggleDrawer(true);
    });

    document.body.appendChild(widget);
    updateWidgetBadge();
  }

  function updateWidgetBadge() {
    const counter = document.getElementById("bc-bridge-counter");
    const status = document.getElementById("bc-bridge-badge-status");
    if (!counter || !status) return;

    const totalCount = state.buffer.reduce((acc, curr) => acc + (parseFloat(curr.qty) || 1), 0);
    const uniqueCount = state.buffer.length;

    const displayCount = Math.round(totalCount * 100) / 100;
    counter.innerText = displayCount > 99 ? "99+" : displayCount;
    counter.style.display = totalCount > 0 ? "flex" : "none";
    status.innerText = `${uniqueCount} artikuli (${displayCount} gab.)`;
  }

  function animateWidget() {
    const widget = document.getElementById("bc-bridge-widget");
    if (!widget) return;
    widget.style.transform = "scale(1.12)";
    setTimeout(() => {
      widget.style.transform = "";
    }, 200);
  }

  // --------------------------------------------------------------------------
  // Slide-out Drawer Panel
  // --------------------------------------------------------------------------
  function injectDrawer() {
    if (document.getElementById("bc-bridge-drawer-container")) return;

    const iconUrl = chrome.runtime.getURL("icons/icon48.png");
    const container = document.createElement("div");
    container.id = "bc-bridge-drawer-container";
    container.innerHTML = `
      <div class="bc-bridge-drawer-overlay" id="bc-bridge-overlay"></div>
      <div class="bc-bridge-drawer" id="bc-bridge-drawer">
        <div class="bc-bridge-drawer-header">
          <div class="bc-bridge-drawer-title-wrap">
            <div class="bc-bridge-drawer-logo">
              <img src="${iconUrl}" alt="BC helperis">
            </div>
            <div>
              <h2 class="bc-bridge-drawer-title">BC helperis</h2>
              <p class="bc-bridge-drawer-subtitle" id="bc-bridge-drawer-count">0 preces gatavas pasūtījumam</p>
            </div>
          </div>
          <div class="bc-bridge-header-actions">
            <button class="bc-bridge-icon-btn" id="bc-bridge-btn-settings" title="Iestatījumi">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
              </svg>
            </button>
            <button class="bc-bridge-icon-btn" id="bc-bridge-btn-close" title="Aizvērt paneli" aria-label="Aizvērt">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="bc-bridge-drawer-body" id="bc-bridge-drawer-body">
          <!-- Items injected dynamically -->
        </div>

        <div class="bc-bridge-drawer-footer">
          <div class="bc-bridge-summary-bar">
            <span>Kopā buferī:</span>
            <span id="bc-bridge-total-stat">0 artikuli</span>
          </div>

          <!-- Instructions hint banner -->
          <div style="font-size: 11px; color: #475569; background: #fff8f5; border: 1px solid #ffd0b8; border-radius: 6px; padding: 7px 10px; margin-bottom: 8px; line-height: 1.4;">
            💡 <b>Kā ielīmēt BC:</b> Noklikšķiniet uz tukšās rindas kolonnā <b>Tips</b> (1. kolonna) un spiediet <b>Ctrl + V</b>.
          </div>

          <!-- Primary: Copy for BC -->
          <button class="bc-bridge-btn-main" id="bc-bridge-btn-copy" title="Nokopē starpliktuvē formātā priekš BC rindām (Ctrl+V)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
            </svg>
            <span>Kopēt priekš BC (Ctrl+V)</span>
          </button>

          <!-- Secondary: Switch to BC tab / Visual Tab Selector -->
          <button class="bc-bridge-btn-secondary" id="bc-bridge-btn-switch-tab" title="Atvērt BC cilni un ielīmēt">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V7h14v12zm-2-7h-4V8h-2v4H7v2h4v4h2v-4h4v-2z"/>
            </svg>
            <span>Pārslēgties uz BC pasūtījumu</span>
          </button>

          <div class="bc-bridge-footer-row">
            <button class="bc-bridge-link-btn" id="bc-bridge-btn-export-csv" style="color: #0078d4;">
              Lejupielādēt CSV (Excel)
            </button>
            <button class="bc-bridge-link-btn" id="bc-bridge-btn-clear-all">
              Notīrīt sarakstu
            </button>
          </div>

          <div class="bc-bridge-drawer-feedback" style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #ffd0b8; text-align: center; font-size: 11px; color: #64748b; line-height: 1.5;">
            <span>Ziņot par kļūdām vai ieteikt:</span><br>
            <a href="mailto:kasparsciematnieks@amf.lv?subject=BC%20helperis%20atsauksme" style="color: #ff5501; font-weight: 700; text-decoration: none;">kasparsciematnieks@amf.lv</a>
            <div style="margin-top: 4px; font-size: 10px; color: #94a3b8;">
              v${CURRENT_VERSION} · <a href="https://github.com/${GITHUB_REPO}" target="_blank" style="color: #94a3b8; text-decoration: underline;">GitHub</a>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(container);

    // Event Listeners
    document.getElementById("bc-bridge-overlay").addEventListener("click", () => toggleDrawer(false));
    document.getElementById("bc-bridge-btn-close").addEventListener("click", () => toggleDrawer(false));
    document.getElementById("bc-bridge-btn-copy").addEventListener("click", copyRowsToClipboard);
    document.getElementById("bc-bridge-btn-switch-tab").addEventListener("click", handleSwitchToBCTab);
    document.getElementById("bc-bridge-btn-export-csv").addEventListener("click", exportToCSV);
    document.getElementById("bc-bridge-btn-clear-all").addEventListener("click", clearAllItems);
    document.getElementById("bc-bridge-btn-settings").addEventListener("click", () => openSettingsModal());
  }

  function toggleDrawer(open) {
    state.drawerOpen = open;
    const overlay = document.getElementById("bc-bridge-overlay");
    const drawer = document.getElementById("bc-bridge-drawer");
    if (!overlay || !drawer) return;

    if (open) {
      renderDrawerList();
      overlay.classList.add("active");
      drawer.classList.add("active");
    } else {
      overlay.classList.remove("active");
      drawer.classList.remove("active");
    }
  }

  function renderDrawerList() {
    const body = document.getElementById("bc-bridge-drawer-body");
    const countEl = document.getElementById("bc-bridge-drawer-count");
    const totalStatEl = document.getElementById("bc-bridge-total-stat");
    if (!body) return;

    const totalCount = state.buffer.reduce((acc, curr) => acc + (parseFloat(curr.qty) || 1), 0);
    const uniqueCount = state.buffer.length;
    const displayTotal = Math.round(totalCount * 100) / 100;

    if (countEl) countEl.innerText = `${uniqueCount} dažādi artikuli (${displayTotal} gab.)`;
    if (totalStatEl) totalStatEl.innerText = `${uniqueCount} artikuli · ${displayTotal} gab.`;

    if (state.buffer.length === 0) {
      body.innerHTML = `
        <div class="bc-bridge-empty-state">
          <svg class="bc-bridge-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
          </svg>
          <div class="bc-bridge-empty-title">Buferis ir tukšs</div>
          <div class="bc-bridge-empty-text">
            Pārlūkojiet eamf.lv katalogus un spiediet <b>+ BC</b> pogu pie precēm, vai iezīmējiet jebkuru artikulu un nospiediet peles labo taustiņu.
          </div>
        </div>
      `;
      return;
    }

    body.innerHTML = "";
    state.buffer.forEach((item) => {
      const card = document.createElement("div");
      card.className = "bc-bridge-item-card";
      card.innerHTML = `
        <div class="bc-bridge-item-top">
          <input type="text" class="bc-bridge-item-code-input" value="${escapeHtml(item.code)}" title="Klikšķiniet, lai labotu artikula kodu pirms kopēšanas" data-id="${item.id}">
          <button class="bc-bridge-item-delete" title="Dzēst artikulu" data-id="${item.id}">✕</button>
        </div>
        <p class="bc-bridge-item-name">${escapeHtml(item.name || "Furnitūras prece")}</p>
        <div class="bc-bridge-item-bottom">
          <span class="bc-bridge-item-price">${escapeHtml(item.price || "")}</span>
          <div class="bc-bridge-qty-controls">
            <button class="bc-bridge-qty-btn" data-action="dec" data-id="${item.id}">–</button>
            <input type="number" class="bc-bridge-qty-input" value="${item.qty}" min="0.01" step="any" data-id="${item.id}">
            <button class="bc-bridge-qty-btn" data-action="inc" data-id="${item.id}">+</button>
          </div>
        </div>
      `;

      // Event listeners for item card
      card.querySelector(".bc-bridge-item-delete").addEventListener("click", () => removeItem(item.id));
      card.querySelector('[data-action="dec"]').addEventListener("click", () => updateItemQty(item.id, -1));
      card.querySelector('[data-action="inc"]').addEventListener("click", () => updateItemQty(item.id, 1));
      
      const codeInput = card.querySelector(".bc-bridge-item-code-input");
      codeInput.addEventListener("change", (e) => {
        const val = cleanArticleCode(e.target.value);
        if (val) {
          item.code = val;
          saveBuffer();
        }
      });

      const qtyInput = card.querySelector(".bc-bridge-qty-input");
      qtyInput.addEventListener("change", (e) => setItemQty(item.id, e.target.value));

      body.appendChild(card);
    });
  }

  // --------------------------------------------------------------------------
  // Multi-Tab Visual Selector Modal
  // --------------------------------------------------------------------------
  function injectTabModal() {
    if (document.getElementById("bc-bridge-modal-overlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "bc-bridge-modal-overlay";
    overlay.className = "bc-bridge-modal-overlay";
    overlay.innerHTML = `
      <div class="bc-bridge-modal">
        <div class="bc-bridge-modal-header">
          <div>
            <h3 class="bc-bridge-modal-title">Izvēlies Business Central pasūtījumu</h3>
            <span style="font-size: 12px; color: #64748b;" id="bc-bridge-modal-subtitle">Atrastās atvērtās cilnes</span>
          </div>
          <button class="bc-bridge-icon-btn" id="bc-bridge-modal-close" title="Aizvērt">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
        <div class="bc-bridge-modal-body" id="bc-bridge-modal-tab-list">
          <!-- Injected tab cards -->
        </div>
        <div class="bc-bridge-modal-footer">
          <button class="bc-bridge-link-btn" id="bc-bridge-btn-open-new-bc" style="color: #0078d4;">
            + Atvērt Business Central pasūtījumus
          </button>
          <button class="bc-bridge-btn-secondary" id="bc-bridge-modal-cancel" style="width: auto; padding: 6px 14px;">
            Atcelt
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById("bc-bridge-modal-close").addEventListener("click", () => closeTabModal());
    document.getElementById("bc-bridge-modal-cancel").addEventListener("click", () => closeTabModal());
    document.getElementById("bc-bridge-btn-open-new-bc").addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "OPEN_NEW_BC_TAB" });
      closeTabModal();
      showToast("Tiek atvērta Business Central cilne", "info");
    });
  }

  function formatTabCardTitle(title) {
    if (!title) return "Business Central pasūtījums";
    return title
      .replace(/\s*·\s*Dynamics 365 Business Central\s*/gi, "")
      .replace(/\s*-\s*Dynamics 365 Business Central\s*/gi, "")
      .replace(/\s*\|\s*Dynamics 365 Business Central\s*/gi, "")
      .replace(/\s*Dynamics 365 Business Central\s*/gi, "")
      .replace(/^\s*(pārdošanas pasūtījums|pirkuma pasūtījums|sales order|purchase order)\s*[-–—:]*\s*/gi, "")
      .trim() || "Business Central pasūtījums";
  }

  function openTabModal(tabs) {
    const overlay = document.getElementById("bc-bridge-modal-overlay");
    const list = document.getElementById("bc-bridge-modal-tab-list");
    const subtitle = document.getElementById("bc-bridge-modal-subtitle");
    if (!overlay || !list) return;

    subtitle.innerText = `Atrastas ${tabs.length} atvērtas Business Central cilnes`;
    list.innerHTML = "";

    tabs.forEach((tab) => {
      const isLastTarget = state.settings.lastTargetTabId === tab.id;
      const displayTitle = formatTabCardTitle(tab.cleanTitle || tab.rawTitle);
      const card = document.createElement("div");
      card.className = "bc-bridge-tab-card";
      card.innerHTML = `
        <div class="bc-bridge-tab-info">
          <div class="bc-bridge-tab-icon"><img src="${chrome.runtime.getURL('icons/icon32.png')}" alt="BC"></div>
          <div class="bc-bridge-tab-details">
            <span class="bc-bridge-tab-title" title="${escapeHtml(tab.rawTitle)}">${escapeHtml(displayTitle)}</span>
            <span class="bc-bridge-tab-url">${escapeHtml(tab.url)}</span>
          </div>
        </div>
        <div>
          ${isLastTarget ? '<span class="bc-bridge-tab-badge recent">Pēdējais aktīvais</span>' : ""}
          ${tab.active ? '<span class="bc-bridge-tab-badge">Aktīvā cilne</span>' : ""}
        </div>
      `;

      card.addEventListener("click", async () => {
        // 1. Copy lines to clipboard if buffer has items
        if (state.buffer.length > 0) {
          try {
            await copyRowsToClipboard(false);
          } catch (e) {
            console.warn("Kopēšanas kļūda:", e);
          }
        }

        // 2. Remember tab as last target
        state.settings.lastTargetTabId = tab.id;
        await saveSettings();

        // 3. Focus that tab
        try {
          chrome.runtime.sendMessage(
            { action: "FOCUS_BC_TAB", tabId: tab.id, windowId: tab.windowId },
            () => {
              closeTabModal();
              toggleDrawer(false);
              const msg = state.buffer.length > 0
                ? `Nokopēts! Pārslēgts uz: ${tab.cleanTitle}. Nospiediet Ctrl+V rindās!`
                : `Pārslēgts uz: ${tab.cleanTitle}`;
              showToast(msg, "success");
            }
          );
        } catch (e) {
          alert("Lūdzu, pārlādējiet šo lapu (F5), lai atjaunotu paplašinājuma savienojumu.");
        }
      });

      list.appendChild(card);
    });

    overlay.classList.add("active");
    state.modalOpen = true;
  }

  function closeTabModal() {
    const overlay = document.getElementById("bc-bridge-modal-overlay");
    if (overlay) overlay.classList.remove("active");
    state.modalOpen = false;
  }

  async function handleSwitchToBCTab() {
    // If buffer has items, copy them
    if (state.buffer.length > 0) {
      try {
        await copyRowsToClipboard(false);
      } catch (e) {
        console.warn("Kopēšanas kļūda:", e);
      }
    }

    try {
      // Query open BC tabs from background worker
      chrome.runtime.sendMessage({ action: "GET_BC_TABS" }, async (response) => {
        if (chrome.runtime.lastError) {
          console.warn("[BC helperis] GET_BC_TABS error:", chrome.runtime.lastError);
          alert("Paplašinājums tika atjaunināts! Lūdzu, nospiediet F5 (Atsvaidzināt) lapā eamf.lv, lai savienojums atjaunotos.");
          return;
        }

        if (!response || !response.success || !response.tabs || response.tabs.length === 0) {
          // No BC tabs open: ask to open
          const confirmed = confirm(
            "Pārlūkā nav atvērta neviena Business Central cilne.\n\nVai atvērt Business Central jaunā cilnē?"
          );
          if (confirmed) {
            chrome.runtime.sendMessage({ action: "OPEN_NEW_BC_TAB" });
          }
          return;
        }

        const tabs = response.tabs;

        if (tabs.length === 1) {
          // Only 1 BC tab: switch directly!
          const singleTab = tabs[0];
          chrome.runtime.sendMessage(
            { action: "FOCUS_BC_TAB", tabId: singleTab.id, windowId: singleTab.windowId },
            () => {
              toggleDrawer(false);
              const msg = state.buffer.length > 0
                ? `Nokopēts! Pārslēgts uz: ${singleTab.cleanTitle}. Nospiediet Ctrl+V rindās!`
                : `Pārslēgts uz: ${singleTab.cleanTitle}`;
              showToast(msg, "success");
            }
          );
        } else {
          // Multiple BC tabs: Show visual selection modal!
          openTabModal(tabs);
        }
      });
    } catch (err) {
      console.error("[BC helperis] Kļūda pārslēdzoties uz BC:", err);
      alert("Paplašinājums tika atjaunināts! Lūdzu, nospiediet F5 (Atsvaidzināt) lapā eamf.lv, lai savienojums atjaunotos.");
    }
  }

  // --------------------------------------------------------------------------
  // Clipboard Formatting & Copy
  // --------------------------------------------------------------------------
  function formatRowsForBC() {
    const preset = state.settings.formatPreset || "amf_std";
    const customTpl = state.settings.customTemplate || "Prece\t{No}\t{Qty}";

    const lines = state.buffer.map((item) => {
      const code = (item.code || "").trim();
      const rawQty = item.qty !== undefined && item.qty !== null ? item.qty : 1;
      // Business Central Latvian locale expects comma (,) for decimals e.g. 0,5 or 21
      const qty = String(rawQty).replace(".", ",");
      const name = item.name || "";
      const price = item.price || "";

      if (preset === "amf_std" || preset === "lv_std") {
        // Prece [TAB] Artikuls [TAB] Pasūtītais daudzums
        return `Prece\t${code}\t${qty}`;
      } else if (preset === "compact") {
        // Artikuls [TAB] Pasūtītais daudzums
        return `${code}\t${qty}`;
      } else if (preset === "en_std") {
        // Item [TAB] Artikuls [TAB] Quantity
        return `Item\t${code}\t${qty}`;
      } else if (preset === "custom") {
        return customTpl
          .replace(/\{Type\}/g, "Prece")
          .replace(/\{No\}/g, code)
          .replace(/\{Qty\}/g, qty)
          .replace(/\{Price\}/g, price)
          .replace(/\{Name\}/g, name)
          .replace(/\\t/g, "\t");
      }
      return `Prece\t${code}\t${qty}`;
    });

    // Excel clipboard format: lines ending with \r\n
    return lines.join("\r\n") + "\r\n";
  }

  async function copyRowsToClipboard(showFeedback = true) {
    if (state.buffer.length === 0) {
      if (showFeedback) showToast("Buferis ir tukšs! Pievienojiet preces.", "warn");
      return;
    }

    const tsvData = formatRowsForBC();
    try {
      await navigator.clipboard.writeText(tsvData);
      if (showFeedback) {
        showToast(
          `Nokopētas ${state.buffer.length} rindas! BC uzklikšķiniet uz ailes 'Tips' un spiediet Ctrl+V.`,
          "success"
        );
      }
    } catch (e) {
      // Fallback copy using textarea
      const textarea = document.createElement("textarea");
      textarea.value = tsvData;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);

      if (showFeedback) {
        showToast(
          `Nokopētas ${state.buffer.length} rindas! BC uzklikšķiniet uz ailes 'Tips' un spiediet Ctrl+V.`,
          "success"
        );
      }
    }
  }

  // --------------------------------------------------------------------------
  // CSV Export
  // --------------------------------------------------------------------------
  function exportToCSV() {
    if (state.buffer.length === 0) {
      showToast("Buferis ir tukšs!", "warn");
      return;
    }

    // Include UTF-8 BOM so Excel opens Latvian letters (ā, č, ē, etc.) perfectly
    let csvContent = "\uFEFFArtikuls;Nosaukums;Daudzums;Cena;Pievienots\r\n";
    state.buffer.forEach((i) => {
      const line = [
        `"${(i.code || "").replace(/"/g, '""')}"`,
        `"${(i.name || "").replace(/"/g, '""')}"`,
        i.qty || 1,
        `"${(i.price || "").replace(/"/g, '""')}"`,
        `"${i.addedAt || ""}"`
      ].join(";");
      csvContent += line + "\r\n";
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `eAMF_pasutijums_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    showToast("CSV fails sagatavots un lejupielādēts", "success");
  }

  // --------------------------------------------------------------------------
  // Settings Modal
  // --------------------------------------------------------------------------
  function injectSettingsModal() {
    if (document.getElementById("bc-bridge-settings-overlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "bc-bridge-settings-overlay";
    overlay.className = "bc-bridge-modal-overlay";
    overlay.innerHTML = `
      <div class="bc-bridge-modal" style="width: 460px;">
        <div class="bc-bridge-modal-header">
          <h3 class="bc-bridge-modal-title">BC rindu formāta iestatījumi</h3>
          <button class="bc-bridge-icon-btn" id="bc-bridge-settings-close" title="Aizvērt">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
        <div class="bc-bridge-modal-body" style="gap: 14px;">
          <p style="font-size: 13px; color: #475569; margin: 0;">
            Izvēlieties, kādā kolonnu formātā sagatavot datus starpliktuvē, lai tie precīzi ielīmētos jūsu Business Central pasūtījuma rindās:
          </p>

          <label style="display: flex; align-items: flex-start; gap: 10px; cursor: pointer; font-size: 13px;">
            <input type="radio" name="bc-format-preset" value="amf_std" style="margin-top: 3px;">
            <div>
              <b>AM Furnitūra / BC: Prece → Nr. → Pasūtītais daudzums</b>
              <div style="font-size: 11px; color: #64748b;">Formāts: Prece [TAB] Artikuls [TAB] Pasūtītais daudzums (noklusējums)</div>
            </div>
          </label>

          <label style="display: flex; align-items: flex-start; gap: 10px; cursor: pointer; font-size: 13px;">
            <input type="radio" name="bc-format-preset" value="en_std" style="margin-top: 3px;">
            <div>
              <b>Standarta EN: Item → No. → Quantity</b>
              <div style="font-size: 11px; color: #64748b;">Formāts: Item [TAB] Artikuls [TAB] [TAB] Quantity</div>
            </div>
          </label>

          <label style="display: flex; align-items: flex-start; gap: 10px; cursor: pointer; font-size: 13px;">
            <input type="radio" name="bc-format-preset" value="compact" style="margin-top: 3px;">
            <div>
              <b>Kompakts: Numurs → Daudzums</b>
              <div style="font-size: 11px; color: #64748b;">Formāts: Artikuls [TAB] Daudzums (ja Tips kolonna ir paslēpta)</div>
            </div>
          </label>

          <label style="display: flex; align-items: flex-start; gap: 10px; cursor: pointer; font-size: 13px;">
            <input type="radio" name="bc-format-preset" value="custom" style="margin-top: 3px;">
            <div>
              <b>Pielāgota veidne</b>
              <div style="font-size: 11px; color: #64748b;">Definēt brīvi ar \\t atdalītājiem</div>
            </div>
          </label>

          <div id="bc-custom-tpl-wrap" style="display: none; flex-direction: column; gap: 4px;">
            <span style="font-size: 12px; font-weight: 600;">Pielāgotā veidne:</span>
            <input type="text" id="bc-custom-tpl-input" class="bc-bridge-qty-input" style="width: 100%; text-align: left; height: 32px; padding: 0 8px;" value="{Type}\\t{No}\\t\\t{Qty}">
            <span style="font-size: 11px; color: #64748b;">Pieejamie mainīgie: {Type}, {No}, {Qty}, {Name}, {Price}</span>
          </div>
        </div>
        <div class="bc-bridge-modal-footer">
          <button class="bc-bridge-btn-main" id="bc-bridge-settings-save" style="width: auto; padding: 8px 20px;">
            Saglabāt iestatījumus
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeBtn = document.getElementById("bc-bridge-settings-close");
    const saveBtn = document.getElementById("bc-bridge-settings-save");
    const radios = overlay.querySelectorAll('input[name="bc-format-preset"]');
    const customWrap = document.getElementById("bc-custom-tpl-wrap");

    closeBtn.addEventListener("click", () => {
      overlay.classList.remove("active");
    });

    radios.forEach((r) => {
      r.addEventListener("change", () => {
        customWrap.style.display = r.value === "custom" && r.checked ? "flex" : "none";
      });
    });

    saveBtn.addEventListener("click", async () => {
      const selectedRadio = overlay.querySelector('input[name="bc-format-preset"]:checked');
      if (selectedRadio) {
        state.settings.formatPreset = selectedRadio.value;
      }
      const tplInput = document.getElementById("bc-custom-tpl-input");
      if (tplInput) {
        state.settings.customTemplate = tplInput.value;
      }
      await saveSettings();
      overlay.classList.remove("active");
      showToast("Iestatījumi saglabāti!", "success");
    });
  }

  function openSettingsModal() {
    const overlay = document.getElementById("bc-bridge-settings-overlay");
    if (!overlay) return;

    let preset = state.settings.formatPreset || "amf_std";
    if (preset === "lv_std") preset = "amf_std";
    const radio = overlay.querySelector(`input[name="bc-format-preset"][value="${preset}"]`);
    if (radio) radio.checked = true;

    const customWrap = document.getElementById("bc-custom-tpl-wrap");
    if (customWrap) {
      customWrap.style.display = preset === "custom" ? "flex" : "none";
    }

    const tplInput = document.getElementById("bc-custom-tpl-input");
    if (tplInput && state.settings.customTemplate) {
      tplInput.value = state.settings.customTemplate;
    }

    overlay.classList.add("active");
  }

  // --------------------------------------------------------------------------
  // Update Checker (GitHub Releases)
  // --------------------------------------------------------------------------
  async function checkForUpdates() {
    try {
      const now = Date.now();
      const data = await chrome.storage.local.get(["bc_update_check"]);
      const lastCheck = data.bc_update_check?.timestamp || 0;
      const cachedInfo = data.bc_update_check?.info || null;

      // Use cache if checked within last 24 hours
      if (now - lastCheck < 24 * 60 * 60 * 1000 && cachedInfo) {
        if (isNewerVersion(cachedInfo.tag, CURRENT_VERSION)) {
          showUpdateNotification(cachedInfo);
        }
        return;
      }

      const resp = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
        headers: { "Accept": "application/vnd.github.v3+json" }
      });
      if (!resp.ok) return;

      const release = await resp.json();
      const latestTag = release.tag_name || "";
      const downloadAsset = (release.assets || []).find((a) => a.name && a.name.endsWith(".zip"));
      const downloadUrl = downloadAsset ? downloadAsset.browser_download_url : `https://github.com/${GITHUB_REPO}/releases/latest/download/BC-helperis.zip`;

      const updateInfo = {
        tag: latestTag,
        htmlUrl: release.html_url || `https://github.com/${GITHUB_REPO}/releases/latest`,
        downloadUrl: downloadUrl
      };

      await chrome.storage.local.set({
        bc_update_check: {
          timestamp: now,
          info: updateInfo
        }
      });

      if (isNewerVersion(latestTag, CURRENT_VERSION)) {
        showUpdateNotification(updateInfo);
      }
    } catch (e) {
      // Non-blocking: fail quietly on network/API errors
    }
  }

  function isNewerVersion(latestTag, currentVer) {
    if (!latestTag || !currentVer) return false;
    const cleanLatest = latestTag.replace(/^v/, "").trim();
    const cleanCurrent = currentVer.replace(/^v/, "").trim();
    const p1 = cleanLatest.split(".").map((n) => parseInt(n, 10) || 0);
    const p2 = cleanCurrent.split(".").map((n) => parseInt(n, 10) || 0);
    const len = Math.max(p1.length, p2.length);
    for (let i = 0; i < len; i++) {
      const n1 = p1[i] || 0;
      const n2 = p2[i] || 0;
      if (n1 > n2) return true;
      if (n1 < n2) return false;
    }
    return false;
  }

  function showUpdateNotification(info) {
    const drawer = document.getElementById("bc-bridge-drawer");
    if (!drawer || document.getElementById("bc-bridge-update-banner")) return;

    const banner = document.createElement("div");
    banner.id = "bc-bridge-update-banner";
    banner.className = "bc-bridge-update-banner";
    banner.innerHTML = `
      <div class="bc-bridge-update-content">
        <span class="bc-bridge-update-text">🎉 Pieejama jauna versija <b>${escapeHtml(info.tag)}</b>!</span>
        <div class="bc-bridge-update-actions">
          <a href="${escapeHtml(info.downloadUrl)}" target="_blank" class="bc-bridge-update-btn">Lejupielādēt ZIP</a>
          <button class="bc-bridge-update-dismiss" id="bc-bridge-dismiss-update" title="Aizvērt">✕</button>
        </div>
      </div>
    `;

    const header = drawer.querySelector(".bc-bridge-drawer-header");
    if (header) {
      header.insertAdjacentElement("afterend", banner);
      document.getElementById("bc-bridge-dismiss-update")?.addEventListener("click", () => {
        banner.remove();
      });
    }
  }

  // --------------------------------------------------------------------------
  // Toast Feedback System
  // --------------------------------------------------------------------------
  function showToast(message, type = "info") {
    const existing = document.querySelector(".bc-bridge-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.className = `bc-bridge-toast ${type}`;
    toast.innerText = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = "opacity 0.3s ease, transform 0.3s ease";
      toast.style.opacity = "0";
      toast.style.transform = "translateY(15px)";
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Run on page load
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
