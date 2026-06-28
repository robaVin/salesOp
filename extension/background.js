// Sales Canvas — capture extension background service worker (MV3).
//
// Authentication model: the extension uses the user's existing session cookie
// from the canvas backend. As long as the user has signed in on the dashboard
// at least once, the cookie travels with every extension request (because the
// backend sets SameSite=None; Secure and our host_permissions include the
// backend URL).
//
// API tokens are accepted as a fallback for headless / service-account use,
// but no longer required for normal users.

const DEFAULTS = {
  backendUrl: 'https://salesop-9ajb.onrender.com',
  canvasUrl: 'https://sales-op-frontend.vercel.app',
  apiToken: '',
}

async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['backendUrl', 'canvasUrl', 'apiToken'], (stored) => {
      resolve({ ...DEFAULTS, ...stored })
    })
  })
}

function buildHeaders(apiToken) {
  const headers = { 'Content-Type': 'application/json' }
  if (apiToken && apiToken.length > 0) {
    headers.Authorization = 'Bearer ' + apiToken
  }
  return headers
}

function extractText() {
  function pickGmailThread() {
    const subjectEl = document.querySelector('h2.hP')
    const subject = subjectEl ? subjectEl.textContent.trim() : ''
    const bodies = Array.from(document.querySelectorAll('.a3s.aiL'))
      .map((el) => (el.innerText || '').trim())
      .filter(Boolean)
    if (!subject && bodies.length === 0) return null
    const lines = []
    if (subject) lines.push('Subject: ' + subject)
    for (const b of bodies) lines.push(b)
    return lines.join('\n\n').slice(0, 8000)
  }

  const selection = (window.getSelection && window.getSelection().toString()) || ''
  if (selection.trim().length > 0) {
    return {
      kind: 'selection',
      text: selection.trim().slice(0, 8000),
      url: location.href,
      title: document.title,
    }
  }

  if (location.host.includes('mail.google.com')) {
    const text = pickGmailThread()
    if (text) {
      return { kind: 'gmail', text, url: location.href, title: document.title }
    }
  }

  return { kind: 'none', text: '', url: location.href, title: document.title }
}

function makeNotificationId(prefix = 'sc-capture-') {
  return prefix + Math.random().toString(36).slice(2, 10)
}

function notify({ title, message, prefix = 'sc-capture-', requireInteraction = false }) {
  return new Promise((resolve) => {
    const id = makeNotificationId(prefix)
    chrome.notifications.create(
      id,
      {
        type: 'basic',
        iconUrl:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
        title,
        message,
        priority: 1,
        requireInteraction,
      },
      (createdId) => resolve(createdId || id)
    )
  })
}

async function focusOrOpenCanvas(canvasUrl) {
  const tabs = await chrome.tabs.query({})
  const existing = tabs.find((t) => t.url && t.url.startsWith(canvasUrl))
  if (existing && existing.id != null) {
    await chrome.tabs.update(existing.id, { active: true })
    if (existing.windowId != null) {
      await chrome.windows.update(existing.windowId, { focused: true })
    }
    return
  }
  await chrome.tabs.create({ url: canvasUrl })
}

async function capture() {
  const config = await getConfig()
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab || tab.id == null) {
    await notify({ title: 'Sales Canvas', message: 'No active tab.' })
    return
  }

  let extracted
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractText,
    })
    extracted = results && results[0] ? results[0].result : null
  } catch (err) {
    await notify({
      title: 'Sales Canvas',
      message: 'Cannot read this page (chrome://, extension page, or PDF).',
    })
    return
  }

  if (!extracted || !extracted.text || extracted.text.length < 5) {
    await notify({
      title: 'Nothing to capture',
      message:
        extracted && extracted.kind === 'gmail'
          ? 'Open a Gmail conversation first.'
          : 'Select some text first, or open a Gmail thread.',
    })
    return
  }

  try {
    const resp = await fetch(config.backendUrl + '/api/capture', {
      method: 'POST',
      credentials: 'include',
      headers: buildHeaders(config.apiToken),
      body: JSON.stringify({
        text: extracted.text,
        source_url: extracted.url,
        source_title: extracted.title,
        source_kind: extracted.kind,
      }),
    })
    if (resp.status === 401) {
      await notify({
        title: 'Sign in to Sales Canvas',
        message: 'Click to open the canvas and sign in, then try again.',
        prefix: 'sc-signin-',
      })
      return
    }
    if (!resp.ok) {
      const detail = await resp.text().catch(() => '')
      throw new Error('HTTP ' + resp.status + ' ' + detail.slice(0, 200))
    }
    const data = await resp.json()
    const note = data && data.note
    const titleSnippet = note && note.title ? note.title : 'Captured'
    await notify({
      title: 'Note created · click to open',
      message: titleSnippet.slice(0, 120),
    })
  } catch (err) {
    const message = err && err.message ? err.message : String(err)
    await notify({
      title: 'Capture failed',
      message:
        message.length > 0
          ? message
          : 'Backend unreachable. Is the dev server running on :3001?',
    })
  }
}

chrome.commands.onCommand.addListener((command) => {
  if (command === 'capture_to_canvas') capture()
})

chrome.action.onClicked.addListener(() => {
  capture()
})

chrome.notifications.onClicked.addListener(async (notificationId) => {
  const config = await getConfig()
  if (notificationId.startsWith('sc-capture-') || notificationId.startsWith('sc-signin-')) {
    await focusOrOpenCanvas(config.canvasUrl)
    chrome.notifications.clear(notificationId)
  }
})

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    notify({
      title: 'Sales Canvas Capture installed',
      message:
        'Sign in to the canvas once, then press Alt+Shift+S anywhere to capture.',
    })
  }
})
