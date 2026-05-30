import { Game } from './game.js';

const canvas = document.getElementById('canvas');
const game   = new Game(canvas);
const input  = game.input;

// ===== マウスクリックでも Space 発火（タイトル/クリア画面対応）=====
canvas.addEventListener('mousedown', e => {
  e.preventDefault();
  if (game.state !== 'playing') input.virtualPress('Space');
});

// ===== バーチャルパッド設定 =====
// DOM要素はタッチ検知のみ担当。ボタン描画はgame.js側でcanvasに行う。
const lBtn  = document.getElementById('vpad-left-btn');
const rBtn  = document.getElementById('vpad-right-btn');
const jZone = document.getElementById('vpad-jump');

if (lBtn && rBtn && jZone) {
  // ---- ユーティリティ ----
  const onStart = (el, fn) =>
    el.addEventListener('touchstart', e => { e.preventDefault(); fn(e); }, { passive: false });
  const onEnd = (el, fn) => {
    el.addEventListener('touchend',    e => { e.preventDefault(); fn(e); }, { passive: false });
    el.addEventListener('touchcancel', e => { e.preventDefault(); fn(e); }, { passive: false });
  };

  // ---- 全画面ベースゾーン（最下層 z-index:0）----
  // タイトル・クリア画面など playing 以外の状態で「どこでもタップ → Space」
  const catchAll = document.getElementById('vpad-catchall');
  if (catchAll) {
    onStart(catchAll, () => {
      if (game.state !== 'playing') input.virtualPress('Space');
    });
  }

  // ---- 左移動ボタン ----
  // プレイ中 → 左移動。それ以外（タイトル/クリア画面等）→ Space（決定）
  onStart(lBtn, () => {
    if (game.state !== 'playing') input.virtualPress('Space');
    else input.virtualDown('ArrowLeft');
  });
  onEnd(lBtn, () => input.virtualUp('ArrowLeft'));

  // ---- 右移動ボタン ----
  onStart(rBtn, () => {
    if (game.state !== 'playing') input.virtualPress('Space');
    else input.virtualDown('ArrowRight');
  });
  onEnd(rBtn, () => input.virtualUp('ArrowRight'));

  // ---- ジャンプゾーン（右半分タップ）----
  // プレイ中 → ジャンプ（ArrowUp）。常に Space も発火（メニュー決定を兼ねる）
  onStart(jZone, () => {
    input.virtualPress('Space');
    input.virtualPress('ArrowUp');
  });
}
