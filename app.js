// Dán địa chỉ Web app của Google Apps Script vào đây (xem hướng dẫn). Đây không phải mật khẩu.
const API_URL = "https://script.google.com/macros/s/AKfycbwyxHToEkAKO_UROZG3CdW6pF2eJK6_NdJa34aItnSW5jBsCrQH7cl2S0vaSp31E9KZ/exec";

const QR_MS = 5 * 60 * 1000;   // phải trùng với Code.gs
const $ = (id) => document.getElementById(id);
const setMsg = (el, t, type) => { el.textContent = t; el.className = "msg" + (type ? " " + type : ""); };

async function api(action, payload = {}) {
  const res = await fetch(API_URL, { method: "POST", body: JSON.stringify({ action, ...payload }) });
  const j = await res.json();
  if (!j.ok) throw new Error(j.error);
  return j.data;
}
function layViTri() {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error("Thiết bị không hỗ trợ GPS."));
    navigator.geolocation.getCurrentPosition(res, (e) => rej(new Error(e.code === 1
      ? "Bạn chưa cho phép truy cập vị trí. Hãy bật GPS và cho phép trình duyệt."
      : "Không lấy được vị trí. Hãy bật GPS rồi thử lại.")),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  });
}

const params = new URLSearchParams(location.search);
if (params.get("buoi")) khoiTaoSinhVien(params.get("buoi"), params.get("k"));
else khoiTaoQuanLy();

// ================= SINH VIÊN =================
async function khoiTaoSinhVien(buoiId, k) {
  $("viewSV").classList.remove("hidden");
  const info = $("svInfo"), form = $("formSV"), msg = $("svMsg");
  let buoi;
  try { buoi = await api("layBuoi", { buoiId, k }); }
  catch (e) { info.textContent = "Không thể điểm danh"; setMsg(msg, e.message, "err"); return; }

  info.innerHTML = "";
  const b = document.createElement("b"); b.textContent = buoi.tenMon;
  info.append(b, document.createTextNode(`${buoi.tiet} - ${buoi.ngay}`));

  const daDD = localStorage.getItem("dd_" + buoiId);
  if (daDD) { setMsg(msg, `Thiết bị này đã điểm danh cho "${daDD}".`, "ok"); return; }

  const sel = $("svTen");
  sel.innerHTML = '<option value="">-- Chọn tên của bạn --</option>';
  buoi.danhSach.forEach((s) => {
    const o = document.createElement("option");
    o.value = s.row; o.textContent = s.ten + (s.da ? " (đã điểm danh)" : ""); o.disabled = s.da;
    o.dataset.ten = s.ten; sel.appendChild(o);
  });
  form.classList.remove("hidden");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const opt = sel.selectedOptions[0];
    if (!opt || !opt.value) return;
    const btn = $("btnSV"); btn.disabled = true;
    setMsg(msg, "Đang lấy vị trí GPS...");
    try {
      const p = await layViTri();
      setMsg(msg, "Đang gửi điểm danh...");
      await api("diemDanh", {
        buoiId, k, row: Number(opt.value), ten: opt.dataset.ten,
        lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy
      });
      localStorage.setItem("dd_" + buoiId, opt.dataset.ten);
      form.classList.add("hidden");
      setMsg(msg, `Điểm danh thành công cho ${opt.dataset.ten}!`, "ok");
    } catch (err) { setMsg(msg, err.message, "err"); btn.disabled = false; }
  });
}

// ================= QUẢN LÝ =================
function khoiTaoQuanLy() {
  const luu = sessionStorage.getItem("mk");
  if (luu) {
    api("dangNhap", { mk: luu }).then((d) => hienQuanLy(luu, d))
      .catch(() => { sessionStorage.removeItem("mk"); hienDangNhap(); });
  } else hienDangNhap();
}
function hienDangNhap() {
  $("viewLogin").classList.remove("hidden");
  $("formLogin").addEventListener("submit", async (e) => {
    e.preventDefault();
    const mk = $("mk").value; $("btnLogin").disabled = true;
    setMsg($("loginMsg"), "Đang kiểm tra...");
    try {
      const d = await api("dangNhap", { mk });
      sessionStorage.setItem("mk", mk);
      $("viewLogin").classList.add("hidden");
      hienQuanLy(mk, d);
    } catch (err) { setMsg($("loginMsg"), err.message, "err"); }
    $("btnLogin").disabled = false;
  });
}

function hienQuanLy(mk, dangNhapData) {
  $("viewQL").classList.remove("hidden");
  $("linkSheet").href = dangNhapData.sheetUrl;

  for (let i = 1; i <= 12; i++) for (const id of ["tietTu", "tietDen"]) {
    const o = document.createElement("option"); o.value = i; o.textContent = "Tiết " + i; $(id).appendChild(o);
  }
  $("tietDen").value = 3;

  let viTriLop = null;
  $("btnViTri").addEventListener("click", async () => {
    $("viTriInfo").textContent = "Đang lấy vị trí...";
    try {
      const p = await layViTri();
      viTriLop = { lat: p.coords.latitude, lng: p.coords.longitude };
      $("viTriInfo").textContent = `Đã lấy vị trí (sai số ±${Math.round(p.coords.accuracy)}m)` +
        (p.coords.accuracy > 100 ? ". Sai số lớn, nên lấy lại bằng điện thoại." : "");
    } catch (err) { $("viTriInfo").textContent = err.message; }
  });

  async function taiDanhSachBuoi(chonId) {
    const ds = await api("dsBuoi", { mk });
    $("chonBuoi").innerHTML = '<option value="">-- Chọn buổi học --</option>';
    ds.forEach((b) => {
      const o = document.createElement("option"); o.value = b.id;
      o.textContent = `${b.ngay} - ${b.tenMon} (${b.tiet})`; $("chonBuoi").appendChild(o);
    });
    if (chonId) { $("chonBuoi").value = chonId; chonBuoi(); }
  }

  $("formTao").addEventListener("submit", async (e) => {
    e.preventDefault();
    const tu = Number($("tietTu").value), den = Number($("tietDen").value);
    if (den < tu) return setMsg($("taoMsg"), "Tiết kết thúc phải sau tiết bắt đầu.", "err");
    if (!viTriLop) return setMsg($("taoMsg"), 'Hãy bấm "Lấy vị trí hiện tại của tôi" trước khi tạo buổi.', "err");
    $("btnTao").disabled = true; setMsg($("taoMsg"), "Đang tạo buổi học...");
    try {
      const r = await api("taoBuoi", {
        mk, tenMon: $("tenMon").value.trim(), tiet: tu === den ? `Tiết ${tu}` : `Tiết ${tu}-${den}`,
        banKinh: Number($("banKinh").value), lat: viTriLop.lat, lng: viTriLop.lng
      });
      setMsg($("taoMsg"), "Đã tạo buổi học và thêm cột vào Google Sheet.", "ok");
      $("tenMon").value = "";
      await taiDanhSachBuoi(r.id);
    } catch (err) { setMsg($("taoMsg"), err.message, "err"); }
    $("btnTao").disabled = false;
  });

  // QR: đổi mỗi 5 phút
  let buoiHienTai = "", qrTimer = null, kDangVe = null, pollTimer = null;
  function dungQR() {
    clearInterval(qrTimer); qrTimer = null; kDangVe = null;
    $("qrbox").classList.add("hidden"); $("qrcode").innerHTML = "";
    $("btnDungQR").classList.add("hidden"); $("btnQR").classList.remove("hidden");
    $("chonBuoi").disabled = false;
  }
  function capNhatQR() {
    const k = Math.floor(Date.now() / QR_MS);
    if (k !== kDangVe) {
      kDangVe = k;
      const url = `${location.origin}${location.pathname}?buoi=${encodeURIComponent(buoiHienTai)}&k=${k}`;
      $("qrcode").innerHTML = "";
      new QRCode($("qrcode"), { text: url, width: 280, height: 280, correctLevel: QRCode.CorrectLevel.L });
    }
    const con = Math.max(0, (k + 1) * QR_MS - Date.now());
    $("qrHint").textContent = `Mã QR đổi sau ${Math.floor(con / 60000)}:${String(Math.floor(con / 1000) % 60).padStart(2, "0")}`;
  }
  $("btnQR").addEventListener("click", () => {
    $("qrbox").classList.remove("hidden");
    $("btnQR").classList.add("hidden"); $("btnDungQR").classList.remove("hidden");
    $("chonBuoi").disabled = true;
    capNhatQR(); qrTimer = setInterval(capNhatQR, 1000);
  });
  $("btnDungQR").addEventListener("click", dungQR);

  // Danh sách điểm danh (tự làm mới mỗi 10 giây)
  async function taiDiemDanh() {
    if (!buoiHienTai) return;
    try {
      const d = await api("xemBuoi", { mk, buoiId: buoiHienTai });
      $("tomTat").textContent = `${d.tenMon} - ${d.tiet} - ${d.ngay} - bán kính ${d.banKinh}m`;
      $("soLuong").textContent = `(${d.coMat}/${d.tong} có mặt)`;
      $("tbody").innerHTML = "";
      d.danhSach.forEach((s) => {
        const tr = document.createElement("tr"); if (!s.gio) tr.className = "vang";
        [s.stt, s.ten, s.gio || "Chưa điểm danh", s.khoangCach === "" ? "" : s.khoangCach + "m"].forEach((v) => {
          const td = document.createElement("td"); td.textContent = v; tr.appendChild(td);
        });
        $("tbody").appendChild(tr);
      });
    } catch (err) { $("soLuong").textContent = "(" + err.message + ")"; }
  }
  function chonBuoi() {
    dungQR(); clearInterval(pollTimer);
    buoiHienTai = $("chonBuoi").value;
    $("chiTiet").classList.toggle("hidden", !buoiHienTai);
    $("tbody").innerHTML = "";
    if (!buoiHienTai) return;
    taiDiemDanh(); pollTimer = setInterval(taiDiemDanh, 10000);
  }
  $("chonBuoi").addEventListener("change", chonBuoi);

  taiDanhSachBuoi();
}