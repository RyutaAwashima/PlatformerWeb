// キー入力管理。isDown: 押しっぱなし、isPressed: 押した瞬間のみ
// virtualDown/Up/Press: バーチャルパッドから外部で呼び出す
const PREVENT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

export class Input {
  constructor() {
    this._held        = new Set();
    this._justPressed = new Set();
    this._vHeld       = new Set(); // バーチャルパッド押しっぱなし状態
    this._textMode    = false;
    this._textBuffer  = '';
    this._textEntered = false;

    window.addEventListener('keydown', e => {
      if (PREVENT.has(e.code)) e.preventDefault();
      if (!this._held.has(e.code)) this._justPressed.add(e.code);
      this._held.add(e.code);
      if (this._textMode) {
        if (e.key === 'Enter') {
          this._textEntered = true;
        } else if (e.key === 'Backspace') {
          this._textBuffer = this._textBuffer.slice(0, -1);
        } else if (e.key.length === 1 && this._textBuffer.length < 64) {
          this._textBuffer += e.key;
        }
      }
    });
    window.addEventListener('keyup', e => this._held.delete(e.code));
  }

  // ===== バーチャルパッドAPI =====

  /** ボタン長押し開始（移動系） */
  virtualDown(code)  { this._vHeld.add(code); }
  /** ボタン長押し解除 */
  virtualUp(code)    { this._vHeld.delete(code); }
  /** 1フレームだけ押した判定（ジャンプ・決定） */
  virtualPress(code) { this._justPressed.add(code); }

  // ===== クエリAPI =====

  /** キーボードまたはバーチャルパッドの「押しっぱなし」 */
  isDown(code)    { return this._held.has(code) || this._vHeld.has(code); }
  /** キーボードまたはバーチャルパッドの「押した瞬間」 */
  isPressed(code) { return this._justPressed.has(code); }
  /** バーチャルパッドが現在押しっぱなしか（描画のフィードバック用） */
  isVirtualDown(code) { return this._vHeld.has(code); }

  // ===== テキストモード =====

  setTextMode(on) {
    this._textMode    = on;
    this._textBuffer  = '';
    this._textEntered = false;
  }

  getTextBuffer() { return this._textBuffer; }

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
