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
  quantityModal: document.querySelector("#quantity-modal"),
  quantityForm: document.querySelector("#quantity-form"),
  quantityInput: document.querySelector("#quantity-input"),
  quantityCancel: document.querySelector("#quantity-cancel"),
  modalItemTitle: document.querySelector("#modal-item-title"),
  modalItemUpc: document.querySelector("#modal-item-upc"),
  modalItemCost: document.querySelector("#modal-item-cost"),
  modalCurrentQuantity: document.querySelector("#modal-current-quantity"),
  addProductForm: document.querySelector("#add-product-form"),
  addUpc: document.querySelector("#add-upc"),
  addName: document.querySelector("#add-name"),
  addCost: document.querySelector("#add-cost"),
  updateCostForm: document.querySelector("#update-cost-form"),
  updateUpc: document.querySelector("#update-upc"),
  updateCost: document.querySelector("#update-cost"),
  productAction: document.querySelector("#product-action"),
  productName: document.querySelector("#product-name"),
  productUpc: document.querySelector("#product-upc"),
  productCost: document.querySelector("#product-cost"),
  productTime: document.querySelector("#product-time"),
};

let activeItem = null;

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
    elements.recentScans.innerHTML = '<p class="empty-state">Recent quantity saves will appear here.</p>';
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
            <span>Qty ${scan.count_for_item}</span>
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

  if (state.last_product_change) {
    const label = state.last_product_change.action === "added" ? "Added product" : "Updated cost price";
    elements.productAction.textContent = label;
    elements.productName.textContent = state.last_product_change.description;
    elements.productUpc.textContent = state.last_product_change.upc;
    elements.productCost.textContent = currencyFormatter.format(state.last_product_change.cost);
    elements.productTime.textContent = state.last_product_change.timestamp;
  } else {
    elements.productAction.textContent = "No product change saved yet.";
    elements.productName.textContent = "-";
    elements.productUpc.textContent = "-";
    elements.productCost.textContent = currencyFormatter.format(0);
    elements.productTime.textContent = "-";
  }

  renderRecentScans(state.recent_scans || []);
}

function openQuantityModal(item) {
  activeItem = item;
  elements.modalItemTitle.textContent = item.description;
  elements.modalItemUpc.textContent = item.upc;
  elements.modalItemCost.textContent = currencyFormatter.format(item.cost);
  elements.modalCurrentQuantity.textContent = item.current_quantity;
  elements.quantityInput.value = item.current_quantity;
  elements.quantityModal.classList.remove("hidden");
  elements.quantityModal.setAttribute("aria-hidden", "false");

  window.requestAnimationFrame(() => {
    elements.quantityInput.focus();
    elements.quantityInput.select();
  });
}

function closeQuantityModal() {
  activeItem = null;
  elements.quantityModal.classList.add("hidden");
  elements.quantityModal.setAttribute("aria-hidden", "true");
  elements.scanInput.value = "";
  elements.scanInput.focus();
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
    elements.statusMessage.textContent = "Looking up item...";
    elements.statusMessage.dataset.state = "working";
    const lookup = await apiRequest("/api/lookup", {
      method: "POST",
      body: JSON.stringify({ upc }),
    });
    openQuantityModal(lookup.item);
    elements.statusMessage.textContent = `Enter quantity for ${lookup.item.description}`;
    elements.statusMessage.dataset.state = "success";
  } catch (error) {
    elements.statusMessage.textContent = error.message;
    elements.statusMessage.dataset.state = "error";
    if (error.message.includes("No inventory record found")) {
      elements.addUpc.value = upc;
      elements.addName.focus();
      return;
    }
    elements.scanInput.select();
    elements.scanInput.focus();
  }
});

elements.quantityForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!activeItem) {
    return;
  }

  const quantity = Number.parseInt(elements.quantityInput.value, 10);
  if (Number.isNaN(quantity) || quantity < 0) {
    elements.statusMessage.textContent = "Enter a valid quantity of 0 or more.";
    elements.statusMessage.dataset.state = "error";
    elements.quantityInput.focus();
    elements.quantityInput.select();
    return;
  }

  try {
    elements.statusMessage.textContent = "Saving quantity...";
    elements.statusMessage.dataset.state = "working";
    const state = await apiRequest("/api/scan", {
      method: "POST",
      body: JSON.stringify({ upc: activeItem.upc, quantity }),
    });
    renderState(state);
    elements.statusMessage.textContent = `Saved quantity ${quantity} for ${state.last_scan.description}`;
    elements.statusMessage.dataset.state = "success";
    closeQuantityModal();
  } catch (error) {
    elements.statusMessage.textContent = error.message;
    elements.statusMessage.dataset.state = "error";
    elements.quantityInput.focus();
    elements.quantityInput.select();
  }
});

elements.quantityCancel.addEventListener("click", () => {
  elements.statusMessage.textContent = "Quantity entry canceled.";
  elements.statusMessage.dataset.state = "working";
  closeQuantityModal();
});

elements.quantityModal.addEventListener("click", (event) => {
  if (event.target === elements.quantityModal) {
    closeQuantityModal();
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !elements.quantityModal.classList.contains("hidden")) {
    closeQuantityModal();
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

elements.addProductForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    elements.statusMessage.textContent = "Adding product...";
    elements.statusMessage.dataset.state = "working";
    const state = await apiRequest("/api/products", {
      method: "POST",
      body: JSON.stringify({
        upc: elements.addUpc.value.trim(),
        description: elements.addName.value.trim(),
        cost: elements.addCost.value.trim(),
      }),
    });
    renderState(state);
    elements.statusMessage.textContent = `Added ${state.last_product_change.description}`;
    elements.statusMessage.dataset.state = "success";
    elements.addProductForm.reset();
    elements.scanInput.focus();
  } catch (error) {
    elements.statusMessage.textContent = error.message;
    elements.statusMessage.dataset.state = "error";
    elements.addUpc.focus();
  }
});

elements.updateCostForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    elements.statusMessage.textContent = "Updating cost price...";
    elements.statusMessage.dataset.state = "working";
    const state = await apiRequest("/api/products/update-cost", {
      method: "POST",
      body: JSON.stringify({
        upc: elements.updateUpc.value.trim(),
        cost: elements.updateCost.value.trim(),
      }),
    });
    renderState(state);
    elements.statusMessage.textContent = `Updated cost for ${state.last_product_change.description}`;
    elements.statusMessage.dataset.state = "success";
    elements.updateCostForm.reset();
    elements.scanInput.focus();
  } catch (error) {
    elements.statusMessage.textContent = error.message;
    elements.statusMessage.dataset.state = "error";
    elements.updateUpc.focus();
  }
});

window.addEventListener("load", () => {
  loadState();
  elements.scanInput.focus();
});
