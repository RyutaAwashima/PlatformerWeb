// キー入力管理。isDown: 押しっぱなし、isPressed: 押した瞬間のみ
const PREVENT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

export class Input {
  constructor() {
    this._held        = new Set();
    this._justPressed = new Set();
    window.addEventListener('keydown', e => {
      if (PREVENT.has(e.code)) e.preventDefault();
      if (!this._held.has(e.code)) this._justPressed.add(e.code);
      this._held.add(e.code);
    });
    window.addEventListener('keyup', e => this._held.delete(e.code));
  }

  isDown(code)    { return this._held.has(code); }
  isPressed(code) { return this._justPressed.has(code); }

  /** 毎フレーム末に呼ぶ。justPressed をリセット */
  flush() { this._justPressed.clear(); }
}
