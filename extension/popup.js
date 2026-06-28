// Popup for the Sales Canvas Capture extension.
//
// Probes /api/auth/me with credentials + optional bearer token to show
// the user's sign-in status, and persists backend / canvas / (optional)
// token config to chrome.storage.local.

const DEFAULTS = {
  backendUrl: 'https://salesop-9ajb.onrender.com',
  canvasUrl: 'https://sales-op-frontend.vercel.app',
  apiToken: '',
}

const els = {
  backendUrl: document.getElementById('backendUrl'),
  canvasUrl: document.getElementById('canvasUrl'),
  apiToken: document.getElementById('apiToken'),
  testBtn: document.getElementById('testBtn'),
  saveBtn: document.getElementById('saveBtn'),
  statusPill: document.getElementById('statusPill'),
  signInRow: document.getElementById('signInRow'),
  signInLink: document.getElementById('signInLink'),
  advancedDetails: document.getElementById('advancedDetails'),
}

function setStatus(kind, label, opts = {}) {
  els.statusPill.className = 'pill ' + kind
  els.statusPill.textContent = label
  if (opts.showSignIn && opts.canvasUrl) {
    els.signInLink.href = opts.canvasUrl + '/login'
    els.signInLink.target = '_blank'
    els.signInRow.style.display = ''
  } else {
    els.signInRow.style.display = 'none'
  }
}

function getCurrentConfig() {
  return {
    backendUrl:
      els.backendUrl.value.trim().replace(/\/$/, '') || DEFAULTS.backendUrl,
    canvasUrl:
      els.canvasUrl.value.trim().replace(/\/$/, '') || DEFAULTS.canvasUrl,
    apiToken: els.apiToken.value.trim(),
  }
}

function load() {
  chrome.storage.local.get(['backendUrl', 'canvasUrl', 'apiToken'], (stored) => {
    const cfg = { ...DEFAULTS, ...stored }
    els.backendUrl.value = cfg.backendUrl
    els.canvasUrl.value = cfg.canvasUrl
    els.apiToken.value = cfg.apiToken
    // Auto-expand the Advanced section if a token is already configured.
    if (cfg.apiToken) els.advancedDetails.open = true
    void probeStatus(cfg)
  })
}

function save() {
  const cfg = getCurrentConfig()
  chrome.storage.local.set(cfg, () => {
    // Re-probe immediately so the user sees the new status.
    void probeStatus(cfg)
  })
}

async function probeStatus(cfg) {
  setStatus('muted', 'Checking…')
  const headers = {}
  if (cfg.apiToken) headers.Authorization = 'Bearer ' + cfg.apiToken

  try {
    const res = await fetch(cfg.backendUrl + '/api/auth/me', {
      credentials: 'include',
      headers,
    })
    if (res.ok) {
      const data = await res.json()
      const email = (data.user && data.user.email) || 'user'
      setStatus('ok', 'Signed in · ' + email)
      return
    }
    if (res.status === 401) {
      setStatus('warn', 'Not signed in', {
        showSignIn: true,
        canvasUrl: cfg.canvasUrl,
      })
      return
    }
    setStatus('err', 'HTTP ' + res.status)
  } catch (err) {
    const msg = err && err.message ? err.message : 'Unreachable'
    setStatus('err', msg.length > 40 ? msg.slice(0, 40) + '…' : msg)
  }
}

els.saveBtn.addEventListener('click', save)
els.testBtn.addEventListener('click', () => void probeStatus(getCurrentConfig()))

load()
