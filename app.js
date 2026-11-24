const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzPWv0y79-Xr8xMhIV-zwO5rTkKCRgDhSfQmMzBg_QmvqTzl3SkUCzHnxoQrpu0Q6VIVQ/exec';

const MAX_EXPERIENCE = 6;
let currentUser = null;
let dbOptions = null;
let userTrainingRecords = [];
let trainingViewMode = 'card';
let selectedTrainingCategory = 'ALL';
let allAdminRecords = [];
let monitorRawData = { users: [], records: [], db: {} };
let monitorScopeFilter = 'all';
let monitorSubMode = 'matrix';
let dashboardSortAsc = true;
let liveClockTimer = null;

let experienceItems = [];
let educationStore = {
  bachelor: { year: '', deg: '', uni: '', file: '' },
  master:   { year: '', deg: '', uni: '', file: '' },
  doctor:   { year: '', deg: '', uni: '', file: '' }
};

const DAYSLEFT_META = {
  EXPIRE:   { label: 'Expire (≤ 0d)',  symbol: '<span class="color-circle-dot" style="background-color:#ef4444;"></span>' },
  WARNING:  { label: 'Warning (1–30d)', symbol: '<span class="color-circle-dot" style="background-color:#f97316;"></span>' },
  CAUTION:  { label: 'Caution (31–90d)',symbol: '<span class="color-circle-dot" style="background-color:#facc15;"></span>' },
  NORMAL:   { label: 'Normal (> 90d)',  symbol: '<span class="color-circle-dot" style="background-color:#22c55e;"></span>' },
  EXEMPTED: { label: 'Exempted',        symbol: '<span class="color-circle-dot" style="background-color:#94a3b8;"></span>' },
  PASS:     { label: 'Pass',            symbol: '<i class="fa-solid fa-check text-success" style="width:12px;"></i>' },
  ALL:      { label: 'All',             symbol: '<span class="color-circle-dot" style="background-color:#3b82f6;"></span>' }
};

function showAppLoading(title = 'กำลังโหลดข้อมูล...', subtitle = 'กรุณารอสักครู่') {
  Swal.fire({
    html: `
      <div class="atsd-spinner-wrap">
        <div class="atsd-spinner-ring"></div>
        <div class="atsd-spinner-icon"><i class="fa-solid fa-plane-up"></i></div>
      </div>
      <div class="atsd-loading-title">${escapeHtml(title)}</div>
      <div class="atsd-loading-sub">${escapeHtml(subtitle)}</div>
    `,
    showConfirmButton: false,
    allowOutsideClick: false,
    allowEscapeKey: false,
    backdrop: 'rgba(15, 23, 42, 0.35)',
    customClass: {
      popup: 'atsd-loading-popup'
    }
  });
}

function hideAppLoading() {
  if (Swal.isVisible()) {
    Swal.close();
  }
}

async function callApi(action, params = {}) {
  const response = await fetch(GAS_WEB_APP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, params })
  });

  if (!response.ok) {
    throw new Error('Network response was not ok: ' + response.status);
  }

  const result = await response.json();
  if (result && result.error) {
    throw new Error(result.error);
  }
  return result.data;
}

function setActiveTab(buttonId, paneId) {
  document.querySelectorAll('#mainTabs .nav-link').forEach(btn => {
    btn.classList.remove('active');
    btn.setAttribute('aria-selected', 'false');
  });
  document.querySelectorAll('.tab-content .tab-pane').forEach(pane => {
    pane.classList.remove('active', 'show');
  });

  const targetBtn = document.getElementById(buttonId);
  const targetPane = document.getElementById(paneId);
  if (targetBtn) {
    targetBtn.classList.add('active');
    targetBtn.setAttribute('aria-selected', 'true');
  }
  if (targetPane) {
    targetPane.classList.add('active', 'show');
  }
}

// ================= LIVE CLOCK (MONITOR) =================
function startLiveClock() {
  stopLiveClock();
  const updateClock = () => {
    const now = new Date();
    const dateEl = document.getElementById('liveDateDisplay');
    const timeEl = document.getElementById('liveTimeDisplay');
    if (dateEl) {
      dateEl.innerText = now.toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    }
    if (timeEl) {
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');
      timeEl.innerText = `${hh}:${mm}:${ss}`;
    }
  };
  updateClock();
  liveClockTimer = setInterval(updateClock, 1000);
}

function stopLiveClock() {
  if (liveClockTimer) {
    clearInterval(liveClockTimer);
    liveClockTimer = null;
  }
}

// ================= 1. AUTHENTICATION =================
document.getElementById('loginForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  const user = document.getElementById('loginUser').value.trim();
  const pass = document.getElementById('loginPass').value.trim();
  const btn = document.getElementById('btnLogin');

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังตรวจสอบ...';

  try {
    const res = await callApi('loginUser', { username: user, password: pass });
    if (res.success) {
      currentUser = res;
      initAppAfterLogin();
    } else {
      Swal.fire('เข้าสู่ระบบไม่สำเร็จ', res.message, 'error');
    }
  } catch (err) {
    Swal.fire('Error', err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-right-to-bracket me-1"></i> เข้าสู่ระบบ';
  }
});

async function initAppAfterLogin() {
  const loginSec = document.getElementById('loginSection');
  const appSec = document.getElementById('appSection');
  if (loginSec) loginSec.classList.add('is-hidden');
  if (appSec) appSec.classList.remove('hidden');

  document.getElementById('navUserDisplay').innerText = currentUser.initialName;
  document.getElementById('navRoleDisplay').innerText = currentUser.role.toUpperCase();

  const isAdmin = currentUser.role === 'admin';
  document.querySelectorAll('.admin-only').forEach(el => {
    el.classList.toggle('hidden', !isAdmin);
  });
  document.querySelectorAll('.user-only').forEach(el => {
    el.classList.toggle('hidden', isAdmin);
  });

  if (isAdmin) {
    startLiveClock();
    setActiveTab('tabBtnAdminMonitor', 'tabAdminMonitor');
    await loadMonitor();
    return;
  }

  stopLiveClock();
  setActiveTab('tabBtnProfile', 'tabProfile');

  try {
    const [opts, posList] = await Promise.all([
      callApi('getDatabaseOptions'),
      callApi('getBgPositionOptions')
    ]);
    dbOptions = opts;
    populateSelect('bgPosition', posList || []);
    loadProfileData();
  } catch (err) {
    Swal.fire('Error', err.message, 'error');
  }
}

function logout() {
  stopLiveClock();
  currentUser = null;
  const loginSec = document.getElementById('loginSection');
  const appSec = document.getElementById('appSection');
  if (appSec) appSec.classList.add('hidden');
  if (loginSec) loginSec.classList.remove('is-hidden');

  document.getElementById('loginForm').reset();
  document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.user-only').forEach(el => el.classList.remove('hidden'));
  setActiveTab('tabBtnProfile', 'tabProfile');
}

async function changeUserPassword() {
  const newPass = document.getElementById('newPasswordInput').value.trim();
  if (!newPass) return Swal.fire('แจ้งเตือน', 'กรุณากรอกรหัสผ่านใหม่', 'warning');

  try {
    const res = await callApi('updatePassword', { username: currentUser.initialName, newPassword: newPass });
    if (res.success) {
      Swal.fire('สำเร็จ', 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว', 'success');
      document.getElementById('newPasswordInput').value = '';
      bootstrap.Modal.getInstance(document.getElementById('passwordModal')).hide();
    } else {
      Swal.fire('ผิดพลาด', res.message, 'error');
    }
  } catch (err) {
    Swal.fire('Error', err.message, 'error');
  }
}

// ================= 2. BACKGROUND PROFILE (TIMELINE & EDUCATION) =================
function renderExperienceTimeline() {
  const container = document.getElementById('expTimelineContainer');
  const countText = document.getElementById('expCountText');
  const addBtn = document.getElementById('btnAddExp');
  if (!container) return;

  if (countText) countText.innerText = `${experienceItems.length} รายการ`;
  if (addBtn) addBtn.disabled = experienceItems.length >= MAX_EXPERIENCE;

  if (experienceItems.length === 0) {
    container.innerHTML = '<div class="text-muted small py-2">ยังไม่มีข้อมูลประสบการณ์ทำงาน กด "+ เพิ่มใหม่" เพื่อเพิ่มรายการ</div>';
    return;
  }

  container.innerHTML = experienceItems.map((item, idx) => {
    const yearStr = String(item.year || '').trim();
    const dotClass = idx === 0 ? 'current' : 'past';
    const currentBadge = idx === 0
      ? '<span class="badge rounded-pill bg-success-subtle text-success border border-success-subtle px-3 py-1">ปัจจุบัน</span>'
      : '';

    return `
      <div class="timeline-item">
        <span class="timeline-dot ${dotClass}"></span>
        <div class="d-flex justify-content-between align-items-start gap-2">
          <div>
            <div class="fw-bold text-dark fs-6">${escapeHtml(item.pos || '-')}</div>
            <div class="text-secondary small mt-1">${escapeHtml(item.name || '-')}</div>
            <div class="text-muted small mt-1">${escapeHtml(yearStr || '-')}</div>
          </div>
          <div class="d-flex align-items-center gap-2 flex-shrink-0">
            ${currentBadge}
            <button type="button" class="btn btn-link text-secondary p-1" title="แก้ไขรายการนี้" onclick="openExpModal(${idx})">
              <i class="fa-solid fa-pen"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function openExpModal(index) {
  const isNew = index < 0;
  document.getElementById('expModalTitle').innerText = isNew ? 'เพิ่มประสบการณ์ทำงาน' : 'แก้ไขประสบการณ์ทำงาน';
  document.getElementById('expEditIndex').value = index;

  const delBtn = document.getElementById('btnDeleteExpModal');
  if (delBtn) delBtn.classList.toggle('hidden', isNew);

  const item = !isNew && experienceItems[index]
    ? experienceItems[index]
    : { year: '', pos: '', name: '' };

  document.getElementById('expModalPos').value = item.pos || '';
  document.getElementById('expModalName').value = item.name || '';
  document.getElementById('expModalYear').value = item.year || '';

  bootstrap.Modal.getOrCreateInstance(document.getElementById('expModal')).show();
}

function saveExpFromModal() {
  const idx = Number(document.getElementById('expEditIndex').value);
  const pos = document.getElementById('expModalPos').value.trim();
  const name = document.getElementById('expModalName').value.trim();
  const year = document.getElementById('expModalYear').value.trim();

  if (!pos && !name && !year) {
    return Swal.fire('แจ้งเตือน', 'กรุณากรอกข้อมูลอย่างน้อย 1 ช่อง', 'warning');
  }

  const entry = { pos, name, year };
  if (idx >= 0 && experienceItems[idx]) {
    experienceItems[idx] = entry;
  } else {
    if (experienceItems.length >= MAX_EXPERIENCE) {
      return Swal.fire('ครบจำนวนสูงสุดแล้ว', `เพิ่มได้สูงสุด ${MAX_EXPERIENCE} รายการ`, 'info');
    }
    experienceItems.push(entry);
  }

  renderExperienceTimeline();
  bootstrap.Modal.getInstance(document.getElementById('expModal'))?.hide();
}

function deleteExpFromModal() {
  const idx = Number(document.getElementById('expEditIndex').value);
  if (idx >= 0 && experienceItems[idx]) {
    experienceItems.splice(idx, 1);
    renderExperienceTimeline();
  }
  bootstrap.Modal.getInstance(document.getElementById('expModal'))?.hide();
}

function hasEduContent(eduObj) {
  if (!eduObj) return false;
  const deg = String(eduObj.deg || '').trim();
  const uni = String(eduObj.uni || '').trim();
  const yr  = String(eduObj.year || '').trim();
  return Boolean(deg || uni || yr);
}

function syncHiddenEduInputs() {
  const map = [
    { key: 'bachelor', prefix: 'Bach' },
    { key: 'master',   prefix: 'Mast' },
    { key: 'doctor',   prefix: 'Doc' }
  ];
  map.forEach(({ key, prefix }) => {
    const obj = educationStore[key] || {};
    document.getElementById(`edu${prefix}Year`).value = obj.year || '';
    document.getElementById(`edu${prefix}Deg`).value  = obj.deg || '';
    document.getElementById(`edu${prefix}Uni`).value  = obj.uni || '';
    document.getElementById(`edu${prefix}File`).value = obj.file || '';
  });
}

function renderEducationSection() {
  syncHiddenEduInputs();
  const container = document.getElementById('eduListContainer');
  const badge = document.getElementById('eduCountBadge');
  if (!container) return;

  const levels = [
    { key: 'doctor',   thTitle: 'ปริญญาเอก', badgeText: 'Doctorate' },
    { key: 'master',   thTitle: 'ปริญญาโท', badgeText: 'Master' },
    { key: 'bachelor', thTitle: 'ปริญญาตรี', badgeText: 'Bachelor' }
  ].filter(item => hasEduContent(educationStore[item.key]));

  if (badge) badge.innerText = `${levels.length} รายการ`;

  if (levels.length === 0) {
    container.innerHTML = '<div class="text-muted small">ยังไม่มีข้อมูลวุฒิการศึกษา กด "+ เพิ่มวุฒิการศึกษา" เพื่อเพิ่มข้อมูล</div>';
    return;
  }

  container.innerHTML = levels.map(item => {
    const d = educationStore[item.key];
    const docLink = d.file
      ? `<a href="${escapeAttr(d.file)}" target="_blank" class="doc-available-tag" onclick="event.stopPropagation();"><i class="fa-solid fa-file-circle-check me-1"></i>มีเอกสาร</a>`
      : '';

    return `
      <div class="edu-entry-card" style="cursor:pointer;" onclick="openEduModal('${item.key}')">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <span class="fw-bold text-dark fs-6">${item.thTitle}</span>
          <span class="edu-level-badge">${item.badgeText}</span>
        </div>
        <div class="text-secondary small">${escapeHtml(d.deg || '-')}</div>
        <div class="text-muted small mb-2">${escapeHtml(d.uni || '-')}</div>
        <div class="d-flex justify-content-between align-items-center pt-1">
          <span class="text-muted small"><i class="fa-regular fa-calendar me-1"></i>${escapeHtml(d.year || '-')}</span>
          ${docLink}
        </div>
      </div>
    `;
  }).join('');
}

function openEduModal(preselectLevel = null) {
  const levelSel = document.getElementById('eduModalLevel');
  if (preselectLevel) {
    levelSel.value = preselectLevel;
  } else {
    const emptyLevel = ['bachelor', 'master', 'doctor'].find(k => !hasEduContent(educationStore[k]));
    levelSel.value = emptyLevel || 'bachelor';
  }
  document.getElementById('eduModalFileInput').value = '';
  onEduModalLevelChange();
  bootstrap.Modal.getOrCreateInstance(document.getElementById('eduModal')).show();
}

function onEduModalLevelChange() {
  const key = document.getElementById('eduModalLevel').value;
  const d = educationStore[key] || { year: '', deg: '', uni: '', file: '' };

  document.getElementById('eduModalDeg').value = d.deg || '';
  document.getElementById('eduModalUni').value = d.uni || '';
  document.getElementById('eduModalYear').value = d.year || '';
  document.getElementById('eduModalFileUrl').value = d.file || '';

  const statusEl = document.getElementById('eduModalFileStatus');
  if (statusEl) {
    statusEl.innerHTML = d.file
      ? `<span class="text-success"><i class="fa-solid fa-check-circle me-1"></i>มีไฟล์แนบแล้ว (<a href="${escapeAttr(d.file)}" target="_blank">เปิดดู</a>)</span>`
      : '<span class="text-muted">ยังไม่มีไฟล์แนบ</span>';
  }

  const clearBtn = document.getElementById('btnClearEduModal');
  if (clearBtn) {
    clearBtn.classList.toggle('hidden', !hasEduContent(d));
  }
}

async function handleEduModalFileUpload(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  const level = document.getElementById('eduModalLevel').value;
  const colIndex = level === 'bachelor' ? 29 : (level === 'master' ? 33 : 37);
  const row = Number(document.getElementById('bgRow').value) || null;

  showAppLoading('กำลังอัปโหลดเอกสาร...', 'บันทึกไฟล์แนบวุฒิการศึกษาลง Drive');
  try {
    const base64 = await readFileAsBase64(file);
    const res = await callApi('uploadFileToDrive', {
      base64Data: base64,
      fileName: `${currentUser.initialName}_${level}_${file.name}`,
      colIndex,
      rowIndex: row,
      sheetType: 'bg',
      isImage: false
    });
    hideAppLoading();
    if (res.success) {
      document.getElementById('eduModalFileUrl').value = res.url;
      document.getElementById('eduModalFileStatus').innerHTML =
        `<span class="text-success"><i class="fa-solid fa-check-circle me-1"></i>อัปโหลดไฟล์เรียบร้อยแล้ว</span>`;
    } else {
      Swal.fire('ผิดพลาด', res.message, 'error');
    }
  } catch (err) {
    hideAppLoading();
    Swal.fire('Error', err.message, 'error');
  }
}

function saveEduFromModal() {
  const key = document.getElementById('eduModalLevel').value;
  const deg = document.getElementById('eduModalDeg').value.trim();
  const uni = document.getElementById('eduModalUni').value.trim();
  const year = document.getElementById('eduModalYear').value.trim();
  const file = document.getElementById('eduModalFileUrl').value.trim();

  if (!deg && !uni && !year) {
    return Swal.fire('แจ้งเตือน', 'กรุณากรอกวุฒิการศึกษา สถาบัน หรือปีที่จบ', 'warning');
  }

  educationStore[key] = { deg, uni, year, file };
  renderEducationSection();
  bootstrap.Modal.getInstance(document.getElementById('eduModal'))?.hide();
}

function clearEduFromModal() {
  const key = document.getElementById('eduModalLevel').value;
  educationStore[key] = { year: '', deg: '', uni: '', file: '' };
  renderEducationSection();
  bootstrap.Modal.getInstance(document.getElementById('eduModal'))?.hide();
}

async function loadProfileData() {
  if (!currentUser || currentUser.role === 'admin') return;
  showAppLoading('กำลังโหลดข้อมูลประวัติ...', 'ดึงข้อมูลจากระบบ ATSD CATC');
  experienceItems = [];
  educationStore = {
    bachelor: { year: '', deg: '', uni: '', file: '' },
    master:   { year: '', deg: '', uni: '', file: '' },
    doctor:   { year: '', deg: '', uni: '', file: '' }
  };
  renderExperienceTimeline();
  renderEducationSection();

  try {
    const data = await callApi('getBackgroundData', { initialName: currentUser.initialName });
    hideAppLoading();
    if (data && data.error) {
      Swal.fire('แจ้งเตือน', data.error, 'warning');
      return;
    }
    document.getElementById('bgRow').value = data.row || '';
    document.getElementById('bgNameEN').value = data.nameEN || '';
    document.getElementById('bgNameTH').value = data.nameTH || '';
    document.getElementById('bgInitial').value = data.initialName || currentUser.initialName || '';
    document.getElementById('bgDateStart').value = data.dateStart || '';
    document.getElementById('bgIdCard').value = data.idCard || '';
    document.getElementById('bgPicUrl').value = data.pic || '';

    const posSelect = document.getElementById('bgPosition');
    if (data.position && ![...posSelect.options].some(o => o.value === data.position)) {
      const opt = document.createElement('option');
      opt.value = data.position;
      opt.text = data.position;
      posSelect.appendChild(opt);
    }
    posSelect.value = data.position || '';

    document.getElementById('bgPicPreview').src = data.pic
      ? data.pic
      : 'https://via.placeholder.com/150?text=No+Image';

    experienceItems = (Array.isArray(data.exp) ? data.exp : [])
      .filter(item =>
        String(item.year || '').trim() ||
        String(item.pos || '').trim() ||
        String(item.name || '').trim()
      )
      .slice(0, MAX_EXPERIENCE);
    renderExperienceTimeline();

    educationStore = {
      bachelor: {
        year: data.edu?.bachelor?.year || '',
        deg:  data.edu?.bachelor?.deg  || '',
        uni:  data.edu?.bachelor?.uni  || '',
        file: data.edu?.bachelor?.file || ''
      },
      master: {
        year: data.edu?.master?.year || '',
        deg:  data.edu?.master?.deg  || '',
        uni:  data.edu?.master?.uni  || '',
        file: data.edu?.master?.file || ''
      },
      doctor: {
        year: data.edu?.doctor?.year || '',
        deg:  data.edu?.doctor?.deg  || '',
        uni:  data.edu?.doctor?.uni  || '',
        file: data.edu?.doctor?.file || ''
      }
    };
    renderEducationSection();
  } catch (err) {
    hideAppLoading();
    Swal.fire('Error', err.message, 'error');
  }
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function handleBgPicUpload(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  const row = Number(document.getElementById('bgRow').value) || null;

  showAppLoading('กำลังอัปโหลดรูปภาพ...', 'บันทึกรูปโปรไฟล์ลงระบบ');
  try {
    const base64 = await readFileAsBase64(file);
    const res = await callApi('uploadFileToDrive', {
      base64Data: base64,
      fileName: `${currentUser.initialName}_profile_${file.name}`,
      colIndex: 6,
      rowIndex: row,
      sheetType: 'bg',
      isImage: true
    });
    hideAppLoading();
    if (res.success) {
      document.getElementById('bgPicPreview').src = res.directUrl;
      document.getElementById('bgPicUrl').value = res.directUrl;
      Swal.fire('สำเร็จ', 'อัปโหลดรูปโปรไฟล์เรียบร้อยแล้ว', 'success');
    } else {
      Swal.fire('ผิดพลาด', res.message, 'error');
    }
  } catch (err) {
    hideAppLoading();
    Swal.fire('Error', err.message, 'error');
  }
}

async function saveProfileData() {
  syncHiddenEduInputs();
  const row = Number(document.getElementById('bgRow').value) || null;

  const expList = [];
  for (let i = 0; i < MAX_EXPERIENCE; i++) {
    const item = experienceItems[i] || { year: '', pos: '', name: '' };
    expList.push({
      year: String(item.year || '').trim(),
      pos:  String(item.pos  || '').trim(),
      name: String(item.name || '').trim()
    });
  }

  const payload = {
    nameEN: document.getElementById('bgNameEN').value.trim(),
    nameTH: document.getElementById('bgNameTH').value.trim(),
    dateStart: document.getElementById('bgDateStart').value.trim(),
    position: document.getElementById('bgPosition').value,
    initialName: document.getElementById('bgInitial').value.trim() || currentUser.initialName,
    pic: document.getElementById('bgPicUrl').value,
    idCard: document.getElementById('bgIdCard').value.trim(),
    exp: expList,
    edu: {
      bachelor: { ...educationStore.bachelor },
      master:   { ...educationStore.master },
      doctor:   { ...educationStore.doctor }
    }
  };

  showAppLoading('กำลังบันทึกข้อมูล...', 'อัปเดตประวัติส่วนตัวของคุณ');
  try {
    const res = await callApi('updateBackgroundData', { row, d: payload });
    hideAppLoading();
    if (res.success) {
      if (res.row) {
        document.getElementById('bgRow').value = res.row;
      }
      Swal.fire('บันทึกสำเร็จ', 'อัปเดตข้อมูลประวัติส่วนตัวเรียบร้อยแล้ว', 'success');
    } else {
      Swal.fire('เกิดข้อผิดพลาด', res.message, 'error');
    }
  } catch (err) {
    hideAppLoading();
    Swal.fire('Error', err.message, 'error');
  }
}

async function exportPDF() {
  showAppLoading('กำลังสร้างไฟล์ PDF...', 'จัดเตรียมเอกสารประวัติส่วนตัว');
  try {
    const url = await callApi('generateInstructorProfilePDF', { userInitialName: currentUser.initialName });
    Swal.fire({
      title: 'สร้างไฟล์ PDF สำเร็จ!',
      icon: 'success',
      html: `<a href="${url}" target="_blank" class="btn btn-primary mt-2"><i class="fa-solid fa-file-pdf me-1"></i> เปิดดู / ดาวน์โหลด PDF</a>`
    });
  } catch (err) {
    Swal.fire('ผิดพลาด', err.message, 'error');
  }
}

// ================= 3. MY TRAINING =================
function goToAddRecordTab() {
  setActiveTab('tabBtnAdd', 'tabAdd');
  initAddForm();
}

function selectTrainingStatFilter(statValue) {
  const sel = document.getElementById('trainingStatusFilter');
  if (sel) sel.value = statValue;
  highlightSummaryStatBox(statValue);
  renderUserTraining();
}

function onTrainingStatusDropdownChange() {
  const val = document.getElementById('trainingStatusFilter')?.value || 'all';
  highlightSummaryStatBox(val);
  renderUserTraining();
}

function highlightSummaryStatBox(statValue) {
  document.querySelectorAll('#tabTraining .summary-stat-box').forEach(box => {
    box.classList.toggle('active-stat', box.dataset.stat === statValue);
  });
}

function selectTrainingCategory(category) {
  selectedTrainingCategory = category || 'ALL';
  document.querySelectorAll('#trainingCategoryButtons .category-pill-btn').forEach(btn => {
    const isMatch = btn.dataset.category === selectedTrainingCategory;
    btn.classList.toggle('is-selected', isMatch);
    const checkIcon = btn.querySelector('.category-check-icon');
    if (checkIcon) checkIcon.classList.toggle('d-none', !isMatch);
  });
  renderUserTraining();
}

function isRecordExpiringSoon(rec) {
  const raw = rec.daysLeft;
  if (raw === '' || raw === null || raw === undefined) return false;
  const n = Number(raw);
  return !isNaN(n) && n <= 90;
}

function getCategoryIconHtml(categoryName) {
  const c = String(categoryName || '').toLowerCase();
  if (c.includes('initial')) return '<i class="fa-solid fa-graduation-cap text-primary"></i>';
  if (c.includes('recurrent')) return '<i class="fa-solid fa-arrows-rotate text-success"></i>';
  if (c.includes('optional')) return '<i class="fa-solid fa-book-open" style="color:#9333ea;"></i>';
  if (c.includes('continuing')) return '<i class="fa-solid fa-award" style="color:#ea580c;"></i>';
  if (c.includes('licensing')) return '<i class="fa-regular fa-id-badge" style="color:#0284c7;"></i>';
  return '<i class="fa-solid fa-layer-group text-secondary"></i>';
}

function getSoftStatusBadge(status) {
  const s = String(status || '').trim().toLowerCase();
  if (s === 'approve') return '<span class="status-pill-approved">Approved</span>';
  if (s === 'reject') return '<span class="status-pill-rejected">Rejected</span>';
  return '<span class="status-pill-waiting">Waiting Approve</span>';
}

function getSoftRemainingBadge(rec) {
  const status = String(rec.statusStr || '').trim().toLowerCase();
  if (status === 'exempted' || status === 'exempt') {
    return '<span class="remain-soft-badge" style="background:#e2e8f0;color:#334155;">Exempted</span>';
  }
  const dVal = rec.daysLeft;
  if (dVal === '' || dVal === null || dVal === undefined) {
    return '<span class="remain-soft-badge" style="background:#e0f2fe;color:#0369a1;"><i class="fa-solid fa-check"></i> Pass</span>';
  }
  const n = Number(dVal);
  if (isNaN(n)) {
    return `<span class="remain-soft-badge" style="background:#e0f2fe;color:#0369a1;">${escapeHtml(dVal)}</span>`;
  }
  if (n <= 0) {
    return `<span class="remain-soft-badge" style="background:#fee2e2;color:#b91c1c;"><i class="fa-regular fa-clock"></i> ${n}d</span>`;
  }
  if (n <= 30) {
    return `<span class="remain-soft-badge" style="background:#ffedd5;color:#c2410c;"><i class="fa-regular fa-clock"></i> ${n}d</span>`;
  }
  if (n <= 90) {
    return `<span class="remain-soft-badge" style="background:#fef9c3;color:#a16207;"><i class="fa-regular fa-clock"></i> ${n}d</span>`;
  }
  return `<span class="remain-soft-badge"><i class="fa-regular fa-clock"></i> ${n}d</span>`;
}

function setTrainingViewMode(mode) {
  trainingViewMode = mode === 'table' ? 'table' : 'card';
  const cardBtn = document.getElementById('btnViewCard');
  const tableBtn = document.getElementById('btnViewTable');
  const cardView = document.getElementById('trainingCardView');
  const tableView = document.getElementById('trainingTableView');

  if (cardBtn) cardBtn.classList.toggle('is-active', trainingViewMode === 'card');
  if (tableBtn) tableBtn.classList.toggle('is-active', trainingViewMode === 'table');
  if (cardView) cardView.classList.toggle('hidden', trainingViewMode !== 'card');
  if (tableView) tableView.classList.toggle('hidden', trainingViewMode !== 'table');

  renderUserTraining();
}

async function loadUserTraining() {
  const tbody = document.getElementById('userTrainingBody');
  const cardView = document.getElementById('trainingCardView');
  const countText = document.getElementById('trainingResultCountText');

  if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">กำลังโหลดข้อมูล...</td></tr>';
  if (cardView) cardView.innerHTML = '<div class="text-center py-4 text-muted">กำลังโหลดข้อมูล...</div>';
  if (countText) countText.innerText = 'กำลังโหลดข้อมูล...';

  try {
    const records = await callApi('getTrainingRecords', { initialName: currentUser.initialName });
    userTrainingRecords = Array.isArray(records) ? [...records].reverse() : [];
    updateTrainingSummaryAndCategories();
    renderUserTraining();
  } catch (err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-danger">${err.message}</td></tr>`;
    if (cardView) cardView.innerHTML = `<div class="text-center py-4 text-danger">${err.message}</div>`;
    if (countText) countText.innerText = 'ไม่สามารถโหลดข้อมูลได้';
  }
}

function updateTrainingSummaryAndCategories() {
  const total = userTrainingRecords.length;
  const approved = userTrainingRecords.filter(r => String(r.statusStr || '').trim().toLowerCase() === 'approve').length;
  const waiting = userTrainingRecords.filter(r => String(r.statusStr || '').trim().toLowerCase() === 'waiting approve').length;
  const expiring = userTrainingRecords.filter(r => isRecordExpiringSoon(r)).length;

  document.getElementById('sumCountAll').innerText = total;
  document.getElementById('sumCountApproved').innerText = approved;
  document.getElementById('sumCountWaiting').innerText = waiting;
  document.getElementById('sumCountExpiring').innerText = expiring > 0 ? expiring : '—';

  const catAllEl = document.getElementById('catCountAll');
  if (catAllEl) catAllEl.innerText = `${total} รายการ`;

  const countsByCat = {
    'Initial Training': 0,
    'Recurrent Training': 0,
    'Optional Training': 0,
    'Continuing Training': 0,
    'Personnel Licensing': 0
  };
  userTrainingRecords.forEach(r => {
    const t = String(r.type || '').trim();
    if (countsByCat[t] !== undefined) countsByCat[t]++;
  });

  const subLabels = [
    { id: 'catCountInitial',    cat: 'Initial Training',    desc: 'การฝึกอบรมเริ่มต้น' },
    { id: 'catCountRecurrent',  cat: 'Recurrent Training',  desc: 'การฝึกอบรมทบทวนตามรอบ' },
    { id: 'catCountOptional',   cat: 'Optional Training',   desc: 'การฝึกอบรมเพิ่มเติม' },
    { id: 'catCountContinuing', cat: 'Continuing Training', desc: 'การพัฒนาความรู้ต่อเนื่อง' },
    { id: 'catCountLicensing',  cat: 'Personnel Licensing', desc: 'ใบอนุญาตและคุณสมบัติบุคลากร' }
  ];
  subLabels.forEach(({ id, cat, desc }) => {
    const el = document.getElementById(id);
    if (el) el.innerText = countsByCat[cat] > 0 ? `${countsByCat[cat]} รายการ · ${desc}` : desc;
  });
}

function getFilteredUserTraining() {
  const keyword = (document.getElementById('trainingSearchInput')?.value || '').trim().toLowerCase();
  const statusFilter = (document.getElementById('trainingStatusFilter')?.value || 'all').trim().toLowerCase();

  return userTrainingRecords.filter(r => {
    const rowType = String(r.type || '').trim();
    const matchCategory = selectedTrainingCategory === 'ALL' || rowType.toLowerCase() === selectedTrainingCategory.toLowerCase();

    const rowStatus = String(r.statusStr || '').trim().toLowerCase();
    let matchStatus = true;
    if (statusFilter === 'expiring') {
      matchStatus = isRecordExpiringSoon(r);
    } else if (statusFilter !== 'all') {
      matchStatus = rowStatus === statusFilter;
    }

    const searchable = [r.ato, r.type, r.sub1, r.sub2, r.sub3].filter(Boolean).join(' ').toLowerCase();
    const matchKeyword = !keyword || searchable.includes(keyword);

    return matchCategory && matchStatus && matchKeyword;
  });
}

function renderUserTraining() {
  const filtered = getFilteredUserTraining();
  const countText = document.getElementById('trainingResultCountText');
  if (countText) countText.innerText = `แสดง ${filtered.length} จาก ${userTrainingRecords.length} รายการ`;

  if (trainingViewMode === 'table') {
    renderUserTrainingTable(filtered);
  } else {
    renderUserTrainingCards(filtered);
  }
}

function openTrainingDetailModal(index) {
  const filtered = getFilteredUserTraining();
  const rec = filtered[index];
  if (!rec) return;

  const title = rec.sub2 || rec.sub1 || 'รายละเอียดรายการ';
  document.getElementById('detailModalTitle').innerText = title;

  const subPath = [rec.type, rec.sub1, rec.sub2, rec.sub3 ? `Role: ${rec.sub3}` : ''].filter(Boolean).join(' · ');
  document.getElementById('detailModalBody').innerHTML = `
    <div class="mb-2"><span class="text-muted small">หมวดหมู่ / รายละเอียด:</span><div class="fw-semibold">${escapeHtml(subPath || '-')}</div></div>
    <div class="row g-2 mb-2 small">
      <div class="col-6"><span class="text-muted">หน่วยงาน (ATO):</span><div class="fw-semibold">${escapeHtml(rec.ato || '-')}</div></div>
      <div class="col-6"><span class="text-muted">สถานะ:</span><div>${getSoftStatusBadge(rec.statusStr)}</div></div>
      <div class="col-6"><span class="text-muted">วันที่ฝึกอบรม / ออกใบอนุญาต:</span><div class="fw-semibold">${escapeHtml(formatDateDisplay(rec.active))}</div></div>
      <div class="col-6"><span class="text-muted">วันหมดอายุ:</span><div class="fw-semibold">${escapeHtml(formatDateDisplay(rec.expire))}</div></div>
    </div>
    <div class="mt-2">${getSoftRemainingBadge(rec)}</div>
  `;

  const footer = document.getElementById('detailModalFooter');
  footer.innerHTML = `
    ${rec.link ? `<a href="${escapeAttr(rec.link)}" target="_blank" class="btn btn-primary btn-sm"><i class="fa-solid fa-file-lines me-1"></i>เปิดไฟล์แนบ</a>` : ''}
    <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">ปิด</button>
  `;

  bootstrap.Modal.getOrCreateInstance(document.getElementById('trainingDetailModal')).show();
}

function renderUserTrainingCards(filtered) {
  const container = document.getElementById('trainingCardView');
  if (!container) return;

  if (filtered.length === 0) {
    container.innerHTML = '<div class="text-center py-4 text-muted bg-light rounded border">ไม่พบข้อมูลที่ตรงกับเงื่อนไข</div>';
    return;
  }

  container.innerHTML = filtered.map((r, idx) => {
    const mainTitle = r.sub2 || r.sub1 || '-';
    const subParts = [r.type, r.sub1, r.sub3 ? `Role: ${r.sub3}` : ''].filter(Boolean);
    const subtitle = subParts.join(' · ');

    return `
      <div class="my-training-card">
        <div class="d-flex justify-content-between align-items-start gap-2">
          <div class="d-flex align-items-start gap-2">
            <span class="mt-1">${getCategoryIconHtml(r.type)}</span>
            <div>
              <div class="fw-bold text-dark fs-6">${escapeHtml(mainTitle)}</div>
              <div class="small text-muted">${escapeHtml(subtitle || '-')}</div>
            </div>
          </div>
          ${getSoftStatusBadge(r.statusStr)}
        </div>

        <hr class="my-3 border-light">

        <div class="row g-2 small mb-3">
          <div class="col-6">
            <div class="text-muted">วันที่ฝึกอบรม / ออกใบอนุญาต</div>
            <div class="fw-bold text-dark mt-1">${escapeHtml(formatDateDisplay(r.active))}</div>
          </div>
          <div class="col-6">
            <div class="text-muted">วันหมดอายุ</div>
            <div class="fw-bold text-dark mt-1">${escapeHtml(formatDateDisplay(r.expire))}</div>
          </div>
        </div>

        <div class="d-flex justify-content-between align-items-center gap-2">
          ${getSoftRemainingBadge(r)}
          <button type="button" class="detail-outline-btn" onclick="openTrainingDetailModal(${idx})">
            <i class="fa-regular fa-file-lines me-1"></i> ดูรายละเอียด
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function renderUserTrainingTable(filtered) {
  const tbody = document.getElementById('userTrainingBody');
  if (!tbody) return;

  tbody.innerHTML = '';
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">ไม่พบข้อมูลที่ตรงกับเงื่อนไข</td></tr>';
    return;
  }

  filtered.forEach((r, idx) => {
    const mainTitle = r.sub2 || r.sub1 || '-';
    const subLine = [r.sub1 && r.sub2 ? r.sub1 : '', r.sub3 ? `Role: ${r.sub3}` : ''].filter(Boolean).join(' · ');

    tbody.innerHTML += `
      <tr>
        <td class="py-2">
          <div class="fw-semibold text-dark">${escapeHtml(mainTitle)}</div>
          ${subLine ? `<div class="small text-muted">${escapeHtml(subLine)}</div>` : ''}
        </td>
        <td class="py-2 small text-secondary">${escapeHtml(r.type || '-')}</td>
        <td class="py-2 text-nowrap small">${escapeHtml(formatDateDisplay(r.active))}</td>
        <td class="py-2 text-nowrap small">${escapeHtml(formatDateDisplay(r.expire))}</td>
        <td class="py-2 text-center text-nowrap">${getSoftRemainingBadge(r)}</td>
        <td class="py-2 text-center text-nowrap">${getSoftStatusBadge(r.statusStr)}</td>
        <td class="py-2 text-end text-nowrap">
          <button type="button" class="detail-outline-btn" onclick="openTrainingDetailModal(${idx})">
            <i class="fa-regular fa-file-lines me-1"></i> ดูรายละเอียด
          </button>
        </td>
      </tr>
    `;
  });
}

// ================= 4. ADD RECORD =================
function toggleExtraSubsPanel(forceOpen = null) {
  const panel = document.getElementById('extraSubsPanel');
  const chevron = document.getElementById('extraSubsChevron');
  if (!panel) return;

  const shouldOpen = forceOpen !== null ? forceOpen : panel.classList.contains('hidden');
  panel.classList.toggle('hidden', !shouldOpen);
  if (chevron) {
    chevron.classList.toggle('fa-chevron-down', !shouldOpen);
    chevron.classList.toggle('fa-chevron-up', shouldOpen);
  }
}

function initAddForm() {
  if (!dbOptions) return;
  populateSelect('addAto', dbOptions.ato);
  populateSelect('addType', dbOptions.type);
  populateSelect('addSub3', [''].concat(dbOptions.authSub3));
  toggleExtraSubsPanel(false);
  onAtoOrTypeChange();
}

async function onAtoOrTypeChange() {
  const ato = document.getElementById('addAto').value;
  const type = document.getElementById('addType').value;

  const expContainer = document.getElementById('expireDateContainer');
  if (type.toLowerCase() === 'initial training') {
    expContainer.classList.add('hidden');
    document.getElementById('addExpireDate').value = '';
  } else {
    expContainer.classList.remove('hidden');
  }

  const sub1Select = document.getElementById('addSub1');
  sub1Select.innerHTML = '<option value="">กำลังโหลด...</option>';

  try {
    const list = await callApi('getSub1Options', { ato, type });
    populateSelect('addSub1', list);
    onSub1Change();
  } catch (err) {
    sub1Select.innerHTML = '<option value="">ผิดพลาด</option>';
  }
}

function onSub1Change() {
  const ato = document.getElementById('addAto').value;
  const type = document.getElementById('addType').value;
  const sub1 = document.getElementById('addSub1').value;

  const sub2SelCont = document.getElementById('sub2SelectContainer');
  const sub2TxtCont = document.getElementById('sub2TextContainer');
  const sub2Sel = document.getElementById('addSub2Select');

  sub2SelCont.classList.remove('hidden');
  sub2TxtCont.classList.add('hidden');
  sub2Sel.innerHTML = '<option value="">-</option>';

  let hasSub2Options = false;
  if (type === 'Optional Training' && sub1.toUpperCase() === 'OTHER') {
    sub2SelCont.classList.add('hidden');
    sub2TxtCont.classList.remove('hidden');
    hasSub2Options = true;
  } else if (sub1 === 'Evaluation-Theory') {
    const list = ato === 'ATCO' ? dbOptions.evalTheoryATCO : (ato === 'FOOTO' ? dbOptions.evalTheoryFOOTO : dbOptions.evalTheoryUATO);
    populateSelect('addSub2Select', list || []);
    hasSub2Options = Array.isArray(list) && list.length > 0;
  } else if (sub1 === 'Evaluation-Practical') {
    const list = ato === 'ATCO' ? dbOptions.evalPracATCO : (ato === 'FOOTO' ? dbOptions.evalPracFOOTO : dbOptions.evalPracUATO);
    populateSelect('addSub2Select', list || []);
    hasSub2Options = Array.isArray(list) && list.length > 0;
  } else if (type === 'Personnel Licensing' && Array.isArray(dbOptions.licenceExtra) && dbOptions.licenceExtra.length > 0) {
    populateSelect('addSub2Select', [''].concat(dbOptions.licenceExtra));
    hasSub2Options = true;
  }

  if (hasSub2Options) {
    toggleExtraSubsPanel(true);
  }
}

document.getElementById('addRecordForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  const ato = document.getElementById('addAto').value;
  const type = document.getElementById('addType').value;
  const sub1 = document.getElementById('addSub1').value;
  const isOther = (type === 'Optional Training' && sub1.toUpperCase() === 'OTHER');
  const sub2 = isOther ? document.getElementById('addSub2Text').value.trim() : document.getElementById('addSub2Select').value;
  const sub3 = document.getElementById('addSub3').value;
  const activeDate = document.getElementById('addActiveDate').value;
  const expireDate = document.getElementById('addExpireDate').value;
  const fileInput = document.getElementById('addFile');

  showAppLoading('กำลังตรวจสอบข้อมูลซ้ำ...', 'ตรวจสอบประวัติการฝึกอบรมและใบอนุญาต');

  try {
    const dupRes = await callApi('checkDuplicateRecord', {
      initialName: currentUser.initialName, ato, type, sub1, sub2
    });

    if (dupRes.isDuplicate) {
      hideAppLoading();
      const choice = await Swal.fire({
        title: 'พบข้อมูลวิชานี้ในระบบแล้ว!',
        html: `Active เดิม: <b>${dupRes.oldActive}</b> | Expire เดิม: <b>${dupRes.oldExpire}</b><br>สถานะ: <b>${dupRes.oldStatus}</b><br><br>ต้องการบันทึกทับข้อมูลเดิมหรือไม่?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'ใช่, บันทึกทับ',
        cancelButtonText: 'ยกเลิก'
      });
      if (choice.isConfirmed) {
        await processFileAndSubmit(fileInput, {
          initialName: currentUser.initialName, ato, type, sub1, sub2, sub3, activeDate, expireDate, overwriteRow: dupRes.row
        });
      }
    } else {
      await processFileAndSubmit(fileInput, {
        initialName: currentUser.initialName, ato, type, sub1, sub2, sub3, activeDate, expireDate, overwriteRow: null
      });
    }
  } catch (err) {
    hideAppLoading();
    Swal.fire('Error', err.message, 'error');
  }
});

async function processFileAndSubmit(fileInput, payload) {
  showAppLoading('กำลังบันทึกข้อมูล...', 'อัปโหลดไฟล์แนบและบันทึกข้อมูลลงระบบ');

  if (fileInput.files && fileInput.files[0]) {
    const file = fileInput.files[0];
    const base64 = await readFileAsBase64(file);
    const cleanFileName = `${payload.initialName}_${payload.sub1}_${file.name}`;
    const uploadRes = await callApi('uploadFileToDrive', {
      base64Data: base64,
      fileName: cleanFileName,
      colIndex: null,
      rowIndex: null,
      sheetType: 'record',
      isImage: false
    });
    if (!uploadRes.success) throw new Error(uploadRes.message);
    payload.fileUrl = uploadRes.url;
  } else {
    payload.fileUrl = '';
  }

  await callApi('submitTrainingRecord', { data: payload });
  hideAppLoading();
  Swal.fire('สำเร็จ!', 'บันทึกข้อมูลเรียบร้อยแล้ว (รอ Admin อนุมัติ)', 'success');
  document.getElementById('addRecordForm').reset();
  toggleExtraSubsPanel(false);
  onAtoOrTypeChange();
}

// ================= 5. ADMIN: TRAINING MONITOR (MATRIX & ACTION REQUIRED) =================
function selectMonitorScope(scope) {
  monitorScopeFilter = scope || 'all';
  document.querySelectorAll('#tabAdminMonitor .summary-stat-box').forEach(box => {
    box.classList.toggle('active-stat', box.dataset.monScope === monitorScopeFilter);
  });
  renderMonitorView();
}

function setMonitorSubMode(mode) {
  monitorSubMode = mode === 'alert' ? 'alert' : 'matrix';
  document.getElementById('btnMonViewMatrix')?.classList.toggle('is-active', monitorSubMode === 'matrix');
  document.getElementById('btnMonViewAlert')?.classList.toggle('is-active', monitorSubMode === 'alert');
  document.getElementById('monitorMatrixSection')?.classList.toggle('hidden', monitorSubMode !== 'matrix');
  document.getElementById('monitorAlertSection')?.classList.toggle('hidden', monitorSubMode !== 'alert');
  renderMonitorView();
}

function matchesMonitorScope(rec, scope) {
  if (!scope || scope === 'all') return true;
  const bucket = getRecordBucket(rec);
  if (scope === 'expired') return bucket === 'EXPIRE';
  if (scope === 'expiring') return bucket === 'WARNING' || bucket === 'CAUTION';
  if (scope === 'normal') return bucket === 'NORMAL' || bucket === 'PASS';
  return true;
}

async function loadMonitor() {
  const body = document.getElementById('monitorMatrixBody');
  if (body) {
    body.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">กำลังโหลดข้อมูล Monitor...</td></tr>';
  }
  try {
    const data = await callApi('getMonitorData');
    monitorRawData = {
      users: Array.isArray(data?.users) ? data.users : [],
      records: Array.isArray(data?.records) ? data.records : [],
      db: data?.db || {}
    };
    initMonitorFilters();
    renderMonitorView();
  } catch (err) {
    if (body) {
      body.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-danger">${err.message}</td></tr>`;
    }
  }
}

function initMonitorFilters() {
  const positions = [...new Set(monitorRawData.users.map(u => String(u.position || '').trim()).filter(Boolean))].sort();
  const atos = [...new Set([
    ...(monitorRawData.db.ato || []),
    ...monitorRawData.records.map(r => String(r.ato || '').trim())
  ].filter(Boolean))];
  const types = [...new Set([
    ...(monitorRawData.db.type || []),
    ...monitorRawData.records.map(r => String(r.type || '').trim())
  ].filter(Boolean))];

  fillFilterDropdown('monFilterPosition', positions, 'All Positions');
  fillFilterDropdown('monFilterAto', atos, 'All ATO');
  fillFilterDropdown('monFilterType', types, 'All Types');

  const atoSel = document.getElementById('monFilterAto');
  const typeSel = document.getElementById('monFilterType');
  if (atoSel && [...atoSel.options].some(o => o.value === 'ATCO')) atoSel.value = 'ATCO';
  if (typeSel && [...typeSel.options].some(o => o.value === 'Recurrent Training')) typeSel.value = 'Recurrent Training';

  syncMonitorCascadeOptions(true);
}

function onMonitorFilterChange() {
  syncMonitorCascadeOptions(false);
  renderMonitorView();
}

function syncMonitorCascadeOptions(resetSubFilters) {
  const ato = document.getElementById('monFilterAto')?.value || 'ALL';
  const type = document.getElementById('monFilterType')?.value || 'ALL';
  const sub1El = document.getElementById('monFilterSub1');
  const sub2El = document.getElementById('monFilterSub2');
  const sub3El = document.getElementById('monFilterSub3');

  const prevSub1 = resetSubFilters ? 'ALL' : (sub1El?.value || 'ALL');
  const prevSub2 = resetSubFilters ? 'ALL' : (sub2El?.value || 'ALL');
  const prevSub3 = resetSubFilters ? 'ALL' : (sub3El?.value || 'ALL');

  const baseRecs = monitorRawData.records.filter(r =>
    (ato === 'ALL' || String(r.ato || '').trim() === ato) &&
    (type === 'ALL' || String(r.type || '').trim() === type)
  );

  let dbSub1 = [];
  const tLower = type.toLowerCase();
  if (tLower === 'initial training') dbSub1 = monitorRawData.db.initial || [];
  else if (tLower === 'recurrent training') dbSub1 = monitorRawData.db.recurrent || [];
  else if (tLower === 'continuing training') dbSub1 = monitorRawData.db.continuing || [];
  else if (tLower === 'optional training') dbSub1 = monitorRawData.db.optional || [];
  else if (tLower === 'personnel licensing') dbSub1 = monitorRawData.db.personnel || [];

  const sub1List = [...new Set([
    ...dbSub1,
    ...baseRecs.map(r => String(r.sub1 || '').trim())
  ].filter(Boolean))].sort();
  fillFilterDropdown('monFilterSub1', sub1List, 'All Sub 1', prevSub1);

  const activeSub1 = sub1El?.value || 'ALL';
  const sub1Recs = baseRecs.filter(r => activeSub1 === 'ALL' || String(r.sub1 || '').trim() === activeSub1);

  const sub2List = [...new Set(sub1Recs.map(r => String(r.sub2 || '').trim()).filter(Boolean))].sort();
  fillFilterDropdown('monFilterSub2', sub2List, 'All Sub 2', prevSub2);

  const activeSub2 = sub2El?.value || 'ALL';
  const sub2Recs = sub1Recs.filter(r => activeSub2 === 'ALL' || String(r.sub2 || '').trim() === activeSub2);

  const sub3List = [...new Set([
    ...(monitorRawData.db.evalSub2 || []),
    ...sub2Recs.map(r => String(r.sub3 || '').trim())
  ].filter(Boolean))].sort();
  fillFilterDropdown('monFilterSub3', sub3List, 'All Sub 3', prevSub3);
}

function renderMonitorView() {
  const posFilter = document.getElementById('monFilterPosition')?.value || 'ALL';
  const atoFilter = document.getElementById('monFilterAto')?.value || 'ALL';
  const typeFilter = document.getElementById('monFilterType')?.value || 'ALL';
  const sub1Filter = document.getElementById('monFilterSub1')?.value || 'ALL';
  const sub2Filter = document.getElementById('monFilterSub2')?.value || 'ALL';
  const sub3Filter = document.getElementById('monFilterSub3')?.value || 'ALL';
  const keyword = (document.getElementById('monSearchInput')?.value || '').trim().toLowerCase();

  const filteredUsers = monitorRawData.users
    .filter(u => {
      if (posFilter !== 'ALL' && String(u.position || '').trim() !== posFilter) return false;
      if (keyword) {
        const uMatch = [u.initialName, u.position, u.nameEN, u.nameTH].filter(Boolean).join(' ').toLowerCase().includes(keyword);
        const hasRecMatch = monitorRawData.records.some(r =>
          String(r.initialName || '').trim() === String(u.initialName || '').trim() &&
          [r.sub1, r.sub2, r.sub3, r.type].filter(Boolean).join(' ').toLowerCase().includes(keyword)
        );
        if (!uMatch && !hasRecMatch) return false;
      }
      return true;
    })
    .sort((a, b) => String(a.initialName).localeCompare(String(b.initialName)));

  const allowedUserSet = new Set(filteredUsers.map(u => String(u.initialName || '').trim()));

  const contextRecs = monitorRawData.records.filter(r => {
    const uName = String(r.initialName || '').trim();
    if (!allowedUserSet.has(uName)) return false;
    if (atoFilter !== 'ALL' && String(r.ato || '').trim() !== atoFilter) return false;
    if (typeFilter !== 'ALL' && String(r.type || '').trim() !== typeFilter) return false;
    if (sub1Filter !== 'ALL' && String(r.sub1 || '').trim() !== sub1Filter) return false;
    if (sub2Filter !== 'ALL' && String(r.sub2 || '').trim() !== sub2Filter) return false;
    if (sub3Filter !== 'ALL' && String(r.sub3 || '').trim() !== sub3Filter) return false;
    if (keyword) {
      const uObj = monitorRawData.users.find(u => String(u.initialName || '').trim() === uName) || {};
      const hay = [uName, uObj.position, r.sub1, r.sub2, r.sub3, r.type].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(keyword)) return false;
    }
    return true;
  });

  // คำนวณ KPI จากชุดข้อมูลที่กรองตามหมวด/ตำแหน่ง
  let kpiNormal = 0;
  let kpiExpiring = 0;
  let kpiExpired = 0;
  contextRecs.forEach(r => {
    const b = getRecordBucket(r);
    if (b === 'NORMAL' || b === 'PASS') kpiNormal++;
    else if (b === 'WARNING' || b === 'CAUTION') kpiExpiring++;
    else if (b === 'EXPIRE') kpiExpired++;
  });

  document.getElementById('monKpiUsers').innerText = filteredUsers.length;
  document.getElementById('monKpiNormal').innerText = kpiNormal;
  document.getElementById('monKpiExpiring').innerText = kpiExpiring;
  document.getElementById('monKpiExpired').innerText = kpiExpired;

  const urgentRecs = contextRecs
    .filter(r => {
      const b = getRecordBucket(r);
      return b === 'EXPIRE' || b === 'WARNING' || b === 'CAUTION';
    })
    .sort((a, b) => Number(a.daysLeft) - Number(b.daysLeft));

  document.getElementById('monAlertBadgeCount').innerText = urgentRecs.length;

  const scopedRecs = contextRecs.filter(r => matchesMonitorScope(r, monitorScopeFilter));
  const summaryEl = document.getElementById('monitorSummaryText');
  if (summaryEl) {
    summaryEl.innerText = `แสดง ${filteredUsers.length} บุคลากร · ${scopedRecs.length} รายการ · ต้องติดตาม ${urgentRecs.length} รายการ`;
  }

  if (monitorSubMode === 'alert') {
    renderMonitorAlertList(urgentRecs);
  } else {
    renderMonitorMatrix(filteredUsers, scopedRecs, sub1Filter);
  }
}

function renderMonitorMatrix(filteredUsers, scopedRecs, sub1Filter) {
  const headEl = document.getElementById('monitorMatrixHead');
  const bodyEl = document.getElementById('monitorMatrixBody');
  if (!headEl || !bodyEl) return;

  let columnHeaders = [];
  if (sub1Filter !== 'ALL') {
    columnHeaders = [sub1Filter];
  } else {
    const availableOpts = [...(document.getElementById('monFilterSub1')?.options || [])]
      .map(o => o.value)
      .filter(v => v !== 'ALL');
    columnHeaders = availableOpts.length > 0
      ? availableOpts
      : [...new Set(scopedRecs.map(r => String(r.sub1 || '').trim()).filter(Boolean))].sort();
  }

  headEl.innerHTML = `
    <tr>
      <th class="text-start ps-3" style="min-width: 150px;">Initial</th>
      ${columnHeaders.map(col => `<th>${escapeHtml(col)}</th>`).join('')}
    </tr>
  `;

  if (filteredUsers.length === 0) {
    bodyEl.innerHTML = `<tr><td colspan="${columnHeaders.length + 1}" class="py-4 text-muted">ไม่พบรายชื่อบุคลากร</td></tr>`;
    return;
  }

  bodyEl.innerHTML = filteredUsers.map(u => {
    const userName = String(u.initialName || '').trim();
    const userRecs = scopedRecs.filter(r => String(r.initialName || '').trim() === userName);

    const cells = columnHeaders.map(colName => {
      const matched = userRecs.filter(r => String(r.sub1 || '').trim() === colName);
      if (matched.length === 0) {
        return '<td class="text-muted">—</td>';
      }
      const cellContent = matched.map(m => {
        const extra = [m.sub2, m.sub3].filter(Boolean).join(' · ');
        const badge = formatMonitorCellDays(m.daysLeft, m.statusStr);
        return extra ? `<div class="small text-secondary mb-1">${escapeHtml(extra)}</div>${badge}` : badge;
      }).join('<hr class="my-1 border-light">');
      return `<td>${cellContent}</td>`;
    }).join('');

    return `
      <tr>
        <td class="text-start ps-3">
          <button type="button" class="initial-link-btn" onclick="openPersonnelDrawer('${escapeAttr(userName)}')">
            ${escapeHtml(userName)}
          </button>
          ${u.position ? `<div class="small text-muted">${escapeHtml(u.position)}</div>` : ''}
        </td>
        ${cells}
      </tr>
    `;
  }).join('');
}

function renderMonitorAlertList(urgentRecs) {
  const container = document.getElementById('monitorAlertList');
  if (!container) return;

  if (urgentRecs.length === 0) {
    container.innerHTML = '<div class="text-center py-4 text-muted bg-light rounded border">ไม่มีรายการที่หมดอายุหรือใกล้หมดอายุในตัวกรองนี้</div>';
    return;
  }

  container.innerHTML = urgentRecs.map(r => {
    const courseTitle = r.sub2 || r.sub1 || '-';
    const subInfo = [r.type, r.sub1 && r.sub2 ? r.sub1 : '', r.sub3 ? `Role: ${r.sub3}` : ''].filter(Boolean).join(' · ');
    return `
      <div class="my-training-card">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
          <div>
            <button type="button" class="initial-link-btn me-2" onclick="openPersonnelDrawer('${escapeAttr(r.initialName)}')">
              ${escapeHtml(r.initialName)}
            </button>
            <strong class="text-dark">${escapeHtml(courseTitle)}</strong>
            <div class="small text-muted">${escapeHtml(subInfo || '-')}</div>
          </div>
          <div class="d-flex align-items-center gap-2">
            <span class="small text-muted">หมดอายุ: <strong>${escapeHtml(formatDateDisplay(r.expire))}</strong></span>
            ${formatMonitorCellDays(r.daysLeft, r.statusStr)}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function openPersonnelDrawer(initialName) {
  const uObj = monitorRawData.users.find(u => String(u.initialName || '').trim() === String(initialName || '').trim()) || {};
  const recs = monitorRawData.records.filter(r => String(r.initialName || '').trim() === String(initialName || '').trim());

  document.getElementById('drawerPersonTitle').innerText = `${initialName}${uObj.nameTH ? ` · ${uObj.nameTH}` : ''}`;
  document.getElementById('drawerPersonSubtitle').innerText = uObj.position || 'บุคลากร ATSD CATC';

  const urgentCount = recs.filter(r => {
    const b = getRecordBucket(r);
    return b === 'EXPIRE' || b === 'WARNING' || b === 'CAUTION';
  }).length;

  const bodyEl = document.getElementById('drawerPersonBody');
  bodyEl.innerHTML = `
    <div class="d-flex flex-wrap gap-2 mb-3">
      <span class="badge bg-primary-subtle text-primary px-3 py-2">รายการทั้งหมด ${recs.length} รายการ</span>
      <span class="badge bg-warning-subtle text-warning-emphasis px-3 py-2">ต้องติดตาม / ใกล้หมดอายุ ${urgentCount} รายการ</span>
    </div>
    ${recs.length === 0
      ? '<div class="text-muted small py-3">ไม่พบประวัติการฝึกอบรมของบุคลากรรายนี้</div>'
      : `<div class="d-flex flex-column gap-2">${recs.map(r => `
          <div class="border rounded-3 p-3 bg-white">
            <div class="d-flex justify-content-between align-items-start gap-2">
              <div>
                <div class="fw-bold text-dark">${escapeHtml(r.sub2 || r.sub1 || '-')}</div>
                <div class="small text-muted">${escapeHtml([r.ato, r.type, r.sub1 && r.sub2 ? r.sub1 : '', r.sub3 ? `Role: ${r.sub3}` : ''].filter(Boolean).join(' · '))}</div>
              </div>
              ${formatMonitorCellDays(r.daysLeft, r.statusStr)}
            </div>
            <div class="d-flex flex-wrap justify-content-between align-items-center small text-muted mt-2 pt-2 border-top">
              <span>Active: <strong>${escapeHtml(formatDateDisplay(r.active))}</strong> · Expire: <strong>${escapeHtml(formatDateDisplay(r.expire))}</strong></span>
              ${r.link ? `<a href="${escapeAttr(r.link)}" target="_blank" class="btn btn-xs btn-outline-primary py-0 px-2">ดูไฟล์</a>` : ''}
            </div>
          </div>
        `).join('')}</div>`
    }
  `;

  bootstrap.Modal.getOrCreateInstance(document.getElementById('personnelDrawerModal')).show();
}

function formatMonitorCellDays(days, statusStr) {
  const st = String(statusStr || '').trim().toLowerCase();
  if (st === 'exempted' || st === 'exempt') {
    return '<span class="remain-soft-badge" style="background:#e2e8f0;color:#334155;">Exempted</span>';
  }
  if (days === '' || days === null || days === undefined) {
    return '<span class="remain-soft-badge" style="background:#e0f2fe;color:#0369a1;"><i class="fa-solid fa-check"></i> Pass</span>';
  }
  const n = Number(days);
  if (isNaN(n)) return `<span class="remain-soft-badge" style="background:#e2e8f0;color:#334155;">${escapeHtml(days)}</span>`;
  if (n <= 0) return `<span class="remain-soft-badge" style="background:#fee2e2;color:#b91c1c;"><i class="fa-regular fa-clock"></i> ${n}d</span>`;
  if (n <= 30) return `<span class="remain-soft-badge" style="background:#ffedd5;color:#c2410c;"><i class="fa-regular fa-clock"></i> ${n}d</span>`;
  if (n <= 90) return `<span class="remain-soft-badge" style="background:#fef9c3;color:#a16207;"><i class="fa-regular fa-clock"></i> ${n}d</span>`;
  return `<span class="remain-soft-badge"><i class="fa-regular fa-clock"></i> ${n}d</span>`;
}

// ================= 6. ADMIN: DASHBOARD OVERVIEW =================
function toggleDaysLeftMenu(event) {
  event.stopPropagation();
  const pop = document.getElementById('daysLeftMenuPop');
  if (!pop) return;
  pop.classList.toggle('hidden');
}

document.addEventListener('click', function(event) {
  const wrap = document.getElementById('daysLeftCustomDropdown');
  const pop = document.getElementById('daysLeftMenuPop');
  if (wrap && pop && !wrap.contains(event.target)) {
    pop.classList.add('hidden');
  }
});

function pickDaysLeftOption(bucket, event) {
  if (event) event.stopPropagation();
  syncDaysLeftDropdownUI(bucket);
  const pop = document.getElementById('daysLeftMenuPop');
  if (pop) pop.classList.add('hidden');
  highlightDashboardCard(bucket);
  renderDashboardTable();
}

function syncDaysLeftDropdownUI(bucket) {
  const key = DAYSLEFT_META[bucket] ? bucket : 'ALL';
  const hiddenSel = document.getElementById('dashFilterDaysLeft');
  const labelEl = document.getElementById('daysLeftSelectedLabel');

  if (hiddenSel) hiddenSel.value = key;
  if (labelEl) {
    const meta = DAYSLEFT_META[key];
    labelEl.innerHTML = `${meta.symbol}<span>${meta.label}</span>`;
  }

  document.querySelectorAll('#daysLeftMenuPop .daysleft-option-item').forEach(btn => {
    btn.classList.toggle('is-selected', btn.dataset.value === key);
  });
}

function getRecordBucket(rec) {
  const status = String(rec.statusStr || '').trim().toLowerCase();
  if (status === 'exempted' || status === 'exempt') return 'EXEMPTED';

  const dVal = rec.daysLeft;
  if (dVal === '' || dVal === null || dVal === undefined) {
    return 'PASS';
  }
  const n = Number(dVal);
  if (isNaN(n)) return 'PASS';
  if (n <= 0) return 'EXPIRE';
  if (n <= 30) return 'WARNING';
  if (n <= 90) return 'CAUTION';
  return 'NORMAL';
}

async function loadAdminDashboard() {
  const tbody = document.getElementById('dashboardTableBody');
  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">กำลังโหลดข้อมูล Dashboard...</td></tr>';
  }
  try {
    const res = await callApi('getAllTrainingRecords');
    allAdminRecords = Array.isArray(res) ? res : [];
    initDashboardFilters();
    renderDashboardTable();
  } catch (err) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-danger">${err.message}</td></tr>`;
    }
  }
}

function initDashboardFilters() {
  const validRecs = allAdminRecords.filter(r => String(r.statusStr || '').trim().toLowerCase() !== 'reject');

  const names = [...new Set(validRecs.map(r => String(r.initialName || '').trim()).filter(Boolean))].sort();
  const types = [...new Set(validRecs.map(r => String(r.type || '').trim()).filter(Boolean))].sort();

  fillFilterDropdown('dashFilterInitial', names, 'All Names');
  fillFilterDropdown('dashFilterType', types, 'All Types');
  syncDashboardCascade(true);
}

function onDashboardCascadeChange() {
  syncDashboardCascade(false);
  renderDashboardTable();
}

function syncDashboardCascade(resetSubs) {
  const typeVal = document.getElementById('dashFilterType')?.value || 'ALL';
  const sub1El = document.getElementById('dashFilterSub1');
  const sub2El = document.getElementById('dashFilterSub2');
  const sub3El = document.getElementById('dashFilterSub3');

  const prevSub1 = resetSubs ? 'ALL' : (sub1El?.value || 'ALL');
  const prevSub2 = resetSubs ? 'ALL' : (sub2El?.value || 'ALL');
  const prevSub3 = resetSubs ? 'ALL' : (sub3El?.value || 'ALL');

  const validRecs = allAdminRecords.filter(r =>
    String(r.statusStr || '').trim().toLowerCase() !== 'reject' &&
    (typeVal === 'ALL' || String(r.type || '').trim() === typeVal)
  );

  const sub1List = [...new Set(validRecs.map(r => String(r.sub1 || '').trim()).filter(Boolean))].sort();
  fillFilterDropdown('dashFilterSub1', sub1List, 'All Sub 1', prevSub1);

  const activeSub1 = sub1El?.value || 'ALL';
  const s1Recs = validRecs.filter(r => activeSub1 === 'ALL' || String(r.sub1 || '').trim() === activeSub1);

  const sub2List = [...new Set(s1Recs.map(r => String(r.sub2 || '').trim()).filter(Boolean))].sort();
  fillFilterDropdown('dashFilterSub2', sub2List, 'All Sub 2', prevSub2);

  const activeSub2 = sub2El?.value || 'ALL';
  const s2Recs = s1Recs.filter(r => activeSub2 === 'ALL' || String(r.sub2 || '').trim() === activeSub2);

  const sub3List = [...new Set(s2Recs.map(r => String(r.sub3 || '').trim()).filter(Boolean))].sort();
  fillFilterDropdown('dashFilterSub3', sub3List, 'All Sub 3', prevSub3);
}

function selectDashboardBucket(bucket) {
  syncDaysLeftDropdownUI(bucket);
  highlightDashboardCard(bucket);
  renderDashboardTable();
}

function highlightDashboardCard(bucket) {
  document.querySelectorAll('#tabAdminDashboard .summary-stat-box').forEach(card => {
    card.classList.toggle('active-stat', card.dataset.bucket === bucket);
  });
}

function toggleDashboardSort() {
  dashboardSortAsc = !dashboardSortAsc;
  renderDashboardTable();
}

function renderDashboardTable() {
  const tbody = document.getElementById('dashboardTableBody');
  if (!tbody) return;

  const bucketFilter = document.getElementById('dashFilterDaysLeft')?.value || 'ALL';
  const nameFilter = document.getElementById('dashFilterInitial')?.value || 'ALL';
  const typeFilter = document.getElementById('dashFilterType')?.value || 'ALL';
  const sub1Filter = document.getElementById('dashFilterSub1')?.value || 'ALL';
  const sub2Filter = document.getElementById('dashFilterSub2')?.value || 'ALL';
  const sub3Filter = document.getElementById('dashFilterSub3')?.value || 'ALL';

  const baseFiltered = allAdminRecords.filter(r => {
    if (String(r.statusStr || '').trim().toLowerCase() === 'reject') return false;
    if (nameFilter !== 'ALL' && String(r.initialName || '').trim() !== nameFilter) return false;
    if (typeFilter !== 'ALL' && String(r.type || '').trim() !== typeFilter) return false;
    if (sub1Filter !== 'ALL' && String(r.sub1 || '').trim() !== sub1Filter) return false;
    if (sub2Filter !== 'ALL' && String(r.sub2 || '').trim() !== sub2Filter) return false;
    if (sub3Filter !== 'ALL' && String(r.sub3 || '').trim() !== sub3Filter) return false;
    return true;
  });

  const counts = { ALL: baseFiltered.length, EXPIRE: 0, WARNING: 0, CAUTION: 0, NORMAL: 0, EXEMPTED: 0, PASS: 0 };
  baseFiltered.forEach(r => {
    const b = getRecordBucket(r);
    if (counts[b] !== undefined) counts[b]++;
  });

  document.getElementById('dashCountAll').innerText = counts.ALL;
  document.getElementById('dashCountNormal').innerText = counts.NORMAL;
  document.getElementById('dashCountCaution').innerText = counts.WARNING + counts.CAUTION;
  document.getElementById('dashCountExpire').innerText = counts.EXPIRE;
  document.getElementById('dashCountWarning').innerText = counts.WARNING;
  document.getElementById('dashCountCautionDetail').innerText = counts.CAUTION;
  document.getElementById('dashCountExempted').innerText = counts.EXEMPTED;
  document.getElementById('dashCountPass').innerText = counts.PASS;

  const finalRows = baseFiltered
    .filter(r => {
      if (bucketFilter === 'ALL') return true;
      if (bucketFilter === 'CAUTION') {
        const b = getRecordBucket(r);
        return b === 'CAUTION' || b === 'WARNING';
      }
      return getRecordBucket(r) === bucketFilter;
    })
    .sort((a, b) => {
      const aNum = (a.daysLeft === '' || a.daysLeft === null || isNaN(Number(a.daysLeft))) ? 999999 : Number(a.daysLeft);
      const bNum = (b.daysLeft === '' || b.daysLeft === null || isNaN(Number(b.daysLeft))) ? 999999 : Number(b.daysLeft);
      return dashboardSortAsc ? (aNum - bNum) : (bNum - aNum);
    });

  if (finalRows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">ไม่พบรายการที่ตรงกับเงื่อนไข</td></tr>';
    return;
  }

  tbody.innerHTML = finalRows.map(r => {
    const courseTitle = r.sub2 || r.sub1 || '-';
    const subDetail = [r.ato, r.sub1 && r.sub2 ? r.sub1 : '', r.sub3 ? `Role: ${r.sub3}` : ''].filter(Boolean).join(' · ');
    const evidence = r.link
      ? `<a href="${escapeAttr(r.link)}" target="_blank" class="detail-outline-btn text-decoration-none"><i class="fa-regular fa-file-lines me-1"></i>View</a>`
      : '<span class="text-muted">-</span>';

    return `
      <tr>
        <td class="fw-bold text-primary">${escapeHtml(r.initialName || '-')}</td>
        <td>
          <div class="fw-semibold text-dark">${escapeHtml(courseTitle)}</div>
          ${subDetail ? `<div class="small text-muted">${escapeHtml(subDetail)}</div>` : ''}
        </td>
        <td class="text-secondary">${escapeHtml(r.type || '-')}</td>
        <td class="text-nowrap">${formatDateDisplay(r.active)}</td>
        <td class="text-nowrap">${formatDateDisplay(r.expire)}</td>
        <td class="text-center text-nowrap">${formatDashboardDaysLeft(r)}</td>
        <td class="text-center">${getSoftStatusBadge(r.statusStr)}</td>
        <td class="text-end text-nowrap">${evidence}</td>
      </tr>
    `;
  }).join('');
}

function formatDashboardDaysLeft(rec) {
  return formatMonitorCellDays(rec.daysLeft, rec.statusStr);
}

// ================= 7. ADMIN: APPROVED =================
async function loadAdminRecords() {
  const tbody = document.getElementById('adminRecordsBody');
  tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">กำลังโหลดข้อมูล...</td></tr>';
  try {
    const res = await callApi('getAllTrainingRecords');
    allAdminRecords = [...res].reverse();
    renderAdminTable();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-danger">${err.message}</td></tr>`;
  }
}

function renderAdminTable() {
  const filter = document.getElementById('adminStatusFilter').value.toLowerCase();
  const tbody = document.getElementById('adminRecordsBody');
  tbody.innerHTML = '';

  const filtered = allAdminRecords.filter(r => filter === 'all' || String(r.statusStr || '').toLowerCase() === filter);
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">ไม่มีรายการในหมวดหมู่นี้</td></tr>';
    return;
  }

  filtered.forEach(r => {
    const courseTitle = r.sub2 || r.sub1 || '-';
    const subDetail = [r.ato, r.sub1 && r.sub2 ? r.sub1 : '', r.sub3 ? `Role: ${r.sub3}` : ''].filter(Boolean).join(' · ');
    const fileLink = r.link
      ? `<a href="${escapeAttr(r.link)}" target="_blank" class="detail-outline-btn text-decoration-none"><i class="fa-regular fa-file-lines me-1"></i>ดูไฟล์</a>`
      : '<span class="text-muted">-</span>';

    tbody.innerHTML += `
      <tr>
        <td class="fw-bold text-primary">${escapeHtml(r.initialName)}</td>
        <td>
          <div class="fw-semibold text-dark">${escapeHtml(courseTitle)}</div>
          ${subDetail ? `<div class="small text-muted">${escapeHtml(subDetail)}</div>` : ''}
        </td>
        <td class="text-secondary">${escapeHtml(r.type || '-')}</td>
        <td class="text-nowrap">${formatDateDisplay(r.active)}</td>
        <td class="text-nowrap">${formatDateDisplay(r.expire)}</td>
        <td class="text-center">${fileLink}</td>
        <td class="text-center">${getSoftStatusBadge(r.statusStr)}</td>
        <td class="text-end text-nowrap">
          <button type="button" class="btn btn-sm btn-success rounded-pill px-2 py-1 me-1" onclick="changeRecordStatus(${r.row}, 'approve')" title="อนุมัติ">
            <i class="fa-solid fa-check me-1"></i>อนุมัติ
          </button>
          <button type="button" class="btn btn-sm btn-outline-danger rounded-pill px-2 py-1" onclick="changeRecordStatus(${r.row}, 'reject')" title="ปฏิเสธ">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </td>
      </tr>
    `;
  });
}

async function changeRecordStatus(row, status) {
  try {
    const res = await callApi('updateRecordStatus', { row, newStatus: status });
    if (res.success) {
      const item = allAdminRecords.find(x => x.row === row);
      if (item) item.statusStr = status;
      renderAdminTable();
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: `อัปเดตสถานะเป็น ${status} แล้ว`, showConfirmButton: false, timer: 1500 });
    }
  } catch (err) {
    Swal.fire('Error', err.message, 'error');
  }
}

// ================= HELPERS =================
function fillFilterDropdown(elementId, items, allLabel, selectedValue = 'ALL') {
  const sel = document.getElementById(elementId);
  if (!sel) return;
  sel.innerHTML = `<option value="ALL">${allLabel}</option>`;
  items.forEach(val => {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = val;
    sel.appendChild(opt);
  });
  sel.value = items.includes(selectedValue) ? selectedValue : 'ALL';
}

function escapeHtml(val) {
  return String(val || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(val) {
  return String(val || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function populateSelect(elementId, items) {
  const sel = document.getElementById(elementId);
  if (!sel) return;
  sel.innerHTML = '';
  items.forEach(val => {
    const opt = document.createElement('option');
    opt.value = val;
    opt.text = val || '-- เลือก --';
    sel.appendChild(opt);
  });
}

function formatDateDisplay(val) {
  if (!val) return '-';
  if (typeof val === 'number') {
    const d = new Date(val);
    return d.toLocaleDateString('en-GB');
  }
  return val;
}

function getStatusBadge(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'approve') return '<span class="badge bg-success badge-status">Approved</span>';
  if (s === 'reject') return '<span class="badge bg-danger badge-status">Rejected</span>';
  return '<span class="badge bg-warning text-dark badge-status">Waiting Approve</span>';
}
