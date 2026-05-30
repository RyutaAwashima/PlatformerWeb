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

// ---- D-パッド: フローティングジョイスティック ----
// 左ゾーン内のどこでも指を置けば、そこが基点になる。
// 基点から左右に THRESHOLD_PX 以上スライドで方向入力。dead zone ではニュートラル。
if (dpad) {
  const THRESHOLD_PX = 24; // 方向入力の閾値（スクリーンpx）

  let activeTouchId = null;
  let originX       = 0; // touchstart 時のclientX
  let currentDir    = null;

  /** clientX/Y を canvas 論理座標に変換 */
  const toCanvas = (clientX, clientY) => {
    const cr = canvas.getBoundingClientRect();
    return {
      cx: (clientX - cr.left) / cr.width  * 960,
      cy: (clientY - cr.top)  / cr.height * 540,
    };
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
    if (game.state !== 'playing') return;
    const t = e.changedTouches[0];
    activeTouchId = t.identifier;
    originX       = t.clientX;
    const base    = toCanvas(t.clientX, t.clientY);
    game.setJoystickState(base, base); // 基点=スティック（初期位置は一致）
    applyDir(null); // まだ方向なし（dead zone）
  }, { passive: false });

  dpad.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier !== activeTouchId) continue;
      const dx    = t.clientX - originX;
      const stick = toCanvas(t.clientX, t.clientY);
      // ジョイスティックのスティック位置を更新（描画用）
      const base = game._joystickBase;
      if (base) game.setJoystickState(base, stick);
      // 閾値超えで方向入力
      if      (dx >  THRESHOLD_PX) applyDir('ArrowRight');
      else if (dx < -THRESHOLD_PX) applyDir('ArrowLeft');
      else                          applyDir(null); // dead zone
    }
  }, { passive: false });

  const release = e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier !== activeTouchId) continue;
      applyDir(null);
      activeTouchId = null;
      game.setJoystickState(null, null); // 非表示に戻す
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

