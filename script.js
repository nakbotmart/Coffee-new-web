/* ==========================================================================
   Fresh Craft Coffee — script.js
   จัดการ 3 หน้า: product.html, order.html, admin.html
   สคริปต์นี้ตรวจสอบว่า element ของแต่ละหน้ามีอยู่จริงก่อนค่อยทำงาน
   จึงสามารถแนบไฟล์เดียวกันนี้ไว้ในทุกหน้าได้โดยไม่พัง
   ========================================================================== */

(function () {
  "use strict";

  /* ------------------------------------------------------------------------
     ค่าคงที่ / การตั้งค่า
     ------------------------------------------------------------------------ */
  const PRODUCTS_JSON_URL = "products.json";
  const ORDER_ENDPOINT_URL =
    "https://script.google.com/macros/s/AKfycbwndaMgVNnN8HabBVCLAPhLf_z926x9wfS41ZFkVbRIsfcfaLuJHb-BCP4j5Kdg51PS/exec";
  const ORDERS_CSV_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vTQ3ZV_waOPVj20de-qGlnNKn5AygN13Sv71Nuwxig46_DtlCRlBb285HFKjPfVkiPL0L-qbS_hE91R/pub?gid=0&single=true&output=csv";

  const MOOD_OPTIONS = [
    { value: "", label: "ทั้งหมด" },
    { value: "espresso", label: "เข้มข้น ตื่นตัว" },
    { value: "latte", label: "นุ่มนวล ผ่อนคลาย" },
    { value: "fruity", label: "สดชื่น ผลไม้" },
    { value: "coldbrew", label: "สกัดเย็น ดื่มง่าย" },
  ];

  /* ------------------------------------------------------------------------
     Utilities
     ------------------------------------------------------------------------ */
  function getQueryParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* ==========================================================================
     1) product.html — รายการสินค้า + ตัวกรอง mood
     ========================================================================== */
  function initProductPage() {
    const listEl = document.getElementById("product-list");
    const filterBarEl = document.getElementById("filter-bar");

    if (!listEl && !filterBarEl) return; // ไม่ใช่หน้านี้

    const activeMood = getQueryParam("mood") || "";

    if (filterBarEl) {
      renderFilterBar(filterBarEl, activeMood);
    }

    if (listEl) {
      listEl.innerHTML = '<p class="loading-msg">กำลังโหลดสินค้า...</p>';

      fetch(PRODUCTS_JSON_URL)
        .then((res) => {
          if (!res.ok) throw new Error("โหลดข้อมูลสินค้าไม่สำเร็จ");
          return res.json();
        })
        .then((data) => {
          const allProducts = Array.isArray(data) ? data : data.products || [];
          const filtered = activeMood
            ? allProducts.filter((p) => p.mood === activeMood)
            : allProducts;
          renderProductList(listEl, filtered);
        })
        .catch((err) => {
          listEl.innerHTML =
            '<p class="empty-msg">เกิดข้อผิดพลาดในการโหลดสินค้า: ' +
            escapeHtml(err.message) +
            "</p>";
        });
    }
  }

  function renderFilterBar(filterBarEl, activeMood) {
    filterBarEl.innerHTML = "";

    MOOD_OPTIONS.forEach((opt) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mood-chip";
      btn.textContent = opt.label;
      btn.dataset.mood = opt.value;

      const isActive = opt.value === activeMood;
      btn.setAttribute("aria-selected", isActive ? "true" : "false");

      btn.addEventListener("click", function () {
        const url = opt.value
          ? "product.html?mood=" + encodeURIComponent(opt.value)
          : "product.html";
        window.location.href = url;
      });

      filterBarEl.appendChild(btn);
    });
  }

  function renderProductList(listEl, products) {
    listEl.innerHTML = "";

    if (!products || products.length === 0) {
      listEl.innerHTML =
        '<p class="empty-msg">ไม่พบสินค้าในหมวดหมู่นี้ ลองเลือกหมวดอื่นดูนะครับ</p>';
      return;
    }

    const grid = document.createElement("div");
    grid.className = "product-grid";

    products.forEach((product) => {
      grid.appendChild(createProductCard(product));
    });

    listEl.appendChild(grid);
  }

  function createProductCard(product) {
    const card = document.createElement("article");
    card.className = "product-card";
    card.dataset.mood = product.mood || "";

    const moodLabel =
      (MOOD_OPTIONS.find((m) => m.value === product.mood) || {}).label ||
      product.mood ||
      "";

    const orderUrl =
      "order.html?item=" +
      encodeURIComponent(product.name) +
      "&price=" +
      encodeURIComponent(product.price);

    card.innerHTML =
      '<div class="product-card__image">' +
      '<img src="' +
      escapeHtml(product.image || "") +
      '" alt="' +
      escapeHtml(product.name || "") +
      '" loading="lazy">' +
      "</div>" +
      '<div class="product-card__body">' +
      '<span class="product-card__mood">' +
      escapeHtml(moodLabel) +
      "</span>" +
      '<h3 class="product-card__name">' +
      escapeHtml(product.name || "") +
      "</h3>" +
      '<p class="product-card__desc">' +
      escapeHtml(product.description || "") +
      "</p>" +
      '<div class="product-card__footer">' +
      '<span class="product-card__price">' +
      escapeHtml(product.price) +
      "</span>" +
      '<a class="btn" href="' +
      orderUrl +
      '">สั่งซื้อ</a>' +
      "</div>" +
      "</div>";

    return card;
  }

  /* ==========================================================================
     2) order.html — ฟอร์มสั่งซื้อ, auto-fill, ส่งข้อมูลไป Google Apps Script
     ========================================================================== */
  function initOrderPage() {
    const form = document.getElementById("orderForm");
    const itemsEl = document.getElementById("items");
    const totalEl = document.getElementById("total");

    if (!form) return; // ไม่ใช่หน้านี้

    // auto-fill จาก URL parameter ทันทีที่โหลดหน้า
    const itemParam = getQueryParam("item");
    const priceParam = getQueryParam("price");

    if (itemsEl && itemParam) {
      itemsEl.value = itemParam;
    }
    if (totalEl && priceParam) {
      totalEl.value = priceParam;
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      submitOrder(form);
    });
  }

  function submitOrder(form) {
    const customerNameEl = document.getElementById("customerName");
    const contactEl = document.getElementById("contact");
    const itemsEl = document.getElementById("items");
    const totalEl = document.getElementById("total");
    const noteEl = document.getElementById("note");

    const payload = {
      customerName: customerNameEl ? customerNameEl.value : "",
      contact: contactEl ? contactEl.value : "",
      items: itemsEl ? itemsEl.value : "",
      total: totalEl ? totalEl.value : "",
      note: noteEl ? noteEl.value : "",
    };

    const submitBtn = form.querySelector('[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "กำลังส่งคำสั่งซื้อ...";
    }

    // ไม่ตั้ง custom headers เพื่อเลี่ยง CORS preflight กับ Google Apps Script
    fetch(ORDER_ENDPOINT_URL, {
      method: "POST",
      body: JSON.stringify(payload),
    })
      .catch(function () {
        // Apps Script มักตอบแบบ opaque/no-cors อยู่แล้ว จึงไม่บล็อกการ redirect
      })
      .finally(function () {
        window.location.href = "thankyou.html";
      });
  }

  /* ==========================================================================
     3) admin.html — ดึง CSV จาก Google Sheets มาแสดงในตาราง
     ========================================================================== */
  function initAdminPage() {
    const table = document.getElementById("ordersTable");
    if (!table) return; // ไม่ใช่หน้านี้

    const tbody = table.querySelector("tbody") || table.appendChild(document.createElement("tbody"));
    tbody.innerHTML = '<tr><td colspan="99">กำลังโหลดข้อมูล...</td></tr>';

    fetch(ORDERS_CSV_URL)
      .then((res) => {
        if (!res.ok) throw new Error("โหลดข้อมูลคำสั่งซื้อไม่สำเร็จ");
        return res.text();
      })
      .then((csvText) => {
        const rows = parseCsv(csvText);
        renderOrdersTable(tbody, rows);
      })
      .catch((err) => {
        tbody.innerHTML =
          '<tr><td colspan="99">เกิดข้อผิดพลาด: ' +
          escapeHtml(err.message) +
          "</td></tr>";
      });
  }

  // CSV parser แบบเบา ๆ รองรับฟิลด์ที่ครอบด้วย " และมี , หรือ " อยู่ข้างใน
  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const next = text[i + 1];

      if (inQuotes) {
        if (char === '"' && next === '"') {
          field += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          field += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ",") {
          row.push(field);
          field = "";
        } else if (char === "\n") {
          row.push(field);
          rows.push(row);
          row = [];
          field = "";
        } else if (char === "\r") {
          // ข้าม \r เพราะจับคู่กับ \n อยู่แล้ว
        } else {
          field += char;
        }
      }
    }

    // เก็บฟิลด์/แถวสุดท้ายถ้ายังไม่ได้ push (กรณีไฟล์ไม่ลงท้ายด้วย \n)
    if (field.length > 0 || row.length > 0) {
      row.push(field);
      rows.push(row);
    }

    return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ""));
  }

  function renderOrdersTable(tbody, rows) {
    tbody.innerHTML = "";

    if (!rows || rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="99">ยังไม่มีคำสั่งซื้อ</td></tr>';
      return;
    }

    // แถวแรกของ CSV ถือเป็นหัวตาราง ไม่นำมาแสดงใน tbody
    const dataRows = rows.slice(1);

    if (dataRows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="99">ยังไม่มีคำสั่งซื้อ</td></tr>';
      return;
    }

    dataRows.forEach((cells) => {
      const tr = document.createElement("tr");
      cells.forEach((cell) => {
        const td = document.createElement("td");
        td.textContent = cell;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }

  /* ------------------------------------------------------------------------
     Bootstrap: เรียกใช้ตัวจัดการของแต่ละหน้าเมื่อ DOM พร้อม
     ------------------------------------------------------------------------ */
  document.addEventListener("DOMContentLoaded", function () {
    initProductPage();
    initOrderPage();
    initAdminPage();
  });
})();
