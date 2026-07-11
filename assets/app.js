(() => {
  "use strict";

  const fallbackImage = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
      <rect width="100%" height="100%" fill="#e9f1ec"/>
      <text x="50%" y="46%" text-anchor="middle" font-size="92">🌸</text>
      <text x="50%" y="62%" text-anchor="middle" font-family="Arial" font-size="26" fill="#315f49">Thêm ảnh sản phẩm thật</text>
    </svg>`);

  const state = {
    products: [],
    productFilter: "Tất cả",
    productSearch: "",
    galleryFilter: "Tất cả",
    cart: JSON.parse(localStorage.getItem("flower_cart_v2") || "{}")
  };

  const $ = (s, scope = document) => scope.querySelector(s);
  const $$ = (s, scope = document) => [...scope.querySelectorAll(s)];
  const money = n => Number(n || 0).toLocaleString("vi-VN") + "₫";
  let config = window.SITE_CONFIG || {};

  async function loadSiteConfig() {
    try {
      const response = await fetch("content/site.json", { cache: "no-store" });
      if (!response.ok) throw new Error("Không tải được content/site.json");
      config = { ...config, ...(await response.json()) };
    } catch (error) {
      console.warn("Đang dùng dữ liệu dự phòng trong data/config.js.", error);
    }
  }

  function setText(selector, value) {
    $$(selector).forEach(el => el.textContent = value || "");
  }

  function setHref(selector, value) {
    $$(selector).forEach(el => el.href = value || "#");
  }

  function hydrateConfig() {
    setText("[data-brand]", config.brand);
    setText("[data-tagline]", config.tagline);
    setText("[data-owner-name]", config.ownerName);
    setText("[data-hero-title]", config.heroTitle);
    setText("[data-hero-text]", config.heroText);
    setText("[data-about-title]", config.aboutTitle);
    setText("[data-about-text]", config.aboutText);
    setText("[data-footer-text]", config.footerText);
    setText("[data-phone]", config.phone);
    setText("[data-email]", config.email);
    setText("[data-location]", config.location);
    setHref("[data-phone-link]", `tel:${config.phoneRaw || ""}`);
    setHref("[data-email-link]", `mailto:${config.email || ""}`);
    setHref("[data-facebook-link]", config.facebookUrl);
    setHref("[data-zalo-link]", config.zaloUrl);
    document.title = `${config.brand || "Vườn Hoa"} | Cây giống & hạt giống hoa`;
    const hero = $("[data-hero-image]");
    const about = $("[data-about-image]");
    if (hero) hero.src = config.heroImage || fallbackImage;
    if (about) about.src = config.aboutImage || fallbackImage;
    $("#year").textContent = new Date().getFullYear();
  }

  function imgTag(src, alt = "") {
    const safe = (src || fallbackImage).replace(/"/g, "&quot;");
    return `<img src="${safe}" alt="${alt.replace(/"/g, "&quot;")}" loading="lazy" onerror="this.src='${fallbackImage}'">`;
  }

  function renderStories() {
    const stories = config.stories || [];
    $("#storyStrip").innerHTML = stories.map((item, i) => `
      <article class="story-card">
        ${imgTag(item.image, item.caption)}
        <span class="story-number">${String(i + 1).padStart(2, "0")}</span>
        <div class="story-caption">${item.caption}</div>
      </article>`).join("");
  }

  function renderCategories() {
    const categories = config.categories || [];
    $("#categoryGrid").innerHTML = categories.map(item => `
      <article class="category-card" data-category="${item.name}">
        ${imgTag(item.image, item.name)}
        <div><small>${item.subtitle}</small><strong>${item.name}</strong></div>
      </article>`).join("");
    $$(".category-card").forEach(card => card.addEventListener("click", () => {
      state.productFilter = card.dataset.category;
      renderProductFilters();
      renderProducts();
      $("#san-pham").scrollIntoView({behavior: "smooth"});
    }));
  }

  function parseCSV(text) {
    const rows = [];
    let row = [], cell = "", quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i], next = text[i + 1];
      if (c === '"' && quoted && next === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = !quoted;
      else if (c === "," && !quoted) { row.push(cell); cell = ""; }
      else if ((c === "\n" || c === "\r") && !quoted) {
        if (c === "\r" && next === "\n") i++;
        row.push(cell); cell = "";
        if (row.some(v => v.trim() !== "")) rows.push(row);
        row = [];
      } else cell += c;
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    if (!rows.length) return [];
    const headers = rows.shift().map(h => h.trim());
    return rows.map(values => Object.fromEntries(headers.map((h, i) => [h, (values[i] || "").trim()])));
  }

  function normalizeProduct(p, idx = 0) {
    return {
      id: String(p.id || `SP-${idx + 1}`),
      name: String(p.name || "Sản phẩm"),
      category: String(p.category || "Khác"),
      price: Number(String(p.price || 0).replace(/[^\d.-]/g, "")),
      oldPrice: Number(String(p.oldPrice || p.old_price || 0).replace(/[^\d.-]/g, "")),
      status: String(p.status || "available").toLowerCase(),
      badge: String(p.badge || ""),
      description: String(p.description || ""),
      image: String(p.image || fallbackImage),
      stock: Number(String(p.stock || 0).replace(/[^\d.-]/g, "")),
      featured: String(p.featured ?? "true").toLowerCase() !== "false"
    };
  }

  async function loadProducts() {
    if (config.googleSheetCsv) {
      try {
        const res = await fetch(config.googleSheetCsv, {cache: "no-store"});
        if (!res.ok) throw new Error("Không tải được Google Sheet");
        const data = parseCSV(await res.text()).map(normalizeProduct);
        if (data.length) return data;
      } catch (error) {
        console.warn("Không tải được dữ liệu Google Sheet, dùng dữ liệu dự phòng.", error);
      }
    }
    try {
      const response = await fetch("content/products.json", { cache: "no-store" });
      if (!response.ok) throw new Error("Không tải được content/products.json");
      const payload = await response.json();
      const products = Array.isArray(payload) ? payload : payload.products;
      if (Array.isArray(products)) return products.map(normalizeProduct);
    } catch (error) {
      console.warn("Đang dùng dữ liệu dự phòng trong data/products.js.", error);
    }
    return (window.PRODUCTS || []).map(normalizeProduct);
  }

  function productStatus(p) {
    if (p.status === "preorder") return {label:"Đặt trước", cls:"status-preorder"};
    if (p.status === "out" || (p.stock <= 0 && p.status !== "preorder")) return {label:"Hết hàng", cls:"status-out"};
    return {label:"Còn hàng", cls:"status-available"};
  }

  function renderProductFilters() {
    const categories = ["Tất cả", ...new Set(state.products.map(p => p.category))];
    $("#productFilters").innerHTML = categories.map(cat => `
      <button class="filter-chip ${cat === state.productFilter ? "active" : ""}" data-filter="${cat}">${cat}</button>`).join("");
    $$("#productFilters .filter-chip").forEach(btn => btn.addEventListener("click", () => {
      state.productFilter = btn.dataset.filter;
      renderProductFilters();
      renderProducts();
    }));
  }

  function renderProducts() {
    const term = state.productSearch.trim().toLowerCase();
    const products = state.products.filter(p =>
      (state.productFilter === "Tất cả" || p.category === state.productFilter) &&
      (!term || `${p.name} ${p.description} ${p.category}`.toLowerCase().includes(term))
    );
    $("#productGrid").innerHTML = products.length ? products.map(p => {
      const status = productStatus(p);
      const disabled = status.label === "Hết hàng";
      return `
        <article class="product-card">
          <div class="product-photo">
            ${imgTag(p.image, p.name)}
            ${p.badge ? `<span class="product-badge">${p.badge}</span>` : ""}
            <span class="product-status ${status.cls}">${status.label}</span>
          </div>
          <div class="product-body">
            <span class="product-category">${p.category}</span>
            <h3>${p.name}</h3>
            <p class="product-desc">${p.description}</p>
            <div class="product-bottom">
              <div class="product-price"><strong>${money(p.price)}</strong>${p.oldPrice ? `<del>${money(p.oldPrice)}</del>` : ""}</div>
              <div class="qty-buy">
                <div class="qty-control">
                  <button type="button" data-qty-minus="${p.id}">−</button>
                  <input id="qty-${p.id}" type="number" min="1" value="1" aria-label="Số lượng ${p.name}">
                  <button type="button" data-qty-plus="${p.id}">+</button>
                </div>
                <button class="add-cart" type="button" data-add="${p.id}" ${disabled ? "disabled" : ""}>
                  ${p.status === "preorder" ? "Đặt trước" : disabled ? "Hết hàng" : "Thêm vào giỏ"}
                </button>
              </div>
            </div>
          </div>
        </article>`;
    }).join("") : `<div class="empty-cart" style="grid-column:1/-1"><span>🌱</span><p>Không tìm thấy sản phẩm phù hợp.</p></div>`;

    $$("[data-qty-minus]").forEach(btn => btn.addEventListener("click", () => changeInputQty(btn.dataset.qtyMinus, -1)));
    $$("[data-qty-plus]").forEach(btn => btn.addEventListener("click", () => changeInputQty(btn.dataset.qtyPlus, 1)));
    $$("[data-add]").forEach(btn => btn.addEventListener("click", () => {
      const id = btn.dataset.add;
      const input = $(`#qty-${CSS.escape(id)}`);
      addToCart(id, Math.max(1, Number(input?.value || 1)));
    }));
  }

  function changeInputQty(id, delta) {
    const input = $(`#qty-${CSS.escape(id)}`);
    if (input) input.value = Math.max(1, Number(input.value || 1) + delta);
  }

  function renderArticles() {
    $("#articleGrid").innerHTML = (config.articles || []).map(a => `
      <article class="article-card reveal">
        ${imgTag(a.image, a.title)}
        <div class="article-body"><small>${a.tag}</small><h3>${a.title}</h3><p>${a.excerpt}</p></div>
      </article>`).join("");
  }

  function renderGalleryFilters() {
    const cats = ["Tất cả", ...new Set((config.gallery || []).map(g => g.category))];
    $("#galleryFilters").innerHTML = cats.map(cat => `
      <button class="filter-chip ${cat === state.galleryFilter ? "active" : ""}" data-gallery-filter="${cat}">${cat}</button>`).join("");
    $$("[data-gallery-filter]").forEach(btn => btn.addEventListener("click", () => {
      state.galleryFilter = btn.dataset.galleryFilter;
      renderGalleryFilters();
      renderGallery();
    }));
  }

  function renderGallery() {
    const items = (config.gallery || []).filter(g => state.galleryFilter === "Tất cả" || g.category === state.galleryFilter);
    $("#galleryGrid").innerHTML = items.map(item => `
      <figure class="gallery-item" data-lightbox="${item.image}" data-caption="${item.caption.replace(/"/g, "&quot;")}">
        ${imgTag(item.image, item.caption)}
      </figure>`).join("");
    $$(".gallery-item").forEach(item => item.addEventListener("click", () => {
      $("#lightboxImage").src = item.dataset.lightbox;
      $("#lightboxCaption").textContent = item.dataset.caption;
      openModal($("#lightbox"));
    }));
  }

  function renderTestimonials() {
    $("#testimonialGrid").innerHTML = (config.testimonials || []).map((t, i) => `
      <article class="testimonial-card reveal">
        <div class="stars">★★★★★</div>
        <blockquote>“${t.text}”</blockquote>
        <footer><span>${String.fromCharCode(65 + i)}</span><div><strong>${t.name}</strong><small>${t.note}</small></div></footer>
      </article>`).join("");
  }

  function saveCart() {
    localStorage.setItem("flower_cart_v2", JSON.stringify(state.cart));
    renderCart();
  }

  function addToCart(id, qty = 1) {
    state.cart[id] = (state.cart[id] || 0) + qty;
    saveCart();
    showToast("Đã thêm vào giỏ hàng");
  }

  function cartData() {
    const items = Object.entries(state.cart).map(([id, qty]) => {
      const product = state.products.find(p => p.id === id);
      return product ? {...product, qty} : null;
    }).filter(Boolean);
    return {items, total: items.reduce((sum, p) => sum + p.price * p.qty, 0)};
  }

  function renderCart() {
    const {items, total} = cartData();
    $("#cartCount").textContent = items.reduce((s, p) => s + p.qty, 0);
    $("#cartTotal").textContent = money(total);
    $("#cartItems").innerHTML = items.length ? items.map(p => `
      <article class="cart-item">
        ${imgTag(p.image, p.name)}
        <div>
          <h4>${p.name}</h4>
          <div class="cart-item-price">${money(p.price)}</div>
          <div class="mini-qty">
            <button type="button" data-cart-minus="${p.id}">−</button>
            <strong>${p.qty}</strong>
            <button type="button" data-cart-plus="${p.id}">+</button>
          </div>
        </div>
        <button class="remove-item" type="button" data-remove="${p.id}">Xóa</button>
      </article>`).join("") : `<div class="empty-cart"><span>🛒</span><p>Giỏ hàng đang trống.<br>Hãy chọn loại hoa bạn yêu thích.</p></div>`;
    $$("[data-cart-minus]").forEach(btn => btn.addEventListener("click", () => updateCart(btn.dataset.cartMinus, -1)));
    $$("[data-cart-plus]").forEach(btn => btn.addEventListener("click", () => updateCart(btn.dataset.cartPlus, 1)));
    $$("[data-remove]").forEach(btn => btn.addEventListener("click", () => {
      delete state.cart[btn.dataset.remove];
      saveCart();
    }));
  }

  function updateCart(id, delta) {
    state.cart[id] = (state.cart[id] || 0) + delta;
    if (state.cart[id] <= 0) delete state.cart[id];
    saveCart();
  }

  function openDrawer() {
    $("#cartDrawer").classList.add("open");
    $("#cartDrawer").setAttribute("aria-hidden", "false");
    showOverlay();
  }

  function closeDrawer() {
    $("#cartDrawer").classList.remove("open");
    $("#cartDrawer").setAttribute("aria-hidden", "true");
    hideOverlayIfClear();
  }

  function openModal(el) {
    el.classList.add("open");
    el.setAttribute("aria-hidden", "false");
    showOverlay();
  }

  function closeModals() {
    $$(".modal.open").forEach(el => {
      el.classList.remove("open");
      el.setAttribute("aria-hidden", "true");
    });
    hideOverlayIfClear();
  }

  function showOverlay() {
    $("#pageOverlay").classList.add("show");
    document.body.classList.add("locked");
  }

  function hideOverlayIfClear() {
    if (!$(".cart-drawer.open") && !$(".modal.open") && !$(".mobile-panel.open")) {
      $("#pageOverlay").classList.remove("show");
      document.body.classList.remove("locked");
    }
  }

  function checkoutText(formData = {}) {
    const {items, total} = cartData();
    return [
      `ĐƠN HÀNG - ${config.brand || "VƯỜN HOA"}`,
      formData.name ? `Khách hàng: ${formData.name}` : "",
      formData.phone ? `Điện thoại: ${formData.phone}` : "",
      formData.address ? `Địa chỉ: ${formData.address}` : "",
      formData.payment ? `Thanh toán: ${formData.payment}` : "",
      formData.note ? `Ghi chú: ${formData.note}` : "",
      "",
      "SẢN PHẨM:",
      ...items.map(p => `${p.qty} × ${p.name} — ${money(p.price * p.qty)}`),
      "",
      `TẠM TÍNH: ${money(total)}`,
      "Phí vận chuyển: cửa hàng xác nhận sau"
    ].filter((v, i, arr) => v !== "" || arr[i - 1] !== "").join("\n");
  }

  function prepareCheckout() {
    const {items, total} = cartData();
    if (!items.length) return showToast("Giỏ hàng đang trống");
    $("#checkoutSummary").innerHTML = `
      <strong>Sản phẩm đã chọn</strong>
      <ul>${items.map(p => `<li>${p.qty} × ${p.name}: ${money(p.price * p.qty)}</li>`).join("")}</ul>
      <strong>Tạm tính: ${money(total)}</strong>`;
    $("#orderItemsField").value = items.map(p => `${p.qty} × ${p.name} (${p.id}) = ${money(p.price * p.qty)}`).join(" | ");
    $("#orderTotalField").value = money(total);
    closeDrawer();
    openModal($("#checkoutModal"));
  }

  async function copyOrder() {
    const form = $("#orderForm");
    const data = Object.fromEntries(new FormData(form).entries());
    const text = checkoutText(data);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    showToast("Đã sao chép đơn hàng");
  }

  function showToast(text) {
    const toast = $("#toast");
    toast.textContent = text;
    toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("show"), 1800);
  }

  function bindUI() {
    $("#cartBtn").addEventListener("click", openDrawer);
    $("#cartClose").addEventListener("click", closeDrawer);
    $("#checkoutOpen").addEventListener("click", prepareCheckout);
    $("#copyOrderBtn").addEventListener("click", copyOrder);
    $("#pageOverlay").addEventListener("click", () => {
      closeDrawer(); closeModals();
      $("#mobilePanel").classList.remove("open");
      hideOverlayIfClear();
    });
    $$("[data-modal-close]").forEach(btn => btn.addEventListener("click", closeModals));

    $("#menuBtn").addEventListener("click", () => {
      $("#mobilePanel").classList.add("open");
      $("#pageOverlay").classList.add("show");
      document.body.classList.add("locked");
    });
    $("#mobileClose").addEventListener("click", () => {
      $("#mobilePanel").classList.remove("open");
      hideOverlayIfClear();
    });
    $$("#mobilePanel a").forEach(a => a.addEventListener("click", () => {
      $("#mobilePanel").classList.remove("open");
      hideOverlayIfClear();
    }));

    $("#productSearch").addEventListener("input", e => {
      state.productSearch = e.target.value;
      renderProducts();
    });

    $("#orderForm").addEventListener("submit", e => {
      const {items} = cartData();
      if (!items.length) {
        e.preventDefault();
        showToast("Giỏ hàng đang trống");
        return;
      }
      if (location.protocol === "file:") {
        e.preventDefault();
        copyOrder();
        alert("Bạn đang mở website từ máy tính. Nội dung đơn đã được sao chép. Sau khi đăng lên Netlify, biểu mẫu sẽ lưu đơn tự động.");
      }
    });
  }

  function observeReveal() {
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          io.unobserve(entry.target);
        }
      });
    }, {threshold:.12});
    $$(".reveal").forEach(el => io.observe(el));
  }

  async function init() {
    await loadSiteConfig();
    hydrateConfig();
    renderStories();
    renderCategories();
    state.products = await loadProducts();
    renderProductFilters();
    renderProducts();
    renderArticles();
    renderGalleryFilters();
    renderGallery();
    renderTestimonials();
    renderCart();
    bindUI();
    observeReveal();
  }

  document.addEventListener("DOMContentLoaded", init);
})();