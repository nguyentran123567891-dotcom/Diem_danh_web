import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, getDocs, getDoc, doc,
  query, where, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAvZR_jhhwLDWC4OaZsaHUwts0YWAecp8c",
  authDomain: "diem-danh-id.firebaseapp.com",
  projectId: "diem-danh-id",
  storageBucket: "diem-danh-id.firebasestorage.app",
  messagingSenderId: "382030733644",
  appId: "1:382030733644:web:000d4922c779220cb02fe9"
};
const db = getFirestore(initializeApp(firebaseConfig));

// ================= CẤU HÌNH =================
const MA_QUAN_LY = "qnu2026";       // ĐỔI mã này. (Chỉ là khóa mức giao diện, xem ghi chú bảo mật)
const QR_DOI_MOI_MS = 15000;        // QR đổi mỗi 15 giây
const QR_SAI_LECH = 2;              // chấp nhận lệch tối đa 2 chu kỳ (~30-45 giây)
const SV_THOI_HAN_MS = 3 * 60 * 1000; // sau khi quét QR hợp lệ, có 3 phút để gửi
const DO_CHINH_XAC_TOI_DA = 100;    // GPS sai số > 100m thì từ chối
const $ = (id) => document.getElementById(id);

function tinhKhoangCach(lat1, lon1, lat2, lon2) {
  const toRad = (x) => x * Math.PI / 180, R = 6371000;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function layViTri() {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error("Thiết bị không hỗ trợ GPS."));
    navigator.geolocation.getCurrentPosition(res, (e) => {
      rej(new Error(e.code === 1
        ? "Bạn chưa cho phép truy cập vị trí. Hãy bật GPS và cho phép trình duyệt."
        : "Không lấy được vị trí. Hãy bật GPS rồi thử lại."));
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  });
}
function setMsg(el, text, type) { el.textContent = text; el.className = "msg" + (type ? " " + type : ""); }

const params = new URLSearchParams(location.search);
if (params.get("buoi")) khoiTaoSinhVien(params.get("buoi"), params.get("k"));
else khoiTaoQuanLy();

// ================= SINH VIÊN =================
async function khoiTaoSinhVien(buoiId, k) {
  $("viewSV").classList.remove("hidden");
  const info = $("svInfo"), form = $("formSV"), msg = $("svMsg");

  const cuaSoHienTai = Math.floor(Date.now() / QR_DOI_MOI_MS);
  if (!k || Math.abs(cuaSoHienTai - Number(k)) > QR_SAI_LECH) {
    info.textContent = "Mã QR đã hết hạn.";
    setMsg(msg, "Hãy quét lại mã QR đang hiển thị trên màn hình của giảng viên.", "err");
    return;
  }
  const hetHan = Date.now() + SV_THOI_HAN_MS;

  let buoi;
  try {
    const snap = await getDoc(doc(db, "buoi_diem_danh", buoiId));
    if (!snap.exists()) throw new Error();
    buoi = snap.data();
  } catch {
    info.textContent = "Không tìm thấy buổi học.";
    return;
  }
  info.innerHTML = "";
  const b = document.createElement("b"); b.textContent = buoi.tenMon;
  info.append(b, document.createTextNode(buoi.tiet || ""));

  const daDD = localStorage.getItem("dd_" + buoiId);
  if (daDD) { setMsg(msg, `Thiết bị này đã điểm danh với tên "${daDD}".`, "ok"); return; }
  form.classList.remove("hidden");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const ten = $("svTen").value.trim().replace(/\s+/g, " ");
    if (!ten) return;
    if (Date.now() > hetHan) { setMsg(msg, "Phiên điểm danh đã hết hạn. Hãy quét lại mã QR.", "err"); return; }

    const btn = $("btnSV"); btn.disabled = true;
    setMsg(msg, "Đang lấy vị trí GPS...");
    try {
      const pos = await layViTri();
      const { latitude, longitude, accuracy } = pos.coords;
      if (accuracy > DO_CHINH_XAC_TOI_DA) {
        throw new Error(`GPS chưa chính xác (sai số ±${Math.round(accuracy)}m). Hãy bật GPS/định vị chính xác, ra chỗ thoáng rồi thử lại.`);
      }
      if (buoi.lat == null) throw new Error("Buổi học chưa được thiết lập vị trí. Hãy báo giảng viên.");
      const kc = tinhKhoangCach(latitude, longitude, buoi.lat, buoi.lng);
      const banKinh = buoi.banKinh || 100;
      if (kc > banKinh) {
        throw new Error(`Bạn đang cách lớp học khoảng ${Math.round(kc)}m (cho phép ${banKinh}m).`);
      }
      const tenChuan = ten.toLowerCase();
      const trung = await getDocs(query(collection(db, "lich_su_diem_danh"),
        where("buoiId", "==", buoiId), where("tenChuan", "==", tenChuan)));
      if (!trung.empty) throw new Error("Tên này đã điểm danh buổi học này rồi.");

      await addDoc(collection(db, "lich_su_diem_danh"), {
        ten, tenChuan, buoiId,
        tenMon: buoi.tenMon, tiet: buoi.tiet || "",
        lat: latitude, lng: longitude,
        khoangCach: Math.round(kc), doChinhXac: Math.round(accuracy),
        thoiGian: serverTimestamp()
      });
      localStorage.setItem("dd_" + buoiId, ten);
      form.classList.add("hidden");
      setMsg(msg, "Điểm danh thành công!", "ok");
    } catch (err) {
      setMsg(msg, err.message, "err");
      btn.disabled = false;
    }
  });
}

// ================= QUẢN LÝ =================
function khoiTaoQuanLy() {
  if (sessionStorage.getItem("ql") === "1") return hienQuanLy();
  $("viewLogin").classList.remove("hidden");
  $("formLogin").addEventListener("submit", (e) => {
    e.preventDefault();
    if ($("mk").value === MA_QUAN_LY) {
      sessionStorage.setItem("ql", "1");
      $("viewLogin").classList.add("hidden");
      hienQuanLy();
    } else setMsg($("loginMsg"), "Mã quản lý không đúng.", "err");
  });
}

function hienQuanLy() {
  $("viewQL").classList.remove("hidden");

  // Tiết học 1..12
  for (let i = 1; i <= 12; i++) {
    for (const id of ["tietTu", "tietDen"]) {
      const o = document.createElement("option"); o.value = i; o.textContent = "Tiết " + i; $(id).appendChild(o);
    }
  }
  $("tietDen").value = 3;

  // Lấy vị trí lớp học
  let viTriLop = null;
  $("btnViTri").addEventListener("click", async () => {
    $("viTriInfo").textContent = "Đang lấy vị trí...";
    try {
      const p = await layViTri();
      viTriLop = { lat: p.coords.latitude, lng: p.coords.longitude };
      $("viTriInfo").textContent =
        `Đã lấy vị trí: ${viTriLop.lat.toFixed(5)}, ${viTriLop.lng.toFixed(5)} (sai số ±${Math.round(p.coords.accuracy)}m)` +
        (p.coords.accuracy > DO_CHINH_XAC_TOI_DA ? ". Sai số lớn, nên lấy lại bằng điện thoại có GPS." : "");
    } catch (err) { $("viTriInfo").textContent = err.message; }
  });

  // Tạo buổi học
  $("formTao").addEventListener("submit", async (e) => {
    e.preventDefault();
    const tu = Number($("tietTu").value), den = Number($("tietDen").value);
    if (den < tu) return setMsg($("taoMsg"), "Tiết kết thúc phải sau tiết bắt đầu.", "err");
    if (!viTriLop) return setMsg($("taoMsg"), "Hãy bấm \"Lấy vị trí hiện tại của tôi\" trước khi tạo buổi.", "err");
    try {
      const ref = await addDoc(collection(db, "buoi_diem_danh"), {
        tenMon: $("tenMon").value.trim(),
        tiet: tu === den ? `Tiết ${tu}` : `Tiết ${tu}-${den}`,
        banKinh: Number($("banKinh").value),
        lat: viTriLop.lat, lng: viTriLop.lng,
        thoiGianTao: serverTimestamp()
      });
      setMsg($("taoMsg"), "Đã tạo buổi học.", "ok");
      $("tenMon").value = "";
      await taiBuoiHoc(ref.id);
    } catch (err) { setMsg($("taoMsg"), "Lỗi: " + err.message, "err"); }
  });

  // Danh sách buổi học
  const buoiMap = {};
  async function taiBuoiHoc(chonId) {
    const snap = await getDocs(collection(db, "buoi_diem_danh"));
    const ds = []; snap.forEach((d) => ds.push({ id: d.id, ...d.data() }));
    ds.sort((a, b) => (b.thoiGianTao?.seconds || 0) - (a.thoiGianTao?.seconds || 0));
    $("chonBuoi").innerHTML = '<option value="">-- Chọn buổi học --</option>';
    ds.forEach((b) => {
      buoiMap[b.id] = b;
      const o = document.createElement("option");
      o.value = b.id;
      const ngay = b.thoiGianTao ? new Date(b.thoiGianTao.seconds * 1000).toLocaleDateString("vi-VN") : "";
      o.textContent = `${b.tenMon} (${b.tiet || "?"}) ${ngay}`;
      $("chonBuoi").appendChild(o);
    });
    if (chonId) { $("chonBuoi").value = chonId; chonBuoi(); }
  }

  // QR động: chứa đường link + mã thời gian
  let qrTimer = null, buoiHienTai = null, huyNghe = null, duLieuXuat = [];
  function dungQR() {
    clearInterval(qrTimer); qrTimer = null;
    $("qrbox").classList.add("hidden"); $("qrcode").innerHTML = "";
    $("btnDungQR").classList.add("hidden"); $("btnQR").classList.remove("hidden");
    $("chonBuoi").disabled = false;
  }
  function veQR() {
    const k = Math.floor(Date.now() / QR_DOI_MOI_MS);
    const url = `${location.origin}${location.pathname}?buoi=${encodeURIComponent(buoiHienTai)}&k=${k}`;
    $("qrcode").innerHTML = "";
    new QRCode($("qrcode"), { text: url, width: 220, height: 220 });
    $("qrHint").textContent = "Mã QR tự đổi mỗi 15 giây. Sinh viên quét bằng camera điện thoại.";
  }
  $("btnQR").addEventListener("click", () => {
    $("qrbox").classList.remove("hidden");
    $("btnQR").classList.add("hidden"); $("btnDungQR").classList.remove("hidden");
    $("chonBuoi").disabled = true;
    veQR(); qrTimer = setInterval(veQR, QR_DOI_MOI_MS);
  });
  $("btnDungQR").addEventListener("click", dungQR);

  // Danh sách điểm danh (cập nhật trực tiếp)
  function chonBuoi() {
    dungQR();
    if (huyNghe) { huyNghe(); huyNghe = null; }
    buoiHienTai = $("chonBuoi").value;
    $("chiTiet").classList.toggle("hidden", !buoiHienTai);
    $("tbody").innerHTML = ""; duLieuXuat = []; $("btnExcel").disabled = true;
    if (!buoiHienTai) return;
    const b = buoiMap[buoiHienTai];
    $("tomTat").textContent = `${b.tenMon} - ${b.tiet || ""} - bán kính ${b.banKinh || 100}m`;
    $("fileWarn").textContent = location.protocol === "file:"
      ? "Bạn đang mở file trực tiếp. Hãy đưa web lên hosting HTTPS (Firebase Hosting/GitHub Pages) thì điện thoại sinh viên mới quét QR và dùng GPS được." : "";

    huyNghe = onSnapshot(query(collection(db, "lich_su_diem_danh"), where("buoiId", "==", buoiHienTai)), (snap) => {
      const ds = []; snap.forEach((d) => ds.push(d.data()));
      ds.sort((a, b) => (a.thoiGian?.seconds ?? 9e12) - (b.thoiGian?.seconds ?? 9e12));
      $("tbody").innerHTML = ""; duLieuXuat = [];
      ds.forEach((d, i) => {
        const tg = d.thoiGian ? new Date(d.thoiGian.seconds * 1000).toLocaleString("vi-VN") : "Vừa xong";
        const tr = document.createElement("tr");
        [i + 1, d.ten, d.tiet || b.tiet || "", tg, d.khoangCach + "m"].forEach((v) => {
          const td = document.createElement("td"); td.textContent = v; tr.appendChild(td);
        });
        $("tbody").appendChild(tr);
        duLieuXuat.push({ "STT": i + 1, "Tên": d.ten, "Môn học": d.tenMon || b.tenMon, "Tiết học": d.tiet || b.tiet || "", "Thời gian": tg, "Khoảng cách (m)": d.khoangCach });
      });
      $("soLuong").textContent = `(${ds.length} sinh viên)`;
      $("btnExcel").disabled = ds.length === 0;
    });
  }
  $("chonBuoi").addEventListener("change", chonBuoi);

  $("btnExcel").addEventListener("click", () => {
    if (!duLieuXuat.length) return;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(duLieuXuat), "DiemDanh");
    XLSX.writeFile(wb, `DiemDanh_${(buoiMap[buoiHienTai]?.tenMon || "buoi").replace(/\s+/g, "_")}.xlsx`);
  });

  taiBuoiHoc();
}