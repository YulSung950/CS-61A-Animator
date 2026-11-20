// The browser features behind data.gleam.

import { Result$Ok, Result$Error } from "./gleam.mjs";

// Debounced persist: one pending timer per process (single library key).
let pendingTimer = null;

// localStorage can throw: when the browser blocks it for this site, or (on a
// write) when the site is out of space.
function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function storageGet(key) {
  const store = storage();
  if (!store) return Result$Error(undefined);
  try {
    const value = store.getItem(key);
    return value === null ? Result$Error(undefined) : Result$Ok(value);
  } catch {
    return Result$Error(undefined);
  }
}

export function storageSet(key, value) {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(key, value);
  } catch (error) {
    console.error(`Couldn't save: ${error.message}`);
  }
}

/** Cancel any pending debounce and write immediately. */
export function persistNow(key, value) {
  if (pendingTimer !== null) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  storageSet(key, value);
}

/** Debounced write; replaces any previous pending write. */
export function schedulePersist(key, value, delayMs) {
  if (pendingTimer !== null) {
    clearTimeout(pendingTimer);
  }
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    storageSet(key, value);
  }, delayMs);
}

/** Reset a select's displayed value after a cancelled create-new. */
export function setSelectValue(testId, value) {
  queueMicrotask(() => {
    const el = globalThis.document?.querySelector(
      `select[data-test-id="${testId}"]`,
    );
    if (el) el.value = value;
  });
}

// Ask the user to name a new drawing; "" (empty string) means they cancelled.
export function promptDrawingName() {
  const name = window.prompt("Name for the new drawing:");
  return name === null ? "" : name;
}
