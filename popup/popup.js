import { storage } from '../background/storage.js';

const REQUIRED_TEXT = "I am intentionally pausing this focus group.";

let groups = [];
let groupToDisable = null;

const container = document.getElementById('groups-container');
const addBtn = document.getElementById('add-group-btn');

const modal = document.getElementById('disable-modal');
const humiliatingInput = document.getElementById('humiliating-input');
const modalConfirmBtn = document.getElementById('modal-confirm-btn');
const modalCancelBtn = document.getElementById('modal-cancel-btn');

async function init() {
  groups = await storage.getGroups();
  if (groups.length === 0) {
    addGroup();
  } else {
    render();
  }
}

function addGroup() {
  groups.unshift({
    id: Date.now().toString(),
    name: "New Group",
    isActive: true,
    websites: [],
    settings: {
      mode: 'always_block',
      dailyAllowance: 30,
      periodLength: 10,
      refractoryPeriod: 60,
      preBlockScreen: false,
      preBlockText: "Breathe in...",
      preBlockDuration: 10,
      disabledUntilTomorrow: false
    }
  });
  render();
}

function render() {
  container.innerHTML = '';
  
  groups.forEach((group, index) => {
    const card = document.createElement('div');
    card.className = 'group-card';
    
    let statusText = group.isActive ? 'PROTECTED' : 'PAUSED';
    if (group.settings.disabledUntilTomorrow) statusText = 'DISABLED TODAY';
    let statusClass = group.isActive ? 'status-active' : 'status-inactive';

    const s = group.settings;

    const siteCount = group.websites.length;
    card.innerHTML = `
      <div class="group-meta"><span>FOCUS GROUP ${String(index + 1).padStart(2, '0')}</span><span>${siteCount} ${siteCount === 1 ? 'site' : 'sites'}</span></div>
      <div class="group-header">
        <input type="text" value="${group.name}" data-idx="${index}" class="name-input">
        <span class="status-badge ${statusClass}">${statusText}</span>
      </div>
      
      <div class="form-group">
        <label>Blocked spaces <span>one domain per line</span></label>
        <textarea rows="3" data-idx="${index}" class="websites-input">${group.websites.join('\n')}</textarea>
      </div>

      <div class="form-group">
        <label>Blocking Mode</label>
        <select data-idx="${index}" class="mode-select">
          <option value="always_block" ${s.mode === 'always_block' ? 'selected' : ''}>Always Block</option>
          <option value="allow_time" ${s.mode === 'allow_time' ? 'selected' : ''}>Daily Time Allowance</option>
          <option value="allow_periods" ${s.mode === 'allow_periods' ? 'selected' : ''}>Periods & Refractory</option>
        </select>
      </div>

      ${s.mode !== 'always_block' ? `
      <div class="row">
        <div class="form-group">
          <label>Daily allowance <span>minutes</span></label>
          <input type="number" value="${s.dailyAllowance}" data-idx="${index}" class="allowance-input">
        </div>
        ${s.mode === 'allow_periods' ? `
        <div class="form-group">
          <label>Focus window <span>minutes</span></label>
          <input type="number" value="${s.periodLength}" data-idx="${index}" class="period-input">
        </div>
        <div class="form-group">
          <label>Reset interval <span>minutes</span></label>
          <input type="number" value="${s.refractoryPeriod}" data-idx="${index}" class="refractory-input">
        </div>
        ` : ''}
      </div>
      ` : ''}

      <div class="checkbox-group">
        <input type="checkbox" data-idx="${index}" class="preblock-check" ${s.preBlockScreen ? 'checked' : ''}>
        <label>Show a pause screen before opening a blocked site</label>
      </div>

      ${s.preBlockScreen ? `
      <div class="row">
        <div class="form-group">
          <label>Pause screen message</label>
          <input type="text" value="${s.preBlockText}" data-idx="${index}" class="pretext-input">
        </div>
        <div class="form-group">
          <label>Duration <span>seconds</span></label>
          <input type="number" value="${s.preBlockDuration}" data-idx="${index}" class="predur-input">
        </div>
      </div>
      ` : ''}

      <div class="card-actions">
        <div>
          <button class="btn text-btn delete-btn" data-idx="${index}">Remove</button>
          <button class="btn ${group.isActive ? 'danger-btn' : 'secondary-btn'} toggle-btn" data-idx="${index}">
            ${group.isActive ? 'Pause protection' : 'Resume protection'}
          </button>
        </div>
        <button class="btn primary-btn save-group-btn" data-idx="${index}">Save group</button>
      </div>
    `;

    container.appendChild(card);
  });

  document.querySelectorAll('.name-input').forEach(el => el.onchange = (e) => { groups[e.target.dataset.idx].name = e.target.value; });
  document.querySelectorAll('.websites-input').forEach(el => el.onchange = (e) => { 
    groups[e.target.dataset.idx].websites = e.target.value.split('\n').map(s => s.trim()).filter(s => s); 
  });
  document.querySelectorAll('.allowance-input').forEach(el => el.onchange = (e) => { groups[e.target.dataset.idx].settings.dailyAllowance = Number(e.target.value); });
  document.querySelectorAll('.period-input').forEach(el => el.onchange = (e) => { groups[e.target.dataset.idx].settings.periodLength = Number(e.target.value); });
  document.querySelectorAll('.refractory-input').forEach(el => el.onchange = (e) => { groups[e.target.dataset.idx].settings.refractoryPeriod = Number(e.target.value); });
  document.querySelectorAll('.pretext-input').forEach(el => el.onchange = (e) => { groups[e.target.dataset.idx].settings.preBlockText = e.target.value; });
  document.querySelectorAll('.predur-input').forEach(el => el.onchange = (e) => { groups[e.target.dataset.idx].settings.preBlockDuration = Number(e.target.value); });

  document.querySelectorAll('.mode-select').forEach(el => el.onchange = (e) => { 
    groups[e.target.dataset.idx].settings.mode = e.target.value; 
    render(); 
  });
  document.querySelectorAll('.preblock-check').forEach(el => el.onchange = (e) => { 
    groups[e.target.dataset.idx].settings.preBlockScreen = e.target.checked; 
    render(); 
  });

  document.querySelectorAll('.save-group-btn').forEach(btn => btn.onclick = async (e) => {
    e.target.textContent = 'Saving...';
    await storage.saveGroups(groups);
    setTimeout(() => {
      e.target.textContent = 'Saved!';
      setTimeout(() => e.target.textContent = 'Save Changes', 2000);
    }, 500);
  });

  document.querySelectorAll('.delete-btn').forEach(el => el.onclick = async (e) => {
    if(confirm("Delete this group permanently?")) {
      groups.splice(e.target.dataset.idx, 1);
      await storage.saveGroups(groups);
      render();
    }
  });

  document.querySelectorAll('.toggle-btn').forEach(el => el.onclick = async (e) => {
    const idx = e.target.dataset.idx;
    if (groups[idx].isActive) {
      groupToDisable = idx;
      humiliatingInput.value = '';
      modalConfirmBtn.disabled = true;
      modal.classList.remove('hidden');
    } else {
      groups[idx].isActive = true;
      groups[idx].settings.disabledUntilTomorrow = false;
      await storage.saveGroups(groups);
      render();
    }
  });
}

addBtn.onclick = addGroup;

modalCancelBtn.onclick = () => {
  modal.classList.add('hidden');
  groupToDisable = null;
};

humiliatingInput.addEventListener('input', (e) => {
  if (e.target.value === REQUIRED_TEXT) {
    modalConfirmBtn.disabled = false;
  } else {
    modalConfirmBtn.disabled = true;
  }
});

modalConfirmBtn.onclick = async () => {
  if (groupToDisable !== null) {
    const disableType = document.querySelector('input[name="disable_type"]:checked').value;
    groups[groupToDisable].isActive = false;
    
    if (disableType === 'today') {
      groups[groupToDisable].settings.disabledUntilTomorrow = true;
    } else {
      groups[groupToDisable].settings.disabledUntilTomorrow = false;
    }
    
    await storage.saveGroups(groups);
    modal.classList.add('hidden');
    groupToDisable = null;
    render();
  }
};

document.addEventListener('DOMContentLoaded', init);
