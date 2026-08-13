import { PackageItem, OfflineQueueItem } from '../types';

const STORAGE_KEY_PACKAGES = 'dock42_packages_v1';
const STORAGE_KEY_QUEUE = 'dock42_offline_queue_v1';

export function getStoredPackages(defaultData: PackageItem[]): PackageItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PACKAGES);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_PACKAGES, JSON.stringify(defaultData));
      return defaultData;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.some((p) => typeof p?.id !== 'string')) {
      console.warn('Stored packages failed shape validation, resetting to defaults.');
      return defaultData;
    }
    return parsed;
  } catch (e) {
    return defaultData;
  }
}

export function savePackagesToLocal(packages: PackageItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY_PACKAGES, JSON.stringify(packages));
  } catch (e) {
    console.error('Error saving packages locally:', e);
  }
}

export function getOfflineQueue(): OfflineQueueItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_QUEUE);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export function addToOfflineQueue(item: OfflineQueueItem) {
  const queue = getOfflineQueue();
  queue.push(item);
  localStorage.setItem(STORAGE_KEY_QUEUE, JSON.stringify(queue));
}

export function clearOfflineQueue() {
  localStorage.setItem(STORAGE_KEY_QUEUE, JSON.stringify([]));
}

export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').then(
        (reg) => {
          console.log('[PWA] ServiceWorker registered with scope:', reg.scope);
        },
        (err) => {
          console.warn('[PWA] ServiceWorker registration failed:', err);
        }
      );
    });
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }
  return false;
}

export function triggerLocalPushNotification(title: string, body: string) {
  if ('serviceWorker' in navigator && Notification.permission === 'granted') {
    navigator.serviceWorker.ready.then((reg) => {
      reg.showNotification(title, {
        body,
        icon: '/icon-192.png',
      } as NotificationOptions);
    });
  } else {
    // In-app fallback alert toast
    console.log('[NOTIFICATION IN-APP]:', title, body);
  }
}
