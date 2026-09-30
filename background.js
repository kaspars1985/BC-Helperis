/**
 * eAMF -> Business Central Bridge
 * Background Service Worker (Manifest V3)
 */

// Initialize Context Menus on Installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "add_selection_to_bc",
    title: "Pievienot BC helperim: \"%s\"",
    contexts: ["selection"]
  });
});

// Handle Context Menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "add_selection_to_bc" && info.selectionText) {
    const rawText = info.selectionText.trim();
    if (!rawText) return;

    // Send message to content script in the current tab to add this item
    if (tab && tab.id) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          action: "ADD_ITEM_FROM_SELECTION",
          code: rawText
        });
      } catch (err) {
        // Fallback: directly update chrome.storage if tab cannot receive message
        addItemDirectlyToStorage(rawText);
      }
    } else {
      addItemDirectlyToStorage(rawText);
    }
  }
});

// Fallback helper to save to storage directly
async function addItemDirectlyToStorage(code) {
  try {
    const data = await chrome.storage.local.get(["bc_buffer"]);
    const buffer = data.bc_buffer || [];
    
    // Check if already exists, increment qty
    const existingIndex = buffer.findIndex(i => i.code.toLowerCase() === code.toLowerCase());
    if (existingIndex >= 0) {
      const prevQty = parseFloat(buffer[existingIndex].qty) || 1;
      buffer[existingIndex].qty = Math.round((prevQty + 1) * 100) / 100;
    } else {
      buffer.push({
        id: "item_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
        code: code,
        name: "Iezīmētais artikuls",
        qty: 1,
        price: "",
        addedAt: new Date().toISOString()
      });
    }

    await chrome.storage.local.set({ bc_buffer: buffer });
  } catch (e) {
    console.error("Kļūda saglabājot buferī:", e);
  }
}

// Check if tab belongs to Business Central (Cloud, AMF on-premise VPN, or NAV)
function isBCTab(tab) {
  if (!tab) return false;
  const url = (tab.url || "").toLowerCase();
  const title = (tab.title || "").toLowerCase();

  // Exclude eamf webshop or extension pages
  if (url.includes("eamf.lv") || url.includes("chrome-extension://") || url.includes("edge://extensions")) {
    return false;
  }

  // 1. Match by URL patterns
  if (
    url.includes("businesscentral") ||
    url.includes("dynamics.com")
  ) {
    return true;
  }

  // 2. Match by Tab Title
  if (
    title.includes("pārdošanas pasūtījums") ||
    title.includes("pirkuma pasūtījums") ||
    title.includes("pasūtījums") ||
    title.includes("sales order") ||
    title.includes("purchase order") ||
    title.includes("business central") ||
    title.includes("dynamics 365") ||
    /\bppas\d+/i.test(title) ||
    /\bppir\d+/i.test(title)
  ) {
    return true;
  }

  return false;
}

// Clean BC tab title for clear human presentation (removes 'Pārdošanas pasūtījums - ' etc.)
function cleanBCTabTitle(rawTitle) {
  if (!rawTitle) return "Business Central pasūtījums";
  return rawTitle
    .replace(/\s*·\s*Dynamics 365 Business Central\s*/gi, "")
    .replace(/\s*-\s*Dynamics 365 Business Central\s*/gi, "")
    .replace(/\s*\|\s*Dynamics 365 Business Central\s*/gi, "")
    .replace(/\s*Dynamics 365 Business Central\s*/gi, "")
    .replace(/^\s*(pārdošanas pasūtījums|pirkuma pasūtījums|sales order|purchase order)\s*[-–—:]*\s*/gi, "")
    .trim() || "Business Central pasūtījums";
}

// Message Listener from Content Scripts and Popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "GET_BC_TABS") {
    // Query all tabs and filter for Business Central tabs
    chrome.tabs.query({}, (tabs) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message, tabs: [] });
        return;
      }

      const matchingTabs = (tabs || []).filter(isBCTab);

      const formattedTabs = matchingTabs.map((t) => ({
        id: t.id,
        windowId: t.windowId,
        rawTitle: t.title || "Business Central",
        cleanTitle: cleanBCTabTitle(t.title),
        url: t.url,
        favIconUrl: t.favIconUrl || "icons/icon48.png",
        active: t.active
      }));

      sendResponse({ success: true, tabs: formattedTabs });
    });
    return true; // Keep message channel open for async response
  }

  if (request.action === "FOCUS_BC_TAB") {
    const { tabId, windowId } = request;
    if (!tabId) {
      sendResponse({ success: false, error: "Nav norādīts tabId" });
      return;
    }

    // Activate the tab
    chrome.tabs.update(tabId, { active: true }, (updatedTab) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
        return;
      }

      // Bring the window to front if windowId provided
      const targetWindowId = windowId || (updatedTab ? updatedTab.windowId : null);
      if (targetWindowId) {
        chrome.windows.update(targetWindowId, { focused: true }, () => {
          sendResponse({ success: true });
        });
      } else {
        sendResponse({ success: true });
      }
    });
    return true;
  }

  if (request.action === "OPEN_NEW_BC_TAB") {
    chrome.storage.local.get(["bc_settings"], (data) => {
      const customUrl = data.bc_settings?.customBcUrl || "https://businesscentral.dynamics.com/";
      chrome.tabs.create({ url: customUrl }, (newTab) => {
        sendResponse({ success: true, tabId: newTab.id });
      });
    });
    return true;
  }
});
