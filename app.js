const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzPWv0y79-Xr8xMhIV-zwO5rTkKCRgDhSfQmMzBg_QmvqTzl3SkUCzHnxoQrpu0Q6VIVQ/exec';

const MAX_EXPERIENCE = 6;
let currentUser = null;
let dbOptions = null;
let userTrainingRecords = [];
let allAdminRecords = [];
let monitorRawData = { users: [], records: [], db: {} };

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
    setActiveTab('tabBtnAdminApprove', 'tabAdminApprove');
    await loadAdminRecords();
    return;
  }

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

// ================= 2. BACKGROUND PROFILE =================
function renderExperienceSlots(expArray = []) {
  const expContainer = document.getElementById('expContainer');
  expContainer.innerHTML = '';

  for (let i = 0; i < MAX_EXPERIENCE; i++) {
    const item = expArray[i] || { year: '', pos: '', name: '' };
    const hasData = Boolean(
      String(item.year || '').trim() ||
      String(item.pos || '').trim() ||
      String(item.name || '').trim()
    );
    const shouldShow = hasData || (i === 0 && expArray.length === 0);

    expContainer.innerHTML += `
      <div id="expRow_${i}" class="col-12 ${shouldShow ? '' : 'hidden'}" data-visible="${shouldShow ? '1' : '0'}">
        <div class="exp-item-card">
          <div class="row g-2 align-items-center">
            <div class="col-sm-4 col-md-3">
              <div class="input-group input-group-sm">
                <span class="input-group-text bg-white text-success"><i class="fa-regular fa-calendar"></i></span>
                <input type="text" id="expYear_${i}" class="form-control" value="${escapeAttr(item.year || '')}" placeholder="ปี / วันที่" oninput="updateExperienceButton()">
              </div>
            </div>
            <div class="col-sm-8 col-md-4">
              <div class="input-group input-group-sm">
                <span class="input-group-text bg-white text-success"><i class="fa-solid fa-user-check"></i></span>
                <input type="text" id="expPos_${i}" class="form-control" value="${escapeAttr(item.pos || '')}" placeholder="ตำแหน่ง" oninput="updateExperienceButton()">
              </div>
            </div>
            <div class="col-10 col-md-4">
              <div class="input-group input-group-sm">
                <span class="input-group-text bg-white text-success"><i class="fa-solid fa-building"></i></span>
                <input type="text" id="expName_${i}" class="form-control" value="${escapeAttr(item.name || '')}" placeholder="หน่วยงาน/องค์กร" oninput="updateExperienceButton()">
              </div>
            </div>
            <div class="col-2 col-md-1 text-end">
              <button type="button" class="btn btn-sm btn-outline-danger py-1 px-2" title="ลบรายการนี้" onclick="clearExperienceSlot(${i})">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  updateExperienceButton();
}

function addExperienceSlot() {
  for (let i = 0; i < MAX_EXPERIENCE; i++) {
    const rowEl = document.getElementById(`expRow_${i}`);
    if (rowEl && rowEl.dataset.visible !== '1') {
      rowEl.dataset.visible = '1';
      rowEl.classList.remove('hidden');
      document.getElementById(`expYear_${i}`)?.focus();
      updateExperienceButton();
      return;
    }
  }
  Swal.fire('ครบจำนวนสูงสุดแล้ว', `สามารถเพิ่มประสบการณ์ทำงานได้สูงสุด ${MAX_EXPERIENCE} รายการ`, 'info');
}

function clearExperienceSlot(index) {
  const yearEl = document.getElementById(`expYear_${index}`);
  const posEl = document.getElementById(`expPos_${index}`);
  const nameEl = document.getElementById(`expName_${index}`);
  const rowEl = document.getElementById(`expRow_${index}`);

  if (yearEl) yearEl.value = '';
  if (posEl) posEl.value = '';
  if (nameEl) nameEl.value = '';

  const visibleCount = getVisibleExperienceCount();
  if (visibleCount > 1 && rowEl) {
    rowEl.dataset.visible = '0';
    rowEl.classList.add('hidden');
  }
  updateExperienceButton();
}

function getVisibleExperienceCount() {
  let count = 0;
  for (let i = 0; i < MAX_EXPERIENCE; i++) {
    const rowEl = document.getElementById(`expRow_${i}`);
    if (rowEl && rowEl.dataset.visible === '1') count++;
  }
  return count;
}

function updateExperienceButton() {
  const addBtn = document.getElementById('btnAddExp');
  const visible = getVisibleExperienceCount();
  if (addBtn) {
    addBtn.disabled = visible >= MAX_EXPERIENCE;
  }
}

async function loadProfileData() {
  if (!currentUser || currentUser.role === 'admin') return;
  Swal.showLoading();
  renderExperienceSlots([]);

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

    renderExperienceSlots(Array.isArray(data.exp) ? data.exp : []);

    if (data.edu) {
      setEduFields('Bach', data.edu.bachelor);
      setEduFields('Mast', data.edu.master);
      setEduFields('Doc', data.edu.doctor);
    } else {
      setEduFields('Bach', {});
      setEduFields('Mast', {});
      setEduFields('Doc', {});
    }
  } catch (err) {
    Swal.close();
    Swal.fire('Error', err.message, 'error');
  }
}

function setEduFields(prefix, eduObj) {
  const obj = eduObj || {};
  document.getElementById(`edu${prefix}Year`).value = obj.year || '';
  document.getElementById(`edu${prefix}Deg`).value = obj.deg || '';
  document.getElementById(`edu${prefix}Uni`).value = obj.uni || '';
  document.getElementById(`edu${prefix}File`).value = obj.file || '';
  const linkEl = document.getElementById(`edu${prefix}Link`);
  if (obj.file) {
    linkEl.href = obj.file;
    linkEl.classList.remove('hidden');
  } else {
    linkEl.classList.add('hidden');
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

async function handleEduFileUpload(input, level, colIndex) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  const row = Number(document.getElementById('bgRow').value) || null;
  const prefix = level === 'bachelor' ? 'Bach' : (level === 'master' ? 'Mast' : 'Doc');

  Swal.fire({ title: 'กำลังอัปโหลดเอกสาร...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  try {
    const base64 = await readFileAsBase64(file);
    const res = await callApi('uploadFileToDrive', {
      base64Data: base64,
      fileName: `${currentUser.initialName}_${level}_${file.name}`,
      colIndex: colIndex,
      rowIndex: row,
      sheetType: 'bg',
      isImage: false
    });
    Swal.close();
    if (res.success) {
      document.getElementById(`edu${prefix}File`).value = res.url;
      const linkEl = document.getElementById(`edu${prefix}Link`);
      linkEl.href = res.url;
      linkEl.classList.remove('hidden');
      Swal.fire('สำเร็จ', 'อัปโหลดไฟล์วุฒิการศึกษาเรียบร้อย', 'success');
    } else {
      Swal.fire('ผิดพลาด', res.message, 'error');
    }
  } catch (err) {
    Swal.close();
    Swal.fire('Error', err.message, 'error');
  }
}

async function saveProfileData() {
  const row = Number(document.getElementById('bgRow').value) || null;

  const expList = [];
  for (let i = 0; i < MAX_EXPERIENCE; i++) {
    expList.push({
      year: (document.getElementById(`expYear_${i}`)?.value || '').trim(),
      pos: (document.getElementById(`expPos_${i}`)?.value || '').trim(),
      name: (document.getElementById(`expName_${i}`)?.value || '').trim()
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
      bachelor: {
        year: document.getElementById('eduBachYear').value.trim(),
        deg: document.getElementById('eduBachDeg').value.trim(),
        uni: document.getElementById('eduBachUni').value.trim(),
        file: document.getElementById('eduBachFile').value
      },
      master: {
        year: document.getElementById('eduMastYear').value.trim(),
        deg: document.getElementById('eduMastDeg').value.trim(),
        uni: document.getElementById('eduMastUni').value.trim(),
        file: document.getElementById('eduMastFile').value
      },
      doctor: {
        year: document.getElementById('eduDocYear').value.trim(),
        deg: document.getElementById('eduDocDeg').value.trim(),
        uni: document.getElementById('eduDocUni').value.trim(),
        file: document.getElementById('eduDocFile').value
      }
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

// ================= 4. ADD RECORD =================
function initAddForm() {
  if (!dbOptions) return;
  populateSelect('addAto', dbOptions.ato);
  populateSelect('addType', dbOptions.type);
  populateSelect('addSub3', [''].concat(dbOptions.authSub3));
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

  if (type === 'Optional Training' && sub1.toUpperCase() === 'OTHER') {
    sub2SelCont.classList.add('hidden');
    sub2TxtCont.classList.remove('hidden');
    return;
  }

  if (sub1 === 'Evaluation-Theory') {
    if (ato === 'ATCO') populateSelect('addSub2Select', dbOptions.evalTheoryATCO);
    else if (ato === 'FOOTO') populateSelect('addSub2Select', dbOptions.evalTheoryFOOTO);
    else if (ato === 'UATO') populateSelect('addSub2Select', dbOptions.evalTheoryUATO);
  } else if (sub1 === 'Evaluation-Practical') {
    if (ato === 'ATCO') populateSelect('addSub2Select', dbOptions.evalPracATCO);
    else if (ato === 'FOOTO') populateSelect('addSub2Select', dbOptions.evalPracFOOTO);
    else if (ato === 'UATO') populateSelect('addSub2Select', dbOptions.evalPracUATO);
  } else if (type === 'Personnel Licensing' && dbOptions.licenceExtra.length > 0) {
    populateSelect('addSub2Select', [''].concat(dbOptions.licenceExtra));
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
  onAtoOrTypeChange();
}

// ================= 5. ADMIN APPROVE, DASHBOARD & MONITOR =================
async function loadAdminRecords() {
  const tbody = document.getElementById('adminRecordsBody');
  tbody.innerHTML = '<tr><td colspan="9" class="text-center">กำลังโหลดข้อมูล...</td></tr>';
  try {
    const res = await callApi('getAllTrainingRecords');
    allAdminRecords = res.reverse();
    renderAdminTable();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center text-danger">${err.message}</td></tr>`;
  }
}

function renderAdminTable() {
  const filter = document.getElementById('adminStatusFilter').value.toLowerCase();
  const tbody = document.getElementById('adminRecordsBody');
  tbody.innerHTML = '';

  const filtered = allAdminRecords.filter(r => filter === 'all' || r.statusStr.toLowerCase() === filter);
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

async function loadAdminDashboard() {
  try {
    const [allRecs, monData] = await Promise.all([
      callApi('getAllTrainingRecords'),
      callApi('getMonitorData')
    ]);

    const recs = Array.isArray(allRecs) ? allRecs : [];
    const users = (monData && Array.isArray(monData.users)) ? monData.users : [];
    const monRecs = (monData && Array.isArray(monData.records)) ? monData.records : [];

    const waiting = recs.filter(r => String(r.statusStr || '').trim().toLowerCase() === 'waiting approve').length;
    const approved = recs.filter(r => String(r.statusStr || '').trim().toLowerCase() === 'approve').length;
    const alertCount = monRecs.filter(r => {
      const d = Number(r.daysLeft);
      return r.daysLeft !== '' && !isNaN(d) && d <= 90;
    }).length;

    const elUsers = document.getElementById('dashTotalUsers');
    const elWaiting = document.getElementById('dashWaitingCount');
    const elApproved = document.getElementById('dashApprovedCount');
    const elAlert = document.getElementById('dashAlertCount');

    if (elUsers) elUsers.innerText = users.length;
    if (elWaiting) elWaiting.innerText = waiting;
    if (elApproved) elApproved.innerText = approved;
    if (elAlert) elAlert.innerText = alertCount;
  } catch (err) {
    Swal.fire('Error', err.message, 'error');
  }
}

async function loadMonitor() {
  const tbody = document.getElementById('monitorTableBody');
  tbody.innerHTML = '<tr><td colspan="6" class="text-center">กำลังโหลดข้อมูล Monitor...</td></tr>';
  try {
    const data = await callApi('getMonitorData');
    monitorRawData = data;
    renderMonitorTable();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger">${err.message}</td></tr>`;
  }
}

function renderMonitorTable() {
  const searchUser = document.getElementById('monitorSearchUser').value.toLowerCase();
  const searchCourse = document.getElementById('monitorSearchCourse').value.toLowerCase();
  const alertFilter = document.getElementById('monitorAlertFilter').value;
  const tbody = document.getElementById('monitorTableBody');
  tbody.innerHTML = '';

  const posMap = {};
  monitorRawData.users.forEach(u => posMap[u.initialName] = u.position);

  const filtered = monitorRawData.records.filter(r => {
    const matchUser = r.initialName.toLowerCase().includes(searchUser);
    const matchCourse = r.courseName.toLowerCase().includes(searchCourse);
    let matchAlert = true;
    const d = Number(r.daysLeft);
    if (alertFilter === 'expired') matchAlert = (r.daysLeft !== '' && !isNaN(d) && d <= 0);
    if (alertFilter === 'warning') matchAlert = (r.daysLeft !== '' && !isNaN(d) && d > 0 && d <= 90);
    return matchUser && matchCourse && matchAlert;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">ไม่พบข้อมูลที่ตรงตามเงื่อนไข</td></tr>';
    return;
  }

  filtered.forEach(r => {
    tbody.innerHTML += `
      <tr>
        <td class="fw-bold">${r.initialName}</td>
        <td>${posMap[r.initialName] || '-'}</td>
        <td>${r.ato}</td>
        <td>${r.type}</td>
        <td>${r.courseName}</td>
        <td class="text-center">${formatDaysLeft(r.daysLeft)}</td>
      </tr>
    `;
  });
}

// ================= HELPERS =================
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
