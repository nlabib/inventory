const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const elements = {
  scanForm: document.querySelector("#scan-form"),
  scanInput: document.querySelector("#scan-input"),
  statusMessage: document.querySelector("#status-message"),
  totalItems: document.querySelector("#total-items"),
  uniqueItems: document.querySelector("#unique-items"),
  runningTotal: document.querySelector("#running-total"),
  lastUpc: document.querySelector("#last-upc"),
  lastTitle: document.querySelector("#last-title"),
  lastCost: document.querySelector("#last-cost"),
  lastCount: document.querySelector("#last-count"),
  lastTime: document.querySelector("#last-time"),
  recentScans: document.querySelector("#recent-scans"),
  sourceFile: document.querySelector("#source-file"),
  csvExport: document.querySelector("#csv-export"),
  xlsxExport: document.querySelector("#xlsx-export"),
  lastSaved: document.querySelector("#last-saved"),
  resetButton: document.querySelector("#reset-button"),
};

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Something went wrong.");
  }

  return payload;
}

function renderRecentScans(scans) {
  if (!scans.length) {
    elements.recentScans.innerHTML = '<p class="empty-state">Recent scans will appear here.</p>';
    return;
  }

  elements.recentScans.innerHTML = scans
    .map(
      (scan) => `
        <article class="recent-item">
          <div>
            <h3>${scan.description}</h3>
            <p>${scan.upc}</p>
          </div>
          <div class="recent-item-meta">
            <strong>${currencyFormatter.format(scan.cost)}</strong>
            <span>x${scan.count_for_item}</span>
            <time>${scan.timestamp}</time>
          </div>
        </article>
      `
    )
    .join("");
}

function renderState(state) {
  elements.totalItems.textContent = state.total_items;
  elements.uniqueItems.textContent = state.unique_items;
  elements.runningTotal.textContent = currencyFormatter.format(state.running_total);
  elements.sourceFile.textContent = state.source_csv || "-";
  elements.csvExport.textContent = state.csv_export_path || "-";
  elements.xlsxExport.textContent = state.xlsx_export_path || "-";
  elements.lastSaved.textContent = state.last_saved_at || "-";

  if (state.last_scan) {
    elements.lastUpc.textContent = state.last_scan.upc;
    elements.lastTitle.textContent = state.last_scan.description;
    elements.lastCost.textContent = currencyFormatter.format(state.last_scan.cost);
    elements.lastCount.textContent = state.last_scan.count_for_item;
    elements.lastTime.textContent = state.last_scan.timestamp;
  } else {
    elements.lastUpc.textContent = "-";
    elements.lastTitle.textContent = "No item scanned yet";
    elements.lastCost.textContent = currencyFormatter.format(0);
    elements.lastCount.textContent = "0";
    elements.lastTime.textContent = "-";
  }

  renderRecentScans(state.recent_scans || []);
}

async function loadState() {
  try {
    const state = await apiRequest("/api/state", { method: "GET" });
    renderState(state);
  } catch (error) {
    elements.statusMessage.textContent = error.message;
    elements.statusMessage.dataset.state = "error";
  }
}

elements.scanForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const upc = elements.scanInput.value.trim();

  if (!upc) {
    elements.statusMessage.textContent = "Scan a barcode first.";
    elements.statusMessage.dataset.state = "error";
    elements.scanInput.focus();
    return;
  }

  try {
    elements.statusMessage.textContent = "Saving scan...";
    elements.statusMessage.dataset.state = "working";
    const state = await apiRequest("/api/scan", {
      method: "POST",
      body: JSON.stringify({ upc }),
    });
    renderState(state);
    elements.statusMessage.textContent = `Saved ${state.last_scan.description}`;
    elements.statusMessage.dataset.state = "success";
    elements.scanInput.value = "";
    elements.scanInput.focus();
  } catch (error) {
    elements.statusMessage.textContent = error.message;
    elements.statusMessage.dataset.state = "error";
    elements.scanInput.select();
    elements.scanInput.focus();
  }
});

elements.resetButton.addEventListener("click", async () => {
  try {
    const state = await apiRequest("/api/reset", {
      method: "POST",
      body: JSON.stringify({}),
    });
    renderState(state);
    elements.statusMessage.textContent = "Session reset and exports cleared.";
    elements.statusMessage.dataset.state = "success";
    elements.scanInput.focus();
  } catch (error) {
    elements.statusMessage.textContent = error.message;
    elements.statusMessage.dataset.state = "error";
  }
});

window.addEventListener("load", () => {
  loadState();
  elements.scanInput.focus();
});
