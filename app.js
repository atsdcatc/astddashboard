const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzPWv0y79-Xr8xMhIV-zwO5rTkKCRgDhSfQmMzBg_QmvqTzl3SkUCzHnxoQrpu0Q6VIVQ/exec';

const MAX_EXPERIENCE = 6;
let currentUser = null;
let dbOptions = null;
let userTrainingRecords = [];
let allAdminRecords = [];
let monitorRawData = { users: [], records: [], db: {} };
let dashboardSortAsc = true;
let liveClockTimer = null;

// เก็บรายการประสบการณ์ทำงานและวุฒิการศึกษาในหน่วยความจำ
let experienceItems = [];
let educationStore = {
  bachelor: { year: '', deg: '', uni: '', file: '' },
  master:   { year: '', deg: '', uni: '', file: '' },
  doctor:   { year: '', deg: '', uni: '', file: '' }
};

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
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    }
    if (timeEl) {
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');
      timeEl.innerText = `${hh} : ${mm} : ${ss}`;
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
    const isCurrent = /ปัจจุบัน|present|current/i.test(yearStr) || idx === 0;
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
  return Boolean(
    String(eduObj.year || '').trim() ||
    String(eduObj.deg || '').trim() ||
    String(eduObj.uni || '').trim() ||
    String(eduObj.file || '').trim()
  );
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

  // เรียงลำดับจากระดับสูงไปต่ำ (ปริญญาเอก -> ปริญญาโท -> ปริญญาตรี) เฉพาะที่มีข้อมูล
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
      ? `<a href="${escapeAttr(d.file)}" target="_blank" class="doc-available-tag"><i class="fa-solid fa-file-circle-check me-1"></i>มีเอกสาร</a>`
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
    // เลือกระดับแรกที่ยังว่างอยู่ให้อัตโนมัติ
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

  Swal.fire({ title: 'กำลังอัปโหลดเอกสาร...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
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
    Swal.close();
    if (res.success) {
      document.getElementById('eduModalFileUrl').value = res.url;
      document.getElementById('eduModalFileStatus').innerHTML =
        `<span class="text-success"><i class="fa-solid fa-check-circle me-1"></i>อัปโหลดไฟล์เรียบร้อยแล้ว</span>`;
    } else {
      Swal.fire('ผิดพลาด', res.message, 'error');
    }
  } catch (err) {
    Swal.close();
    Swal.fire('Error', err.message, 'error');
  }
}

function saveEduFromModal() {
  const key = document.getElementById('eduModalLevel').value;
  educationStore[key] = {
    deg: document.getElementById('eduModalDeg').value.trim(),
    uni: document.getElementById('eduModalUni').value.trim(),
    year: document.getElementById('eduModalYear').value.trim(),
    file: document.getElementById('eduModalFileUrl').value.trim()
  };
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
  Swal.showLoading();
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
    Swal.close();
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
    Swal.close();
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

  Swal.fire({ title: 'กำลังอัปโหลดรูปภาพ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
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
    Swal.close();
    if (res.success) {
      document.getElementById('bgPicPreview').src = res.directUrl;
      document.getElementById('bgPicUrl').value = res.directUrl;
      Swal.fire('สำเร็จ', 'อัปโหลดรูปโปรไฟล์เรียบร้อยแล้ว', 'success');
    } else {
      Swal.fire('ผิดพลาด', res.message, 'error');
    }
  } catch (err) {
    Swal.close();
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

  Swal.fire({ title: 'กำลังบันทึกข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  try {
    const res = await callApi('updateBackgroundData', { row, d: payload });
    Swal.close();
    if (res.success) {
      if (res.row) {
        document.getElementById('bgRow').value = res.row;
      }
      Swal.fire('บันทึกสำเร็จ', 'อัปเดตข้อมูลประวัติส่วนตัวเรียบร้อยแล้ว', 'success');
    } else {
      Swal.fire('เกิดข้อผิดพลาด', res.message, 'error');
    }
  } catch (err) {
    Swal.close();
    Swal.fire('Error', err.message, 'error');
  }
}

async function exportPDF() {
  Swal.fire({ title: 'กำลังสร้างไฟล์ PDF...', text: 'กรุณารอสักครู่', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
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
async function loadUserTraining() {
  const tbody = document.getElementById('userTrainingBody');
  const summary = document.getElementById('trainingSummary');
  if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">กำลังโหลดข้อมูล...</td></tr>';
  if (summary) summary.innerText = 'กำลังโหลดสรุปรายการ...';

  try {
    const records = await callApi('getTrainingRecords', { initialName: currentUser.initialName });
    userTrainingRecords = Array.isArray(records) ? [...records].reverse() : [];

    const typeSelect = document.getElementById('trainingTypeFilter');
    if (typeSelect) {
      const currentTypeVal = String(typeSelect.value || 'all').trim().toLowerCase();
      const uniqueTypes = [...new Set(
        userTrainingRecords
          .map(r => String(r.type || '').trim())
          .filter(Boolean)
      )];

      typeSelect.innerHTML = '<option value="all">ทุกประเภท (All Types)</option>';
      uniqueTypes.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        typeSelect.appendChild(opt);
      });

      const matchedOption = [...typeSelect.options].find(
        o => String(o.value || '').trim().toLowerCase() === currentTypeVal
      );
      typeSelect.value = matchedOption ? matchedOption.value : 'all';
    }

    updateTrainingSummary();
    renderUserTrainingTable();
  } catch (err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-danger">${err.message}</td></tr>`;
    if (summary) summary.innerText = 'ไม่สามารถโหลดข้อมูลได้';
  }
}

function updateTrainingSummary() {
  const summary = document.getElementById('trainingSummary');
  if (!summary) return;
  const total = userTrainingRecords.length;
  const approved = userTrainingRecords.filter(r => String(r.statusStr || '').trim().toLowerCase() === 'approve').length;
  const waiting = userTrainingRecords.filter(r => String(r.statusStr || '').trim().toLowerCase() === 'waiting approve').length;
  summary.innerHTML = `ทั้งหมด <strong>${total}</strong> รายการ • <span class="text-success">Approved ${approved}</span> • <span class="text-warning text-dark">Waiting ${waiting}</span>`;
}

function renderUserTrainingTable() {
  const tbody = document.getElementById('userTrainingBody');
  if (!tbody) return;

  const keyword = (document.getElementById('trainingSearchInput')?.value || '').trim().toLowerCase();
  const typeFilter = (document.getElementById('trainingTypeFilter')?.value || 'all').trim().toLowerCase();
  const statusFilter = (document.getElementById('trainingStatusFilter')?.value || 'all').trim().toLowerCase();

  const filtered = userTrainingRecords.filter(r => {
    const rowType = String(r.type || '').trim().toLowerCase();
    const matchType = typeFilter === 'all' || rowType === typeFilter;
    const matchStatus = statusFilter === 'all' || String(r.statusStr || '').trim().toLowerCase() === statusFilter;
    const searchable = [r.ato, r.type, r.sub1, r.sub2, r.sub3].filter(Boolean).join(' ').toLowerCase();
    const matchKeyword = !keyword || searchable.includes(keyword);
    return matchType && matchStatus && matchKeyword;
  });

  tbody.innerHTML = '';
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">ไม่พบข้อมูลที่ตรงกับเงื่อนไข</td></tr>';
    return;
  }

  filtered.forEach(r => {
    const mainTitle = r.sub2 || r.sub1 || '-';
    const subMeta = [r.sub1, r.sub3 ? `Role: ${r.sub3}` : ''].filter(Boolean).join(' • ');
    const categoryMeta = [r.ato, r.type].filter(Boolean).join(' • ');
    const badge = getStatusBadge(r.statusStr);
    const fileBtn = r.link
      ? `<a href="${r.link}" target="_blank" class="btn btn-sm btn-outline-primary py-1 px-2 text-nowrap"><i class="fa-solid fa-file-lines me-1"></i>เปิดไฟล์</a>`
      : '<span class="text-muted small">-</span>';

    tbody.innerHTML += `
      <tr>
        <td class="py-2 small text-secondary">${categoryMeta || '-'}</td>
        <td class="py-2">
          <div class="fw-semibold text-dark">${mainTitle}</div>
          ${subMeta ? `<div class="small text-muted">${subMeta}</div>` : ''}
        </td>
        <td class="py-2 text-nowrap small">${formatDateDisplay(r.active)}</td>
        <td class="py-2 text-nowrap small">${formatDateDisplay(r.expire)}</td>
        <td class="py-2 text-center text-nowrap">${formatDaysLeft(r.daysLeft)}</td>
        <td class="py-2 text-center text-nowrap">${badge}</td>
        <td class="py-2 text-center">${fileBtn}</td>
      </tr>
    `;
  });
}

// ================= 4. ADD RECORD (PROGRESSIVE DISCLOSURE) =================
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

  // เปิดแผง Sub Type 2–3 อัตโนมัติเมื่อหมวดวิชามีตัวเลือก Sub 2 ให้กรอก
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

  Swal.fire({ title: 'กำลังตรวจสอบข้อมูลซ้ำ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

  try {
    const dupRes = await callApi('checkDuplicateRecord', {
      initialName: currentUser.initialName, ato, type, sub1, sub2
    });

    if (dupRes.isDuplicate) {
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
      } else {
        Swal.close();
      }
    } else {
      await processFileAndSubmit(fileInput, {
        initialName: currentUser.initialName, ato, type, sub1, sub2, sub3, activeDate, expireDate, overwriteRow: null
      });
    }
  } catch (err) {
    Swal.fire('Error', err.message, 'error');
  }
});

async function processFileAndSubmit(fileInput, payload) {
  Swal.fire({ title: 'กำลังบันทึกข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

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
  Swal.fire('สำเร็จ!', 'บันทึกข้อมูลเรียบร้อยแล้ว (รอ Admin อนุมัติ)', 'success');
  document.getElementById('addRecordForm').reset();
  toggleExtraSubsPanel(false);
  onAtoOrTypeChange();
}

// ================= 5. ADMIN: TRAINING MONITOR (MATRIX) =================
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
    renderMonitorMatrix();
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
  renderMonitorMatrix();
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

function renderMonitorMatrix() {
  const headEl = document.getElementById('monitorMatrixHead');
  const bodyEl = document.getElementById('monitorMatrixBody');
  if (!headEl || !bodyEl) return;

  const posFilter = document.getElementById('monFilterPosition')?.value || 'ALL';
  const atoFilter = document.getElementById('monFilterAto')?.value || 'ALL';
  const typeFilter = document.getElementById('monFilterType')?.value || 'ALL';
  const sub1Filter = document.getElementById('monFilterSub1')?.value || 'ALL';
  const sub2Filter = document.getElementById('monFilterSub2')?.value || 'ALL';
  const sub3Filter = document.getElementById('monFilterSub3')?.value || 'ALL';

  const filteredUsers = monitorRawData.users
    .filter(u => posFilter === 'ALL' || String(u.position || '').trim() === posFilter)
    .sort((a, b) => String(a.initialName).localeCompare(String(b.initialName)));

  const filteredRecords = monitorRawData.records.filter(r => {
    if (atoFilter !== 'ALL' && String(r.ato || '').trim() !== atoFilter) return false;
    if (typeFilter !== 'ALL' && String(r.type || '').trim() !== typeFilter) return false;
    if (sub1Filter !== 'ALL' && String(r.sub1 || '').trim() !== sub1Filter) return false;
    if (sub2Filter !== 'ALL' && String(r.sub2 || '').trim() !== sub2Filter) return false;
    if (sub3Filter !== 'ALL' && String(r.sub3 || '').trim() !== sub3Filter) return false;
    return true;
  });

  let columnHeaders = [];
  if (sub1Filter !== 'ALL') {
    columnHeaders = [sub1Filter];
  } else {
    const availableOpts = [...(document.getElementById('monFilterSub1')?.options || [])]
      .map(o => o.value)
      .filter(v => v !== 'ALL');
    columnHeaders = availableOpts.length > 0
      ? availableOpts
      : [...new Set(filteredRecords.map(r => String(r.sub1 || '').trim()).filter(Boolean))].sort();
  }

  headEl.innerHTML = `
    <tr>
      <th class="text-start ps-3" style="min-width: 140px;">Initial Name</th>
      ${columnHeaders.map(col => `<th>${escapeHtml(col)}</th>`).join('')}
    </tr>
  `;

  if (filteredUsers.length === 0) {
    bodyEl.innerHTML = `<tr><td colspan="${columnHeaders.length + 1}" class="py-4 text-muted">ไม่พบรายชื่อบุคลากร</td></tr>`;
    return;
  }

  bodyEl.innerHTML = filteredUsers.map(u => {
    const userName = String(u.initialName || '').trim();
    const userRecs = filteredRecords.filter(r => String(r.initialName || '').trim() === userName);

    const cells = columnHeaders.map(colName => {
      const matched = userRecs.filter(r => String(r.sub1 || '').trim() === colName);
      if (matched.length === 0) {
        return '<td class="text-muted">-</td>';
      }
      const cellContent = matched.map(m => {
        const extra = [m.sub2, m.sub3].filter(Boolean).join(' / ');
        const badge = formatMonitorCellDays(m.daysLeft);
        return extra ? `<div class="small fw-semibold">${escapeHtml(extra)}</div>${badge}` : badge;
      }).join('<hr class="my-1">');
      return `<td>${cellContent}</td>`;
    }).join('');

    return `
      <tr>
        <td class="text-start ps-3 fw-bold text-primary">${escapeHtml(userName)}</td>
        ${cells}
      </tr>
    `;
  }).join('');
}

function formatMonitorCellDays(days) {
  if (days === '' || days === null || days === undefined) {
    return '<span class="badge bg-info text-dark">Pass</span>';
  }
  const n = Number(days);
  if (isNaN(n)) return `<span class="badge bg-secondary">${escapeHtml(days)}</span>`;
  if (n <= 0) return `<span class="badge bg-danger">${n} d</span>`;
  if (n <= 30) return `<span class="badge" style="background:#fd7e14;">${n} d</span>`;
  if (n <= 90) return `<span class="badge bg-warning text-dark">${n} d</span>`;
  return `<span class="badge bg-success">${n} d</span>`;
}

// ================= 6. ADMIN: DASHBOARD OVERVIEW =================
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
    tbody.innerHTML = '<tr><td colspan="11" class="text-center py-4 text-muted">กำลังโหลดข้อมูล Dashboard...</td></tr>';
  }
  try {
    const res = await callApi('getAllTrainingRecords');
    allAdminRecords = Array.isArray(res) ? res : [];
    initDashboardFilters();
    renderDashboardTable();
  } catch (err) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="11" class="text-center py-4 text-danger">${err.message}</td></tr>`;
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
  const sel = document.getElementById('dashFilterDaysLeft');
  if (sel) sel.value = bucket;
  highlightDashboardCard(bucket);
  renderDashboardTable();
}

function onDashboardBucketDropdownChange() {
  const bucket = document.getElementById('dashFilterDaysLeft')?.value || 'ALL';
  highlightDashboardCard(bucket);
  renderDashboardTable();
}

function highlightDashboardCard(bucket) {
  document.querySelectorAll('.dash-stat-card').forEach(card => {
    card.classList.toggle('active-card', card.dataset.bucket === bucket);
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
  document.getElementById('dashCountExpire').innerText = counts.EXPIRE;
  document.getElementById('dashCountWarning').innerText = counts.WARNING;
  document.getElementById('dashCountCaution').innerText = counts.CAUTION;
  document.getElementById('dashCountNormal').innerText = counts.NORMAL;
  document.getElementById('dashCountExempted').innerText = counts.EXEMPTED;
  document.getElementById('dashCountPass').innerText = counts.PASS;

  const finalRows = baseFiltered
    .filter(r => bucketFilter === 'ALL' || getRecordBucket(r) === bucketFilter)
    .sort((a, b) => {
      const aNum = (a.daysLeft === '' || a.daysLeft === null || isNaN(Number(a.daysLeft))) ? 999999 : Number(a.daysLeft);
      const bNum = (b.daysLeft === '' || b.daysLeft === null || isNaN(Number(b.daysLeft))) ? 999999 : Number(b.daysLeft);
      return dashboardSortAsc ? (aNum - bNum) : (bNum - aNum);
    });

  if (finalRows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" class="text-center py-4 text-muted">No records found</td></tr>';
    return;
  }

  tbody.innerHTML = finalRows.map(r => {
    const evidence = r.link
      ? `<a href="${r.link}" target="_blank" class="btn btn-xs btn-outline-primary py-0 px-2"><i class="fa-solid fa-file-lines me-1"></i>View</a>`
      : '-';
    return `
      <tr>
        <td class="fw-bold">${escapeHtml(r.initialName || '-')}</td>
        <td>${escapeHtml(r.ato || '-')}</td>
        <td>${escapeHtml(r.type || '-')}</td>
        <td>${escapeHtml(r.sub1 || '-')}</td>
        <td>${escapeHtml(r.sub2 || '-')}</td>
        <td>${escapeHtml(r.sub3 || '-')}</td>
        <td class="text-nowrap">${formatDateDisplay(r.active)}</td>
        <td class="text-nowrap">${formatDateDisplay(r.expire)}</td>
        <td class="text-center text-nowrap">${formatDashboardDaysLeft(r)}</td>
        <td class="text-center">${getStatusBadge(r.statusStr)}</td>
        <td class="text-center">${evidence}</td>
      </tr>
    `;
  }).join('');
}

function formatDashboardDaysLeft(rec) {
  const bucket = getRecordBucket(rec);
  if (bucket === 'EXEMPTED') return '<span class="badge bg-secondary">Exempted</span>';
  if (bucket === 'PASS') return '<span class="badge" style="background:#20c997;color:#1e293b;">Pass</span>';
  const n = Number(rec.daysLeft);
  if (bucket === 'EXPIRE') return `<span class="badge bg-danger">Expire (${n})</span>`;
  if (bucket === 'WARNING') return `<span class="badge" style="background:#fd7e14;">${n} วัน</span>`;
  if (bucket === 'CAUTION') return `<span class="badge bg-warning text-dark">${n} วัน</span>`;
  return `<span class="badge bg-success">${n} วัน</span>`;
}

// ================= 7. ADMIN: APPROVED =================
async function loadAdminRecords() {
  const tbody = document.getElementById('adminRecordsBody');
  tbody.innerHTML = '<tr><td colspan="9" class="text-center">กำลังโหลดข้อมูล...</td></tr>';
  try {
    const res = await callApi('getAllTrainingRecords');
    allAdminRecords = [...res].reverse();
    renderAdminTable();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center text-danger">${err.message}</td></tr>`;
  }
}

function renderAdminTable() {
  const filter = document.getElementById('adminStatusFilter').value.toLowerCase();
  const tbody = document.getElementById('adminRecordsBody');
  tbody.innerHTML = '';

  const filtered = allAdminRecords.filter(r => filter === 'all' || String(r.statusStr || '').toLowerCase() === filter);
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">ไม่มีรายการในหมวดหมู่นี้</td></tr>';
    return;
  }

  filtered.forEach(r => {
    const courseFull = [r.sub1, r.sub2, r.sub3].filter(Boolean).join(' | ');
    const fileLink = r.link ? `<a href="${r.link}" target="_blank" class="btn btn-xs btn-outline-primary py-0 px-2">ดูไฟล์</a>` : '-';
    tbody.innerHTML += `
      <tr>
        <td class="fw-bold">${r.initialName}</td>
        <td>${r.ato}</td>
        <td>${r.type}</td>
        <td>${courseFull}</td>
        <td>${formatDateDisplay(r.active)}</td>
        <td>${formatDateDisplay(r.expire)}</td>
        <td class="text-center">${fileLink}</td>
        <td class="text-center">${getStatusBadge(r.statusStr)}</td>
        <td class="text-center text-nowrap">
          <button class="btn btn-xs btn-success py-0 px-2" onclick="changeRecordStatus(${r.row}, 'approve')"><i class="fa-solid fa-check"></i></button>
          <button class="btn btn-xs btn-danger py-0 px-2" onclick="changeRecordStatus(${r.row}, 'reject')"><i class="fa-solid fa-xmark"></i></button>
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

function formatDaysLeft(days) {
  if (days === '' || days === null || days === undefined) return '-';
  const n = Number(days);
  if (isNaN(n)) return days;
  if (n <= 0) return `<span class="badge bg-danger">หมดอายุ (${n})</span>`;
  if (n <= 90) return `<span class="badge bg-warning text-dark">เหลือ ${n} วัน</span>`;
  return `<span class="badge bg-success">เหลือ ${n} วัน</span>`;
}

function getStatusBadge(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'approve') return '<span class="badge bg-success badge-status">Approved</span>';
  if (s === 'reject') return '<span class="badge bg-danger badge-status">Rejected</span>';
  return '<span class="badge bg-warning text-dark badge-status">Waiting Approve</span>';
}
