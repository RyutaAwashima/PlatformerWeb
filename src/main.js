import { Game } from './game.js';

const canvas   = document.getElementById('canvas');
const gameWrap = document.getElementById('game-wrap');
const game     = new Game(canvas);
const input    = game.input;

// ===== 非プレイ状態: どこでもクリック/タップで決定 =====
// pointerdown はマウス・タッチ両方で発火し、バブリングするため
// vpad ゾーンが上に乗っていても #game-wrap で確実に捕捉できる
gameWrap.addEventListener('pointerdown', () => {
  if (game.state !== 'playing') input.virtualPress('Space');
});

// ===== バーチャルパッド設定（プレイ中のみ）=====
// DOM要素はタッチ検知のみ担当。ボタン描画はgame.js側でcanvasに行う。
const dpad  = document.getElementById('vpad-dpad');
const jZone = document.getElementById('vpad-jump');

// ---- D-パッド（ドラッグで◀▶切替対応）----
// ゾーン内の左半分 → ArrowLeft、右半分 → ArrowRight
// ゾーン外にドラッグした場合は無効化
if (dpad) {
  let activeTouchId = null;
  let currentDir    = null;

  /** タッチX座標からゾーン内左右を判定。ゾーン外ならnull */
  const getDir = clientX => {
    const r    = dpad.getBoundingClientRect();
    const relX = clientX - r.left;
    if (relX < 0 || relX > r.width) return null;
    return relX < r.width * 0.5 ? 'ArrowLeft' : 'ArrowRight';
  };

  /** 現在の方向を切り替える（同じなら何もしない） */
  const applyDir = dir => {
    if (dir === currentDir) return;
    if (currentDir) input.virtualUp(currentDir);
    if (dir)        input.virtualDown(dir);
    currentDir = dir;
  };

  dpad.addEventListener('touchstart', e => {
    e.preventDefault();
    if (game.state !== 'playing') return; // 非プレイ時は gameWrap.pointerdown に任せる
    const t = e.changedTouches[0];
    activeTouchId = t.identifier;
    applyDir(getDir(t.clientX));
  }, { passive: false });

  dpad.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === activeTouchId) applyDir(getDir(t.clientX));
    }
  }, { passive: false });

  const release = e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === activeTouchId) {
        applyDir(null);
        activeTouchId = null;
      }
    }
  };
  dpad.addEventListener('touchend',    release, { passive: false });
  dpad.addEventListener('touchcancel', release, { passive: false });
}

// ---- ジャンプゾーン（右半分・任意位置タップ）----
// タップ位置をcanvas論理座標に変換してゲームへ通知 → フラッシュ描画
if (jZone) {
  jZone.addEventListener('touchstart', e => {
    e.preventDefault();
    if (game.state !== 'playing') return; // 非プレイ時は gameWrap.pointerdown に任せる
    for (const t of e.changedTouches) {
      const cr = canvas.getBoundingClientRect();
      const cx = (t.clientX - cr.left) / cr.width  * 960;
      const cy = (t.clientY - cr.top)  / cr.height * 540;
      input.virtualPress('Space');
      input.virtualPress('ArrowUp');
      game.addJumpFlash(cx, cy);
    }
  }, { passive: false });
}

