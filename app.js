// Dán địa chỉ Web app của Google Apps Script vào đây (xem hướng dẫn). Đây không phải mật khẩu.
const API_URL = "https://script.google.com/macros/s/AKfycbwyxHToEkAKO_UROZG3CdW6pF2eJK6_NdJa34aItnSW5jBsCrQH7cl2S0vaSp31E9KZ/exec";

const TZ = "Asia/Ho_Chi_Minh";
const $ = (id) => document.getElementById(id);
const setMsg = (el, t, type) => { el.textContent = t; el.className = "msg" + (type ? " " + type : ""); };
const fGio = (ms) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ }).format(ms);
const fGioGiay = (ms) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: TZ }).format(ms);
const fNgayDai = (ms) => new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", timeZone: TZ }).format(ms);
const homNayISO = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());   // yyyy-mm-dd
const homNayVN = () => homNayISO().split("-").reverse().join("/");                                // dd/mm/yyyy
const NHAN_TT = { R: "Có mặt", T: "Đi trễ", P: "Vắng có phép", KP: "Vắng không phép", "": "Chưa điểm danh" };

async function api(action, payload = {}) {
  let res;
  try { res = await fetch(API_URL, { method: "POST", body: JSON.stringify({ action, ...payload }) }); }
  catch (e) { throw new Error("Không kết nối được máy chủ. Hãy kiểm tra mạng rồi thử lại."); }
  let j;
  try { j = await res.json(); } catch (e) { throw new Error("Máy chủ trả về dữ liệu không hợp lệ."); }
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
if (params.has("quanly")) khoiTaoQuanLy();
else khoiTaoSinhVien(params.get("buoi"));

// ============================================================
//                       GIAO DIỆN SINH VIÊN
// ============================================================
function khoiTaoSinhVien(buoiUuTien) {
  $("viewSV").classList.remove("hidden");

  let offset = 0;                  // lệch giữa đồng hồ máy chủ và máy người dùng
  let muonSauPhut = 15;
  let dsLop = [], lop = null, svDS = [], ban = false;
  const bay = () => Date.now() + offset;
  const trangThai = (l) => (bay() < l.moLuc ? "chua_mo" : bay() > l.ketThuc ? "ket_thuc" : "dang_mo");
  const khoa = (id) => "dd2_" + id;
  const docLocal = (id) => {
    const v = localStorage.getItem(khoa(id));
    if (!v) return null;
    try { return JSON.parse(v); } catch (e) { return null; }
  };

  // Đồng hồ + cập nhật nhãn nút mỗi giây
  setInterval(() => { $("svClock").textContent = `${fNgayDai(bay())} · ${fGioGiay(bay())}`; capNhatLopVaNut(); }, 1000);
  $("svClock").textContent = `${fNgayDai(bay())} · ${fGioGiay(bay())}`;

  async function taiLop() {
    try {
      const d = await api("lopHomNay");
      offset = d.now - Date.now(); muonSauPhut = d.muonSauPhut;
      dsLop = d.lop;
      setMsg($("svLopMsg"), dsLop.length ? "" : "Hôm nay không có lớp nào theo lịch. Nếu có buổi học bù, hãy chờ người quản lý mở lớp.");
      if (lop && !dsLop.some((l) => l.id === lop.id)) { lop = null; $("svCard").classList.add("hidden"); }
      veLop();
      if (!lop) {
        const uuTien = dsLop.find((l) => l.id === buoiUuTien && trangThai(l) !== "ket_thuc");
        const dangMo = dsLop.filter((l) => trangThai(l) === "dang_mo");
        const con = dsLop.filter((l) => trangThai(l) !== "ket_thuc");
        const chon = uuTien || (dangMo.length === 1 ? dangMo[0] : con.length === 1 ? con[0] : null);
        if (chon) chonLop(chon.id);
      }
    } catch (e) { setMsg($("svLopMsg"), e.message, "err"); }
  }

  function veLop() {
    const box = $("svLop"); box.innerHTML = "";
    dsLop.forEach((l) => {
      const b = document.createElement("button"); b.type = "button"; b.className = "lopcard" + (lop && lop.id === l.id ? " chon" : "");
      b.dataset.id = l.id;
      const left = document.createElement("span");
      const t = document.createElement("b"); t.textContent = l.tenMon;
      const s = document.createElement("small"); s.textContent = `${l.tiet} · ${fGio(l.batDau)}–${fGio(l.ketThuc)}${l.phong ? " · " + l.phong : ""}`;
      left.append(t, s);
      const chip = document.createElement("span"); chip.className = "chip";
      b.append(left, chip);
      b.addEventListener("click", () => chonLop(l.id));
      box.appendChild(b);
    });
    capNhatLopVaNut();
  }

  function capNhatLopVaNut() {
    document.querySelectorAll("#svLop .lopcard").forEach((b) => {
      const l = dsLop.find((x) => x.id === b.dataset.id); if (!l) return;
      const st = trangThai(l), chip = b.querySelector(".chip");
      chip.className = "chip" + (st === "dang_mo" ? " mo" : st === "ket_thuc" ? " xong" : "");
      chip.textContent = st === "dang_mo" ? "Đang mở" : st === "ket_thuc" ? "Đã kết thúc" : "Mở lúc " + fGio(l.moLuc);
    });
    capNhatNut();
  }

  async function chonLop(id) {
    lop = dsLop.find((l) => l.id === id); if (!lop) return;
    veLop();
    $("svCard").classList.remove("hidden");
    $("boxLyDo").classList.add("hidden"); $("lyDo").value = "";
    $("svInfo").innerHTML = "";
    const b = document.createElement("b"); b.textContent = lop.tenMon;
    $("svInfo").append(b, document.createTextNode(`${lop.tiet} · ${fGio(lop.batDau)}–${fGio(lop.ketThuc)}${lop.phong ? " · Phòng " + lop.phong : ""}`));
    setMsg($("svMsg"), "Đang tải danh sách lớp...");
    $("svForm").classList.add("hidden");
    try {
      const d = await api("dsSinhVien", { buoiId: id });
      if (!lop || lop.id !== id) return;
      svDS = d.sinhVien;
      const sel = $("svTen");
      sel.innerHTML = '<option value="">-- Chọn tên của bạn --</option>';
      svDS.forEach((s) => {
        const o = document.createElement("option");
        o.value = s.row; o.dataset.ten = s.ten;
        o.textContent = s.ten + (s.tt === "R" || s.tt === "T" ? " (đã điểm danh)" : s.tt === "P" ? " (đã báo vắng)" : "");
        o.disabled = s.tt === "R" || s.tt === "T";
        sel.appendChild(o);
      });
      // Thiết bị này đã điểm danh buổi này chưa?
      const loc = docLocal(id);
      const hienTai = loc && svDS.find((s) => s.ten === loc.ten);
      if (loc && (loc.tt === "R" || loc.tt === "T") && hienTai && (hienTai.tt === "R" || hienTai.tt === "T")) {
        setMsg($("svMsg"), `Thiết bị này đã điểm danh "${loc.ten}" (${NHAN_TT[loc.tt]}).`, "ok");
        return;
      }
      if (loc && loc.tt === "P" && hienTai) { sel.value = hienTai.row; setMsg($("svMsg"), `Bạn đã báo vắng có phép. Nếu đến lớp, hãy bấm "Có mặt".`, "ok"); }
      else setMsg($("svMsg"), "");
      $("svForm").classList.remove("hidden");
      capNhatNut();
    } catch (e) { setMsg($("svMsg"), e.message, "err"); }
  }

  // Nút "Có mặt" tự đổi thành "Đi trễ" khi quá 15 phút kể từ giờ bắt đầu
  function capNhatNut() {
    if (!lop) return;
    const st = trangThai(lop), muon = bay() - lop.batDau > muonSauPhut * 60000;
    const nut = $("btnCoMat");
    nut.textContent = muon ? "Đi trễ" : "Có mặt";
    nut.classList.toggle("muon", muon);
    nut.disabled = ban || st !== "dang_mo";
    $("btnVang").disabled = ban || st === "ket_thuc";
    $("btnGuiVang").disabled = ban || st === "ket_thuc";
    const han = fGio(lop.batDau + muonSauPhut * 60000);
    $("svHint").textContent =
      st === "chua_mo" ? `Chưa đến giờ điểm danh. Mở lúc ${fGio(lop.moLuc)}. Bạn vẫn có thể báo vắng.`
      : st === "ket_thuc" ? "Buổi học đã kết thúc."
      : muon ? `Đã quá ${muonSauPhut} phút so với giờ bắt đầu (${fGio(lop.batDau)}), hệ thống sẽ ghi nhận ĐI TRỄ. Cần bật GPS.`
      : `Điểm danh "Có mặt" đến ${han}, sau đó tính "Đi trễ". Cần bật GPS.`;
  }

  function layTen() {
    const opt = $("svTen").selectedOptions[0];
    if (!opt || !opt.value) { setMsg($("svMsg"), "Hãy chọn tên của bạn trước.", "err"); return null; }
    return { row: Number(opt.value), ten: opt.dataset.ten };
  }
  const batBan = (v) => { ban = v; capNhatNut(); };

  $("btnCoMat").addEventListener("click", async () => {
    const t = layTen(); if (!t || !lop) return;
    const l = lop; batBan(true); $("boxLyDo").classList.add("hidden");
    setMsg($("svMsg"), "Đang lấy vị trí GPS...");
    try {
      const p = await layViTri();
      setMsg($("svMsg"), "Đang gửi điểm danh...");
      const r = await api("diemDanh", { buoiId: l.id, row: t.row, ten: t.ten, loai: "co_mat", lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
      localStorage.setItem(khoa(l.id), JSON.stringify({ ten: t.ten, tt: r.tt }));
      $("svForm").classList.add("hidden");
      setMsg($("svMsg"), `${r.tt === "T" ? "Đã ghi nhận ĐI TRỄ" : "Điểm danh CÓ MẶT thành công"} cho ${t.ten} (cách lớp khoảng ${r.khoangCach}m).`, "ok");
    } catch (err) { setMsg($("svMsg"), err.message, "err"); }
    batBan(false);
  });

  $("btnVang").addEventListener("click", () => {
    if (!layTen()) return;
    setMsg($("svMsg"), "");
    $("boxLyDo").classList.remove("hidden"); $("lyDo").focus();
  });
  $("btnHuyVang").addEventListener("click", () => { $("boxLyDo").classList.add("hidden"); $("lyDo").value = ""; });
  $("btnGuiVang").addEventListener("click", async () => {
    const t = layTen(); if (!t || !lop) return;
    const lyDo = $("lyDo").value.trim();
    if (lyDo.length < 2) return setMsg($("svMsg"), "Vui lòng nhập lý do vắng.", "err");
    const l = lop; batBan(true); setMsg($("svMsg"), "Đang gửi báo vắng...");
    try {
      const r = await api("diemDanh", { buoiId: l.id, row: t.row, ten: t.ten, loai: "vang", lyDo });   // báo vắng: không cần GPS
      localStorage.setItem(khoa(l.id), JSON.stringify({ ten: t.ten, tt: r.tt }));
      $("boxLyDo").classList.add("hidden"); $("lyDo").value = "";
      setMsg($("svMsg"), `Đã gửi báo vắng cho ${t.ten}. Lý do đã được chuyển đến người quản lý.`, "ok");
      chonLopLaiNhe(l.id);
    } catch (err) { setMsg($("svMsg"), err.message, "err"); }
    batBan(false);
  });
  // làm mới nhãn "(đã báo vắng)" trong danh sách tên mà không xóa thông báo
  async function chonLopLaiNhe(id) {
    try {
      const d = await api("dsSinhVien", { buoiId: id });
      const m = {}; d.sinhVien.forEach((s) => (m[s.row] = s));
      Array.from($("svTen").options).forEach((o) => {
        const s = m[o.value]; if (!s) return;
        o.textContent = s.ten + (s.tt === "R" || s.tt === "T" ? " (đã điểm danh)" : s.tt === "P" ? " (đã báo vắng)" : "");
      });
    } catch (e) { /* bỏ qua */ }
  }

  taiLop();
  setInterval(taiLop, 60000);   // tự cập nhật danh sách lớp (khi qua buổi mới / quản lý mở buổi thủ công)
}

// ============================================================
//                       GIAO DIỆN QUẢN LÝ
// ============================================================
function khoiTaoQuanLy() {
  const veSV = location.pathname;
  $("linkVeSV").href = veSV; $("linkVeSV2").href = veSV;
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

function hienQuanLy(mk, dn) {
  $("viewQL").classList.remove("hidden");
  $("linkSheet").href = dn.sheetUrl;
  $("btnDangXuat").addEventListener("click", (e) => { e.preventDefault(); sessionStorage.removeItem("mk"); location.reload(); });

  // ---- Link + QR cố định cho sinh viên ----
  const linkSV = location.origin + location.pathname;
  $("linkSV").value = linkSV;
  $("btnChepLink").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(linkSV); $("btnChepLink").textContent = "Đã sao chép!"; }
    catch (e) { $("linkSV").select(); $("btnChepLink").textContent = "Hãy nhấn Ctrl+C"; }
    setTimeout(() => ($("btnChepLink").textContent = "Sao chép link"), 2000);
  });
  let qrVe = false;
  $("btnQR").addEventListener("click", () => {
    const hien = $("qrbox").classList.toggle("hidden") === false;
    $("btnQR").textContent = hien ? "Ẩn mã QR" : "Hiện mã QR";
    if (hien && !qrVe) { new QRCode($("qrcode"), { text: linkSV, width: 260, height: 260, correctLevel: QRCode.CorrectLevel.M }); qrVe = true; }
  });

  // ---- Form mở buổi thủ công ----
  for (let i = 1; i <= 12; i++) for (const id of ["tietTu", "tietDen"]) {
    const o = document.createElement("option"); o.value = i; o.textContent = "Tiết " + i; $(id).appendChild(o);
  }
  $("tietDen").value = 3;
  $("ngayHoc").value = homNayISO();
  dn.monHoc.forEach((m) => { const o = document.createElement("option"); o.value = m; $("dsMon").appendChild(o); });
  const ps = $("phongSel");
  ps.innerHTML = '<option value="">-- Chọn vị trí --</option>';
  dn.phong.forEach((p) => { const o = document.createElement("option"); o.value = p; o.textContent = "Phòng " + p; ps.appendChild(o); });
  const og = document.createElement("option"); og.value = "__gps__"; og.textContent = "Vị trí hiện tại của tôi (GPS)"; ps.appendChild(og);

  let viTriLop = null;
  ps.addEventListener("change", () => {
    const gps = ps.value === "__gps__";
    $("btnViTri").classList.toggle("hidden", !gps);
    $("viTriInfo").classList.toggle("hidden", !gps);
    if (gps) $("viTriInfo").textContent = viTriLop ? "Đã lấy vị trí." : "Chưa lấy vị trí. Hãy bấm nút khi bạn đang ở trong lớp.";
  });
  $("btnViTri").addEventListener("click", async () => {
    $("viTriInfo").textContent = "Đang lấy vị trí...";
    try {
      const p = await layViTri();
      viTriLop = { lat: p.coords.latitude, lng: p.coords.longitude };
      $("viTriInfo").textContent = `Đã lấy vị trí (sai số ±${Math.round(p.coords.accuracy)}m)` +
        (p.coords.accuracy > 100 ? ". Sai số lớn, nên lấy lại bằng điện thoại." : "");
    } catch (err) { $("viTriInfo").textContent = err.message; }
  });

  $("formTao").addEventListener("submit", async (e) => {
    e.preventDefault();
    const tu = Number($("tietTu").value), den = Number($("tietDen").value);
    if (den < tu) return setMsg($("taoMsg"), "Tiết kết thúc phải sau tiết bắt đầu.", "err");
    if (!ps.value) return setMsg($("taoMsg"), "Hãy chọn vị trí lớp học.", "err");
    const gps = ps.value === "__gps__";
    if (gps && !viTriLop) return setMsg($("taoMsg"), 'Hãy bấm "Lấy vị trí hiện tại của tôi" trước khi tạo buổi.', "err");
    $("btnTao").disabled = true; setMsg($("taoMsg"), "Đang tạo buổi học...");
    try {
      const r = await api("taoBuoi", {
        mk, tenMon: $("tenMon").value.trim(), ngay: $("ngayHoc").value, tietTu: tu, tietDen: den,
        banKinh: Number($("banKinh").value), ...(gps ? { lat: viTriLop.lat, lng: viTriLop.lng } : { phong: ps.value })
      });
      setMsg($("taoMsg"), "Đã tạo buổi học và thêm cột vào Google Sheet.", "ok");
      $("tenMon").value = "";
      await taiDanhSachBuoi(r.id);
    } catch (err) { setMsg($("taoMsg"), err.message, "err"); }
    $("btnTao").disabled = false;
  });

  // ---- Danh sách buổi + chi tiết ----
  let buoiHienTai = "", pollTimer = null, daHuy = false;

  async function taiDanhSachBuoi(chonId) {
    try {
      const ds = await api("dsBuoi", { mk });
      const sel = $("chonBuoi"), giu = chonId || sel.value;
      sel.innerHTML = '<option value="">-- Chọn buổi học --</option>';
      const hom = homNayVN();
      const gHom = document.createElement("optgroup"); gHom.label = "Hôm nay";
      const gKhac = document.createElement("optgroup"); gKhac.label = "Các buổi khác";
      ds.forEach((b) => {
        const o = document.createElement("option"); o.value = b.id;
        const nhan = (b.huy ? " [đã hủy]" : b.trangThai === "dang_mo" ? " [đang mở]" : "") + (b.loai === "Thủ công" ? " · thủ công" : "");
        o.textContent = `${b.ngay} - ${b.tenMon} (${b.tiet})${nhan}`;
        (b.ngay === hom ? gHom : gKhac).appendChild(o);
      });
      if (gHom.children.length) sel.appendChild(gHom);
      if (gKhac.children.length) sel.appendChild(gKhac);
      if (giu && ds.some((b) => b.id === giu)) { sel.value = giu; chonBuoi(); }
    } catch (err) { setMsg($("taoMsg"), err.message, "err"); }
  }

  async function taiDiemDanh() {
    const id = buoiHienTai; if (!id) return;
    if (document.activeElement && document.activeElement.classList.contains("ttsel")) return;   // đang chỉnh, không làm mới
    try {
      const d = await api("xemBuoi", { mk, buoiId: id });
      if (id !== buoiHienTai) return;
      veChiTiet(d);
    } catch (err) { $("tomTat").textContent = err.message; }
  }

  function veChiTiet(d) {
    daHuy = d.huy;
    $("tomTat").textContent = `${d.tenMon} - ${d.tiet} (${d.gioBatDau}–${d.gioKetThuc}) - ${d.ngay}${d.phong ? " - " + d.phong : ""} - bán kính ${d.banKinh}m` +
      (d.huy ? " - ĐÃ HỦY" : d.chot ? " - đã chốt" : "");
    $("btnHuy").textContent = d.huy ? "Khôi phục buổi này" : "Hủy buổi này";
    const th = $("thongKe"); th.innerHTML = "";
    [["R", `Có mặt: ${d.dem.R}`], ["T", `Đi trễ: ${d.dem.T}`], ["P", `Có phép: ${d.dem.P}`], ["KP", `Không phép: ${d.dem.KP}`], ["", `Chưa điểm danh: ${d.dem.chua}`]]
      .forEach(([k, t]) => { const s = document.createElement("span"); s.className = "stat " + k; s.textContent = t; th.appendChild(s); });
    const tb = $("tbody"); tb.innerHTML = "";
    d.danhSach.forEach((s) => {
      const tr = document.createElement("tr"); tr.className = "t-" + (s.tt === "" ? "N" : s.tt);
      const td = (v) => { const c = document.createElement("td"); c.textContent = v; tr.appendChild(c); return c; };
      td(s.stt); td(s.ten);
      const c = document.createElement("td");
      const sel = document.createElement("select"); sel.className = "ttsel"; sel.setAttribute("aria-label", "Trạng thái của " + s.ten);
      const kn = Object.keys(NHAN_TT);
      if (s.tt && kn.indexOf(s.tt) < 0) { const o = document.createElement("option"); o.value = s.tt; o.textContent = s.tt; sel.appendChild(o); }
      kn.forEach((k) => { const o = document.createElement("option"); o.value = k; o.textContent = (k ? k + " - " : "") + NHAN_TT[k]; sel.appendChild(o); });
      sel.value = s.tt;
      sel.addEventListener("change", async () => {
        sel.disabled = true;
        try { await api("capNhatTrangThai", { mk, buoiId: buoiHienTai, row: s.row, tt: sel.value }); }
        catch (err) { alert(err.message); }
        sel.disabled = false; sel.blur(); taiDiemDanh();
      });
      c.appendChild(sel); tr.appendChild(c);
      td(s.gio || ""); td(s.khoangCach === "" ? "" : s.khoangCach + "m"); td(s.lyDo || "");
      tb.appendChild(tr);
    });
  }

  function chonBuoi() {
    clearInterval(pollTimer);
    buoiHienTai = $("chonBuoi").value;
    $("chiTiet").classList.toggle("hidden", !buoiHienTai);
    $("tbody").innerHTML = ""; $("thongKe").innerHTML = ""; $("tomTat").textContent = "Đang tải...";
    if (!buoiHienTai) return;
    taiDiemDanh(); pollTimer = setInterval(taiDiemDanh, 10000);
  }
  $("chonBuoi").addEventListener("change", chonBuoi);

  $("btnHuy").addEventListener("click", async () => {
    if (!buoiHienTai) return;
    const huy = !daHuy;
    if (!confirm(huy ? "Hủy buổi học này? Buổi bị hủy sẽ không hiện cho sinh viên và không bị chốt KP." : "Khôi phục buổi học này?")) return;
    try { await api("huyBuoi", { mk, buoiId: buoiHienTai, huy }); await taiDanhSachBuoi(buoiHienTai); taiDiemDanh(); }
    catch (err) { alert(err.message); }
  });

  taiDanhSachBuoi();
}
