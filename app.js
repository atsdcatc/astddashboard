// ⚠️ นำ URL ของ Google Apps Script Web App ที่ Deploy แล้วมาใส่ที่นี่
const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';

let currentUser = null;
let dbOptions = null;
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
  document.getElementById('loginSection').classList.add('hidden');
  document.getElementById('appSection').classList.remove('hidden');
  document.getElementById('navUserDisplay').innerText = currentUser.initialName;
  document.getElementById('navRoleDisplay').innerText = currentUser.role.toUpperCase();

  if (currentUser.role === 'admin') {
    document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
  }

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
  document.getElementById('appSection').classList.add('hidden');
  document.getElementById('loginSection').classList.remove('hidden');
  document.getElementById('loginForm').reset();
  document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
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
async function loadProfileData() {
  if (!currentUser) return;
  Swal.showLoading();

  const expContainer = document.getElementById('expContainer');
  expContainer.innerHTML = '';
  for (let i = 0; i < 6; i++) {
    expContainer.innerHTML += `
      <div class="col-md-2"><input type="text" id="expYear_${i}" class="form-control form-control-sm" placeholder="ปี (เช่น 2020-2023)"></div>
      <div class="col-md-5"><input type="text" id="expPos_${i}" class="form-control form-control-sm" placeholder="ตำแหน่ง"></div>
      <div class="col-md-5"><input type="text" id="expName_${i}" class="form-control form-control-sm" placeholder="หน่วยงาน/องค์กร"></div>
    `;
  }

  try {
    const data = await callApi('getBackgroundData', { initialName: currentUser.initialName });
    Swal.close();
    if (data.error) {
      Swal.fire('แจ้งเตือน', data.error, 'warning');
      return;
    }
    document.getElementById('bgRow').value = data.row;
    document.getElementById('bgNameEN').value = data.nameEN || '';
    document.getElementById('bgNameTH').value = data.nameTH || '';
    document.getElementById('bgInitial').value = data.initialName || '';
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

    if (data.exp) {
      data.exp.forEach((item, idx) => {
        document.getElementById(`expYear_${idx}`).value = item.year || '';
        document.getElementById(`expPos_${idx}`).value = item.pos || '';
        document.getElementById(`expName_${idx}`).value = item.name || '';
      });
    }

    if (data.edu) {
      setEduFields('Bach', data.edu.bachelor);
      setEduFields('Mast', data.edu.master);
      setEduFields('Doc', data.edu.doctor);
    }
  } catch (err) {
    Swal.close();
    Swal.fire('Error', err.message, 'error');
  }
}

function setEduFields(prefix, eduObj) {
  if (!eduObj) return;
  document.getElementById(`edu${prefix}Year`).value = eduObj.year || '';
  document.getElementById(`edu${prefix}Deg`).value = eduObj.deg || '';
  document.getElementById(`edu${prefix}Uni`).value = eduObj.uni || '';
  document.getElementById(`edu${prefix}File`).value = eduObj.file || '';
  const linkEl = document.getElementById(`edu${prefix}Link`);
  if (eduObj.file) {
    linkEl.href = eduObj.file;
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
  const row = document.getElementById('bgRow').value;

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
  const row = document.getElementById('bgRow').value;
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
  const row = Number(document.getElementById('bgRow').value);
  if (!row) return Swal.fire('ผิดพลาด', 'ไม่พบแถวข้อมูลในระบบ', 'error');

  let expList = [];
  for (let i = 0; i < 6; i++) {
    expList.push({
      year: document.getElementById(`expYear_${i}`).value.trim(),
      pos: document.getElementById(`expPos_${i}`).value.trim(),
      name: document.getElementById(`expName_${i}`).value.trim()
    });
  }

  const payload = {
    nameEN: document.getElementById('bgNameEN').value.trim(),
    nameTH: document.getElementById('bgNameTH').value.trim(),
    dateStart: document.getElementById('bgDateStart').value.trim(),
    position: document.getElementById('bgPosition').value,
    initialName: document.getElementById('bgInitial').value.trim(),
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
  tbody.innerHTML = '<tr><td colspan="9" class="text-center">กำลังโหลดข้อมูล...</td></tr>';

  try {
    const records = await callApi('getTrainingRecords', { initialName: currentUser.initialName });
    tbody.innerHTML = '';
    if (!records || records.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">ไม่พบประวัติการฝึกอบรม</td></tr>';
      return;
    }
    records.reverse().forEach(r => {
      const subDetail = [r.sub2, r.sub3].filter(Boolean).join(' / ');
      const badge = getStatusBadge(r.statusStr);
      const fileBtn = r.link ? `<a href="${r.link}" target="_blank" class="btn btn-xs btn-outline-info py-0 px-2"><i class="fa-solid fa-link"></i></a>` : '-';
      tbody.innerHTML += `
        <tr>
          <td>${r.ato || '-'}</td>
          <td>${r.type || '-'}</td>
          <td class="fw-semibold">${r.sub1 || '-'}</td>
          <td>${subDetail || '-'}</td>
          <td>${formatDateDisplay(r.active)}</td>
          <td>${formatDateDisplay(r.expire)}</td>
          <td class="text-center">${formatDaysLeft(r.daysLeft)}</td>
          <td class="text-center">${badge}</td>
          <td class="text-center">${fileBtn}</td>
        </tr>
      `;
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center text-danger">${err.message}</td></tr>`;
  }
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

// ================= 5. ADMIN APPROVE & MONITOR =================
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
