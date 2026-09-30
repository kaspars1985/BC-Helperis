/**
 * eAMF -> Business Central Bridge
 * Popup Controller
 */

document.addEventListener("DOMContentLoaded", async () => {
  const statText = document.getElementById("stat-text");
  const itemList = document.getElementById("item-list");
  const btnCopy = document.getElementById("btn-copy");
  const btnSwitchBc = document.getElementById("btn-switch-bc");
  const btnClear = document.getElementById("btn-clear");
  const toast = document.getElementById("toast");

  let buffer = [];
  let settings = { formatPreset: "lv_std", customTemplate: "{Type}\t{No}\t\t{Qty}" };

  async function loadData() {
    const data = await chrome.storage.local.get(["bc_buffer", "bc_settings", "bc_update_check"]);
    buffer = data.bc_buffer || [];
    if (data.bc_settings) settings = { ...settings, ...data.bc_settings };
    if (data.bc_update_check?.info) {
      checkPopupUpdate(data.bc_update_check.info);
    }
    render();
  }

  function checkPopupUpdate(info) {
    if (!info || !info.tag) return;
    const currentVer = chrome.runtime.getManifest().version;
    const cleanLatest = info.tag.replace(/^v/, "").trim();
    const cleanCurrent = (currentVer || "").replace(/^v/, "").trim();
    const p1 = cleanLatest.split(".").map((n) => parseInt(n, 10) || 0);
    const p2 = cleanCurrent.split(".").map((n) => parseInt(n, 10) || 0);
    let isNewer = false;
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
      if ((p1[i] || 0) > (p2[i] || 0)) { isNewer = true; break; }
      if ((p1[i] || 0) < (p2[i] || 0)) { break; }
    }
    if (isNewer) {
      const alertEl = document.getElementById("update-alert");
      const tagEl = document.getElementById("update-tag");
      const linkEl = document.getElementById("update-link");
      if (alertEl && tagEl && linkEl) {
        tagEl.innerText = info.tag;
        linkEl.href = info.downloadUrl || "https://github.com/kaspars1985/BC-Helperis/releases/latest";
        alertEl.style.display = "flex";
      }
    }
  }

  function render() {
    const totalCount = buffer.reduce((acc, curr) => acc + (parseFloat(curr.qty) || 1), 0);
    const displayTotal = Math.round(totalCount * 100) / 100;
    statText.innerText = `${buffer.length} artikuli (${displayTotal} gab.)`;

    if (buffer.length === 0) {
      itemList.innerHTML = '<div class="empty-state">Buferī nav preču.<br>Pievienojiet tās vietnē eamf.lv!</div>';
      btnCopy.disabled = true;
      btnCopy.style.opacity = "0.6";
      btnSwitchBc.disabled = false;
      btnSwitchBc.style.opacity = "1";
      return;
    }

    btnCopy.disabled = false;
    btnCopy.style.opacity = "1";
    btnSwitchBc.disabled = false;
    btnSwitchBc.style.opacity = "1";

    itemList.innerHTML = "";
    // Show up to 10 latest items
    buffer.slice(-10).reverse().forEach((item) => {
      const pill = document.createElement("div");
      pill.className = "item-pill";
      pill.innerHTML = `
        <span class="item-code">${escapeHtml(item.code)}</span>
        <span class="item-qty">${item.qty} gab.</span>
      `;
      itemList.appendChild(pill);
    });

    if (buffer.length > 10) {
      const more = document.createElement("div");
      more.style.textAlign = "center";
      more.style.fontSize = "11px";
      more.style.color = "#64748b";
      more.innerText = `+ vēl ${buffer.length - 10} preces buferī`;
      itemList.appendChild(more);
    }
  }

  function showToast(msg) {
    toast.innerText = msg;
    toast.style.display = "block";
    setTimeout(() => {
      toast.style.display = "none";
    }, 2500);
  }

  function formatRows() {
    const preset = settings.formatPreset || "amf_std";
    const lines = buffer.map((item) => {
      const code = (item.code || "").trim();
      const rawQty = item.qty !== undefined && item.qty !== null ? item.qty : 1;
      const qty = String(rawQty).replace(".", ",");
      if (preset === "amf_std" || preset === "lv_std") return `Prece\t${code}\t${qty}`;
      if (preset === "compact") return `${code}\t${qty}`;
      if (preset === "en_std") return `Item\t${code}\t${qty}`;
      return `Prece\t${code}\t${qty}`;
    });
    return lines.join("\r\n") + "\r\n";
  }

  btnCopy.addEventListener("click", async () => {
    if (!buffer.length) return;
    const text = formatRows();
    try {
      await navigator.clipboard.writeText(text);
      showToast(`Nokopēts! BC klikšķiniet uz 'Tips' un spiediet Ctrl+V.`);
    } catch (e) {
      console.error(e);
    }
  });

  btnSwitchBc.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "GET_BC_TABS" }, async (res) => {
      if (res && res.tabs && res.tabs.length > 0) {
        // Copy rows if buffer has items
        if (buffer.length > 0) {
          try {
            await navigator.clipboard.writeText(formatRows());
          } catch (e) {
            console.warn(e);
          }
        }

        // Target last used or first tab
        const targetTab = res.tabs.find(t => t.id === settings.lastTargetTabId) || res.tabs[0];
        chrome.runtime.sendMessage(
          { action: "FOCUS_BC_TAB", tabId: targetTab.id, windowId: targetTab.windowId },
          () => {
            window.close();
          }
        );
      } else {
        const conf = confirm("Nav atvērtu BC ciļņu. Vai atvērt jaunu Business Central cilni?");
        if (conf) {
          if (buffer.length > 0) {
            try {
              await navigator.clipboard.writeText(formatRows());
            } catch (e) {}
          }
          chrome.runtime.sendMessage({ action: "OPEN_NEW_BC_TAB" });
          window.close();
        }
      }
    });
  });

  btnClear.addEventListener("click", async () => {
    if (!buffer.length) return;
    if (confirm("Notīrīt visus saglabātos artikulus?")) {
      buffer = [];
      await chrome.storage.local.set({ bc_buffer: [] });
      render();
    }
  });

  function escapeHtml(str) {
    if (!str) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  await loadData();
});
