(function () {
  class DOMRectPolyfill {
    constructor(x = 0, y = 0, width = 0, height = 0) {
      this.x = Number(x) || 0;
      this.y = Number(y) || 0;
      this.width = Number(width) || 0;
      this.height = Number(height) || 0;
      this.top = this.y;
      this.left = this.x;
      this.right = this.x + this.width;
      this.bottom = this.y + this.height;
    }
    static fromRect(rect = {}) {
      return new DOMRectPolyfill(rect.x ?? 0, rect.y ?? 0, rect.width ?? 0, rect.height ?? 0);
    }
    toJSON() {
      return {
        x: this.x,
        y: this.y,
        width: this.width,
        height: this.height,
        top: this.top,
        right: this.right,
        bottom: this.bottom,
        left: this.left,
      };
    }
  }
  function define(target, key, value) {
    if (!target) return;
    try {
      if (typeof target[key] === 'undefined') {
        Object.defineProperty(target, key, { configurable: true, writable: true, value });
      }
    } catch {
      // silenced intentionally
    }
  }
  function install(target) {
    define(target, 'DOMRect', DOMRectPolyfill);
    define(target, 'DOMRectReadOnly', DOMRectPolyfill);
  }
  install(globalThis);
  if (typeof global !== 'undefined') install(global);
  if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
  install(globalThis.window);
})();
