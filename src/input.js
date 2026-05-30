// キー入力管理。isDown: 押しっぱなし、isPressed: 押した瞬間のみ
const PREVENT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

export class Input {
  constructor() {
    this._held        = new Set();
    this._justPressed = new Set();
    this._textMode    = false;
    this._textBuffer  = '';
    this._textEntered = false;
    window.addEventListener('keydown', e => {
      if (PREVENT.has(e.code)) e.preventDefault();
      if (!this._held.has(e.code)) this._justPressed.add(e.code);
      this._held.add(e.code);
      // テキストモード: コンソール入力をバッファに積む
      if (this._textMode) {
        if (e.key === 'Enter') {
          this._textEntered = true;
        } else if (e.key === 'Backspace') {
          this._textBuffer = this._textBuffer.slice(0, -1);
        } else if (e.key.length === 1 && this._textBuffer.length < 8) {
          this._textBuffer += e.key;
        }
      }
    });
    window.addEventListener('keyup', e => this._held.delete(e.code));
  }

  isDown(code)    { return this._held.has(code); }
  isPressed(code) { return this._justPressed.has(code); }

  /** テキストモードON/OFF。ONにするとバッファをリセット */
  setTextMode(on) {
    this._textMode    = on;
    this._textBuffer  = '';
    this._textEntered = false;
  }

  /** 現在のコンソール入力文字列を返す */
  getTextBuffer() { return this._textBuffer; }

  /**
   * Enterが押されていたらコマンド文字列を返してバッファをクリア。
   * まだ押されていなければ null を返す。
   */
  consumeTextEnter() {
    if (!this._textEntered) return null;
    const cmd = this._textBuffer.trim();
    this._textBuffer  = '';
    this._textEntered = false;
    return cmd;
  }

  /** 毎フレーム末に呼ぶ。justPressed をリセット */
  flush() { this._justPressed.clear(); }
}
