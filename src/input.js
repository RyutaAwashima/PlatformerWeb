// キー入力管理。isDown: 押しっぱなし、isPressed: 押した瞬間のみ
// タッチ対応: canvas要素を渡すとマルチタッチが有効になる
const PREVENT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

export class Input {
  /**
   * @param {HTMLCanvasElement|null} canvas - タッチ入力を受け付けるcanvas要素
   */
  constructor(canvas = null) {
    this._held          = new Set();
    this._justPressed   = new Set();
    this._textMode      = false;
    this._textBuffer    = '';
    this._textEntered   = false;

    // タッチ状態管理
    // _activeTouches: touchIdentifier → {cx, cy} (canvas論理ピクセル座標)
    this._activeTouches = new Map();
    // 左右判定の分割X座標（毎フレームプレイヤーX座標で更新される）
    this._splitX        = 480;

    // ===== キーボードイベント =====
    window.addEventListener('keydown', e => {
      if (PREVENT.has(e.code)) e.preventDefault();
      if (!this._held.has(e.code)) this._justPressed.add(e.code);
      this._held.add(e.code);
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

    // ===== タッチイベント =====
    if (canvas) {
      // clientX/Y → canvas論理座標（CSSスケールを補正）
      const toCanvasCoord = (clientX, clientY) => {
        const r = canvas.getBoundingClientRect();
        return {
          cx: (clientX - r.left) * (canvas.width  / r.width),
          cy: (clientY - r.top)  * (canvas.height / r.height),
        };
      };

      canvas.addEventListener('touchstart', e => {
        e.preventDefault();
        for (const t of e.changedTouches) {
          this._activeTouches.set(t.identifier, toCanvasCoord(t.clientX, t.clientY));
        }
        // タッチ開始 = ジャンプ（Space相当）を瞬間発火
        this._justPressed.add('Space');
      }, { passive: false });

      canvas.addEventListener('touchmove', e => {
        e.preventDefault();
        for (const t of e.changedTouches) {
          if (this._activeTouches.has(t.identifier)) {
            this._activeTouches.set(t.identifier, toCanvasCoord(t.clientX, t.clientY));
          }
        }
      }, { passive: false });

      // touchend / touchcancel どちらもタッチ解除
      const releaseHandler = e => {
        for (const t of e.changedTouches) {
          this._activeTouches.delete(t.identifier);
        }
      };
      canvas.addEventListener('touchend',    releaseHandler, { passive: false });
      canvas.addEventListener('touchcancel', releaseHandler, { passive: false });
    }
  }

  /**
   * プレイヤーのcanvas X座標を毎フレーム渡す。
   * この座標より左のタッチ = 左移動、右 = 右移動 として扱う。
   */
  setTouchSplitX(x) { this._splitX = x; }

  /** 現在アクティブなタッチの中にsplitXより左のものがあるか */
  _touchAnyLeft() {
    for (const { cx } of this._activeTouches.values()) {
      if (cx < this._splitX) return true;
    }
    return false;
  }

  /** 現在アクティブなタッチの中にsplitX以右のものがあるか */
  _touchAnyRight() {
    for (const { cx } of this._activeTouches.values()) {
      if (cx >= this._splitX) return true;
    }
    return false;
  }

  /**
   * キーまたはタッチの「押しっぱなし」判定。
   * ArrowLeft / ArrowRight はタッチ位置でも判定される。
   */
  isDown(code) {
    if (this._held.has(code)) return true;
    if (code === 'ArrowLeft')  return this._touchAnyLeft();
    if (code === 'ArrowRight') return this._touchAnyRight();
    return false;
  }

  /** キーまたはタッチの「押した瞬間」判定 */
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
