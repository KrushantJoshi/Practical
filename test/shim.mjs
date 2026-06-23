/*
 * Minimal browser shim so the game modules can run under Node for testing.
 * Imported for side effects before any game module. Real browsers provide all
 * of this; here we stub just enough to execute init/update/draw/mount.
 */
Object.defineProperty(globalThis, 'navigator', { value: { vibrate() {}, serviceWorker: { register: () => Promise.resolve() }, clipboard: { writeText: () => Promise.resolve() } }, configurable: true });
Object.defineProperty(globalThis, 'performance', { value: { now: () => Date.now() }, configurable: true });
globalThis.location = { search: '' };
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.confirm = () => false;
globalThis.AudioContext = class { constructor() { this.currentTime = 0; this.destination = {}; } createOscillator() { return { type: '', frequency: { value: 0 }, connect() {}, start() {}, stop() {} }; } createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; } };
globalThis.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = v; }, removeItem(k) { delete this._d[k]; } };

class El {
  constructor(t = 'div') { this.tagName = t; this.children = []; this.style = { setProperty() {} }; this._c = new Set(); this.dataset = {}; this.clientWidth = 360; }
  set className(v) { this._c = new Set((v || '').split(' ').filter(Boolean)); } get className() { return [...this._c].join(' '); }
  classList = { add: () => {}, remove: () => {}, toggle: () => {} };
  set innerHTML(v) { this.children = []; } get innerHTML() { return ''; }
  set textContent(v) { this._t = v; } get textContent() { return this._t || ''; }
  set hidden(v) {} set disabled(v) {}
  appendChild(c) { this.children.push(c); return c; } remove() {}
  addEventListener() {} removeEventListener() {}
  querySelector() { return new El(); } querySelectorAll() { return []; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 390, height: 740 }; }
  getContext() { return new Proxy({}, { get: (_, p) => p === 'roundRect' || p === 'measureText' ? () => ({ width: 9 }) : () => {}, set: () => true }); }
  set onclick(f) {} dispatchEvent() { return true; } setAttribute() {}
}
export const make = () => new El();
const ids = {};
['hub', 'play', 'grid', 'canvas', 'dom-root', 'back', 'game-title', 'sound-toggle', 'noads', 'coins', 'open-ach', 'open-themes', 'open-settings'].forEach(i => ids[i] = make());
globalThis.document = { getElementById: i => ids[i] || make(), createElement: make, querySelector: () => make(), documentElement: make(), body: make(), addEventListener() {}, removeEventListener() {}, fonts: { load: () => Promise.resolve(), ready: Promise.resolve() }, dispatchEvent() {} };
globalThis.window = { addEventListener() {}, removeEventListener() {}, location: { search: '' }, matchMedia: () => ({ matches: false }) };
export const ctx = ids.canvas.getContext();
