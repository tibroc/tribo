// Browser-side Web Push plumbing: a dedicated push service worker (narrow
// scope, so it coexists with the PWA caching worker), permission flow, and
// subscribe/unsubscribe against the backend. Per-device and per-profile.
import { getPushStatus, subscribePush, unsubscribePush } from './api'

const SW_URL = '/push-sw.js'
const SW_SCOPE = '/push-scope/'

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE })
  await navigator.serviceWorker.ready.catch(() => {})
  return reg
}

// currentEndpoint returns this device's subscription endpoint, if any.
export async function currentEndpoint(): Promise<string | null> {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.getRegistration(SW_SCOPE)
  const sub = await reg?.pushManager.getSubscription()
  return sub?.endpoint ?? null
}

// enablePush walks the whole flow: permission → SW → subscribe → register
// with the backend. Throws with a readable message on any refusal.
export async function enablePush(): Promise<void> {
  if (!pushSupported()) throw new Error('push not supported in this browser')
  const status = await getPushStatus()
  if (!status.enabled || !status.publicKey) throw new Error('push not available on the server')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('notification permission was not granted')

  const reg = await registration()
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(status.publicKey),
  })
  const json = sub.toJSON()
  await subscribePush({ endpoint: sub.endpoint, keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' } })
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration(SW_SCOPE)
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await unsubscribePush(sub.endpoint).catch(() => {})
    await sub.unsubscribe()
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(b64)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}
