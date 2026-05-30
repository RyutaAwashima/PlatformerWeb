import { Input } from './input.js';

const { Engine, Bodies, Body, World, Events } = Matter;

// ===== シード付き疑似乱数 (mulberry32) =====
// ステージモード: stage番号でシード固定 → 落下して再挑戦しても同じ配置
// ヘヴンズモード: 毎回 Math.random() でランダム配置
let _rngFn = null;
function rng() { return _rngFn !== null ? _rngFn() : Math.random(); }
function _seedRng(seed) {
  let s = (seed ^ 0xdeadbeef) >>> 0;
  _rngFn = () => {
    s += 0x6D2B79F5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}
function _unseedRng() { _rngFn = null; }

// ===== 定数 =====
const W = 960, H = 540;
const PLAYER_W = 28, PLAYER_H = 40;
const PLAYER_SPEED = 6;
const JUMP_VEL = -18;          // ジャンプ力（大きいほど高く飛ぶ）

const START_Y = 480;            // プレイヤー開始世界Y
const STAGE_COUNT = 18;
const BASE_GOAL_HEIGHT = 1700;  // Stage1 の必要高度(px)
const GOAL_STEP_HEIGHT = 220;   // ステージごとの追加高度(px)
const HEAVENS_UNLOCK_STAGE = STAGE_COUNT;
const MAX_LIVES = 3;

const PLATFORM_COUNTDOWN      = 1800; // ms: 踏んでから落下開始まで
const PLAT_FALLEN_VANISH_MS   = 2200; // ms: 落下開始から消滅まで
const PLAT_FALLEN_FADE_MS     = 700;  // ms: 消滅前のフェード開始タイミング
const DJ_COOLDOWN         = 3000; // ms: 二段ジャンプのクールタイム
const DJ_FLASH_DURATION   = 800;  // ms: 使用可能フラッシュの継続時間
const DJ_FLASH_INTERVAL   = 80;   // ms: フラッシュの点滅間隔
const ENEMY_KNOCK_VX    = 14;   // 吹き飛ばし横速度
const ENEMY_KNOCK_VY    = -12;  // 吹き飛ばし上速度
const KNOCKBACK_DURATION = 550; // ms: ノックバック中の入力無効時間
const STOMP_VY          = -24;  // 踏みつけバウンス速度（通常ジャンプより強い）

// ===== Boss5 Leaper 定数 =====
const BOSS5_HP_MAX      = 4;
const BOSS5_W           = 48;
const BOSS5_H           = 56;
const BOSS5_WALK_SPD    = 2.2;
const BOSS5_JUMP_VY     = -26;    // -24 では PERCH_Y=110 に届かないため強化
const BOSS5_GRAVITY     = 0.9;
const BOSS5_DIVE_GRAV   = 4.5;
const BOSS5_PERCH_MS    = 2200;  // 空中停留時間（旧 roam なし）
const BOSS5_WARN_MS     = 650;
const BOSS5_BERSERK_MS       = 7000;  // バーサーク持続ms
const BOSS5_BERSERK_PERCH_MS = 1400;  // バーサーク中の空中停留ms（通常の約 63%）
const BOSS5_BERSERK_BURST    = 3;     // バーサーク中の衝撃波数
const BOSS5_SHOCK_SPD   = 7.0;        // (次バージョンで SW_GREEN_SPD に統一予定)
const BOSS5_BURST_COUNT = 2;
const BOSS5_KNOCK_VX    = 30;
const BOSS5_KNOCK_VY    = -22;
const BOSS5_STOMP_VY    = -28;     // ミニオン踏み台ジャンプの上昇速度
const BOSS5_ARENA_X1    = 80;
const BOSS5_ARENA_X2    = 880;
const BOSS5_PERCH_Y     = 110;
const BOSS5_MINION_COLOR= '#c060e0';
const BOSS5_MINION_LIFE = 3500;
const BOSS5_MINION_FADE = 750;
const BOSS5_MINION_BOUNCE = 0.32;
const BOSS5_MINION_MAX  = 5;

const PLAT_Y_GAP_MIN = 75;
const PLAT_Y_GAP_MAX = 105;
const PLAT_W_MIN = 120;
const PLAT_W_MAX = 220;
const PLAT_H = 16;
const HEAL_INTERVAL    = 750;    // 回復床の出現間隔（高さpx）
const WIND_STRENGTH     = 0.10;   // 風ドリフト量 px/frame (dt=16msで約1.6px/frame)
const WIND_ZONE_MIN_H   = 240;    // 風ゾーン最小高さ(px)
const WIND_ZONE_MAX_H   = 370;    // 風ゾーン最大高さ(px)
const WIND_ZONE_SPACING = 600;    // 風ゾーン生成間隔(px)

const COLORS = {
  bg:           '#0d0e14',
  player:       '#7df0a4',
  ground:       '#2e3044',
  platIdle:     '#4a4e6a',
  platWarn:     '#c8a040',
  platDanger:   '#d05828',
  platCritical: '#e02828',
  goal:         '#7deaff',
  heal:         '#58ff9f',
  healUsed:     '#2f5d43',
  healGlow:     'rgba(88,255,159,0.8)',
  movingPlat:   '#7a8aff',
  movingSmooth: '#c07aff',
  blinkOn:      '#f0e060',
  blinkOff:     '#3a3010',
  elevIdle:     '#4080c8',
  elevRising:   '#70c0ff',
  elevGlow:     'rgba(112,192,255,0.65)',
  windBand:     'rgba(70, 175, 255, 0.09)',
  windLine:     'rgba(140, 215, 255, 0.48)',
  text:         '#e6e6ea',
  muted:        '#5a5e7a',
  overlay:      'rgba(13,14,20,0.88)',
  bossBody:     '#b83060',
  bossStun:     '#c87030',
  boss5Minion:  BOSS5_MINION_COLOR,
  bossVuln:     '#c830a0',
  bossWeak:     '#fff040',
  bossHpFill:   '#ff4060',
};

// ===== ボス定数 =====
const BOSS_FLOOR_Y    = 500;           // アリーナ床ボディ中心Y
const BOSS_FLOOR_X1   = 80;            // アリーナ左端X
const BOSS_FLOOR_X2   = 880;           // アリーナ右端X
const BOSS_CHARGE_SPD = 9.5;           // 突進速度 px/frame(60fps基準)
const BOSS_STUN_MS    = 2200;          // スタン持続ms
const BOSS_VULN_MS    = 1800;          // 弱点露出ms
const BOSS_PATROL_MS  = 1600;          // 突進前パトロールms
const BOSS_WINDUP_MS  = 700;           // 予備動作ms
const BOSS_HP_MAX     = 3;             // ボスHP
const BOSS_KNOCK_VX   = 24;            // ボス衝突ノックバック横速度
const BOSS_KNOCK_VY   = -18;           // ボス衝突ノックバック縦速度

// ===== ボス2定数 (空中浮遊型) =====
const BOSS2_HP_MAX     = 4;
const BOSS2_W          = 52;
const BOSS2_H          = 52;
const BOSS2_DRIFT_SPD  = 2.0;    // 通常ドリフト速度
const BOSS2_CHARGE_SPD = 12;     // 突進速度
const BOSS2_DRIFT_MS   = 3000;   // ドリフト継続ms (+50%)
const BOSS2_HOVER_MS   = 2700;   // プラット下待機ms (+50%)
const BOSS2_WINDUP_MS      = 800;    // 予備動作ms
const BOSS2_STUN_MS        = 4500;   // スタン持続ms
const BOSS2_SHOCK_MS       = 1800;   // 衝撃波持続ms(normal/delayed)
const BOSS2_SHOCK_DELAY    = 550;    // delayed: 溜め時間ms
const BOSS2_SHOCK_SPD_NORM = 4.5;    // normal: 定速
const BOSS2_SHOCK_SPD_FAST = 9.5;    // delayed: 爆発速度
const BOSS2_SHOCK_SPD_PULS = 7.5;    // pulse: 展開速度
const BOSS2_SHOCK_PULSE_MS = 450;    // pulse: 1サイクルms (展開300+停止150)
const BOSS2_KNOCK_VX   = 28;
const BOSS2_KNOCK_VY   = -20;
const PLAT2_RESPAWN_MS = 4500;   // ドロップ床復活ms

// ===== ボス3定数 (地上疾走型) =====
const BOSS3_HP_MAX       = 4;
const BOSS3_W            = 42;
const BOSS3_H            = 54;
const BOSS3_GRAVITY      = 0.9;     // 手動重力加速度 (px/frame^2)
const BOSS3_JUMP_VY      = -18;     // ジャンプ初速（足場へ）
const BOSS3_WALK_SPD     = 2.8;     // 通常歩行速度
const BOSS3_CHARGE_SPD   = 11;      // 突進速度
const BOSS3_CHARGE2_SPD  = 22;      // 高速連続突進速度
const BOSS3_ROAM_MS      = 2200;    // roaming 継続ms
const BOSS3_WINDUP_MS    = 700;     // 溜めms
const BOSS3_STUN_MS      = 3800;    // スタン持続ms
const BOSS3_SHOCK_SPD    = 11.0;    // 衝撃波速度
const BOSS3_BURST_COUNT  = 4;       // バースト波数
// 波間隔：1発目即時→120ms→2発目→120ms→3発目→390ms→4発目
const BOSS3_BURST_GAPS   = [60, 60, 390]; // 波n射出後の待機（波n+1発射まで）
const BOSS3_KNOCK_VX     = 26;
const BOSS3_KNOCK_VY     = -18;
const PLAT3_COLLAPSE_MS  = 1400;    // Boss3アリーナ床の崩落ms
const PLAT3_RESPAWN_MS   = 5000;    // Boss3床の復活ms
const PLAT5_COLLAPSE_MS  = 1000;    // Boss5アリーナ床の崩落ms（やや短め）
const PLAT5_RESPAWN_MS   = 4500;    // Boss5床の復活ms
// Boss3アリーナ床のX範囲（cx=480, width=arenaW*0.6=480 → 240〜720）
const BOSS3_ARENA_X1     = 240;     // Boss3アリーナ床左端X
const BOSS3_ARENA_X2     = 720;     // Boss3アリーナ床右端X

// ===== ボス4定数 (前隙タイミング型) =====
const BOSS4_HP_MAX       = 4;
const BOSS4_W            = 44;
const BOSS4_H            = 52;
const BOSS4_WALK_SPD     = 2.2;     // patrol歩き速度
const BOSS4_CHARGE_SPD   = 16.0;    // 高速突進速度（見逃しペナルティ）
const BOSS4_ROAM_MS      = 1800;    // patrol継続ms
const BOSS4_WINDUP_MS    = 900;     // windup総時間ms
const BOSS4_WINDOW_MS    = 360;     // 前隙ウィンドウ（windup後半のweakBody露出ms）× 2
const BOSS4_STUN_MS      = 3000;    // スタン持続ms
const BOSS4_SHOCK_SPD    = 6.0;     // 青・水: バースト衝撃波速度（中速）
const BOSS4_BURST_COUNT  = 5;       // 青・水: バースト波数（多発）
const BOSS4_BURST_GAPS   = [60, 60, 60, 60, 400]; // 波n射出後の待機ms
const BOSS4_LOCAL_SHOCK_RANGE = 170; // ラッシュ型衝撃波の最大展開半径(px)
const BOSS4_KNOCK_VX     = 28;
const BOSS4_KNOCK_VY     = -20;
const BOSS4_ARENA_X1     = 80;      // アリーナ左端（full幅）
const BOSS4_ARENA_X2     = 880;     // アリーナ右端

// ===== Boss6定数 (最終ボス: 3形態) =====
const BOSS6_HP_MAX       = 6;    // 総HP（形態1:6→4、形態2:4→2、形態3:2→0）
const BOSS6_W            = 50;
const BOSS6_H            = 58;
// 形態1（地上型）
const BOSS6_F1_PATROL_MS = 1400;  // patrol継続ms
const BOSS6_F1_WINDUP_MS = 650;   // 溜めms
const BOSS6_F1_CHARGE_SPD= 10.0;  // 通常突進速度
const BOSS6_F1_CHARGE2_SPD=19.0;  // HP4以下のスピードアップ後
const BOSS6_F1_STUN_MS   = 2800;  // スタンms
// 形態2（空中型）
const BOSS6_F2_JUMP_VY   = -26;
const BOSS6_F2_GRAVITY   = 0.9;
const BOSS6_F2_DIVE_GRAV = 4.5;
const BOSS6_F2_PERCH_Y   = 120;
const BOSS6_F2_PERCH_MS  = 1800;
const BOSS6_F2_WARN_MS   = 550;
const BOSS6_F2_BURST     = 3;     // 着地後衝撃波数
// 形態3（前隙タイミング型）
const BOSS6_F3_PATROL_MS = 1200;
const BOSS6_F3_WINDUP_MS = 820;
const BOSS6_F3_WINDOW_MS = 320;   // 弱点露出ウィンドウ
const BOSS6_F3_CHARGE_SPD= 17.0;
const BOSS6_F3_STUN_MS   = 2500;
const BOSS6_F3_BURST     = 4;     // 衝撃波数
// 共通
const BOSS6_KNOCK_VX     = 28;
const BOSS6_KNOCK_VY     = -20;
const BOSS6_ARENA_X1     = 120;   // Boss3的な狭めアリーナ
const BOSS6_ARENA_X2     = 840;
// アリーナ崩落足場
const PLAT6_COLLAPSE_MS  = 1200;
const PLAT6_RESPAWN_MS   = 5000;

// ===== 衝撃波タイプ定数（4色） =====
// 赤・炎: ゆっくり広がり長持続。Boss2
const SW_RED_SPD    = 2.5;
const SW_RED_MS     = 1800;   // BOSS2_SHOCK_MS と同値
// 青・水: 中速、多発。Boss4
const SW_BLUE_SPD   = 6.0;
const SW_BLUE_WAVE_MS = 1400; // 1波の最大持続ms
// 黄・大地: 高速、短め。Boss3 (= BOSS3_SHOCK_SPD / BOSS3 既存値を流用)
// 緑・風: 高速、画面端まで溢れる。Boss5
const SW_GREEN_SPD  = 9.5;
const SW_GREEN_WAVE_MS = 900; // 1波の最大持続ms

// ===== Platform ラッパー =====
class PlatformObj {
  constructor(body, {
    isGround    = false,
    isGoal      = false,
    isHealing   = false,
    canCollapse = true,
    collapseMs  = PLATFORM_COUNTDOWN, // 崩落開始までのms（デフォルトは通常床と同じ）
    // 横移動床
    isMoving    = false,
    moveType    = 'linear',  // 'linear' | 'smooth'
    moveRange   = 150,       // 半往復幅(px)
    moveSpeed   = 0.08,      // linear: px/ms  /  smooth: 内部スケール値
    // 明滅床
    isBlinking  = false,
    blinkOnMs   = 900,
    blinkOffMs  = 500,
    // エレベーター床
    isElevator  = false,
    elevTravel  = 320,       // 上昇距離(px)
    elevSpeed   = 0.11,      // px/ms
  } = {}) {
    this.body        = body;
    this.isGround    = isGround;
    this.isGoal      = isGoal;
    this.isHealing   = isHealing;
    this.canCollapse  = canCollapse;
    this._collapseMs  = collapseMs;
    this.healUsed     = false;
    this.state        = 'idle';
    this.timer        = 0;
    this._fallTimer   = 0;

    // 横移動
    this.isMoving   = isMoving;
    this.moveType   = moveType;
    this.moveRange  = moveRange;
    this.moveSpeed  = moveSpeed;
    this._moveT     = rng() * Math.PI * 2; // ランダム初期位相
    this._moveDir   = 1;
    this._moveBaseX = body.position.x;

    // 明滅
    this.isBlinking    = isBlinking;
    this.blinkOnMs     = blinkOnMs;
    this.blinkOffMs    = blinkOffMs;
    this._blinkT       = rng() * (blinkOnMs + blinkOffMs);
    this._blinkVisible = true;

    // エレベーター
    this.isElevator   = isElevator;
    this.elevTravel   = elevTravel;
    this.elevSpeed    = elevSpeed;
    this.elevTraveled = 0;
    this.elevState    = 'idle'; // idle | rising | gone
    this._elevBaseY   = body.position.y;

    // 前フレーム位置（プレイヤー追従用）
    this._prevX = body.position.x;
    this._prevY = body.position.y;
  }

  tryStartCountdown() {
    // エレベーターは専用の起動ロジックを使うため対象外
    if (this.state === 'idle' && this.canCollapse && !this.isElevator) {
      this.state = 'countdown';
    }
  }

  activateElevator() {
    if (this.isElevator && this.elevState === 'idle') {
      this.elevState  = 'rising';
      this._elevBaseY = this.body.position.y;
    }
  }

  update(dt) {
    this._prevX = this.body.position.x;
    this._prevY = this.body.position.y;

    // 横移動床（カウントダウン中は移動を停止して崩落へ）
    if (this.isMoving && this.state === 'idle') {
      this._moveT += dt;
      let newX;
      if (this.moveType === 'smooth') {
        // サイン波でぬるっと往復（moveSpeed * 0.001 = rad/ms）
        newX = this._moveBaseX + Math.sin(this._moveT * this.moveSpeed * 0.001) * this.moveRange;
      } else {
        // 一定速度でバウンス
        newX = this.body.position.x + this._moveDir * this.moveSpeed * dt;
        if (newX > this._moveBaseX + this.moveRange) { newX = this._moveBaseX + this.moveRange; this._moveDir = -1; }
        if (newX < this._moveBaseX - this.moveRange) { newX = this._moveBaseX - this.moveRange; this._moveDir =  1; }
      }
      Body.setPosition(this.body, { x: newX, y: this.body.position.y });
      return;
    }

    // 明滅床（カウントダウン中は点滅停止・実体化して崩落へ）
    if (this.isBlinking) {
      if (this.state === 'idle') {
        this._blinkT += dt;
        const cycle      = this.blinkOnMs + this.blinkOffMs;
        const phase      = this._blinkT % cycle;
        const nowVisible = phase < this.blinkOnMs;
        if (nowVisible !== this._blinkVisible) {
          this._blinkVisible = nowVisible;
          this.body.isSensor = !nowVisible;
        }
        return;
      }
      // countdown / falling 中は点滅を止めて実体化を維持
      if (!this._blinkVisible) {
        this._blinkVisible = true;
        this.body.isSensor = false;
      }
    }

    // エレベーター床
    if (this.isElevator) {
      if (this.elevState === 'rising') {
        const dy = this.elevSpeed * dt;
        this.elevTraveled += dy;
        if (this.elevTraveled >= this.elevTravel) {
          this.elevState = 'gone';
        } else {
          Body.setPosition(this.body, { x: this.body.position.x, y: this._elevBaseY - this.elevTraveled });
        }
      }
      return;
    }

    // 通常崩落
    if (this.state === 'falling') {
      this._fallTimer += dt;
      return;
    }
    if (this.state !== 'countdown') return;
    this.timer += dt;
    if (this.timer >= this._collapseMs) {
      this.state = 'falling';
      Body.setStatic(this.body, false);
      Body.setVelocity(this.body, { x: 0, y: 5 });
      Body.setAngularVelocity(this.body, (Math.random() - 0.5) * 0.05);
    }
  }

  // 落下後の消滅までの残り割合 (1→→•0)
  get vanishRatio() {
    if (this.state !== 'falling') return 1;
    return Math.max(0, 1 - this._fallTimer / PLAT_FALLEN_VANISH_MS);
  }

  get countdownRatio() { return Math.min(1, this.timer / this._collapseMs); }
  get elevRatio()      { return Math.min(1, this.elevTraveled / this.elevTravel); }

  get color() {
    if (this.isHealing)  return this.healUsed ? COLORS.healUsed : COLORS.heal;
    if (this.isGoal)     return COLORS.goal;
    if (this.isElevator) return this.elevState === 'rising' ? COLORS.elevRising : COLORS.elevIdle;
    // カウントダウン中・崩落中は種別に関わらず警告色
    if (this.state === 'countdown' || this.state === 'falling') {
      const r = this.countdownRatio;
      if (r < 0.5)  return COLORS.platWarn;
      if (r < 0.75) return COLORS.platDanger;
      return COLORS.platCritical;
    }
    if (this.isMoving)   return this.moveType === 'smooth'  ? COLORS.movingSmooth : COLORS.movingPlat;
    if (this.isBlinking) return this._blinkVisible ? COLORS.blinkOn : COLORS.blinkOff;
    if (this.isGround)   return COLORS.ground;
    return COLORS.platIdle;
  }
}

// ===== Enemy =====
class Enemy {
  constructor(x, y) {
    this.baseX = x;
    this.baseY = y;
    this._t   = rng() * 1000; // ランダム位相
    this.patrolHalf  = 50 + rng() * 70;   // 横パトロール幅(px)
    this.patrolSpeed = 0.0006 + rng() * 0.0005; // rad/ms
    this.floatAmp    = 8  + rng() * 10;   // 上下浮遊幅(px)
    this.floatSpeed  = 0.0013 + rng() * 0.001;  // rad/ms
    this.body = Bodies.rectangle(x, y, 28, 28, {
      isSensor: true, isStatic: true, label: 'enemy',
    });
  }
  update(dt) {
    this._t += dt;
    const nx = this.baseX + Math.sin(this._t * this.patrolSpeed) * this.patrolHalf;
    const ny = this.baseY + Math.sin(this._t * this.floatSpeed)  * this.floatAmp;
    Body.setPosition(this.body, { x: nx, y: ny });
  }
}

// ===== EnemyRunner =====
// 地上を水平に走る敵。左右を一定幅でバウンスする。Stage4+ 解禁。
class EnemyRunner {
  constructor(x, y) {
    this.type   = 'runner';
    this.x      = x;
    this.y      = y;
    this._dir   = rng() < 0.5 ? 1 : -1;
    this._speed = 2.0 + rng() * 1.8;   // px/frame (60fps基準)
    this._range = 70 + rng() * 120;
    this._baseX = x;
    this._legT  = rng() * Math.PI * 2; // 走りアニメ位相
    this.body = Bodies.rectangle(x, y, 34, 22, {
      isSensor: true, isStatic: true, label: 'enemy',
    });
  }
  update(dt, _playerX) {
    this._legT += dt * 0.015;
    this.x += this._dir * this._speed * (dt / 16.67);
    if (this.x > this._baseX + this._range) { this.x = this._baseX + this._range; this._dir = -1; }
    if (this.x < this._baseX - this._range) { this.x = this._baseX - this._range; this._dir =  1; }
    Body.setPosition(this.body, { x: this.x, y: this.y });
  }
}

// ===== EnemyDiver =====
// 上空でホバー → 急降下 → ゆっくり浮上を繰り返す敵。Stage7+ 解禁。
class EnemyDiver {
  constructor(x, y) {
    this.type      = 'diver';
    this.x         = x;
    this.y         = y;
    this.baseY     = y;
    this._state    = 'hover'; // hover | dive | rising
    this._timer    = rng() * 2200;
    this._hoverMs  = 1800 + rng() * 1400;
    this._vy       = 0;
    this._diveDepth = 120 + rng() * 90;
    this._hoverT   = 0;
    this.body = Bodies.rectangle(x, y, 26, 32, {
      isSensor: true, isStatic: true, label: 'enemy',
    });
  }
  update(dt, _playerX) {
    this._timer += dt;
    switch (this._state) {
      case 'hover':
        this._hoverT += dt;
        this.y = this.baseY + Math.sin(this._hoverT * 0.0025) * 14;
        if (this._timer >= this._hoverMs) {
          this._state = 'dive'; this._timer = 0; this._vy = 0;
        }
        break;
      case 'dive':
        this._vy += 0.55 * (dt / 16.67);
        this.y   += this._vy * (dt / 16.67);
        if (this.y >= this.baseY + this._diveDepth) {
          this.y = this.baseY + this._diveDepth;
          this._state = 'rising'; this._timer = 0;
        }
        break;
      case 'rising':
        this.y -= 3.2 * (dt / 16.67);
        if (this.y <= this.baseY) {
          this.y = this.baseY;
          this._state = 'hover'; this._timer = 0; this._hoverT = 0;
          this._hoverMs = 1800 + Math.random() * 1400;
        }
        break;
    }
    Body.setPosition(this.body, { x: this.x, y: this.y });
  }
}

// ===== BossCharge =====
// 突進型ボス。壁にぶつかるとスタン → 弱点露出 → 踏みつけでダメージのサイクル
class BossCharge {
  constructor(x, y, phase, world) {
    this.phase = phase;           // 1(通常) | 2(巨大)
    this.hp    = BOSS_HP_MAX;
    this.bW    = phase === 2 ? 68 : 46;
    this.bH    = phase === 2 ? 68 : 50;
    this.x     = x;
    this.y     = y;
    // 状態: patrol|windup|charging|windup_shock|shockwave|stunned|dead
    this.state = 'patrol';
    this.timer = 0;
    this.chargeDir   = 1;
    this._weakActive = false;
    this._hitFlash   = 0;
    this._pattern    = 'A';       // 'A'=突進+衝撃波, 'B'=二連穑進→オートスタン
    this._swLx     = -999;        // 左衝撃波 X
    this._swRx     = 9999;        // 右衝撃波 X
    this._swActive = false;

    const swY = BOSS_FLOOR_Y - 16;
    this.body = Bodies.rectangle(x, y, this.bW, this.bH, {
      label: 'boss', isSensor: true, isStatic: true,
    });
    this.weakBody = Bodies.rectangle(x, -9999, Math.round(this.bW * 0.55), 12, {
      label: 'bossWeak', isSensor: true, isStatic: true,
    });
    this.swBodyL = Bodies.rectangle(-999, swY, 30, 32, {
      label: 'bossShock', isSensor: true, isStatic: true,
    });
    this.swBodyR = Bodies.rectangle(9999, swY, 30, 32, {
      label: 'bossShock', isSensor: true, isStatic: true,
    });
    World.add(world, [this.body, this.weakBody, this.swBodyL, this.swBodyR]);
  }

  update(dt, playerX) {
    this.timer += dt;
    if (this._hitFlash > 0) this._hitFlash -= dt;
    if (this.state === 'dead') return;

    const halfW      = this.bW / 2;
    const leftBound  = BOSS_FLOOR_X1 + halfW + 10;
    const rightBound = BOSS_FLOOR_X2 - halfW - 10;
    const swY        = BOSS_FLOOR_Y - 16;

    switch (this.state) {
      case 'patrol': {
        const dir = playerX > this.x ? 1 : -1;
        this.x += dir * 1.5 * (dt / 16.67);
        this.x = Math.max(leftBound, Math.min(rightBound, this.x));
        if (this.timer >= BOSS_PATROL_MS) {
          this.timer     = 0;
          this.state     = 'windup';
          this.chargeDir = playerX > this.x ? 1 : -1;
          this._pattern  = Math.random() < 0.5 ? 'A' : 'B';
        }
        break;
      }
      case 'windup':
        if (this.timer >= BOSS_WINDUP_MS) {
          this.state = 'charging';
          this.timer = 0;
        }
        break;
      case 'charging': {
        this.x += this.chargeDir * BOSS_CHARGE_SPD * (dt / 16.67);
        const hitR = this.chargeDir > 0 && this.x >= rightBound;
        const hitL = this.chargeDir < 0 && this.x <= leftBound;
        if (hitR || hitL) {
          this.x         = hitR ? rightBound : leftBound;
          this.chargeDir *= -1;
          if (this._pattern === 'B') {
            // パターンB: 即座に2回目の突進
            this.state = 'charging2';
            this.timer = 0;
          } else {
            // パターンA: 衝撃波へ
            this.state = 'windup_shock';
            this.timer = 0;
          }
        }
        break;
      }
      case 'charging2': {
        this.x += this.chargeDir * BOSS_CHARGE_SPD * (dt / 16.67);
        const hitR2 = this.chargeDir > 0 && this.x >= rightBound;
        const hitL2 = this.chargeDir < 0 && this.x <= leftBound;
        if (hitR2 || hitL2) {
          this.x           = hitR2 ? rightBound : leftBound;
          this.state       = 'stunned';
          this.timer       = 0;
          this._weakActive = true;
          this._hitFlash   = 300;
        }
        break;
      }
      case 'windup_shock':
        if (this.timer >= BOSS_WINDUP_MS) {
          this.state     = 'shockwave';
          this.timer     = 0;
          this._swLx     = this.x;
          this._swRx     = this.x;
          this._swActive = true;
        }
        break;
      case 'shockwave': {
        const spd = 4.5 * (dt / 16.67);
        this._swLx -= spd;
        this._swRx += spd;
        Body.setPosition(this.swBodyL, {
          x: this._swLx > BOSS_FLOOR_X1 ? this._swLx : -999, y: swY,
        });
        Body.setPosition(this.swBodyR, {
          x: this._swRx < BOSS_FLOOR_X2 ? this._swRx : 9999, y: swY,
        });
        if (this.timer >= BOSS_STUN_MS) {
          this._swActive = false;
          this.state     = 'patrol';
          this.timer     = 0;
          Body.setPosition(this.swBodyL, { x: -999, y: swY });
          Body.setPosition(this.swBodyR, { x: 9999, y: swY });
        }
        break;
      }
      case 'stunned':
        if (this.timer >= BOSS_STUN_MS) {
          this._weakActive = false;
          this.state       = 'patrol';
          this.timer       = 0;
        }
        break;
    }

    Body.setPosition(this.body, { x: this.x, y: this.y });
    Body.setPosition(this.weakBody, {
      x: this.x,
      y: this._weakActive ? this.y - this.bH / 2 - 5 : -9999,
    });
  }

  // スタン中に弱点を踏まれた → ダメージ
  stomp() {
    this.hp--;
    this._hitFlash   = 320;
    this._weakActive = false;
    if (this.hp <= 0) {
      this.state = 'dead';
    } else {
      this.state = 'patrol';
      this.timer = 0;
    }
  }
}

// 空中浮遊型ボス。プラットフォームを落として当てるとスタン
class BossFloat {
  constructor(x, y, world) {
    this.hp          = BOSS2_HP_MAX;
    this.bW          = BOSS2_W;
    this.bH          = BOSS2_H;
    this.x           = x;
    this.y           = y;
    this._bobT       = 0;
    this._hitFlash   = 0;
    this._weakActive = false;
    this.state       = 'drift';
    this.timer       = 0;
    this.chargeDir   = 1;
    this._tgtY       = y;     // ドリフト目標Y
    this._hoverUnder = false; // プラット下待機中フラグ
    this._swActive   = false;
    this._swVariant  = 'normal'; // 'normal' | 'delayed' | 'pulse'
    this._swLx       = -999;
    this._swRx       = 9999;
    this._chargeGrounded = false; // 突進開始時のプレイヤー地上フラグ

    const swY = BOSS_FLOOR_Y - 16;
    this.body = Bodies.rectangle(x, y, this.bW, this.bH, {
      label: 'boss', isSensor: true, isStatic: true,
    });
    this.weakBody = Bodies.rectangle(x, -9999, Math.round(this.bW * 0.55), 12, {
      label: 'bossWeak', isSensor: true, isStatic: true,
    });
    this.swBodyL = Bodies.rectangle(-999, swY, 30, 32, {
      label: 'bossShock', isSensor: true, isStatic: true,
    });
    this.swBodyR = Bodies.rectangle(9999, swY, 30, 32, {
      label: 'bossShock', isSensor: true, isStatic: true,
    });
    World.add(world, [this.body, this.weakBody, this.swBodyL, this.swBodyR]);
  }

  update(dt, playerX, playerY, playerGrounded, droppablePlats) {
    this.timer  += dt;
    this._bobT  += dt;
    if (this._hitFlash > 0) this._hitFlash -= dt;
    if (this.state === 'dead') return;

    const halfW      = this.bW / 2;
    const leftBound  = BOSS_FLOOR_X1 + halfW + 10;
    const rightBound = BOSS_FLOOR_X2 - halfW - 10;
    const floorY     = BOSS_FLOOR_Y - 24 - this.bH / 2;
    const bob        = Math.sin(this._bobT * 0.003) * 6;

    switch (this.state) {
      case 'drift': {
        const dir = playerX > this.x ? 1 : -1;
        this.x += dir * BOSS2_DRIFT_SPD * (dt / 16.67);
        this.x  = Math.max(leftBound, Math.min(rightBound, this.x));
        // 目標Y へ補間（前ステートからのワープ防止）
        this.y += (this._tgtY + bob - this.y) * Math.min(1, 4 * dt / 1000);
        if (this.timer >= BOSS2_DRIFT_MS) {
          this.timer = 0;
          const hoverChance = this.hp <= BOSS2_HP_MAX / 2 ? 0.35 : 0.65;
          const idle = (droppablePlats || []).filter(p => p.state === 'idle');
          if (Math.random() < hoverChance && idle.length > 0) {
            const tgt    = idle[Math.floor(Math.random() * idle.length)];
            this._tgtX   = tgt.origX;
            this._tgtY   = tgt.origY + PLAT_H / 2 + this.bH / 2 + 14;
            this._hoverUnder = true;
            this.state   = 'hover_under';
          } else if (Math.random() < 0.55) {
            // 突進 → windup へ（方向は windup 終了時に決定）
            this._hoverUnder = false;
            this.chargeDir = playerX >= this.x ? 1 : -1; // 視覚的な振り向き用
            this.state    = 'windup';
          } else {
            // 衝撃波
            this._hoverUnder = false;
            this.state    = 'windup_shock';
          }
        }
        break;
      }
      case 'hover_under': {
        const spd = BOSS2_DRIFT_SPD * 3 * (dt / 16.67);
        const dx  = this._tgtX - this.x;
        const dy  = this._tgtY - this.y;
        this.x += Math.abs(dx) > spd ? Math.sign(dx) * spd : dx;
        this.y += Math.abs(dy) > spd ? Math.sign(dy) * spd : dy;
        this.y += bob * 0.4;
        if (this.timer >= BOSS2_HOVER_MS) {
          this.timer       = 0;
          this._hoverUnder = false;
          this.chargeDir   = playerX >= this.x ? 1 : -1; // 視覚的な振り向き用
          this.state       = 'windup';
        }
        break;
      }
      case 'windup': {
        this.x += Math.sin(this._bobT * 0.04) * 0.6;
        this.y += (this._tgtY + bob - this.y) * Math.min(1, 4 * dt / 1000);
        if (this.timer >= BOSS2_WINDUP_MS) {
          this.timer = 0;
          this.state = 'charging';
          // 突進方向を直前のプレイヤー位置で確定
          this._chargeGrounded = playerGrounded;
          if (playerGrounded) {
            // 地上: 床面に向かってダイブ突進
            const tx  = playerX;
            const ty  = BOSS_FLOOR_Y - 60;
            const cdx = tx - this.x;
            const cdy = ty - this.y;
            const clen = Math.sqrt(cdx * cdx + cdy * cdy) || 1;
            this.chargeDX  = cdx / clen;
            this.chargeDY  = cdy / clen;
            this.chargeDir = cdx >= 0 ? 1 : -1;
          } else {
            // 空中: ホーミング初速（charging 中も追尾）
            const cdx = playerX - this.x;
            const cdy = playerY - this.y;
            const clen = Math.sqrt(cdx * cdx + cdy * cdy) || 1;
            this.chargeDX  = cdx / clen;
            this.chargeDY  = cdy / clen;
            this.chargeDir = cdx >= 0 ? 1 : -1;
          }
        }
        break;
      }
      case 'charging': {
        const spd = BOSS2_CHARGE_SPD * (dt / 16.67);

        if (!this._chargeGrounded) {
          // 空中ホーミング: 毎フレームプレイヤー方向へなめらかに旋回
          const tdx  = playerX - this.x;
          const tdy  = playerY - this.y;
          const tlen = Math.sqrt(tdx * tdx + tdy * tdy) || 1;
          const turn = 0.07; // 旋回率（高いほどシャープ）
          this.chargeDX += (tdx / tlen - this.chargeDX) * turn;
          this.chargeDY += (tdy / tlen - this.chargeDY) * turn;
          const dlen = Math.sqrt(this.chargeDX * this.chargeDX + this.chargeDY * this.chargeDY) || 1;
          this.chargeDX /= dlen;
          this.chargeDY /= dlen;
          this.chargeDir = this.chargeDX >= 0 ? 1 : -1;
        }

        this.x += this.chargeDX * spd;
        this.y += this.chargeDY * spd;
        // 縦方向 bounds 制約
        this.y = Math.max(60, Math.min(BOSS_FLOOR_Y - 80, this.y));

        const hitR = this.x >= rightBound;
        const hitL = this.x <= leftBound;
        if (hitR || hitL) {
          this.x     = hitR ? rightBound : leftBound;
          this.timer = 0;
          if (this._chargeGrounded) {
            // 地上突進 → 確定衝撃波（_tgtY を現在地固定でワープ防止）
            this._tgtY = this.y;
            this.state = 'windup_shock';
          } else {
            // 空中突進 → ドリフトへ
            this._tgtY = 240 + Math.random() * 130;
            this.state = 'drift';
          }
        }
        break;
      }
      case 'windup_shock': {
        // 赤/炎: ゆっくり溜めてから放出
        this.x += Math.sin(this._bobT * 0.04) * 0.6;
        this.y += (this._tgtY + bob - this.y) * Math.min(1, 4 * dt / 1000);
        if (this.timer >= BOSS2_WINDUP_MS) {
          this.timer     = 0;
          this.state     = 'shockwave';
          this._swLx     = this.x;
          this._swRx     = this.x;
          this._swActive = true;
        }
        break;
      }
      case 'shockwave': {
        // 赤/炎: SW_RED_SPD でゆっくり広がり、端に達しても SW_RED_MS まで継続
        const swY2 = BOSS_FLOOR_Y - 16;
        const spd2 = SW_RED_SPD * (dt / 16.67);
        this._swLx -= spd2;
        this._swRx += spd2;
        Body.setPosition(this.swBodyL, {
          x: this._swLx > BOSS_FLOOR_X1 ? this._swLx : -999, y: swY2,
        });
        Body.setPosition(this.swBodyR, {
          x: this._swRx < BOSS_FLOOR_X2 ? this._swRx : 9999, y: swY2,
        });
        if (this.timer >= SW_RED_MS) {
          this._swActive  = false;
          this._tgtY      = 240 + Math.random() * 130;
          this.state      = 'drift';
          this.timer      = 0;
          Body.setPosition(this.swBodyL, { x: -999, y: swY2 });
          Body.setPosition(this.swBodyR, { x: 9999, y: swY2 });
        }
        break;
      }
      case 'stunned': {
        this.y = floorY;
        // スタン中は衝撃波を収抴
        if (this._swActive) {
          this._swActive = false;
          const swY2 = BOSS_FLOOR_Y - 16;
          Body.setPosition(this.swBodyL, { x: -999, y: swY2 });
          Body.setPosition(this.swBodyR, { x: 9999, y: swY2 });
        }
        if (this.timer >= BOSS2_STUN_MS) {
          this._weakActive = false;
          this._tgtY = 240 + Math.random() * 130;
          this.state = 'drift';
          this.timer = 0;
        }
        break;
      }
    }

    Body.setPosition(this.body, { x: this.x, y: this.y });
    Body.setPosition(this.weakBody, {
      x: this.x,
      y: this._weakActive ? this.y - this.bH / 2 - 5 : -9999,
    });
  }

  // プラットフォームが当たった → スタン
  getHit() {
    if (this.state === 'stunned' || this.state === 'dead') return;
    this._hitFlash   = 500;
    this._weakActive = true;
    this._hoverUnder = false;
    this.state       = 'stunned';
    this.timer       = 0;
  }

  // スタン中に弱点を踏まれた → ダメージ
  stomp() {
    this.hp--;
    this._hitFlash   = 320;
    this._weakActive = false;
    if (this.hp <= 0) {
      this.state = 'dead';
    } else {
      this._tgtY = 240 + Math.random() * 130;
      this.state = 'drift';
      this.timer = 0;
    }
  }
}

// ===== BossRunner =====
// 地上疾走型ボス。プラットフォームに乗り、手動キネマティクスで物理演算。
// ダメージサイクル: charging2 → stunned → 弱点踏み (ボス1と同方式)
class BossRunner {
  constructor(x, y, world) {
    this.hp          = BOSS3_HP_MAX;
    this.bW          = BOSS3_W;
    this.bH          = BOSS3_H;
    this.x           = x;
    this.y           = y;
    this.vx          = 0;
    this.vy          = 0;
    this._onGround   = false;  // 着地中フラグ
    this._groundY    = y + this.bH / 2; // 現在の着地面Y
    this.state       = 'roaming';
    this.timer       = 0;
    this.chargeDir   = 1;
    this._weakActive = false;
    this._hitFlash   = 0;
    this._facingDir  = 1;  // 見ている方向

    this.body = Bodies.rectangle(x, y, this.bW, this.bH, {
      label: 'boss', isSensor: true, isStatic: true,
    });
    this.weakBody = Bodies.rectangle(x, -9999, Math.round(this.bW * 0.6), 12, {
      label: 'bossWeak', isSensor: true, isStatic: true,
    });
    this.swBodyL = Bodies.rectangle(-999, BOSS_FLOOR_Y - 16, 30, 32, {
      label: 'bossShock', isSensor: true, isStatic: true,
    });
    this.swBodyR = Bodies.rectangle(9999, BOSS_FLOOR_Y - 16, 30, 32, {
      label: 'bossShock', isSensor: true, isStatic: true,
    });
    World.add(world, [this.body, this.weakBody, this.swBodyL, this.swBodyR]);

    // shock_burst 管理
    this._swActive    = false;
    this._swLx        = -999;
    this._swRx        = 9999;
    this._burstCount  = 0;
    this._burstTotal  = BOSS3_BURST_COUNT;
    this._burstTimer  = 0;
    this._burstWaveOn = false; // 現在の波が展開中か
  }

  // ── 物理 ──────────────────────────────────────────────────
  // プラットフォームリスト(PlatformObj[])を受け取ってAABB着地判定
  _applyPhysics(dt, platforms) {
    const f = dt / 16.67;

    // 重力
    if (!this._onGround) {
      this.vy += BOSS3_GRAVITY * f;
    }

    this.x += this.vx * f;
    this.y += this.vy * f;

    // アリーナ横端クランプ（床がある範囲に限定）
    const halfW = this.bW / 2;
    this.x = Math.max(BOSS3_ARENA_X1 + halfW, Math.min(BOSS3_ARENA_X2 - halfW, this.x));

    // 着地判定 (プラットフォーム上面 + アリーナ床)
    this._onGround = false;
    const bL = this.x - halfW, bR = this.x + halfW;
    const bB = this.y + this.bH / 2;

    for (const plat of platforms) {
      if (plat.state === 'falling') continue;
      if (plat.body.isSensor)       continue; // 明滅床の非実体フェーズはスキップ
      const pb   = plat.body;
      const ph   = PLAT_H;
      const pL   = pb.position.x - pb.bounds.max.x + pb.position.x; // 左端
      // Matter.jsのboundsを使う
      const platL = pb.bounds.min.x;
      const platR = pb.bounds.max.x;
      const platT = pb.bounds.min.y;
      if (this.vy >= 0 &&
          bB >= platT && bB <= platT + 20 &&
          bR > platL + 4 && bL < platR - 4) {
        this.y      = platT - this.bH / 2;
        this.vy     = 0;
        this._onGround = true;
        this._groundY  = platT;
        // 着地した足場のカウントダウン開始（まだ idle なら）
        if (plat.canCollapse && plat.state === 'idle') {
          plat.state = 'countdown';
          plat.timer = 0;
        }
      }
    }

    // アリーナ床（恒久的）
    const floorT = BOSS_FLOOR_Y - 12;
    if (this.vy >= 0 && bB >= floorT && bB <= floorT + 20) {
      this.y         = floorT - this.bH / 2;
      this.vy        = 0;
      this._onGround = true;
      this._groundY  = floorT;
    }

    // 画面天井
    if (this.y - this.bH / 2 < 0) { this.y = this.bH / 2; this.vy = 0; }
  }

  // ── ステートマシン ────────────────────────────────────────
  update(dt, playerX, playerY, playerGrounded, platforms) {
    this.timer += dt;
    if (this._hitFlash > 0) this._hitFlash -= dt;
    if (this.state === 'dead') return;

    const halfW      = this.bW / 2;
    const leftBound  = BOSS3_ARENA_X1 + halfW + 8;
    const rightBound = BOSS3_ARENA_X2 - halfW - 8;
    const swY        = BOSS_FLOOR_Y - 16;

    switch (this.state) {
      // ──────────── roaming ────────────
      case 'roaming': {
        // プレイヤー方向へゆっくり歩く
        const dir = playerX > this.x ? 1 : -1;
        this._facingDir = dir;
        this.vx = dir * BOSS3_WALK_SPD;

        if (this.timer >= BOSS3_ROAM_MS) {
          this.timer = 0;
          this.vx    = 0;
          // 行動選択: チャージ 60% / ジャンプ移動 40%
          if (Math.random() < 0.60) {
            this.chargeDir  = playerX > this.x ? 1 : -1;
            this._facingDir = this.chargeDir;
            this.state      = 'windup_charge';
          } else {
            this.state = 'jump_to_plat';
            this.timer = 0;
            this._launchJump(playerX, platforms);
          }
        }
        break;
      }

      // ──────────── windup_charge ────────────
      case 'windup_charge': {
        // 溜め中は震える
        this.vx = Math.sin(this.timer * 0.04) * 1.5;
        if (this.timer >= BOSS3_WINDUP_MS) {
          this.timer     = 0;
          this.state     = 'charging';
        }
        break;
      }

      // ──────────── charging ────────────
      case 'charging': {
        this.vx = this.chargeDir * BOSS3_CHARGE_SPD;
        const hitR = this.x >= rightBound;
        const hitL = this.x <= leftBound;
        if (hitR || hitL) {
          this.x          = hitR ? rightBound : leftBound;
          this.chargeDir *= -1;
          this._facingDir = this.chargeDir;
          this.vx         = this.chargeDir * BOSS3_CHARGE2_SPD;
          this.state      = 'charging2';
          this.timer      = 0;
        }
        break;
      }

      // ──────────── charging2 (高速連続突進) ────────────
      case 'charging2': {
        this.vx = this.chargeDir * BOSS3_CHARGE2_SPD;
        const hitR2 = this.x >= rightBound;
        const hitL2 = this.x <= leftBound;
        if (hitR2 || hitL2) {
          this.x           = hitR2 ? rightBound : leftBound;
          this.vx          = 0;
          this.vy          = 0;
          this.y           = BOSS_FLOOR_Y - 12 - this.bH / 2;
          this._onGround   = true;
          this.state       = 'stunned';
          this.timer       = 0;
          this._weakActive = true;
          this._hitFlash   = 300;
        }
        break;
      }

      // ──────────── stunned ────────────
      case 'stunned': {
        this.vx = 0;
        if (this.timer >= BOSS3_STUN_MS) {
          this._weakActive = false;
          this.state       = 'roaming';
          this.timer       = 0;
        }
        break;
      }

      // ──────────── jump_to_plat ────────────
      case 'jump_to_plat': {
        // 空中は何もしない（物理に任せる）
        if (this._onGround && this.timer > 200) {
          // 着地 → ショックバースト
          this.startBurst();
        }
        break;
      }

      // ──────────── shock_burst ────────────
      case 'shock_burst': {
        this.vx = 0;
        this._burstTimer += dt;

        // 現在の波が展開中 → 移動させる
        if (this._burstWaveOn) {
          const spd = BOSS3_SHOCK_SPD * (dt / 16.67);
          this._swLx -= spd;
          this._swRx += spd;
          const atEdge = this._swLx <= BOSS3_ARENA_X1 && this._swRx >= BOSS3_ARENA_X2;
          if (atEdge || this._burstTimer >= 390) {
            // 波を消す
            this._swActive    = false;
            this._burstWaveOn = false;
            Body.setPosition(this.swBodyL, { x: -999, y: swY });
            Body.setPosition(this.swBodyR, { x: 9999, y: swY });
            this._burstTimer = 0;
            // 全波終了？
            if (this._burstCount >= this._burstTotal) {
              this.state = 'roaming';
              this.timer = 0;
            }
          } else {
            Body.setPosition(this.swBodyL, {
              x: this._swLx > BOSS3_ARENA_X1 ? this._swLx : -999, y: swY,
            });
            Body.setPosition(this.swBodyR, {
              x: this._swRx < BOSS3_ARENA_X2 ? this._swRx : 9999, y: swY,
            });
          }
        } else if (this._burstTimer >= (BOSS3_BURST_GAPS[this._burstCount - 1] ?? 300)) {
          // 次の波を発射
          this._swLx        = this.x;
          this._swRx        = this.x;
          this._swActive    = true;
          this._burstWaveOn = true;
          this._burstCount++;
          this._burstTimer  = 0;
        }
        break;
      }
    }

    // 物理適用
    this._applyPhysics(dt, platforms);
    if (this._onGround) this.vy = 0;

    // センサー位置同期
    Body.setPosition(this.body, { x: this.x, y: this.y });
    Body.setPosition(this.weakBody, {
      x: this.x,
      y: this._weakActive ? this.y - this.bH / 2 - 6 : -9999,
    });
  }

  // 足場リストから最適な着地目標を選んでジャンプ
  _launchJump(playerX, platforms) {
    const candidates = platforms.filter(p =>
      p.state !== 'falling' && !p.body.isSensor && p.canCollapse
    );
    let tgt = null;
    if (candidates.length > 0) {
      // プレイヤーに近い足場を優先
      candidates.sort((a, b) =>
        Math.abs(a.body.position.x - playerX) - Math.abs(b.body.position.x - playerX)
      );
      tgt = candidates[0];
    }
    const targetX = tgt ? tgt.body.position.x : playerX;
    const targetY = tgt ? tgt.body.bounds.min.y : BOSS_FLOOR_Y - 12;

    // 放物線: vx を距離に応じて設定、vy は固定
    const dx = targetX - this.x;
    const t  = Math.abs(BOSS3_JUMP_VY) / BOSS3_GRAVITY; // 頂点到達フレーム数
    this.vx = dx / (t * 2);
    this.vy = BOSS3_JUMP_VY;
    this._onGround = false;
  }

  // プレイヤーが弱点を踏んだ
  stomp() {
    this.hp--;
    this._hitFlash   = 320;
    this._weakActive = false;
    if (this.hp <= 0) {
      this.state = 'dead';
      this.vx    = 0;
    } else {
      this.state = 'roaming';
      this.timer = 0;
    }
  }

  // 衝撃波バーストを開始
  startBurst() {
    if (this.state === 'shock_burst') return;
    this.state        = 'shock_burst';
    this.timer        = 0;
    this._burstCount  = 1;           // 1波目を即発射するので1からスタート
    this._burstWaveOn = true;        // 即発射
    this._burstTimer  = 0;
    this._swActive    = true;
    this.vx           = 0;
    const swY = BOSS_FLOOR_Y - 16;
    this._swLx = this.x;
    this._swRx = this.x;
    Body.setPosition(this.swBodyL, { x: this.x, y: swY });
    Body.setPosition(this.swBodyR, { x: this.x, y: swY });
  }
}

// ===== BossStriker =====
// 前隙タイミング型。windup後半に弱点を晒す。
// 踏まれた → stunned。見逃した → 超高速charging → wall hit → shock_burst。
class BossStriker {
  constructor(x, y, world) {
    this.hp          = BOSS4_HP_MAX;
    this.bW          = BOSS4_W;
    this.bH          = BOSS4_H;
    this.x           = x;
    this.y           = y;
    this.chargeDir   = 1;
    this.state       = 'patrol';   // patrol|windup|charging|windup_shock|shock_burst|stunned|dead
    this.timer       = 0;
    this._weakActive = false;
    this._hitFlash   = 0;
    this._swActive   = false;
    this._swLx       = -999;
    this._swRx       = 9999;
    this._burstCount = 0;
    this._burstTimer = 0;
    this._burstWaveOn= false;
    this._attackType = 'rush';    // 'rush' | 'wide'  交互に切替
    this._chargeTargetX = W / 2;

    const swY = BOSS_FLOOR_Y - 16;
    this.body = Bodies.rectangle(x, y, this.bW, this.bH, {
      label: 'boss', isSensor: true, isStatic: true,
    });
    // weakBody: windup中の前隙ウィンドウのみ頭上に出現
    this.weakBody = Bodies.rectangle(x, -9999, Math.round(this.bW * 0.55), 12, {
      label: 'bossWeak', isSensor: true, isStatic: true,
    });
    this.swBodyL = Bodies.rectangle(-999, swY, 30, 32, {
      label: 'bossShock', isSensor: true, isStatic: true,
    });
    this.swBodyR = Bodies.rectangle(9999, swY, 30, 32, {
      label: 'bossShock', isSensor: true, isStatic: true,
    });
    World.add(world, [this.body, this.weakBody, this.swBodyL, this.swBodyR]);
  }

  update(dt, playerX) {
    this.timer += dt;
    if (this._hitFlash > 0) this._hitFlash -= dt;
    if (this.state === 'dead') return;

    const halfW      = this.bW / 2;
    const leftBound  = BOSS4_ARENA_X1 + halfW + 10;
    const rightBound = BOSS4_ARENA_X2 - halfW - 10;
    const floorSurf  = BOSS_FLOOR_Y - 12 - this.bH / 2;
    const swY        = BOSS_FLOOR_Y - 16;

    switch (this.state) {
      case 'patrol': {
        const dir = playerX > this.x ? 1 : -1;
        this.x += dir * BOSS4_WALK_SPD * (dt / 16.67);
        this.x = Math.max(leftBound, Math.min(rightBound, this.x));
        if (this.timer >= BOSS4_ROAM_MS) {
          this.chargeDir = playerX > this.x ? 1 : -1;
          this.state = 'windup';
          this.timer = 0;
        }
        break;
      }
      case 'windup': {
        // 後半 BOSS4_WINDOW_MS で weakBody を露出（前隙ウィンドウ）
        const windowStart = BOSS4_WINDUP_MS - BOSS4_WINDOW_MS;
        this._weakActive = this.timer >= windowStart;
        if (this.timer >= BOSS4_WINDUP_MS) {
          this._weakActive = false;
          if (this._attackType === 'rush') {
            // ラッシュ型: windup終了時点のプレイヤーX座標へ急接近
            this._chargeTargetX = Math.max(leftBound, Math.min(rightBound, playerX));
            this.chargeDir = this._chargeTargetX > this.x ? 1 : -1;
          } else {
            // ワイド型: チャージ方向の壁まで突進
            this._chargeTargetX = this.chargeDir > 0 ? rightBound : leftBound;
          }
          this.state = 'charging';
          this.timer = 0;
        }
        break;
      }
      case 'charging': {
        this.x += this.chargeDir * BOSS4_CHARGE_SPD * (dt / 16.67);
        const hitTarget = this.chargeDir > 0
          ? this.x >= this._chargeTargetX
          : this.x <= this._chargeTargetX;
        if (hitTarget) {
          this.x     = this._chargeTargetX;
          this.state = 'windup_shock';
          this.timer = 0;
        }
        break;
      }
      case 'windup_shock': {
        if (this.timer >= 500) {
          this._startBurst();
        }
        break;
      }
      case 'shock_burst': {
        this._burstTimer += dt;
        if (this._burstWaveOn) {
          // 衝撃波を展開中
          const spd = BOSS4_SHOCK_SPD * (dt / 16.67);
          this._swLx -= spd;
          this._swRx += spd;
          const atEdge = this._swLx <= BOSS4_ARENA_X1 && this._swRx >= BOSS4_ARENA_X2;
          Body.setPosition(this.swBodyL, {
            x: this._swLx > BOSS4_ARENA_X1 ? this._swLx : -999, y: swY,
          });
          Body.setPosition(this.swBodyR, {
            x: this._swRx < BOSS4_ARENA_X2 ? this._swRx : 9999, y: swY,
          });
          if (atEdge || this._burstTimer >= SW_BLUE_WAVE_MS) {
            // この波終了
            this._swActive = false;
            this._burstWaveOn = false;
            Body.setPosition(this.swBodyL, { x: -999, y: swY });
            Body.setPosition(this.swBodyR, { x: 9999, y: swY });
            if (this._burstCount >= BOSS4_BURST_COUNT) {
              // 全波完了 → patrol（次は rush 型）
              this.state       = 'patrol';
              this.timer       = 0;
              this._burstCount = 0;
              this._attackType = 'rush';
            } else {
              // 次波待機 (BURST_GAPS[burstCount-1])
              this._burstTimer = 0;
            }
          }
        } else {
          // 次の波の発射待ち
          const gap = BOSS4_BURST_GAPS[this._burstCount - 1] ?? 300;
          if (this._burstTimer >= gap) {
            this._burstCount++;
            this._burstTimer  = 0;
            this._burstWaveOn = true;
            this._swActive    = true;
            this._swLx = this.x;
            this._swRx = this.x;
            Body.setPosition(this.swBodyL, { x: this.x, y: swY });
            Body.setPosition(this.swBodyR, { x: this.x, y: swY });
          }
        }
        break;
      }
      case 'shock_local': {
        // ラッシュ型: プレイヤー位置付近への局所衝撃波
        this._burstTimer += dt;
        if (this._burstWaveOn) {
          const spd = BOSS4_SHOCK_SPD * 1.2 * (dt / 16.67);
          this._swLx -= spd;
          this._swRx += spd;
          const reachedLimit = (this._swRx - this.x) >= BOSS4_LOCAL_SHOCK_RANGE;
          Body.setPosition(this.swBodyL, {
            x: this._swLx > BOSS4_ARENA_X1 ? this._swLx : -999, y: swY,
          });
          Body.setPosition(this.swBodyR, {
            x: this._swRx < BOSS4_ARENA_X2 ? this._swRx : 9999, y: swY,
          });
          if (reachedLimit || this._burstTimer >= SW_BLUE_WAVE_MS) {
            this._swActive    = false;
            this._burstWaveOn = false;
            Body.setPosition(this.swBodyL, { x: -999, y: swY });
            Body.setPosition(this.swBodyR, { x: 9999, y: swY });
            if (this._burstCount >= BOSS4_BURST_COUNT) {
              // 全波完了 → patrol（次は wide 型）
              this.state       = 'patrol';
              this.timer       = 0;
              this._burstCount = 0;
              this._attackType = 'wide';
            } else {
              this._burstTimer = 0;
            }
          }
        } else {
          const gap = BOSS4_BURST_GAPS[this._burstCount - 1] ?? 300;
          if (this._burstTimer >= gap) {
            this._burstCount++;
            this._burstTimer  = 0;
            this._burstWaveOn = true;
            this._swActive    = true;
            this._swLx = this.x;
            this._swRx = this.x;
            Body.setPosition(this.swBodyL, { x: this.x, y: swY });
            Body.setPosition(this.swBodyR, { x: this.x, y: swY });
          }
        }
        break;
      }
      case 'stunned': {
        // スタン: 床に固定、弱点露出
        this.y = floorSurf;
        if (this.timer >= BOSS4_STUN_MS) {
          this._weakActive = false;
          this.state       = 'patrol';
          this.timer       = 0;
        }
        break;
      }
    }

    Body.setPosition(this.body, { x: this.x, y: this.y });
    Body.setPosition(this.weakBody, {
      x: this.x,
      y: this._weakActive ? this.y - this.bH / 2 - 5 : -9999,
    });
  }

  _startBurst() {
    if (this.state === 'shock_burst' || this.state === 'shock_local') return;
    this.state        = this._attackType === 'wide' ? 'shock_burst' : 'shock_local';
    this.timer        = 0;
    this._burstCount  = 1;
    this._burstWaveOn = true;
    this._burstTimer  = 0;
    this._swActive    = true;
    const swY = BOSS_FLOOR_Y - 16;
    this._swLx = this.x;
    this._swRx = this.x;
    Body.setPosition(this.swBodyL, { x: this.x, y: swY });
    Body.setPosition(this.swBodyR, { x: this.x, y: swY });
  }

  // 前隙ウィンドウ中に弱点を踏まれた → 即スタン（弱点はスタン中も続く）
  stompWeak() {
    if (this.state !== 'windup') return;
    this._weakActive = true;   // スタン中も弱点を攀す
    this._hitFlash   = 500;
    this.state       = 'stunned';
    this.timer       = 0;
  }

  // スタン中に弱点を踏まれた → ダメージ
  stomp() {
    this.hp--;
    this._hitFlash   = 320;
    this._weakActive = false;
    if (this.hp <= 0) {
      this.state = 'dead';
    } else {
      this.state = 'patrol';
      this.timer = 0;
    }
  }
}

// ===== LeaperMinion =====
// BossLeaper が perch 中に投下する落下雑魚。重力あり、バウンスあり。
// 上から踏む → 超大ジャンプ台。横から触れる → ノックバック。
class LeaperMinion {
  constructor(x, y, world) {
    this.x   = x;
    this.y   = y;
    this.life = BOSS5_MINION_LIFE;
    this.body = Bodies.rectangle(x, y, 26, 26, {
      restitution: BOSS5_MINION_BOUNCE,
      friction:    0.18,
      frictionAir: 0.01,
      label: 'leaperMinion',
      isStatic: false,
    });
    // 落下時に左右少しランダムに散らす
    Body.setVelocity(this.body, {
      x: (Math.random() - 0.5) * 3.5,
      y: 2,
    });
    World.add(world, this.body);
  }

  update(dt) {
    this.life -= dt;
    this.x = this.body.position.x;
    this.y = this.body.position.y;
  }

  get isDead()     { return this.life <= 0; }
  get fadeAlpha()  {
    if (this.life > BOSS5_MINION_FADE) return 1;
    return Math.max(0, this.life / BOSS5_MINION_FADE);
  }
  get spinAngle()  { return this.body.angle; }
}

// ===== BossFinal =====
// 3形態最終ボス。HP6→4→2の閾値で形態遷移。
// 形態1(地上突進): 壁激突スタン→踏みダメ。HP4以下でスピードアップ。
// 形態2(空中浮遊): 浮遊中を踏む→即ダメ。着地後バースト（緑衝撃波）。
// 形態3(前隙型):  windup後半の一瞬だけ弱点露出。青衝撃波多波。
class BossFinal {
  constructor(x, y, world) {
    this.hp    = BOSS6_HP_MAX;
    this.bW    = BOSS6_W;
    this.bH    = BOSS6_H;
    this.x     = x;
    this.y     = y;
    this.form  = 1;           // 1|2|3
    this.state = 'patrol';    // 形態により使う状態が変わる
    this.timer = 0;
    this.chargeDir   = 1;
    this._weakActive = false;
    this._hitFlash   = 0;
    this._pattern    = 'A';
    // 衝撃波
    this._swLx = -999; this._swRx = 9999; this._swActive = false;
    this._burstWaveOn = false; this._burstCount = 0; this._burstTimer = 0;
    // 形態2用
    this.vy = 0;
    this._diveTargetX = x;
    this._transitioning = false; // 形態遷移エフェクト中
    this._transTimer    = 0;
    // 形態3
    this._attackType = 'wide';

    const swY = BOSS_FLOOR_Y - 16;
    this.body = Bodies.rectangle(x, y, this.bW, this.bH, {
      label: 'boss', isSensor: true, isStatic: true,
    });
    this.weakBody = Bodies.rectangle(x, -9999, Math.round(this.bW * 0.55), 14, {
      label: 'bossWeak', isSensor: true, isStatic: true,
    });
    this.swBodyL = Bodies.rectangle(-999, swY, 40, 32, {
      label: 'bossShock', isSensor: true, isStatic: true,
    });
    this.swBodyR = Bodies.rectangle(9999, swY, 40, 32, {
      label: 'bossShock', isSensor: true, isStatic: true,
    });
    World.add(world, [this.body, this.weakBody, this.swBodyL, this.swBodyR]);
  }

  update(dt, playerX, world) {
    this.timer += dt;
    if (this._hitFlash > 0) this._hitFlash -= dt;
    if (this.state === 'dead') return;

    // 遷移エフェクト中は静止
    if (this._transitioning) {
      this._transTimer += dt;
      if (this._transTimer >= 1200) {
        this._transitioning = false;
        this._transTimer    = 0;
        this._enterForm(this.form, playerX);
      }
      Body.setPosition(this.body,    { x: this.x, y: this.y });
      Body.setPosition(this.weakBody,{ x: this.x, y: -9999 });
      return;
    }

    const swY        = BOSS_FLOOR_Y - 16;
    const floorSurf  = BOSS_FLOOR_Y - 12 - this.bH / 2;
    const leftBound  = BOSS6_ARENA_X1 + this.bW / 2 + 10;
    const rightBound = BOSS6_ARENA_X2 - this.bW / 2 - 10;

    if (this.form === 1) this._updateForm1(dt, playerX, leftBound, rightBound, swY, floorSurf);
    if (this.form === 2) this._updateForm2(dt, playerX, leftBound, rightBound, swY, floorSurf);
    if (this.form === 3) this._updateForm3(dt, playerX, leftBound, rightBound, swY, floorSurf);

    Body.setPosition(this.body, { x: this.x, y: this.y });
    Body.setPosition(this.weakBody, {
      x: this.x,
      y: this._weakActive ? this.y - this.bH / 2 - 6 : -9999,
    });
  }

  // ---- 形態1: 地上突進 (Boss1ベース) ----
  _updateForm1(dt, playerX, leftBound, rightBound, swY, floorSurf) {
    const chargeSPD = this.hp <= 4 ? BOSS6_F1_CHARGE2_SPD : BOSS6_F1_CHARGE_SPD;
    switch (this.state) {
      case 'patrol': {
        const dir = playerX > this.x ? 1 : -1;
        this.x += dir * 2.0 * (dt / 16.67);
        this.x = Math.max(leftBound, Math.min(rightBound, this.x));
        if (this.timer >= BOSS6_F1_PATROL_MS) {
          this.chargeDir = playerX > this.x ? 1 : -1;
          this._pattern  = Math.random() < 0.45 ? 'B' : 'A';
          this.state = 'windup'; this.timer = 0;
        }
        break;
      }
      case 'windup':
        if (this.timer >= BOSS6_F1_WINDUP_MS) { this.state = 'charging'; this.timer = 0; }
        break;
      case 'charging': {
        this.x += this.chargeDir * chargeSPD * (dt / 16.67);
        const hitR = this.chargeDir > 0 && this.x >= rightBound;
        const hitL = this.chargeDir < 0 && this.x <= leftBound;
        if (hitR || hitL) {
          this.x = hitR ? rightBound : leftBound;
          this.chargeDir *= -1;
          if (this._pattern === 'B') {
            this.state = 'charging2'; this.timer = 0;
          } else {
            this.state = 'windup_shock'; this.timer = 0;
          }
        }
        break;
      }
      case 'charging2': {
        this.x += this.chargeDir * chargeSPD * (dt / 16.67);
        const hitR2 = this.chargeDir > 0 && this.x >= rightBound;
        const hitL2 = this.chargeDir < 0 && this.x <= leftBound;
        if (hitR2 || hitL2) {
          this.x = hitR2 ? rightBound : leftBound;
          this.state = 'stunned'; this.timer = 0; this._weakActive = true;
        }
        break;
      }
      case 'windup_shock':
        if (this.timer >= BOSS6_F1_WINDUP_MS) {
          this.state = 'shockwave'; this.timer = 0;
          this._swLx = this.x; this._swRx = this.x; this._swActive = true;
        }
        break;
      case 'shockwave': {
        // 赤/炎: ゆっくり
        const spd = SW_RED_SPD * (dt / 16.67);
        this._swLx -= spd; this._swRx += spd;
        Body.setPosition(this.swBodyL, { x: this._swLx > BOSS6_ARENA_X1 ? this._swLx : -999, y: swY });
        Body.setPosition(this.swBodyR, { x: this._swRx < BOSS6_ARENA_X2 ? this._swRx : 9999, y: swY });
        if (this.timer >= SW_RED_MS) {
          this._swActive = false;
          Body.setPosition(this.swBodyL, { x: -999, y: swY });
          Body.setPosition(this.swBodyR, { x: 9999, y: swY });
          this.state = 'patrol'; this.timer = 0;
        }
        break;
      }
      case 'stunned':
        if (this.timer >= BOSS6_F1_STUN_MS) {
          this._weakActive = false; this.state = 'patrol'; this.timer = 0;
        }
        break;
    }
  }

  // ---- 形態2: 空中浮遊 (Boss5ベース) ----
  _updateForm2(dt, playerX, leftBound, rightBound, swY, floorSurf) {
    switch (this.state) {
      case 'jump_up': {
        this.vy += BOSS6_F2_GRAVITY * (dt / 16.67);
        this.y  += this.vy * (dt / 16.67);
        if (this.y <= BOSS6_F2_PERCH_Y + this.bH / 2) {
          this.y = BOSS6_F2_PERCH_Y + this.bH / 2; this.vy = 0;
          this.state = 'perch'; this.timer = 0;
          this._weakActive = true;
        } else if (this.y >= floorSurf && this.vy > 0) {
          this.y = floorSurf; this.vy = BOSS6_F2_JUMP_VY;
        }
        break;
      }
      case 'perch': {
        const driftDir = playerX > this.x ? 1 : -1;
        this.x += driftDir * 1.4 * (dt / 16.67);
        this.x  = Math.max(leftBound, Math.min(rightBound, this.x));
        this.y  = BOSS6_F2_PERCH_Y + this.bH / 2 + Math.sin(this.timer * 0.004) * 12;
        if (this.timer >= BOSS6_F2_PERCH_MS) {
          this._weakActive  = false;
          this._diveTargetX = Math.max(leftBound, Math.min(rightBound, playerX));
          this.state = 'dive_warn'; this.timer = 0;
        }
        break;
      }
      case 'dive_warn': {
        this.y += 0.8 * (dt / 16.67);
        this._weakActive = false;
        if (this.timer >= BOSS6_F2_WARN_MS) {
          this.state = 'diving'; this.timer = 0; this.vy = 0;
        }
        break;
      }
      case 'diving': {
        this.vy += BOSS6_F2_DIVE_GRAV * (dt / 16.67);
        this.y  += this.vy * (dt / 16.67);
        if (this.y >= floorSurf) {
          this.y = floorSurf; this.vy = 0;
          this._startBurst2();
        }
        break;
      }
      case 'shockwave': {
        // 緑/風: 高速で広がる
        this._burstTimer += dt;
        if (this._burstWaveOn) {
          const spd = SW_GREEN_SPD * (dt / 16.67);
          this._swLx -= spd; this._swRx += spd;
          const atEdge = this._swLx <= 0 && this._swRx >= W;
          Body.setPosition(this.swBodyL, { x: this._swLx > 0 ? this._swLx : -999, y: swY });
          Body.setPosition(this.swBodyR, { x: this._swRx < W ? this._swRx : 9999, y: swY });
          if (atEdge || this._burstTimer >= SW_GREEN_WAVE_MS) {
            this._swActive = false; this._burstWaveOn = false;
            Body.setPosition(this.swBodyL, { x: -999, y: swY });
            Body.setPosition(this.swBodyR, { x: 9999, y: swY });
            if (this._burstCount >= BOSS6_F2_BURST) {
              this.state = 'jump_up'; this.timer = 0; this.vy = BOSS6_F2_JUMP_VY;
              this._burstCount = 0;
            } else { this._burstTimer = 0; }
          }
        } else {
          if (this._burstTimer >= 160) {
            this._burstCount++; this._burstTimer = 0;
            this._burstWaveOn = true; this._swActive = true;
            this._swLx = this.x; this._swRx = this.x;
            Body.setPosition(this.swBodyL, { x: this.x, y: swY });
            Body.setPosition(this.swBodyR, { x: this.x, y: swY });
          }
        }
        break;
      }
    }
  }

  _startBurst2() {
    this.state = 'shockwave'; this.timer = 0;
    this._burstCount = 0; this._burstWaveOn = false;
    this._burstTimer = 0; this._swActive = false;
  }

  // ---- 形態3: 前隙タイミング (Boss4ベース) ----
  _updateForm3(dt, playerX, leftBound, rightBound, swY, floorSurf) {
    switch (this.state) {
      case 'patrol': {
        const dir = playerX > this.x ? 1 : -1;
        this.x += dir * 2.5 * (dt / 16.67);
        this.x = Math.max(leftBound, Math.min(rightBound, this.x));
        if (this.timer >= BOSS6_F3_PATROL_MS) {
          this.chargeDir = playerX > this.x ? 1 : -1;
          this.state = 'windup'; this.timer = 0;
        }
        break;
      }
      case 'windup': {
        const windowStart = BOSS6_F3_WINDUP_MS - BOSS6_F3_WINDOW_MS;
        this._weakActive = this.timer >= windowStart;
        if (this.timer >= BOSS6_F3_WINDUP_MS) {
          this._weakActive = false;
          this.state = 'charging'; this.timer = 0;
        }
        break;
      }
      case 'charging': {
        this.x += this.chargeDir * BOSS6_F3_CHARGE_SPD * (dt / 16.67);
        const hitR = this.chargeDir > 0 && this.x >= rightBound;
        const hitL = this.chargeDir < 0 && this.x <= leftBound;
        if (hitR || hitL) {
          this.x = hitR ? rightBound : leftBound;
          this.state = 'windup_shock'; this.timer = 0;
        }
        break;
      }
      case 'windup_shock':
        if (this.timer >= 500) { this._startBurst3(); }
        break;
      case 'shock_burst': {
        this._burstTimer += dt;
        if (this._burstWaveOn) {
          // 青/水: 中速多波
          const spd = SW_BLUE_SPD * (dt / 16.67);
          this._swLx -= spd; this._swRx += spd;
          const atEdge = this._swLx <= BOSS6_ARENA_X1 && this._swRx >= BOSS6_ARENA_X2;
          Body.setPosition(this.swBodyL, { x: this._swLx > BOSS6_ARENA_X1 ? this._swLx : -999, y: swY });
          Body.setPosition(this.swBodyR, { x: this._swRx < BOSS6_ARENA_X2 ? this._swRx : 9999, y: swY });
          if (atEdge || this._burstTimer >= SW_BLUE_WAVE_MS) {
            this._swActive = false; this._burstWaveOn = false;
            Body.setPosition(this.swBodyL, { x: -999, y: swY });
            Body.setPosition(this.swBodyR, { x: 9999, y: swY });
            if (this._burstCount >= BOSS6_F3_BURST) {
              this.state = 'stunned'; this.timer = 0;
              this._weakActive = true; this._burstCount = 0;
            } else { this._burstTimer = 0; }
          }
        } else {
          if (this._burstTimer >= 80) {
            this._burstCount++; this._burstTimer = 0;
            this._burstWaveOn = true; this._swActive = true;
            this._swLx = this.x; this._swRx = this.x;
            Body.setPosition(this.swBodyL, { x: this.x, y: swY });
            Body.setPosition(this.swBodyR, { x: this.x, y: swY });
          }
        }
        break;
      }
      case 'stunned':
        if (this.timer >= BOSS6_F3_STUN_MS) {
          this._weakActive = false; this.state = 'patrol'; this.timer = 0;
        }
        break;
    }
  }

  _startBurst3() {
    this.state = 'shock_burst'; this.timer = 0;
    this._burstCount = 0; this._burstWaveOn = false;
    this._burstTimer = 0; this._swActive = false;
  }

  // ---- 形態遷移 ----
  _enterForm(form, playerX) {
    const floorSurf = BOSS_FLOOR_Y - 12 - this.bH / 2;
    if (form === 2) {
      this.y = floorSurf;
      this.state = 'jump_up'; this.timer = 0;
      this.vy = BOSS6_F2_JUMP_VY;
      this._weakActive = false;
    } else if (form === 3) {
      this.y = floorSurf;
      this.state = 'patrol'; this.timer = 0;
      this._weakActive = false;
      this.chargeDir = playerX > this.x ? 1 : -1;
    }
    // 衝撃波リセット
    const swY = BOSS_FLOOR_Y - 16;
    this._swActive = false; this._burstWaveOn = false; this._burstCount = 0;
    Body.setPosition(this.swBodyL, { x: -999, y: swY });
    Body.setPosition(this.swBodyR, { x: 9999, y: swY });
  }

  // ---- ダメージ ----
  // 形態1: stunned中に踏む
  stomp() {
    if (this.state !== 'stunned') return;
    this._dealDamage();
  }

  // 形態2: 浮遊中に踏む / 形態3: windup前隙中に踏む
  stompWeak() {
    if (this.form === 2) {
      if (this.state !== 'perch') return;
    } else if (this.form === 3) {
      if (this.state !== 'windup' || !this._weakActive) return;
      // 前隙ヒット → スタンへ
      this._weakActive = true;
      this._hitFlash   = 500;
      this.state = 'stunned'; this.timer = 0;
      this._dealDamage();
      return;
    } else { return; }
    this._dealDamage();
  }

  _dealDamage() {
    this.hp--;
    this._hitFlash   = 400;
    this._weakActive = false;
    if (this.hp <= 0) {
      this.state = 'dead';
      return;
    }
    // 形態遷移チェック
    if (this.form === 1 && this.hp <= 4) {
      this.form = 2; this._transitioning = true; this._transTimer = 0;
    } else if (this.form === 2 && this.hp <= 2) {
      this.form = 3; this._transitioning = true; this._transTimer = 0;
    } else if (this.form === 1) {
      this.state = 'patrol'; this.timer = 0;
    } else if (this.form === 2) {
      // ダメージ後即ジャンプに戻る
      this.state = 'jump_up'; this.timer = 0; this.vy = BOSS6_F2_JUMP_VY;
    } else {
      this.state = 'patrol'; this.timer = 0;
    }
  }
}

// ===== BossLeaper =====
// 高空停留 + ミニオン投下 + 急降下爆撃型。
// jump_up → perch（ミニオン投下, 弱点露出 [非バーサーク時]）
//   → dive_warn → diving（弱点露出 [非バーサーク時]）→ shockwave → jump_up
//   弱点踏み → HP-1 + バーサーク（一定期間、弱点非露出・攻撃強化）→後に解除で通常に戻る
class BossLeaper {
  constructor(x, y, world) {
    this.hp          = BOSS5_HP_MAX;
    this.bW          = BOSS5_W;
    this.bH          = BOSS5_H;
    this.x           = x;
    this.y           = y;
    this.state       = 'jump_up'; // jump_up|perch|dive_warn|diving|shockwave|dead
    this.timer       = 0;
    this.vy          = BOSS5_JUMP_VY;
    this._weakActive = false;
    this._hitFlash   = 0;
    this.minions     = [];
    this._minionSlots    = [400, 1000, 1700]; // perch開始からの投下タイミング(2200ms perch用)
    this._minionIdx      = 0;
    this._diveTargetX    = x;
    this._swActive       = false;
    this._swLx           = -999;
    this._swRx           = 9999;
    this._burstWaveOn    = false;
    this._burstCount     = 0;
    this._burstTimer     = 0;
    this._berserk        = false; // バーサーク状態フラグ
    this._berserkTimer   = 0;    // バーサーク経遊ms

    const swY = BOSS_FLOOR_Y - 16;
    this.body     = Bodies.rectangle(x, y, this.bW, this.bH, {
      label: 'boss', isSensor: true, isStatic: true,
    });
    this.weakBody = Bodies.rectangle(x, -9999, Math.round(this.bW * 0.55), 14, {
      label: 'bossWeak', isSensor: true, isStatic: true,
    });
    this.swBodyL  = Bodies.rectangle(-999, swY, 40, 32, {
      label: 'bossShock', isSensor: true, isStatic: true,
    });
    this.swBodyR  = Bodies.rectangle(9999, swY, 40, 32, {
      label: 'bossShock', isSensor: true, isStatic: true,
    });
    World.add(world, [this.body, this.weakBody, this.swBodyL, this.swBodyR]);
  }

  update(dt, playerX, world) {
    this.timer += dt;
    if (this._hitFlash > 0) this._hitFlash -= dt;
    if (this.state === 'dead') return;

    // ミニオン更新・寿命切れ削除
    for (const m of this.minions) m.update(dt);
    const dead = this.minions.filter(m => m.isDead);
    for (const m of dead) World.remove(world, m.body);
    this.minions = this.minions.filter(m => !m.isDead);

    // ミニオン数上限（古いものから消去）
    while (this.minions.length > BOSS5_MINION_MAX) {
      const gone = this.minions.shift();
      World.remove(world, gone.body);
    }

    const floorSurf = BOSS_FLOOR_Y - 12 - this.bH / 2;
    const swY       = BOSS_FLOOR_Y - 16;
    const leftBound = BOSS5_ARENA_X1 + this.bW / 2 + 10;
    const rightBound= BOSS5_ARENA_X2 - this.bW / 2 - 10;

    switch (this.state) {
      case 'jump_up': {
        this.vy += BOSS5_GRAVITY * (dt / 16.67);
        this.y  += this.vy * (dt / 16.67);
        if (this.y <= BOSS5_PERCH_Y + this.bH / 2) {
          this.y   = BOSS5_PERCH_Y + this.bH / 2;
          this.vy  = 0;
          this.state       = 'perch';
          this.timer       = 0;
          this._minionIdx  = 0;
          this._weakActive = !this._berserk; // バーサーク中は弱点非露出
        } else if (this.y >= floorSurf && this.vy > 0) {
          // 頂点に届かず床に戻った → 再ジャンプ
          this.y  = floorSurf;
          this.vy = BOSS5_JUMP_VY;
        }
        break;
      }
      case 'perch': {
        // プレイヤー方向へゆっくりドリフト
        const driftDir = playerX > this.x ? 1 : -1;
        this.x += driftDir * 1.2 * (dt / 16.67);
        this.x  = Math.max(leftBound, Math.min(rightBound, this.x));
        // 縦ボブ（Boss2風の浮遊感）
        this.y = BOSS5_PERCH_Y + this.bH / 2 + Math.sin(this.timer * 0.0035) * 14;
        // ミニオン投下
        while (
          this._minionIdx < this._minionSlots.length &&
          this.timer >= this._minionSlots[this._minionIdx]
        ) {
          const mx = this.x + (Math.random() - 0.5) * 200;
          const my = this.y + 30;
          this.minions.push(new LeaperMinion(
            Math.max(BOSS5_ARENA_X1 + 20, Math.min(BOSS5_ARENA_X2 - 20, mx)),
            my, world
          ));
          this._minionIdx++;
        }
        if (this.timer >= (this._berserk ? BOSS5_BERSERK_PERCH_MS : BOSS5_PERCH_MS)) {
          this._weakActive   = false;
          this._diveTargetX  = Math.max(leftBound, Math.min(rightBound, playerX));
          this.state = 'dive_warn';
          this.timer = 0;
        }
        break;
      }
      case 'dive_warn': {
        // ゆっくり降下しながら予告
        this.y += 0.8 * (dt / 16.67);
        this._weakActive = false;
        if (this.timer >= BOSS5_WARN_MS) {
          this.state       = 'diving';
          this.timer       = 0;
          this.vy          = 0;
          this._weakActive = !this._berserk; // バーサーク中は弱点非露出
        }
        break;
      }
      case 'diving': {
        this.vy += BOSS5_DIVE_GRAV * (dt / 16.67);
        this.y  += this.vy * (dt / 16.67);
        if (this.y >= floorSurf) {
          this.y           = floorSurf;
          this.vy          = 0;
          this._weakActive = false;
          this._startBurst();
        }
        break;
      }
      case 'shockwave': {
        // 緑/風: 高速で画面端まで溢れる
        this._burstTimer += dt;
        if (this._burstWaveOn) {
          const spd = (this._berserk ? SW_GREEN_SPD * 1.5 : SW_GREEN_SPD) * (dt / 16.67);
          this._swLx -= spd;
          this._swRx += spd;
          // 緑: アリーナ端ではなく画面端(0/W)まで到達
          const atEdge = this._swLx <= 0 && this._swRx >= W;
          Body.setPosition(this.swBodyL, {
            x: this._swLx > 0 ? this._swLx : -999, y: swY,
          });
          Body.setPosition(this.swBodyR, {
            x: this._swRx < W ? this._swRx : 9999, y: swY,
          });
          if (atEdge || this._burstTimer >= SW_GREEN_WAVE_MS) {
            this._swActive    = false;
            this._burstWaveOn = false;
            Body.setPosition(this.swBodyL, { x: -999, y: swY });
            Body.setPosition(this.swBodyR, { x: 9999, y: swY });
            if (this._burstCount >= (this._berserk ? BOSS5_BERSERK_BURST : BOSS5_BURST_COUNT)) {
              // 地上から即ジャンプして空中へ戻る
              this.state       = 'jump_up';
              this.timer       = 0;
              this.vy          = BOSS5_JUMP_VY;
              this._burstCount = 0;
            } else {
              this._burstTimer = 0;
            }
          }
        } else {
          const gap = 180;
          if (this._burstTimer >= gap) {
            this._burstCount++;
            this._burstTimer  = 0;
            this._burstWaveOn = true;
            this._swActive    = true;
            this._swLx = this.x;
            this._swRx = this.x;
            Body.setPosition(this.swBodyL, { x: this.x, y: swY });
            Body.setPosition(this.swBodyR, { x: this.x, y: swY });
          }
        }
        break;
      }
    }

    // バーサーク解除タイマー
    if (this._berserk) {
      this._berserkTimer += dt;
      if (this._berserkTimer >= BOSS5_BERSERK_MS) {
        this._berserk      = false;
        this._berserkTimer = 0;
        // 次の perch 長入時に _weakActive = true がセットされる
      }
    }

    Body.setPosition(this.body, { x: this.x, y: this.y });
    Body.setPosition(this.weakBody, {
      x: this.x,
      y: this._weakActive ? this.y - this.bH / 2 - 6 : -9999,
    });
  }

  _startBurst() {
    if (this.state === 'shockwave') return;
    this.state        = 'shockwave';
    this.timer        = 0;
    this._burstCount  = 0;
    this._burstWaveOn = false;
    this._burstTimer  = 0;
    this._swActive    = false;
  }

  // 弱点踏み → 即ダメージ + バーサーク突入
  stompWeak() {
    if (!this._weakActive) return;
    this.hp--;
    this._hitFlash   = 500;
    this._weakActive = false;
    if (this.hp <= 0) {
      this.state = 'dead';
      this.vy    = 0;
      if (this._swActive) {
        this._swActive    = false;
        this._burstWaveOn = false;
      }
      return;
    }
    // バーサーク突入: 即 jump_up に戻る
    this._berserk      = true;
    this._berserkTimer = 0;
    if (this._swActive) {
      this._swActive    = false;
      this._burstWaveOn = false;
      this._burstCount  = 0;
    }
    this.state = 'jump_up';
    this.timer = 0;
    this.vy    = BOSS5_JUMP_VY;
  }

  stomp() { /* Boss5 では使用しない */ }
}

// ===== Game =====
export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.input  = new Input();
    // タッチデバイス判定（バーチャルパッド描画に使用）
    this._isTouchDevice = navigator.maxTouchPoints > 0;
    this._lastTime = null;
    this.heavensUnlocked = false;
    this.bestHeavensHeight = 0;
    this.debugMode = false;
    this.currentStage = 1;
    this.currentMode = 'stage'; // stage | heavens
    this._healUsedY = new Set(); // リトライ跨ぎから持越する回復済みY座標セット
    this._nextStage = 1;
    this._titleMessage = '';
    this._pendingBossPhase = 0;
    this._runSeed = 0;
    this._init({ mode: 'stage', stage: 1, lives: MAX_LIVES, newRun: true });
    this.state = 'title';
    requestAnimationFrame(t => this._loop(t));
  }

  _stageGoalHeight(stage) {
    return BASE_GOAL_HEIGHT + (stage - 1) * GOAL_STEP_HEIGHT;
  }

  _stageConfig(mode, stage) {
    if (mode === 'heavens') {
      return {
        enemyRate:   0.28 + Math.random() * 0.34,
        healInterval: HEAL_INTERVAL,
        movingRate:  0.10 + Math.random() * 0.20,
        blinkRate:   0.06 + Math.random() * 0.12,
        elevRate:    0.04 + Math.random() * 0.08,
        windRate:    0.55 + Math.random() * 0.30,
      };
    }
    // Stage 1-9: 緩温なスケール。Stage 10-18: 全要素が超高密度で四屌なスケール。
    return {
      enemyRate:    Math.min(0.22 + (stage - 1) * 0.04, 0.70),
      healInterval: stage >= 3 ? HEAL_INTERVAL : 0,
      movingRate:   stage >= 4  ? Math.min((stage - 3) * 0.08, 0.45) : 0,
      blinkRate:    stage >= 5  ? Math.min((stage - 4) * 0.06, 0.30) : 0,
      elevRate:     stage >= 6  ? Math.min((stage - 5) * 0.06, 0.26) : 0,
      windRate:     stage >= 7  ? Math.min((stage - 6) * 0.30, 0.90) : 0,
    };
  }

  // ===== 初期化 =====
  _init({ mode = 'stage', stage = 1, lives = MAX_LIVES, newRun = false, bossPhase = 1 } = {}) {
    // リトライ判定: 同じステージ・同じモードへの再入のみ healUsedY を保持
    if (newRun || stage !== this.currentStage || mode !== this.currentMode) {
      this._healUsedY.clear();
    }
    this.engine = Engine.create({ gravity: { y: 2.0 } });
    const world = this.engine.world;

    this.state = 'playing';
    this.currentMode = mode;
    this.currentStage = stage;
    this.lives = lives;
    this.maxHeightReached     = 0;
    this.platforms            = [];
    this._ridingPlatforms      = new Set(); // 乗っている移動/エレベーター床
    this._blinkAfterHeal       = false;     // 回復床直後に明滅床を配置するフラグ
    this._contacts       = 0;
    this._jumpsLeft      = 2;    // 地上=2, 空中=1, 使い切り=0
    this._canDoubleJump  = true; // 二段ジャンプ使用可否
    this._djCooldown     = 0;   // ms: 残クールタイム
    this._flashTimer     = 0;   // ms: フラッシュ残時間
    this.enemies         = [];  // 敵リスト
    this._knockbackTimer = 0;   // ms: ノックバック残時間
    this._wallHitFlash   = 0;   // ms: 壁叩きつけエフェクト残時間
    this.boss            = null; // ボスインスタンス
    this._bossPhase      = bossPhase; // 現在のボスフェーズ
    this._droppablePlats = [];   // ボス2ドロップ床リスト
    this.stageGoalHeight = this.currentMode === 'stage' ? this._stageGoalHeight(this.currentStage) : null;
    this.goalY = this.stageGoalHeight !== null ? START_Y - this.stageGoalHeight : null;
    this.currentStageConfig = mode !== 'boss' ? this._stageConfig(this.currentMode, this.currentStage) : null;

    // ステージモードはシードで配置をコントロールする
    // newRun=true(新規ゲーム開始) → _runSeedをランダム生成 → 毎回違う配置
    // newRun=false(リトライ: 死亡後) → _runSeedを引き継ぐ → 同じ配置で再挑戦
    if (mode === 'stage') {
      if (newRun) this._runSeed = (Math.random() * 0x7fffffff | 0) + 1;
      _seedRng(this._runSeed ^ (stage * 0x9e3779b9 >>> 0));
    } else {
      _unseedRng();
    }

    const spawnY = START_Y;

    // プレイヤー（回転なし）
    this.playerBody = Bodies.rectangle(W / 2, spawnY - PLAYER_H, PLAYER_W, PLAYER_H, {
      label: 'player', frictionAir: 0.06,
      friction: 0, restitution: 0,
      inertia: Infinity, inverseInertia: 0,
    });
    World.add(world, this.playerBody);

    if (mode === 'boss') {
      // ボスアリーナ専用初期化
      this.windZones = [];
      this._genFrontier  = 0;
      this._healFrontier = -9999999;
      this._windFrontier = -9999999;
      this._initBossArena(bossPhase);
    } else {
      // 地面
      this._addPlat(W / 2, spawnY, W, 20, { isGround: true, canCollapse: false });

      // 回復床（安全床・1回のみ回復）
      this._addPlat(W * 0.2, spawnY - 170, 180, PLAT_H, { isHealing: true, canCollapse: false });

      // ゴール台
      if (this.currentMode === 'stage') {
        this._addPlat(W / 2, this.goalY, 320, PLAT_H, { isGoal: true, canCollapse: false });
      }

      // 手続き生成
      this._genFrontier  = spawnY - 30;
      this._healFrontier = this.currentStageConfig.healInterval > 0
        ? spawnY - Math.round(this.stageGoalHeight * 0.55)
        : -9999999;
      this.windZones     = [];
      this._windFrontier = spawnY - 600;
      this._generateBatch(12);

      // カメラ（プレイヤーを上から65%の位置に置く）
      this.cameraTop = spawnY - H * 0.65;
    }

    // 衝突イベント
    Events.on(this.engine, 'collisionStart', e => {
      for (const { bodyA, bodyB } of e.pairs) {
        const other = bodyA === this.playerBody ? bodyB
                    : bodyB === this.playerBody ? bodyA : null;
        if (other === null) continue;

        // Matter.js: 正Y方向が下 → velocity.y > 0 で落下中
        const playerFalling = this.playerBody.velocity.y > 0;
        const playerAbove   = this.playerBody.position.y < other.position.y;

        // ボスとの衝突
        if (this.currentMode === 'boss' && this.boss && this.boss.state !== 'dead') {
          // 弱点踏みつけ → ダメージ
          if (other === this.boss.weakBody && this.boss._weakActive && playerFalling && playerAbove) {
            Body.setVelocity(this.playerBody, { x: this.playerBody.velocity.x, y: STOMP_VY });
            this._jumpsLeft = 2;
            this._knockbackTimer = 0;
            // Boss4: windup中の前隙踏み → stompWeak（スタン遷移、ダメージなし）
            if (this._bossPhase === 4 && this.boss.state === 'windup') {
              this.boss.stompWeak();
            } else if (this._bossPhase === 5) {
              // Boss5: 弱点踏み → 即ダメージ + バーサーク突入
              this.boss.stompWeak();
              if (this.boss.state === 'dead') {
                for (const m of this.boss.minions) World.remove(this.engine.world, m.body);
                this.boss.minions = [];
                this.state = 'bossclear';
              }
            } else if (this._bossPhase === 6) {
              // Boss6: 形態によって stompWeak / stomp を呼び分け
              if (this.boss.form === 1) {
                this.boss.stomp();
              } else {
                this.boss.stompWeak();
              }
              if (this.boss.state === 'dead') { this.state = 'bossclear'; }
            } else {
              this.boss.stomp();
              if (this.boss.state === 'dead') {
                this.state = 'bossclear';
              }
            }
            continue;
          }
          // Boss5 ミニオン接触
          if (this._bossPhase === 5 && this.boss.minions) {
            const hitMinion = this.boss.minions.find(m => m.body === other);
            if (hitMinion) {
              if (playerFalling && playerAbove) {
                // 上から踏む → 超大ジャンプ台 + ミニオン消滅
                Body.setVelocity(this.playerBody, {
                  x: this.playerBody.velocity.x,
                  y: BOSS5_STOMP_VY,
                });
                this._jumpsLeft = 2;
                this._knockbackTimer = 0;
                hitMinion.life = 0; // 即死
              } else if (this._knockbackTimer <= 0) {
                // 横から触れる → ノックバック
                const kx = Math.sign(this.playerBody.position.x - other.position.x) * BOSS5_KNOCK_VX;
                Body.setVelocity(this.playerBody, { x: kx, y: BOSS5_KNOCK_VY });
                this._knockbackTimer = KNOCKBACK_DURATION;
                this._contacts  = 0;
                this._jumpsLeft = 1;
              }
              continue;
            }
          }
          // 衝撃波に当たる → ノックバック
          if (this.boss.swBodyL && (other === this.boss.swBodyL || other === this.boss.swBodyR) &&
              this._knockbackTimer <= 0) {
            const kvx = this._bossPhase === 6 ? BOSS6_KNOCK_VX
                      : this._bossPhase === 5 ? BOSS5_KNOCK_VX
                      : this._bossPhase === 4 ? BOSS4_KNOCK_VX
                      : this._bossPhase === 3 ? BOSS3_KNOCK_VX
                      : this._bossPhase === 2 ? BOSS2_KNOCK_VX : BOSS_KNOCK_VX;
            const kvy = this._bossPhase === 6 ? BOSS6_KNOCK_VY
                      : this._bossPhase === 5 ? BOSS5_KNOCK_VY
                      : this._bossPhase === 4 ? BOSS4_KNOCK_VY
                      : this._bossPhase === 3 ? BOSS3_KNOCK_VY
                      : this._bossPhase === 2 ? BOSS2_KNOCK_VY : BOSS_KNOCK_VY;
            const kx = Math.sign(this.playerBody.position.x - this.boss.x) * kvx;
            Body.setVelocity(this.playerBody, { x: kx, y: kvy });
            this._knockbackTimer = KNOCKBACK_DURATION;
            this._contacts  = 0;
            this._jumpsLeft = 1;
            continue;
          }
          // 本体に触れる（スタン以外）→ ノックバック
          if (other === this.boss.body && this._knockbackTimer <= 0 &&
              this.boss.state !== 'stunned') {
            const kvx = this._bossPhase === 6 ? BOSS6_KNOCK_VX
                      : this._bossPhase === 5 ? BOSS5_KNOCK_VX
                      : this._bossPhase === 4 ? BOSS4_KNOCK_VX
                      : this._bossPhase === 3 ? BOSS3_KNOCK_VX
                      : this._bossPhase === 2 ? BOSS2_KNOCK_VX : BOSS_KNOCK_VX;
            const kvy = this._bossPhase === 6 ? BOSS6_KNOCK_VY
                      : this._bossPhase === 5 ? BOSS5_KNOCK_VY
                      : this._bossPhase === 4 ? BOSS4_KNOCK_VY
                      : this._bossPhase === 3 ? BOSS3_KNOCK_VY
                      : this._bossPhase === 2 ? BOSS2_KNOCK_VY : BOSS_KNOCK_VY;
            const kx = Math.sign(this.playerBody.position.x - this.boss.x) * kvx;
            Body.setVelocity(this.playerBody, { x: kx, y: kvy });
            this._knockbackTimer = KNOCKBACK_DURATION;
            this._contacts  = 0;
            this._jumpsLeft = 1;
            continue;
          }
        }

        // 敵との衝突
        const hitEnemy = this.enemies.find(en => en.body === other);
        if (hitEnemy) {
          if (playerFalling && playerAbove) {
            // 踏みつけ：踏み台ジャンプ + 敵ディフィート
            Body.setVelocity(this.playerBody, { x: this.playerBody.velocity.x, y: STOMP_VY });
            this._jumpsLeft = 2;
            this._knockbackTimer = 0;
            const idx = this.enemies.indexOf(hitEnemy);
            if (idx !== -1) this.enemies.splice(idx, 1);
            // 敵を画面外に吹き飛ばして即消去
            Body.setVelocity(other, {
              x: Math.sign(other.position.x - W / 2) * 12,
              y: -20,
            });
            World.remove(this.engine.world, other);
          } else if (this._knockbackTimer <= 0) {
            // 横衝突 → ノックバック
            const kx = Math.sign(this.playerBody.position.x - other.position.x) * ENEMY_KNOCK_VX;
            Body.setVelocity(this.playerBody, { x: kx, y: ENEMY_KNOCK_VY });
            this._knockbackTimer = KNOCKBACK_DURATION;
            this._contacts  = 0;
            this._jumpsLeft = 1;
          }
          continue; // _contacts は加算しない
        }

        // 台との衝突：落下着地のみ有効
        // ジャンプ中に頭が当たった場合は跳ね返るだけ（タイマー・ヒール・ジャンプリセット一切なし）
        if (!playerFalling) continue;

        this._contacts++;
        this._jumpsLeft = 2; // 着地でリセット（DJ-CTはリセットしない）
        const plat = this.platforms.find(p => p.body === other);
        if (!plat) continue;

        if (plat.isHealing && !plat.healUsed) {
          plat.healUsed = true;
          this._healUsedY.add(Math.round(plat.body.position.y)); // リトライ跨ぎで持越
          this.lives = Math.min(MAX_LIVES, this.lives + 1);
          continue;
        }

        // 移動床・エレベーター: 着地時のみ追従登録
        if (plat.isMoving || plat.isElevator) {
          this._ridingPlatforms.add(plat);
        }
        // エレベーター起動
        if (plat.isElevator) {
          plat.activateElevator();
        }

        plat.tryStartCountdown();
        if (plat.isGoal) {
          // 3ステージごとにボス戦を挿入（Stage 3→Ph1 ... 18→Ph6）
          const bossAfter = [3, 6, 9, 12, 15, 18];
          if (bossAfter.includes(this.currentStage)) {
            const phase = bossAfter.indexOf(this.currentStage) + 1;
            this._pendingBossPhase = phase;
            this._nextStage = this.currentStage + 1; // ボスクリア後の遷移先
            this.state = 'stageclear'; // 一度クリア画面を挙ってからボスへ
          } else if (this.currentStage >= HEAVENS_UNLOCK_STAGE) {
            this.heavensUnlocked = true;
            this.state = 'title';
            this._titleMessage = 'HEAVENS MODE UNLOCKED';
          } else {
            this._pendingBossPhase = 0;
            this._nextStage = this.currentStage + 1;
            this.state = 'stageclear';
          }
        }
      }
    });
    Events.on(this.engine, 'collisionEnd', e => {
      for (const { bodyA, bodyB } of e.pairs) {
        const other = bodyA === this.playerBody ? bodyB
                    : bodyB === this.playerBody ? bodyA : null;
        if (other === null) continue;
        // 敵は _contacts に影響しない（センサーなので）
        if (this.enemies.some(en => en.body === other)) continue;
        this._contacts = Math.max(0, this._contacts - 1);
        // 移動床・エレベーターから離れたら追従解除
        const leftPlat = this.platforms.find(p => p.body === other);
        if (leftPlat) this._ridingPlatforms.delete(leftPlat);
      }
    });
  }

  _addPlat(x, y, w, h, opts = {}) {
    const body = Bodies.rectangle(x, y, w, h, { isStatic: true, friction: 0.1 });
    const plat = new PlatformObj(body, opts);
    // リトライ時: 前回使用済みの回復床は即座に使用済み扱い
    if (opts.isHealing && this._healUsedY.has(Math.round(y))) {
      plat.healUsed = true;
    }
    this.platforms.push(plat);
    World.add(this.engine.world, body);
    return plat;
  }

  // 横移動床
  _addMovingPlat(x, y, w) {
    const smooth = rng() < 0.5;
    const range  = 90 + rng() * 130;
    // 端が画面外に出ないよう中心を補正
    const cx     = Math.min(Math.max(x, range + w / 2 + 20), W - range - w / 2 - 20);
    const speed  = smooth
      ? 0.8 + rng() * 1.2   // smooth: ×0.001=rad/ms → 周期3〜8秒
      : 0.06 + rng() * 0.06; // linear: 60〜120px/s
    return this._addPlat(cx, y, w, PLAT_H, {
      isMoving: true, moveType: smooth ? 'smooth' : 'linear',
      moveRange: range, moveSpeed: speed, canCollapse: true,
    });
  }

  // 明滅床
  _addBlinkingPlat(x, y, w) {
    const onMs  = 700 + rng() * 400;
    const offMs = 280 + rng() * 400;
    return this._addPlat(x, y, Math.max(100, w * 0.85), PLAT_H, {
      isBlinking: true, blinkOnMs: onMs, blinkOffMs: offMs, canCollapse: true,
    });
  }

  // エレベーター床
  _addElevatorPlat(x, y, w) {
    const travel = 260 + rng() * 180;
    const speed  = 0.09 + rng() * 0.05;
    return this._addPlat(x, y, Math.max(90, w * 0.65), PLAT_H, {
      isElevator: true, elevTravel: travel, elevSpeed: speed, canCollapse: false,
    });
  }

  _generateBatch(count) {
    let y = this._genFrontier;
    const cfg = this.currentStageConfig;
    for (let i = 0; i < count; i++) {
      y -= PLAT_Y_GAP_MIN + rng() * (PLAT_Y_GAP_MAX - PLAT_Y_GAP_MIN);
      if (this.currentMode === 'stage' && y <= this.goalY + 40) break;

      const w = PLAT_W_MIN + rng() * (PLAT_W_MAX - PLAT_W_MIN);
      const x = w / 2 + 20 + rng() * (W - w - 40);

      // 回復床の直後は明滅床を配置しない（安全マージンを確保）
      if (this._blinkAfterHeal) {
        this._blinkAfterHeal = false;
        // 明滅床を除外して通常/移動/エレベーターのみ選択
        const roll2 = rng();
        if (cfg.movingRate > 0 && roll2 < cfg.movingRate) {
          this._addMovingPlat(x, y, w);
        } else if (cfg.elevRate > 0 && roll2 < cfg.movingRate + cfg.elevRate) {
          this._addElevatorPlat(x, y, w);
        } else {
          this._addPlat(x, y, w, PLAT_H, { canCollapse: true });
          if (rng() < cfg.enemyRate) this._spawnEnemy(30 + rng() * (W - 60), y - 45 - rng() * 25);
        }
        continue;
      }

      // 回復床：固定高さフロンティアに達したら配置（healInterval 単位で定間隔）
      if (this._healFrontier > -9999999 && y <= this._healFrontier) {
        this._addPlat(x, y, Math.max(130, w * 0.7), PLAT_H, { isHealing: true, canCollapse: false });
        this._blinkAfterHeal = true;
        this._healFrontier -= this.currentStageConfig.healInterval;
        continue;
      }

      // 種別を確率選択（回復床は高さ固定方式に変更済み）
      const roll = rng();
      let cum = 0;
      let platType = 'normal';
      if (cfg.movingRate > 0 && roll < (cum += cfg.movingRate)) platType = 'moving';
      else if (cfg.blinkRate  > 0 && roll < (cum += cfg.blinkRate))  platType = 'blink';
      else if (cfg.elevRate   > 0 && roll < (cum += cfg.elevRate))   platType = 'elevator';

      switch (platType) {
        case 'moving':
          this._addMovingPlat(x, y, w);
          if (rng() < cfg.enemyRate * 0.6) {
            this._spawnEnemy(30 + rng() * (W - 60), y - 45 - rng() * 25);
          }
          break;
        case 'blink':
          this._addBlinkingPlat(x, y, w);
          break;
        case 'elevator':
          this._addElevatorPlat(x, y, w);
          break;
        default:
          this._addPlat(x, y, w, PLAT_H, { canCollapse: true });
          if (rng() < cfg.enemyRate) {
            this._spawnEnemy(30 + rng() * (W - 60), y - 45 - rng() * 25);
          }
      }
    }
    this._genFrontier = y;
  }

  // 風ゾーンを1つ生成（確率 windRate）して frontier を進める
  _generateWindZones() {
    const cfg = this.currentStageConfig;
    if (rng() >= cfg.windRate) {
      // 今回は生成なし。次のチェックポイントまで frontier を進める
      this._windFrontier -= WIND_ZONE_SPACING;
      return;
    }
    const bottom   = this._windFrontier;
    const zoneH    = WIND_ZONE_MIN_H + rng() * (WIND_ZONE_MAX_H - WIND_ZONE_MIN_H);
    const top      = bottom - zoneH;
    const strength = (rng() < 0.5 ? 1 : -1) * WIND_STRENGTH;
    this.windZones.push({ top, bottom, strength, _animT: 0 });
    this._windFrontier -= WIND_ZONE_SPACING;
  }

  _spawnEnemy(x, y) {
    const stage = this.currentStage;
    let en;
    if (stage >= 7) {
      // Stage7+: 全3種
      const roll = rng();
      if      (roll < 0.28) en = new EnemyRunner(x, y);
      else if (roll < 0.50) en = new EnemyDiver(x, y - 50);
      else                  en = new Enemy(x, y);
    } else if (stage >= 4) {
      // Stage4-6: ランナー追加
      en = rng() < 0.35 ? new EnemyRunner(x, y) : new Enemy(x, y);
    } else {
      en = new Enemy(x, y);
    }
    World.add(this.engine.world, en.body);
    this.enemies.push(en);
  }

  _loseLife() {
    if (this.debugMode) return;   // デバッグ中は無敵
    const nextLives = this.lives - 1;
    if (nextLives <= 0) {
      if (this.currentMode === 'heavens') {
        this.bestHeavensHeight = Math.max(this.bestHeavensHeight, Math.floor(this.maxHeightReached));
      }
      this.state = 'title';
      this._titleMessage = 'GAME OVER';
      return;
    }
    this._init({ mode: this.currentMode, stage: this.currentStage, lives: nextLives, bossPhase: this._bossPhase });
  }

  _debugExecCmd(cmd) {
    const s = cmd.toLowerCase();
    if (s === 'x') {
      this.debugMode = false;
      this.input.setTextMode(false);
      return;
    }
    const bossM = s.match(/^b(\d+)$/);
    if (bossM) {
      const ph = parseInt(bossM[1]);
      if (ph >= 1 && ph <= 6) { this._debugEnterBoss(ph); return; }
    }
    const stageM = s.match(/^(\d+)$/);
    if (stageM) {
      const st = parseInt(stageM[1]);
      if (st >= 1 && st <= STAGE_COUNT) { this._debugJumpToStage(st); return; }
    }
  }

  _debugJumpToStage(stage) {
    const clamped = Math.min(STAGE_COUNT, Math.max(1, stage));
    this.heavensUnlocked = this.heavensUnlocked || clamped >= HEAVENS_UNLOCK_STAGE;
    this._titleMessage = `DEBUG STAGE ${clamped}`;
    this._init({ mode: 'stage', stage: clamped, lives: this.state === 'playing' ? this.lives : MAX_LIVES, newRun: true });
  }

  _debugEnterHeavens() {
    this.heavensUnlocked = true;
    this._titleMessage = 'DEBUG HEAVENS';
    this._init({ mode: 'heavens', stage: 1, lives: this.state === 'playing' ? this.lives : MAX_LIVES });
  }

  _initBossArena(phase) {
    if (phase === 2) { this._initBossArena2(); return; }
    if (phase === 3) { this._initBossArena3(); return; }
    if (phase === 4) { this._initBossArena4(); return; }
    if (phase === 5) { this._initBossArena5(); return; }
    if (phase === 6) { this._initBossArena6(); return; }
    const floorSurf = BOSS_FLOOR_Y - 12;
    const arenaW    = BOSS_FLOOR_X2 - BOSS_FLOOR_X1;

    // アリーナ床（左右は落下ギャップ）
    this._addPlat(
      (BOSS_FLOOR_X1 + BOSS_FLOOR_X2) / 2,
      BOSS_FLOOR_Y, arenaW, 24,
      { isGround: true, canCollapse: false }
    );

    // ボス生成
    this.boss = new BossCharge(W / 2 + 80, floorSurf - 25, 1, this.engine.world);

    // カメラ固定
    this.cameraTop = 0;
  }

  _initBossArena2() {
    const world  = this.engine.world;
    const arenaW = BOSS_FLOOR_X2 - BOSS_FLOOR_X1;

    // アリーナ床（20%短縮）
    this._addPlat(
      (BOSS_FLOOR_X1 + BOSS_FLOOR_X2) / 2,
      BOSS_FLOOR_Y, arenaW * 0.8, 24,
      { isGround: true, canCollapse: false }
    );

    // ドロップ床を生成（乗るとカウントダウン→崩落 → ボスに当たるとスタン）
    // 左: 通常ジャンプ / 右: 二段Jで届く高さ / 中央: ステップ式高台
    const platDefs = [
      { x: 170, y: 368, w: 150 },   // 左低（通常J）
      { x: 790, y: 308, w: 150 },   // 右高（二段J）
      { x: 420, y: 358, w: 100 },   // 中央低
      { x: 540, y: 248, w: 100 },   // 中央中
      { x: 420, y: 148, w: 100 },   // 中央高
    ];

    this._droppablePlats = [];
    for (const def of platDefs) {
      // _addPlat で platforms に登録 → 既存の崩落ロジックがそのまま動く
      // collapseMs を通常の 700ms に短縮
      const plat = this._addPlat(def.x, def.y, def.w, PLAT_H, {
        canCollapse: true, collapseMs: 700,
      });
      // label を droppable に付け替えてボスAABBチェックで識別
      plat.body.label = 'droppable';
      this._droppablePlats.push({ plat, origX: def.x, origY: def.y, origW: def.w, state: 'idle', timer: 0 });
    }

    // ボス生成（中央上空）
    this.boss = new BossFloat(W / 2, 280, world);

    // カメラ固定
    this.cameraTop = 0;
  }

  _initBossArena3() {
    const world  = this.engine.world;
    const cx     = (BOSS_FLOOR_X1 + BOSS_FLOOR_X2) / 2;
    const arenaW = BOSS_FLOOR_X2 - BOSS_FLOOR_X1;

    // アリーナ底（60%幅）
    this._addPlat(cx, BOSS_FLOOR_Y, arenaW * 0.6, 24,
      { isGround: true, canCollapse: false });

    // プラットレイアウト（3段 × 2列）—ボス・プレイヤー共用
    const platDefs = [
      { x: 195,  y: 410, w: 140 }, // 左低
      { x: 765,  y: 410, w: 140 }, // 右低
      { x: 210,  y: 305, w: 120 }, // 左中
      { x: 750,  y: 305, w: 120 }, // 右中
      { x: 330,  y: 200, w: 110 }, // 左高
      { x: 630,  y: 200, w: 110 }, // 右高
    ];

    this._arena3Plats = []; // { plat, origX, origY, origW, state, timer }
    for (const def of platDefs) {
      const plat = this._addPlat(def.x, def.y, def.w, PLAT_H, {
        canCollapse: true, collapseMs: PLAT3_COLLAPSE_MS,
      });
      plat.body.label = 'arena3plat';
      this._arena3Plats.push({
        plat, origX: def.x, origY: def.y, origW: def.w,
        state: 'idle', timer: 0,
      });
    }

    // ボス生成（左低足場の上）
    const floorSurf = BOSS_FLOOR_Y - 12;
    this.boss = new BossRunner(195, 410 - PLAT_H / 2 - BOSS3_H / 2 - 2, world);

    this.cameraTop = 0;
  }

  _initBossArena4() {
    const world  = this.engine.world;
    const arenaW = BOSS4_ARENA_X2 - BOSS4_ARENA_X1;

    // フル幅床
    this._addPlat(
      (BOSS4_ARENA_X1 + BOSS4_ARENA_X2) / 2,
      BOSS_FLOOR_Y, arenaW, 24,
      { isGround: true, canCollapse: false }
    );

    // 左右の踏み台（前隙を狙うためのジャンプ卓耶）
    this._addPlat(200, BOSS_FLOOR_Y - 82, 140, PLAT_H, { canCollapse: false });
    this._addPlat(760, BOSS_FLOOR_Y - 82, 140, PLAT_H, { canCollapse: false });

    // ボス生成
    const floorSurf = BOSS_FLOOR_Y - 12;
    this.boss = new BossStriker(W / 2, floorSurf - BOSS4_H / 2, world);

    this.cameraTop = 0;
  }

  _initBossArena5() {
    const world  = this.engine.world;
    const arenaW = BOSS5_ARENA_X2 - BOSS5_ARENA_X1;
    const cx     = (BOSS5_ARENA_X1 + BOSS5_ARENA_X2) / 2;

    // 底床（全幅・崩落なし）
    this._addPlat(cx, BOSS_FLOOR_Y, arenaW, 24, { isGround: true, canCollapse: false });

    // 崩落足場（乗るとカウントダウン→落下→復活）
    const platDefs = [
      { x: 200, y: 130, w: 170 }, // 上段左
      { x: 760, y: 130, w: 170 }, // 上段右
      { x: 170, y: 280, w: 130 }, // 中段左
      { x: 480, y: 280, w: 150 }, // 中段中央
      { x: 790, y: 280, w: 130 }, // 中段右
      { x: 220, y: 420, w: 160 }, // 下段左
      { x: 740, y: 420, w: 160 }, // 下段右
    ];

    this._arena5Plats = [];
    for (const def of platDefs) {
      const plat = this._addPlat(def.x, def.y, def.w, PLAT_H, {
        canCollapse: true, collapseMs: PLAT5_COLLAPSE_MS,
      });
      plat.body.label = 'arena5plat';
      this._arena5Plats.push({
        plat, origX: def.x, origY: def.y, origW: def.w,
        state: 'idle', timer: 0,
      });
    }

    // ボス生成（底面上）
    const floorSurf = BOSS_FLOOR_Y - 12;
    this.boss = new BossLeaper(W / 2, floorSurf - BOSS5_H / 2, world);
    this.cameraTop = 0;
  }

  _initBossArena6() {
    const world  = this.engine.world;
    const arenaW = BOSS6_ARENA_X2 - BOSS6_ARENA_X1;
    const cx     = (BOSS6_ARENA_X1 + BOSS6_ARENA_X2) / 2;

    // 底床（全幅・崩落なし）
    this._addPlat(cx, BOSS_FLOOR_Y, arenaW, 24, { isGround: true, canCollapse: false });

    // 両端の落下ギャップ（Boss3参考: 床のない壁際）は BOSS6_ARENA_X1/X2 の壁で表現済み

    // 崩落足場（形態が進むにつれて減る演出を将来追加可。現状は全配置）
    const platDefs = [
      { x: 240, y: 120, w: 160 }, // 上段左
      { x: 720, y: 120, w: 160 }, // 上段右
      { x: 480, y: 200, w: 140 }, // 上段中央
      { x: 180, y: 300, w: 130 }, // 中段左
      { x: 480, y: 300, w: 130 }, // 中段中央
      { x: 780, y: 300, w: 130 }, // 中段右
      { x: 300, y: 420, w: 150 }, // 下段左
      { x: 660, y: 420, w: 150 }, // 下段右
    ];

    this._arena6Plats = [];
    for (const def of platDefs) {
      const plat = this._addPlat(def.x, def.y, def.w, PLAT_H, {
        canCollapse: true, collapseMs: PLAT6_COLLAPSE_MS,
      });
      plat.body.label = 'arena6plat';
      this._arena6Plats.push({
        plat, origX: def.x, origY: def.y, origW: def.w,
        state: 'idle', timer: 0,
      });
    }

    // ボス生成
    const floorSurf = BOSS_FLOOR_Y - 12;
    this.boss = new BossFinal(W / 2, floorSurf - BOSS6_H / 2, world);
    this.cameraTop = 0;
  }

  _debugEnterBoss(phase) {
    this._titleMessage = `DEBUG BOSS PHASE ${phase}`;
    this._init({
      mode: 'boss', stage: this.currentStage,
      lives: this.state === 'playing' ? this.lives : MAX_LIVES,
      bossPhase: phase,
    });
  }

  get isGrounded() { return this._contacts > 0; }

  // ===== ループ =====
  _loop(time) {
    const dt = this._lastTime ? Math.min(time - this._lastTime, 50) : 16.67;
    this._lastTime = time;
    this._update(dt);
    this._render();
    requestAnimationFrame(t => this._loop(t));
  }

  _update(dt) {
    const inp = this.input;

    // デバッグコンソール (0 キーでON/OFF)
    if (inp.isPressed('Digit0')) {
      this.debugMode = !this.debugMode;
      inp.setTextMode(this.debugMode);
    }
    if (this.debugMode) {
      const cmd = inp.consumeTextEnter();
      if (cmd !== null) this._debugExecCmd(cmd);
    }

    // タイトル / クリア 操作
    if (this.state !== 'playing') {
      if (this.state === 'title' && (inp.isPressed('Space') || inp.isPressed('KeyR'))) {
        this._titleMessage = '';
        this._init({ mode: 'stage', stage: 1, lives: MAX_LIVES, newRun: true });
      } else if (this.state === 'title' && this.heavensUnlocked && inp.isPressed('KeyH')) {
        this._titleMessage = 'HEAVENS MODE';
        this._init({ mode: 'heavens', stage: 1, lives: MAX_LIVES });
      } else if (this.state === 'stageclear' && (inp.isPressed('Space') || inp.isPressed('KeyR'))) {
        if (this._pendingBossPhase > 0) {
          // ボス戦へ遷移
          const phase = this._pendingBossPhase;
          this._pendingBossPhase = 0;
          this._init({ mode: 'boss', stage: this.currentStage, lives: this.lives, bossPhase: phase });
        } else {
          this._init({ mode: 'stage', stage: this._nextStage, lives: this.lives });
        }
      } else if (this.state === 'bossclear' && (inp.isPressed('Space') || inp.isPressed('KeyR'))) {
        if (this._nextStage > STAGE_COUNT) {
          // Boss Phase 6 クリア → Heavensアンロック
          this.heavensUnlocked = true;
          this.state = 'title';
          this._titleMessage = 'HEAVENS MODE UNLOCKED';
        } else {
          this._init({ mode: 'stage', stage: this._nextStage, lives: this.lives, newRun: false });
        }
      }
      inp.flush();
      return;
    }

    const b = this.playerBody;

    // 二段ジャンプ クールタイム（常に実行）
    if (this._djCooldown > 0) {
      this._djCooldown -= dt;
      if (this._djCooldown <= 0) {
        this._djCooldown    = 0;
        this._canDoubleJump = true;
        this._flashTimer    = DJ_FLASH_DURATION;
      }
    }
    if (this._flashTimer > 0) this._flashTimer -= dt;

    // ノックバック中は入力を無効にして自然減衰に任せる
    if (this._knockbackTimer > 0) {
      this._knockbackTimer -= dt;
    } else {
      // 水平移動
      let vx = 0;
      if (inp.isDown('ArrowLeft')  || inp.isDown('KeyA')) vx = -PLAYER_SPEED;
      if (inp.isDown('ArrowRight') || inp.isDown('KeyD')) vx =  PLAYER_SPEED;

      // 風ゾーン内ならドリフト加算（入力に乗せる形で自然に戻る）
      for (const zone of this.windZones) {
        if (b.position.y >= zone.top && b.position.y <= zone.bottom) {
          vx += zone.strength * dt;
          break;
        }
      }

      // ジャンプ
      let vy = b.velocity.y;
      if (inp.isPressed('ArrowUp') || inp.isPressed('KeyW') || inp.isPressed('Space')) {
        if (this._jumpsLeft === 2) {
          vy = JUMP_VEL;
          this._jumpsLeft--;
        } else if (this._jumpsLeft === 1 && this._canDoubleJump) {
          vy = JUMP_VEL;
          this._jumpsLeft--;
          this._canDoubleJump = false;
          this._djCooldown    = DJ_COOLDOWN;
          this._flashTimer    = 0;
        }
      }

      Body.setVelocity(b, { x: vx, y: vy });
    }

    // デバッグ中は Space 長押しで浮遊
    if (this.debugMode && inp.isDown('Space')) {
      Body.setVelocity(b, { x: this.playerBody.velocity.x, y: -4.8 });
    }

    Engine.update(this.engine, dt);
    inp.flush();

    // 台の更新
    for (const p of this.platforms) p.update(dt);

    // プレイヤーを移動床・エレベーターに追従させる
    for (const plat of [...this._ridingPlatforms]) {
      if (!this.platforms.includes(plat)) { this._ridingPlatforms.delete(plat); continue; }
      const dx = plat.body.position.x - plat._prevX;
      const dy = plat.body.position.y - plat._prevY;
      if (dx !== 0 || dy !== 0) {
        Body.setPosition(b, { x: b.position.x + dx, y: b.position.y + dy });
      }
    }

    // 画面外に落ちた or 落下タイムアウトした台を除去
    const cullY = this.cameraTop + H + 400;
    const dead = this.platforms.filter(p =>
      p.state === 'falling' &&
      (p.body.position.y > cullY || p._fallTimer >= PLAT_FALLEN_VANISH_MS)
    );
    for (const p of dead) { World.remove(this.engine.world, p.body); this._ridingPlatforms.delete(p); }
    this.platforms = this.platforms.filter(p => !dead.includes(p));

    // 上昇完了エレベーターを除去
    const deadElev = this.platforms.filter(p => p.isElevator && p.elevState === 'gone');
    for (const p of deadElev) { World.remove(this.engine.world, p.body); this._ridingPlatforms.delete(p); }
    this.platforms = this.platforms.filter(p => !(p.isElevator && p.elevState === 'gone'));

    // 敵の更新・カリング
    for (const en of this.enemies) en.update(dt, b.position.x);
    const deadEn = this.enemies.filter(en => en.baseY > this.cameraTop + H + 400);
    for (const en of deadEn) World.remove(this.engine.world, en.body);
    this.enemies = this.enemies.filter(en => !deadEn.includes(en));

    // カメラ追従（上方向のみ）・ボスモードは固定
    if (this.currentMode !== 'boss') {
      const targetTop = b.position.y - H * 0.65;
      if (targetTop < this.cameraTop) this.cameraTop += (targetTop - this.cameraTop) * 0.12;
    }

    // 高度更新（ボスモード除く）
    if (this.currentMode !== 'boss') {
      const h = START_Y - b.position.y;
      if (h > this.maxHeightReached) {
        this.maxHeightReached = h;
      }
    }

    // 追加生成（ボスモード除く）
    if (this.currentMode !== 'boss') {
      const shouldGenerate = this.currentMode === 'heavens' || this._genFrontier > this.goalY + 60;
      if (shouldGenerate && b.position.y - this._genFrontier < H * 2) {
        if (this.currentMode === 'heavens') {
          this.currentStageConfig = this._stageConfig('heavens', 1);
        }
        this._generateBatch(6);
      }

      // 風ゾーン追加生成
      if (this.currentStageConfig.windRate > 0 && b.position.y - this._windFrontier < H * 0.8) {
        this._generateWindZones();
      }
    }

    // 風ゾーンアニメーション時間更新
    for (const zone of this.windZones) zone._animT += dt;

    // 画面外に消えた瞬間に落下判定
    if (b.position.y - PLAYER_H * 0.5 > this.cameraTop + H) {
      this._loseLife();
      return;
    }

    // ボス更新
    if (this.currentMode === 'boss' && this.boss) {
      if (this.boss.state !== 'dead') {
        if (this._bossPhase === 3) {
          // Boss3: プラットフォームリストを渡して自己物理
          this.boss.update(dt, b.position.x, b.position.y, this.isGrounded, this.platforms);
        } else if (this._bossPhase === 5) {
          // Boss5: worldを渡してミニオン管理
          this.boss.update(dt, b.position.x, this.engine.world);
        } else if (this._bossPhase === 6) {
          // Boss6: worldを渡して形態遷移管理
          this.boss.update(dt, b.position.x, this.engine.world);
        } else {
          this.boss.update(dt, b.position.x, b.position.y, this.isGrounded, this._droppablePlats);
        }
      }

      // ボス2: ドロップ床管理（乗るとタイマー崩落 → ボスに当たるとスタン → 復活）
      if (this._bossPhase === 2 && this._droppablePlats.length > 0) {
        for (const dp of this._droppablePlats) {
          const pb   = dp.plat.body;
          const ps   = dp.plat.state; // 'idle' | 'countdown' | 'falling'

          if (dp.state === 'idle') {
            // PlatformObj が countdown/falling に遷移したら追跡開始
            if (ps === 'countdown' || ps === 'falling') {
              dp.state = 'dropping';
              dp.timer = 0;
            }
          } else if (dp.state === 'dropping') {
            // falling 状態 → ボスAABBチェック
            if (ps === 'falling' &&
                this.boss.state !== 'stunned' && this.boss.state !== 'dead') {
              const hw = dp.origW / 2;
              if (pb.position.x + hw > this.boss.x - this.boss.bW / 2 &&
                  pb.position.x - hw < this.boss.x + this.boss.bW / 2 &&
                  pb.position.y + PLAT_H / 2 > this.boss.y - this.boss.bH / 2 &&
                  pb.position.y - PLAT_H / 2 < this.boss.y + this.boss.bH / 2) {
                this.boss.getHit();
                // 床を即非表示にして復活待ちへ
                Body.setStatic(pb, true);
                Body.setPosition(pb, { x: dp.origX, y: -600 });
                dp.plat.state = 'idle'; // PlatformObj の状態もリセット
                dp.plat.timer = 0;
                dp.state = 'respawning';
                dp.timer = 0;
                continue;
              }
            }
            // 床面着地 or 画面外 → 復活待ちへ
            if (pb.position.y >= BOSS_FLOOR_Y - PLAT_H - 5 || pb.position.y > H + 100) {
              Body.setStatic(pb, true);
              Body.setPosition(pb, { x: dp.origX, y: -600 });
              dp.plat.state = 'idle';
              dp.plat.timer = 0;
              dp.state = 'respawning';
              dp.timer = 0;
            }
          } else if (dp.state === 'respawning') {
            dp.timer += dt;
            if (dp.timer >= PLAT2_RESPAWN_MS) {
              Body.setPosition(pb, { x: dp.origX, y: dp.origY });
              dp.state = 'idle';
              dp.timer = 0;
            }
          }
        }
      }

      // ボス3: 崩落床の復活管理
      if (this._bossPhase === 3 && this._arena3Plats && this._arena3Plats.length > 0) {
        for (const ap of this._arena3Plats) {
          if (ap.plat.state === 'falling') {
            ap.timer += dt;
            if (ap.timer >= PLAT3_RESPAWN_MS) {
              // 復活: 元の位置へ戻して idle にリセット
              Body.setStatic(ap.plat.body, true);
              Body.setPosition(ap.plat.body, { x: ap.origX, y: ap.origY });
              ap.plat.state = 'idle';
              ap.plat.timer = 0;
              ap.timer = 0;
            }
          } else {
            ap.timer = 0;
          }
        }
      }

      // ボス5: 崩落床の復活管理（Boss2 と同じ: 落下即退避 → タイマー後に元位置へ）
      if (this._bossPhase === 5 && this._arena5Plats && this._arena5Plats.length > 0) {
        for (const ap of this._arena5Plats) {
          const pb = ap.plat.body;
          const ps = ap.plat.state;

          if (ap.state === 'idle') {
            if (ps === 'countdown' || ps === 'falling') {
              ap.state = 'dropping';
              ap.timer = 0;
            }
          } else if (ap.state === 'dropping') {
            // falling に入ったら即退避（画面外へ）して復活待ちへ
            if (ps === 'falling' || pb.position.y >= BOSS_FLOOR_Y - PLAT_H - 5 || pb.position.y > H + 100) {
              Body.setStatic(pb, true);
              Body.setPosition(pb, { x: ap.origX, y: -600 });
              ap.plat.state = 'idle';
              ap.plat.timer = 0;
              ap.state = 'respawning';
              ap.timer = 0;
            }
          } else if (ap.state === 'respawning') {
            ap.timer += dt;
            if (ap.timer >= PLAT5_RESPAWN_MS) {
              Body.setPosition(pb, { x: ap.origX, y: ap.origY });
              ap.state = 'idle';
              ap.timer = 0;
            }
          }
        }
      }

      // ボス6: 崩落床の復活管理（ボス5と同方式）
      if (this._bossPhase === 6 && this._arena6Plats && this._arena6Plats.length > 0) {
        for (const ap of this._arena6Plats) {
          const pb = ap.plat.body;
          const ps = ap.plat.state;

          if (ap.state === 'idle') {
            if (ps === 'countdown' || ps === 'falling') {
              ap.state = 'dropping'; ap.timer = 0;
            }
          } else if (ap.state === 'dropping') {
            if (ps === 'falling' || pb.position.y >= BOSS_FLOOR_Y - PLAT_H - 5 || pb.position.y > H + 100) {
              Body.setStatic(pb, true);
              Body.setPosition(pb, { x: ap.origX, y: -600 });
              ap.plat.state = 'idle'; ap.plat.timer = 0;
              ap.state = 'respawning'; ap.timer = 0;
            }
          } else if (ap.state === 'respawning') {
            ap.timer += dt;
            if (ap.timer >= PLAT6_RESPAWN_MS) {
              Body.setPosition(pb, { x: ap.origX, y: ap.origY });
              ap.state = 'idle'; ap.timer = 0;
            }
          }
        }
      }

      // ボスモード: 画面外へ吹っ飛びミス（画面端+10%マージン）
      if (this._knockbackTimer > 0 && this._wallHitFlash <= 0) {
        const px     = b.position.x;
        const margin = W * 0.10; // 96px
        if (px <= -margin || px >= W + margin) {
          Body.setVelocity(b, { x: 0, y: 2 });
          this._knockbackTimer = 0;
          this._wallHitFlash   = 600; // ms
          this._loseLife();
          return;
        }
      }
      if (this._wallHitFlash > 0) this._wallHitFlash -= dt;
    }
  }

  // ===== ボス固定HPバー（画面中央上部）=====
  // 追従式ではなく画面中央やや上に固定描画。数値なし・ボス名表示。
  _drawBossHpBar(ctx, hp, hpMax, color = '#ff4060', bossName = 'BOSS') {
    const barW  = 300;   // 横幅固定（固定位置版、元の追従バー幅の約2倍以上）
    const barH  = 12;
    const barX  = W / 2 - barW / 2;
    const barY  = 56;    // 画面上部から56px（中央やや上）
    const nameY = barY - 12;
    const ratio = Math.max(0, hp / hpMax);

    // 背景パネル
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.fillStyle   = '#06060f';
    ctx.fillRect(barX - 10, nameY - 15, barW + 20, barH + 38);
    ctx.globalAlpha = 1;
    ctx.restore();

    // ボス名
    ctx.fillStyle   = color;
    ctx.font        = 'bold 13px ui-monospace, Consolas, monospace';
    ctx.textAlign   = 'center';
    ctx.fillText(bossName, W / 2, nameY);
    ctx.textAlign   = 'left';

    // 影
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(barX + 2, barY + 2, barW, barH);
    // 背景
    ctx.fillStyle = '#1a1a26';
    ctx.fillRect(barX, barY, barW, barH);
    // HP（残量で色変化）
    const dynColor = ratio > 0.5 ? color
      : ratio > 0.25 ? '#ff8020' : '#ff2020';
    ctx.fillStyle = dynColor;
    ctx.fillRect(barX, barY, barW * ratio, barH);
    // 枠線
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth   = 1;
    ctx.strokeRect(barX, barY, barW, barH);
  }

  // ===== 描画 =====
  _sy(wy) { return wy - this.cameraTop; } // 世界Y → スクリーンY

  _render() {
    const ctx = this.ctx;
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);

    // 風ゾーン背景（プラットフォームより手前に描画しないよう先に描く）
    for (const zone of this.windZones) {
      const sy1 = this._sy(zone.top);
      const sy2 = this._sy(zone.bottom);
      if (sy2 < -10 || sy1 > H + 10) continue;

      // 半透明のカラー帯
      ctx.fillStyle = COLORS.windBand;
      ctx.fillRect(0, sy1, W, sy2 - sy1);

      // 流れるダッシュライン（風向きに合わせてスクロール）
      ctx.save();
      ctx.strokeStyle = COLORS.windLine;
      ctx.lineWidth = 1.5;
      const dir = Math.sign(zone.strength);
      ctx.setLineDash([14, 38]);
      ctx.lineDashOffset = -((zone._animT * 0.07 * dir) % 52);
      for (let vy = sy1 + 18; vy < sy2; vy += 30) {
        ctx.beginPath();
        ctx.moveTo(0, vy);
        ctx.lineTo(W, vy);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
    }

    // プラットフォーム
    for (const plat of this.platforms) {
      const sy = this._sy(plat.body.position.y);
      if (sy < -80 || sy > H + 80) continue;

      // 明滅床（非表示フェーズ）: うっすら輪郭だけ表示
      if (plat.isBlinking && !plat._blinkVisible) {
        ctx.save();
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = COLORS.blinkOff;
        this._drawVerts(ctx, plat.body);
        ctx.restore();
        continue;
      }

      // 回復床グロー
      if (plat.isHealing && !plat.healUsed) {
        ctx.save();
        ctx.shadowBlur = 20;
        ctx.shadowColor = COLORS.healGlow;
        ctx.fillStyle = COLORS.heal;
        this._drawVerts(ctx, plat.body);
        ctx.restore();
      }

      // エレベーターグロー（上昇中）
      if (plat.isElevator && plat.elevState === 'rising') {
        ctx.save();
        ctx.shadowBlur = 18;
        ctx.shadowColor = COLORS.elevGlow;
        ctx.fillStyle = COLORS.elevRising;
        this._drawVerts(ctx, plat.body);
        ctx.restore();
      }

      // 落下中: フェードアウト処理
      {
        const fadeStart = PLAT_FALLEN_VANISH_MS - PLAT_FALLEN_FADE_MS;
        const isFading  = plat.state === 'falling' && plat._fallTimer > fadeStart;
        if (isFading) ctx.save();
        if (isFading) ctx.globalAlpha = Math.max(0, 1 - (plat._fallTimer - fadeStart) / PLAT_FALLEN_FADE_MS);
        ctx.fillStyle = plat.color;
        this._drawVerts(ctx, plat.body);
        if (isFading) ctx.restore();
      }

      // 落下後消滅バー（落下中に足場上に表示: 残り時間を赤→透明で示す）
      if (plat.state === 'falling' && plat._fallTimer < PLAT_FALLEN_VANISH_MS) {
        const { min, max } = plat.body.bounds;
        const bx = min.x, bw = max.x - min.x;
        const barY = this._sy(min.y) - 7;
        const remaining = plat.vanishRatio;
        ctx.fillStyle = 'rgba(30,10,10,0.7)';
        ctx.fillRect(bx, barY, bw, 4);
        ctx.fillStyle = remaining > 0.5 ? '#e02828' : remaining > 0.25 ? '#ff6030' : '#ff9900';
        ctx.fillRect(bx, barY, bw * remaining, 4);
      }

      // 崩落カウントダウンバー（静止中のみ）
      if (plat.state === 'countdown' && plat.body.isStatic) {
        const { min, max } = plat.body.bounds;
        const bx = min.x, bw = max.x - min.x;
        const barY = this._sy(min.y) - 7;
        const remaining = 1 - plat.countdownRatio;
        ctx.fillStyle = '#111';
        ctx.fillRect(bx, barY, bw, 4);
        ctx.fillStyle = remaining > 0.5 ? '#7df0a4' : remaining > 0.25 ? '#ffcb6b' : '#ff4444';
        ctx.fillRect(bx, barY, bw * remaining, 4);
      }

      // エレベーター残量バー（idle=フル, rising=減少）
      if (plat.isElevator && plat.elevState !== 'gone') {
        const { min, max } = plat.body.bounds;
        const bx = min.x, bw = max.x - min.x;
        const barY = this._sy(min.y) - 7;
        const remaining = 1 - plat.elevRatio;
        ctx.fillStyle = '#1a2a3a';
        ctx.fillRect(bx, barY, bw, 4);
        ctx.fillStyle = plat.elevState === 'rising' ? '#70c0ff' : '#4080c8';
        ctx.fillRect(bx, barY, bw * remaining, 4);
      }
    }

    // 敵
    for (const en of this.enemies) {
      const ex  = en.body.position.x;
      const esy = this._sy(en.body.position.y);
      if (esy < -60 || esy > H + 60) continue;

      if (en.type === 'runner') {
        // ===== EnemyRunner: 横長・緑系・走りアニメ =====
        const legOff = Math.sin(en._legT) * 4; // 足の上下
        ctx.fillStyle = '#40c060';
        ctx.fillRect(ex - 17, esy - 11, 34, 22);
        // 目（進行方向向き）
        const eyeX = en._dir > 0 ? ex + 2 : ex - 2;
        ctx.fillStyle = '#fff';
        ctx.fillRect(eyeX - 6, esy - 8, 6, 7);
        ctx.fillRect(eyeX + 1, esy - 8, 6, 7);
        ctx.fillStyle = '#1a2e1a';
        ctx.fillRect(eyeX - 5 + (en._dir > 0 ? 1 : 0), esy - 6, 3, 4);
        ctx.fillRect(eyeX + 2 + (en._dir > 0 ? 1 : 0), esy - 6, 3, 4);
        // 足（アニメ）
        ctx.fillStyle = '#30a050';
        ctx.fillRect(ex - 10, esy + 11, 8, 4 + legOff);
        ctx.fillRect(ex +  2, esy + 11, 8, 4 - legOff);
      } else if (en.type === 'diver') {
        // ===== EnemyDiver: 縦長・紺系・急降下テレグラフ =====
        const isDiving = en._state === 'dive';
        ctx.fillStyle = isDiving ? '#ff3060' : '#5040c0';
        ctx.fillRect(ex - 13, esy - 16, 26, 32);
        // 翼（サイン波で羽ばたき）
        const wingSpan = isDiving ? 2 : 8 + 6 * Math.abs(Math.sin(en._hoverT * 0.004));
        ctx.fillStyle = isDiving ? '#ff6090' : '#8060e0';
        ctx.fillRect(ex - 13 - wingSpan, esy - 8, wingSpan, 10);
        ctx.fillRect(ex + 13,            esy - 8, wingSpan, 10);
        // 目
        ctx.fillStyle = '#fff';
        ctx.fillRect(ex - 7, esy - 10, 5, 6);
        ctx.fillRect(ex + 2, esy - 10, 5, 6);
        ctx.fillStyle = isDiving ? '#ff0000' : '#1a1a3e';
        ctx.fillRect(ex - 6, esy - 9, 3, 4);
        ctx.fillRect(ex + 3, esy - 9, 3, 4);
        // 急降下中: 速度線
        if (isDiving && en._vy > 2) {
          ctx.save();
          ctx.strokeStyle = '#ff3060';
          ctx.globalAlpha = 0.55;
          ctx.lineWidth   = 2;
          for (let i = 0; i < 3; i++) {
            const ox = (i - 1) * 8;
            ctx.beginPath();
            ctx.moveTo(ex + ox, esy + 16);
            ctx.lineTo(ex + ox, esy + 16 + en._vy * 2.5);
            ctx.stroke();
          }
          ctx.restore();
        }
      } else {
        // ===== Enemy(浮遊型): オレンジ =====
        ctx.fillStyle = '#e07840';
        ctx.fillRect(ex - 14, esy - 14, 28, 28);
        // 白目
        ctx.fillStyle = '#fff';
        ctx.fillRect(ex - 8, esy - 5, 7, 7);
        ctx.fillRect(ex + 1, esy - 5, 7, 7);
        // 瞳
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(ex - 6, esy - 3, 4, 4);
        ctx.fillRect(ex + 3, esy - 3, 4, 4);
      }
    }

    // ボス描画（フェーズ1: 突進型）
    if (this.currentMode === 'boss' && this.boss && this._bossPhase === 1) {
      const boss = this.boss;
      const bx   = boss.x;
      const bsy  = this._sy(boss.y);
      const bw   = boss.phase === 2 ? 60 : 44;
      const bh   = boss.phase === 2 ? 68 : 50;

      // 衝撃波（本体より先に描画）
      if (boss._swActive) {
        const swSY = this._sy(BOSS_FLOOR_Y - 16);
        ctx.save();
        ctx.fillStyle = COLORS.bossWeak;
        if (boss._swLx > BOSS_FLOOR_X1) {
          ctx.globalAlpha = 0.9;
          ctx.fillRect(boss._swLx - 15, swSY - 10, 30, 20);
          // 波絋トレイル
          ctx.globalAlpha = 0.3;
          ctx.fillRect(boss._swLx - 30, swSY - 6, 30, 12);
        }
        if (boss._swRx < BOSS_FLOOR_X2) {
          ctx.globalAlpha = 0.9;
          ctx.fillRect(boss._swRx - 15, swSY - 10, 30, 20);
          ctx.globalAlpha = 0.3;
          ctx.fillRect(boss._swRx, swSY - 6, 30, 12);
        }
        ctx.restore();
      }

      // 衝撃波テレグラフ（床全体が光る）
      if (boss.state === 'windup_shock') {
        ctx.save();
        ctx.globalAlpha = 0.22 + 0.18 * Math.sin(Date.now() * 0.025);
        ctx.fillStyle = COLORS.bossWeak;
        ctx.fillRect(BOSS_FLOOR_X1, this._sy(BOSS_FLOOR_Y - 28), BOSS_FLOOR_X2 - BOSS_FLOOR_X1, 26);
        ctx.restore();
      }

      // 本体色（状態別）
      const bodyColor =
        boss.state === 'stunned'    ? COLORS.bossStun :
        boss.state === 'windup_shock' || boss.state === 'shockwave' ? COLORS.bossVuln :
        boss.state === 'charging2'  ? '#ff2050'       :
        boss.state === 'dead'       ? '#555'          :
        COLORS.bossBody;
      ctx.fillStyle = boss._hitFlash > 0 && Math.floor(boss._hitFlash / 60) % 2 === 0
        ? '#ffffff' : bodyColor;
      ctx.fillRect(bx - bw / 2, bsy - bh / 2, bw, bh);

      // 目
      ctx.fillStyle = '#fff';
      ctx.fillRect(bx - bw * 0.28, bsy - bh * 0.12, bw * 0.18, bh * 0.2);
      ctx.fillRect(bx + bw * 0.10, bsy - bh * 0.12, bw * 0.18, bh * 0.2);
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(bx - bw * 0.22, bsy - bh * 0.08, bw * 0.10, bh * 0.12);
      ctx.fillRect(bx + bw * 0.14, bsy - bh * 0.08, bw * 0.10, bh * 0.12);

      // 固定HPバー
      if (boss.state !== 'dead') this._drawBossHpBar(ctx, boss.hp, BOSS_HP_MAX, '#ff4060', 'CHARGE BEAST');

      // 弱点グロー（スタン中）
      if (boss._weakActive) {
        const wx  = boss.weakBody.position.x;
        const wsy = this._sy(boss.weakBody.position.y);
        ctx.save();
        ctx.globalAlpha = 0.72 + 0.28 * Math.sin(Date.now() * 0.01);
        ctx.fillStyle = COLORS.bossWeak;
        ctx.beginPath();
        ctx.arc(wx, wsy, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();
        ctx.fillStyle = '#1a1a2e';
        ctx.font = 'bold 11px ui-monospace, Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('踏め!', wx, wsy + 4);
        ctx.textAlign = 'left';
      }

      // 突進テレグラフ
      if (boss.state === 'windup') {
        ctx.save();
        ctx.globalAlpha = 0.3 + 0.3 * Math.sin(Date.now() * 0.018);
        ctx.fillStyle = COLORS.bossBody;
        const dir = boss.chargeDir;
        ctx.fillRect(
          dir > 0 ? bx : bx - bw * 2.2,
          bsy - bh / 2,
          bw * 2.2, bh
        );
        ctx.restore();
      }
    }

    // ドロップ床描画（ボス2）
    if (this.currentMode === 'boss' && this._bossPhase === 2 && this._droppablePlats.length > 0) {
      for (const dp of this._droppablePlats) {
        if (dp.state === 'respawning') {
          // 復活待機中: アウトライン表示
          const ratio = dp.timer / PLAT2_RESPAWN_MS;
          const px    = dp.origX;
          const py    = this._sy(dp.origY);
          ctx.save();
          ctx.globalAlpha = 0.15 + 0.25 * ratio;
          ctx.strokeStyle = '#6090d8';
          ctx.lineWidth   = 2;
          ctx.setLineDash([6, 6]);
          ctx.strokeRect(px - dp.origW / 2, py - PLAT_H / 2, dp.origW, PLAT_H);
          // 復活バー
          ctx.globalAlpha = 0.5;
          ctx.fillStyle   = '#2050a0';
          ctx.fillRect(px - dp.origW / 2, py + PLAT_H / 2 + 3, dp.origW * ratio, 3);
          ctx.setLineDash([]);
          ctx.restore();
          continue;
        }
        // idle / dropping: ボディ位置で描画
        const bx = dp.plat.body.position.x;
        const by = this._sy(dp.plat.body.position.y);
        if (by < -60 || by > H + 60) continue;
        // countdown中は通常崩落色、falling中はオレンジ
        const ps = dp.plat.state;
        ctx.fillStyle = (dp.state === 'idle' && ps === 'idle') ? '#4878c0'
                      : ps === 'falling' ? '#c06040'
                      : '#7060d0'; // countdown中は紫
        ctx.fillRect(bx - dp.origW / 2, by - PLAT_H / 2, dp.origW, PLAT_H);
        // countdown中の崩落バー
        if (ps === 'countdown') {
          ctx.fillStyle = '#ff8040';
          ctx.fillRect(bx - dp.origW / 2, by + PLAT_H / 2 - 3, dp.origW * dp.plat.countdownRatio, 3);
        }
        if (dp.state === 'idle' && ps === 'idle') {
          ctx.fillStyle   = '#a0c8ff';
          ctx.font        = 'bold 10px ui-monospace, Consolas, monospace';
          ctx.textAlign   = 'center';
          ctx.fillText('STEP', bx, by - PLAT_H / 2 - 3);
          ctx.textAlign   = 'left';
        }
      }
    }

    // ドロップ床描画（ボス5）
    if (this.currentMode === 'boss' && this._bossPhase === 5 && this._arena5Plats && this._arena5Plats.length > 0) {
      for (const ap of this._arena5Plats) {
        if (ap.state === 'respawning') {
          // 復活待機中: アウトライン + 進捗バー
          const ratio = ap.timer / PLAT5_RESPAWN_MS;
          const px    = ap.origX;
          const py    = this._sy(ap.origY);
          ctx.save();
          ctx.globalAlpha = 0.15 + 0.25 * ratio;
          ctx.strokeStyle = BOSS5_MINION_COLOR;
          ctx.lineWidth   = 2;
          ctx.setLineDash([6, 6]);
          ctx.strokeRect(px - ap.origW / 2, py - PLAT_H / 2, ap.origW, PLAT_H);
          ctx.globalAlpha = 0.5;
          ctx.fillStyle   = '#6020a0';
          ctx.fillRect(px - ap.origW / 2, py + PLAT_H / 2 + 3, ap.origW * ratio, 3);
          ctx.setLineDash([]);
          ctx.restore();
        }
        // idle/dropping は汎用プラットフォーム描画（platforms ループ）に任せる
      }
    }

    // ボス描画（フェーズ5: 高空爆撃型 BossLeaper）
    if (this.currentMode === 'boss' && this.boss && this._bossPhase === 5) {
      const boss = this.boss;
      const bx   = boss.x;
      const bsy  = this._sy(boss.y);
      const bw   = boss.bW;
      const bh   = boss.bH;
      // ミニオン描画
      for (const m of boss.minions) {
        const mx  = m.body.position.x;
        const msy = this._sy(m.body.position.y);
        if (msy < -60 || msy > H + 60) continue;
        ctx.save();
        ctx.globalAlpha = m.fadeAlpha;
        ctx.translate(mx, msy);
        ctx.rotate(m.spinAngle);
        ctx.fillStyle = BOSS5_MINION_COLOR;
        ctx.fillRect(-13, -13, 26, 26);
        // 目
        ctx.fillStyle = '#fff';
        ctx.fillRect(-5, -6, 4, 5);
        ctx.fillRect(2, -6, 4, 5);
        ctx.fillStyle = '#1a0028';
        ctx.fillRect(-4, -5, 2, 3);
        ctx.fillRect(3, -5, 2, 3);
        ctx.restore();
        // 落下軌跡（落下中のみ）
        if (m.body.velocity.y > 1) {
          ctx.save();
          ctx.globalAlpha = m.fadeAlpha * 0.35;
          ctx.strokeStyle = BOSS5_MINION_COLOR;
          ctx.lineWidth   = 2;
          ctx.beginPath();
          ctx.moveTo(mx, msy);
          ctx.lineTo(mx - m.body.velocity.x * 3, msy - m.body.velocity.y * 3);
          ctx.stroke();
          ctx.restore();
        }
      }

      // dive_warn: 床マーカー（着地予定位置）
      if (boss.state === 'dive_warn' || boss.state === 'diving') {
        const mx  = boss._diveTargetX;
        const msy = this._sy(BOSS_FLOOR_Y - 20);
        const warnAlpha = boss.state === 'dive_warn'
          ? 0.4 + 0.35 * Math.sin(Date.now() * 0.02)
          : 0.8;
        ctx.save();
        ctx.globalAlpha = warnAlpha;
        ctx.fillStyle   = '#ff3030';
        ctx.fillRect(mx - 34, msy, 68, 8);
        ctx.globalAlpha = warnAlpha * 0.4;
        ctx.fillRect(mx - 60, msy, 120, 4);
        ctx.restore();
      }

      // 衝撃波（緑/風: 画面端まで溢れる）
      if (boss._swActive) {
        const swSY = this._sy(BOSS_FLOOR_Y - 16);
        ctx.save();
        ctx.fillStyle = '#40e060';
        if (boss._swLx > 0) {
          ctx.globalAlpha = 0.95;
          ctx.fillRect(boss._swLx - 20, swSY - 12, 40, 26);
          ctx.globalAlpha = 0.3;
          ctx.fillRect(boss._swLx - 40, swSY - 6, 40, 14);
        }
        if (boss._swRx < W) {
          ctx.globalAlpha = 0.95;
          ctx.fillRect(boss._swRx - 20, swSY - 12, 40, 26);
          ctx.globalAlpha = 0.3;
          ctx.fillRect(boss._swRx, swSY - 6, 40, 14);
        }
        ctx.restore();
      }

      // perch グロー（停留中）
      if (boss.state === 'perch') {
        ctx.save();
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.04);
        ctx.globalAlpha = 0.25 + 0.25 * pulse;
        ctx.fillStyle   = boss._berserk ? '#ff4020' : COLORS.bossWeak;
        ctx.beginPath();
        ctx.arc(bx, bsy, bw * 1.0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // バーサーク: 怒りオーラ
      if (boss._berserk && boss.state !== 'dead') {
        ctx.save();
        const bPulse = 0.4 + 0.6 * Math.abs(Math.sin(Date.now() * 0.010));
        ctx.globalAlpha = bPulse * 0.55;
        ctx.strokeStyle = '#ff3010';
        ctx.lineWidth   = 6;
        ctx.strokeRect(bx - bw / 2 - 5, bsy - bh / 2 - 5, bw + 10, bh + 10);
        ctx.restore();
      }

      // diving テレグラフ（急降下中の速度線）
      if (boss.state === 'diving') {
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = '#ff4060';
        ctx.lineWidth   = 3;
        for (let i = 0; i < 4; i++) {
          const ox  = (i - 1.5) * (bw / 3.5);
          const len = 20 + i * 6;
          ctx.beginPath();
          ctx.moveTo(bx + ox, bsy + bh / 2);
          ctx.lineTo(bx + ox, bsy + bh / 2 + len);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 本体描画
      const bodyColor5 =
        boss.state === 'dead'      ? '#555'           :
        boss._berserk              ? '#ff3010'        :
        boss.state === 'shockwave' ? '#ff4060'        :
        boss.state === 'diving'    ? '#e02050'        :
        boss.state === 'dive_warn' ? '#c03060'        :
        boss.state === 'perch'     ? '#9020d0'        :
        boss.state === 'jump_up'   ? '#7030b0'        :
        COLORS.bossBody;
      ctx.fillStyle = boss._hitFlash > 0 && Math.floor(boss._hitFlash / 60) % 2 === 0
        ? '#ffffff' : bodyColor5;
      ctx.fillRect(bx - bw / 2, bsy - bh / 2, bw, bh);

      // 目（常に下向き）
      ctx.fillStyle = '#fff';
      ctx.fillRect(bx - bw * 0.25, bsy + bh * 0.05, bw * 0.18, bh * 0.18);
      ctx.fillRect(bx + bw * 0.07, bsy + bh * 0.05, bw * 0.18, bh * 0.18);
      ctx.fillStyle = '#1a0028';
      ctx.fillRect(bx - bw * 0.22, bsy + bh * 0.09, bw * 0.10, bh * 0.10);
      ctx.fillRect(bx + bw * 0.10, bsy + bh * 0.09, bw * 0.10, bh * 0.10);

      // 固定HPバー
      if (boss.state !== 'dead') this._drawBossHpBar(ctx, boss.hp, BOSS5_HP_MAX, '#9020d0', 'SKY LEAPER');

      // 弱点グロー
      if (boss._weakActive) {
        const wx  = boss.weakBody.position.x;
        const wsy = this._sy(boss.weakBody.position.y);
        const wColor = COLORS.bossWeak;
        ctx.save();
        ctx.globalAlpha = 0.72 + 0.28 * Math.sin(Date.now() * 0.01);
        ctx.fillStyle   = wColor;
        ctx.beginPath();
        ctx.arc(wx, wsy, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();
        ctx.fillStyle   = '#1a0028';
        ctx.font        = 'bold 11px ui-monospace, Consolas, monospace';
        ctx.textAlign   = 'center';
        ctx.fillText('今！', wx, wsy + 4);
        ctx.textAlign   = 'left';
      }
    }

    // ボス描画（フェーズ6: 最終ボス BossFinal 3形態）
    if (this.currentMode === 'boss' && this.boss && this._bossPhase === 6) {
      const boss = this.boss;
      const bx   = boss.x;
      const bsy  = this._sy(boss.y);
      const bw   = boss.bW;
      const bh   = boss.bH;

      // 崩落足場（respawning中のアウトライン）
      if (this._arena6Plats) {
        for (const ap of this._arena6Plats) {
          if (ap.state !== 'respawning') continue;
          const ratio = ap.timer / PLAT6_RESPAWN_MS;
          const px    = ap.origX;
          const py    = this._sy(ap.origY);
          ctx.save();
          ctx.globalAlpha = 0.15 + 0.25 * ratio;
          ctx.strokeStyle = '#c0a020';
          ctx.lineWidth   = 2;
          ctx.setLineDash([6, 6]);
          ctx.strokeRect(px - ap.origW / 2, py - PLAT_H / 2, ap.origW, PLAT_H);
          ctx.globalAlpha = 0.5;
          ctx.fillStyle   = '#8a7000';
          ctx.fillRect(px - ap.origW / 2, py + PLAT_H / 2 + 3, ap.origW * ratio, 3);
          ctx.setLineDash([]);
          ctx.restore();
        }
      }

      // 形態遷移エフェクト（全画面フラッシュ）
      if (boss._transitioning) {
        const t = boss._transTimer / 1200;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 0.7 * (1 - t * 2));
        ctx.fillStyle = boss.form === 2 ? '#2040a0' : '#c0a000';
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
        // FORM変化テキスト
        if (t < 0.6) {
          ctx.save();
          ctx.globalAlpha = 1 - t / 0.6;
          ctx.fillStyle   = '#ffffff';
          ctx.font        = 'bold 36px ui-monospace, Consolas, monospace';
          ctx.textAlign   = 'center';
          ctx.fillText(`FORM ${boss.form}`, W / 2, H / 2);
          ctx.textAlign   = 'left';
          ctx.restore();
        }
      }

      // dive_warn マーカー（形態2）
      if (boss.form === 2 && (boss.state === 'dive_warn' || boss.state === 'diving')) {
        const mx  = boss._diveTargetX;
        const msy = this._sy(BOSS_FLOOR_Y - 20);
        const warnAlpha = boss.state === 'dive_warn'
          ? 0.4 + 0.35 * Math.sin(Date.now() * 0.02) : 0.8;
        ctx.save();
        ctx.globalAlpha = warnAlpha;
        ctx.fillStyle   = '#ff3030';
        ctx.fillRect(mx - 34, msy, 68, 8);
        ctx.globalAlpha = warnAlpha * 0.4;
        ctx.fillRect(mx - 60, msy, 120, 4);
        ctx.restore();
      }

      // 衝撃波描画（形態1=赤, 形態2=緑, 形態3=青）
      if (boss._swActive) {
        const swSY    = this._sy(BOSS_FLOOR_Y - 16);
        const swColor = boss.form === 1 ? '#ff4020'
                      : boss.form === 2 ? '#40e060'
                      : '#4090ff';
        ctx.save();
        ctx.fillStyle = swColor;
        if (boss._swLx > 0) {
          ctx.globalAlpha = 0.95;
          ctx.fillRect(boss._swLx - 20, swSY - 12, 40, 26);
          ctx.globalAlpha = 0.3;
          ctx.fillRect(boss._swLx - 40, swSY - 6, 40, 14);
        }
        if (boss._swRx < W) {
          ctx.globalAlpha = 0.95;
          ctx.fillRect(boss._swRx - 20, swSY - 12, 40, 26);
          ctx.globalAlpha = 0.3;
          ctx.fillRect(boss._swRx, swSY - 6, 40, 14);
        }
        ctx.restore();
      }

      // 形態2 perch グロー
      if (boss.form === 2 && boss.state === 'perch') {
        ctx.save();
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.04);
        ctx.globalAlpha = 0.25 + 0.25 * pulse;
        ctx.fillStyle   = COLORS.bossWeak;
        ctx.beginPath();
        ctx.arc(bx, bsy, bw * 1.0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 形態3 windup ウィンドウ: 床ドラム
      if (boss.form === 3 && boss.state === 'windup' && boss._weakActive) {
        ctx.save();
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.025);
        ctx.globalAlpha = 0.3 + 0.3 * pulse;
        ctx.fillStyle   = '#ffe000';
        ctx.fillRect(BOSS6_ARENA_X1, this._sy(BOSS_FLOOR_Y - 8), BOSS6_ARENA_X2 - BOSS6_ARENA_X1, 8);
        ctx.restore();
      }

      // 本体色（形態×状態）
      const bodyColor6 =
        boss.state === 'dead'        ? '#555'     :
        boss._hitFlash > 0 && Math.floor(boss._hitFlash / 60) % 2 === 0 ? '#ffffff' :
        boss.form === 1 && boss.state === 'stunned' ? '#b02020' :
        boss.form === 1 ? '#d03030' :
        boss.form === 2 && boss.state === 'perch'   ? '#5020c0' :
        boss.form === 2 ? '#3040d0' :
        boss.form === 3 && boss.state === 'windup' && boss._weakActive ? '#e0b000' :
        boss.form === 3 && boss.state === 'stunned' ? '#806000' :
        '#b09000';
      ctx.fillStyle = bodyColor6;
      ctx.fillRect(bx - bw / 2, bsy - bh / 2, bw, bh);

      // 形態表示ライン（左肩に細い帯）
      const formColors = ['#ff4040', '#4060ff', '#ffe000'];
      ctx.fillStyle = formColors[boss.form - 1] || '#fff';
      ctx.fillRect(bx - bw / 2, bsy - bh / 2, 6, bh);

      // 目
      const eyeDir = boss.chargeDir >= 0 ? 1 : -1;
      ctx.fillStyle = '#fff';
      ctx.fillRect(bx - bw * 0.28 + eyeDir * bw * 0.06, bsy - bh * 0.15, bw * 0.18, bh * 0.18);
      ctx.fillRect(bx + bw * 0.10 + eyeDir * bw * 0.06, bsy - bh * 0.15, bw * 0.18, bh * 0.18);
      ctx.fillStyle = '#1a0028';
      ctx.fillRect(bx - bw * 0.25 + eyeDir * bw * 0.06, bsy - bh * 0.11, bw * 0.10, bh * 0.10);
      ctx.fillRect(bx + bw * 0.13 + eyeDir * bw * 0.06, bsy - bh * 0.11, bw * 0.10, bh * 0.10);

      // 固定HPバー
      if (boss.state !== 'dead') {
        const formColors6 = ['#ff4040', '#4060ff', '#ffe000'];
        const formLabel   = ['FORM 1 / 3', 'FORM 2 / 3', 'FORM 3 / 3'];
        this._drawBossHpBar(ctx, boss.hp, BOSS6_HP_MAX,
          formColors6[boss.form - 1] || '#ff4060',
          `FINAL BOSS  ${formLabel[boss.form - 1] || ''}`);
      }

      // 弱点
      if (boss._weakActive && boss.weakBody.position.y > 0) {
        const wx  = boss.weakBody.position.x;
        const wsy = this._sy(boss.weakBody.position.y);
        ctx.save();
        ctx.globalAlpha = 0.72 + 0.28 * Math.sin(Date.now() * 0.012);
        ctx.fillStyle   = COLORS.bossWeak;
        ctx.beginPath();
        ctx.arc(wx, wsy, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();
        ctx.fillStyle = '#1a0028';
        ctx.font      = 'bold 11px ui-monospace, Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('今！', wx, wsy + 4);
        ctx.textAlign = 'left';
      }

      // HUD ヒント（フォームごと）
      ctx.fillStyle = formColors[boss.form - 1] || '#fff';
      ctx.font      = '12px ui-monospace, Consolas, monospace';
      const hintMsg = boss.form === 1 ? '壁に激突させろ → スタン中に踏め'
                    : boss.form === 2 ? '停留(PERCH)中を踏め！ → 着地後に衝撃波'
                    : '予備動作の光った瞬間だけ踏める！';
      ctx.fillText(hintMsg, 14, 70);
    }

    // ボス描画（フェーズ2: 浮遊型）
    if (this.currentMode === 'boss' && this.boss && this._bossPhase === 2) {
      const boss = this.boss;
      const bx   = boss.x;
      const bsy  = this._sy(boss.y);
      const bw   = boss.bW;
      const bh   = boss.bH;

      // プラット下待機中グロー(スタンチャンス示唐)
      if (boss._hoverUnder || boss.state === 'hover_under') {
        ctx.save();
        ctx.globalAlpha = 0.18 + 0.14 * Math.sin(Date.now() * 0.006);
        ctx.fillStyle   = '#40a0ff';
        ctx.beginPath();
        ctx.arc(bx, bsy, bw * 0.95, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // 上向き矢印(ドロップヒント)
        ctx.save();
        ctx.globalAlpha = 0.6 + 0.4 * Math.abs(Math.sin(Date.now() * 0.005));
        ctx.fillStyle   = '#a0d8ff';
        ctx.font        = 'bold 18px ui-monospace, Consolas, monospace';
        ctx.textAlign   = 'center';
        ctx.fillText('↓', bx, bsy - bh / 2 - 6);
        ctx.textAlign   = 'left';
        ctx.restore();
      }

      // 衝撃波（赤/炎: 床全体がくすぶり、波面が赤く広がる）
      if (boss._swActive) {
        const swSY = this._sy(BOSS_FLOOR_Y - 16);
        ctx.save();
        // 床全体の炎グロー（常時）
        ctx.globalAlpha = 0.18 + 0.12 * Math.sin(Date.now() * 0.007);
        ctx.fillStyle   = '#ff2010';
        ctx.fillRect(BOSS_FLOOR_X1, this._sy(BOSS_FLOOR_Y - 32), BOSS_FLOOR_X2 - BOSS_FLOOR_X1, 30);
        // 波面（赤）
        ctx.fillStyle = '#ff4020';
        if (boss._swLx > BOSS_FLOOR_X1) {
          ctx.globalAlpha = 0.95;
          ctx.fillRect(boss._swLx - 15, swSY - 10, 30, 20);
          ctx.globalAlpha = 0.4;
          ctx.fillRect(boss._swLx - 30, swSY - 6, 30, 12);
        }
        if (boss._swRx < BOSS_FLOOR_X2) {
          ctx.globalAlpha = 0.95;
          ctx.fillRect(boss._swRx - 15, swSY - 10, 30, 20);
          ctx.globalAlpha = 0.4;
          ctx.fillRect(boss._swRx, swSY - 6, 30, 12);
        }
        ctx.restore();
      }

      // 衝撃波テレグラフ（windup_shock 中: 炎が床を舐める）
      if (boss.state === 'windup_shock') {
        ctx.save();
        const beat = 0.3 + 0.25 * Math.abs(Math.sin(Date.now() * 0.018));
        ctx.globalAlpha = beat;
        ctx.fillStyle   = '#ff2010';
        ctx.fillRect(BOSS_FLOOR_X1, this._sy(BOSS_FLOOR_Y - 32), BOSS_FLOOR_X2 - BOSS_FLOOR_X1, 30);
        ctx.restore();
      }

      // 突進テレグラフ
      if (boss.state === 'windup') {
        ctx.save();
        ctx.globalAlpha = 0.28 + 0.28 * Math.sin(Date.now() * 0.018);
        ctx.fillStyle   = '#1860c0';
        const dir = boss.chargeDir;
        ctx.fillRect(dir > 0 ? bx : bx - bw * 2.2, bsy - bh / 2, bw * 2.2, bh);
        ctx.restore();
      }

      // 本体色（状態別）
      const bodyColor2 =
        boss.state === 'stunned'      ? COLORS.bossStun  :
        boss.state === 'charging'     ? '#4090ff'         :
        boss.state === 'windup'       ? '#2870e0'         :
        boss.state === 'windup_shock' ? COLORS.bossVuln   :
        boss.state === 'shockwave'    ? COLORS.bossVuln   :
        boss.state === 'dead'         ? '#555'            :
        '#1860c0';
      ctx.fillStyle = boss._hitFlash > 0 && Math.floor(boss._hitFlash / 60) % 2 === 0
        ? '#ffffff' : bodyColor2;
      ctx.fillRect(bx - bw / 2, bsy - bh / 2, bw, bh);

      // 目
      ctx.fillStyle = '#fff';
      ctx.fillRect(bx - bw * 0.28, bsy - bh * 0.12, bw * 0.18, bh * 0.2);
      ctx.fillRect(bx + bw * 0.10, bsy - bh * 0.12, bw * 0.18, bh * 0.2);
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(bx - bw * 0.22, bsy - bh * 0.08, bw * 0.10, bh * 0.12);
      ctx.fillRect(bx + bw * 0.14, bsy - bh * 0.08, bw * 0.10, bh * 0.12);

      // 固定HPバー
      if (boss.state !== 'dead') this._drawBossHpBar(ctx, boss.hp, BOSS2_HP_MAX, '#4090ff', 'FLOAT DEMON');

      // 弱点グロー（スタン中）
      if (boss._weakActive) {
        const wx  = boss.weakBody.position.x;
        const wsy = this._sy(boss.weakBody.position.y);
        ctx.save();
        ctx.globalAlpha = 0.72 + 0.28 * Math.sin(Date.now() * 0.01);
        ctx.fillStyle   = COLORS.bossWeak;
        ctx.beginPath();
        ctx.arc(wx, wsy, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();
        ctx.fillStyle = '#1a1a2e';
        ctx.font = 'bold 11px ui-monospace, Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('踏め!', wx, wsy + 4);
        ctx.textAlign = 'left';
      }
    }

    // ボス描画（フェーズ4: 前隙タイミング型）
    if (this.currentMode === 'boss' && this.boss && this._bossPhase === 4) {
      const boss = this.boss;
      const bx   = boss.x;
      const bsy  = this._sy(boss.y);
      const bw   = boss.bW;
      const bh   = boss.bH;

      // 衝撃波（青/水: 両タイプとも青）
      if (boss._swActive) {
        const swSY   = this._sy(BOSS_FLOOR_Y - 16);
        const swColor = '#4090ff';
        ctx.save();
        ctx.fillStyle = swColor;
        if (boss._swLx > BOSS4_ARENA_X1) {
          ctx.globalAlpha = 0.95;
          ctx.fillRect(boss._swLx - 15, swSY - 10, 30, 22);
          ctx.globalAlpha = 0.3;
          ctx.fillRect(boss._swLx - 32, swSY - 6, 32, 14);
        }
        if (boss._swRx < BOSS4_ARENA_X2) {
          ctx.globalAlpha = 0.95;
          ctx.fillRect(boss._swRx - 15, swSY - 10, 30, 22);
          ctx.globalAlpha = 0.3;
          ctx.fillRect(boss._swRx, swSY - 6, 32, 14);
        }
        ctx.restore();
      }

      // windup_shockテレグラフ（青/水）
      if (boss.state === 'windup_shock') {
        ctx.save();
        ctx.globalAlpha = 0.22 + 0.18 * Math.sin(Date.now() * 0.025);
        // ワイド/ラッシュともに青いグロー
        ctx.fillStyle = '#2060d0';
        if (boss._attackType === 'wide') {
          ctx.fillRect(BOSS4_ARENA_X1, this._sy(BOSS_FLOOR_Y - 28), BOSS4_ARENA_X2 - BOSS4_ARENA_X1, 26);
        } else {
          ctx.fillRect(
            boss.x - BOSS4_LOCAL_SHOCK_RANGE,
            this._sy(BOSS_FLOOR_Y - 28),
            BOSS4_LOCAL_SHOCK_RANGE * 2, 26
          );
        }
        ctx.restore();
      }

      // 前隙ウィンドウグロー（windup後半の影話）
      const windowStart = BOSS4_WINDUP_MS - BOSS4_WINDOW_MS;
      if (boss.state === 'windup' && boss.timer >= windowStart) {
        ctx.save();
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.05);
        ctx.globalAlpha = 0.30 + 0.30 * pulse;
        ctx.fillStyle   = COLORS.bossWeak;
        ctx.beginPath();
        ctx.arc(bx, bsy, bw * 0.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (boss.state === 'windup') {
        // 前隙前の準備テレグラフ（赤色半透明）
        ctx.save();
        ctx.globalAlpha = 0.25 + 0.2 * Math.sin(Date.now() * 0.018);
        ctx.fillStyle   = '#cc2020';
        const dir = boss.chargeDir;
        ctx.fillRect(
          dir > 0 ? bx : bx - bw * 2.5,
          bsy - bh / 2, bw * 2.5, bh
        );
        ctx.restore();
      }

      // 本体色
      const bodyColor4 =
        boss.state === 'stunned'      ? COLORS.bossStun  :
        boss.state === 'charging'     ? '#d84020'        :
        boss.state === 'shock_burst'  ? '#2060d0'        :
        boss.state === 'shock_local'  ? '#4090ff'        :
        boss.state === 'windup_shock' ? '#1850b8'        :
        boss.state === 'windup'       ? '#a02828'        :
        boss.state === 'dead'         ? '#555'           :
        COLORS.bossBody;
      ctx.fillStyle = boss._hitFlash > 0 && Math.floor(boss._hitFlash / 60) % 2 === 0
        ? '#ffffff' : bodyColor4;
      ctx.fillRect(bx - bw / 2, bsy - bh / 2, bw, bh);

      // 目
      const eyeDir4 = boss.chargeDir;
      ctx.fillStyle = '#fff';
      ctx.fillRect(bx + eyeDir4 * (bw * 0.05), bsy - bh * 0.22, bw * 0.22, bh * 0.18);
      ctx.fillStyle = '#1a0a0a';
      ctx.fillRect(bx + eyeDir4 * (bw * 0.10), bsy - bh * 0.18, bw * 0.10, bh * 0.10);

      // 固定HPバー
      if (boss.state !== 'dead') this._drawBossHpBar(ctx, boss.hp, BOSS4_HP_MAX, '#d84020', 'STRIKER');

      // 超高速突進中の速度線
      if (boss.state === 'charging') {
        ctx.save();
        ctx.globalAlpha = 0.65;
        ctx.strokeStyle = '#ff6010';
        ctx.lineWidth   = 2.5;
        const ld = -boss.chargeDir;
        for (let i = 0; i < 5; i++) {
          const oy  = (i - 2) * (bh / 5);
          const len = 24 + i * 8;
          ctx.beginPath();
          ctx.moveTo(bx + ld * (bw / 2), bsy + oy);
          ctx.lineTo(bx + ld * (bw / 2 + len), bsy + oy);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 弱点グロー
      if (boss._weakActive) {
        const wx  = boss.weakBody.position.x;
        const wsy = this._sy(boss.weakBody.position.y);
        // 前隙中は黄色グロー、スタン中はオレンジグロー
        const wColor = boss.state === 'windup' ? COLORS.bossWeak : '#ff9030';
        ctx.save();
        ctx.globalAlpha = 0.72 + 0.28 * Math.sin(Date.now() * 0.01);
        ctx.fillStyle   = wColor;
        ctx.beginPath();
        ctx.arc(wx, wsy, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();
        ctx.fillStyle   = '#1a1a2e';
        ctx.font        = 'bold 11px ui-monospace, Consolas, monospace';
        ctx.textAlign   = 'center';
        ctx.fillText(boss.state === 'windup' ? '今！' : '踏め!', wx, wsy + 4);
        ctx.textAlign   = 'left';
      }
    }

    // ボス描画（フェーズ3: 地上疾走型）
    if (this.currentMode === 'boss' && this.boss && this._bossPhase === 3) {
      const boss = this.boss;
      const bx   = boss.x;
      const bsy  = this._sy(boss.y);
      const bw   = boss.bW;
      const bh   = boss.bH;

      // 衝撃波（shock_burst）
      if (boss._swActive) {
        const swSY = this._sy(BOSS_FLOOR_Y - 16);
        ctx.save();
        ctx.fillStyle = COLORS.bossWeak;
        if (boss._swLx > BOSS_FLOOR_X1) {
          ctx.globalAlpha = 0.95;
          ctx.fillRect(boss._swLx - 15, swSY - 10, 30, 22);
          ctx.globalAlpha = 0.3;
          ctx.fillRect(boss._swLx - 32, swSY - 6, 32, 14);
        }
        if (boss._swRx < BOSS_FLOOR_X2) {
          ctx.globalAlpha = 0.95;
          ctx.fillRect(boss._swRx - 15, swSY - 10, 30, 22);
          ctx.globalAlpha = 0.3;
          ctx.fillRect(boss._swRx, swSY - 6, 32, 14);
        }
        ctx.restore();
      }

      // 本体色
      const bodyColor3 =
        boss.state === 'stunned'       ? COLORS.bossStun  :
        boss.state === 'charging'      ? '#c84010'        :
        boss.state === 'charging2'     ? '#ff6020'        :
        boss.state === 'windup_charge' ? '#a03010'        :
        boss.state === 'shock_burst'   ? COLORS.bossWeak  :
        boss.state === 'dead'          ? '#555'           :
        '#882210';
      ctx.fillStyle = boss._hitFlash > 0 && Math.floor(boss._hitFlash / 60) % 2 === 0
        ? '#ffffff' : bodyColor3;

      // 体（少し長めの四角 + 足を表現する短い棒）
      ctx.fillRect(bx - bw / 2, bsy - bh / 2, bw, bh);

      // 目
      const eyeDir = boss._facingDir;
      ctx.fillStyle = '#fff';
      ctx.fillRect(bx + eyeDir * (bw * 0.05), bsy - bh * 0.22, bw * 0.22, bh * 0.18);
      ctx.fillStyle = '#1a0a0a';
      ctx.fillRect(bx + eyeDir * (bw * 0.10), bsy - bh * 0.18, bw * 0.10, bh * 0.10);

      // 突進中は速度線
      if (boss.state === 'charging' || boss.state === 'charging2') {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = boss.state === 'charging2' ? '#ff8040' : '#ff4020';
        ctx.lineWidth   = 2;
        const lineDir = -boss.chargeDir;
        for (let i = 0; i < 4; i++) {
          const oy = (i - 1.5) * (bh / 4);
          const len = boss.state === 'charging2' ? 28 + i * 6 : 14 + i * 4;
          ctx.beginPath();
          ctx.moveTo(bx + lineDir * (bw / 2), bsy + oy);
          ctx.lineTo(bx + lineDir * (bw / 2 + len), bsy + oy);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 固定HPバー
      if (boss.state !== 'dead') this._drawBossHpBar(ctx, boss.hp, BOSS3_HP_MAX, '#c84010', 'SPEED RUNNER');

      // 弱点グロー（スタン中）
      if (boss._weakActive) {
        const wx  = boss.weakBody.position.x;
        const wsy = this._sy(boss.weakBody.position.y);
        ctx.save();
        ctx.globalAlpha = 0.72 + 0.28 * Math.sin(Date.now() * 0.01);
        ctx.fillStyle   = COLORS.bossWeak;
        ctx.beginPath();
        ctx.arc(wx, wsy, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();
        ctx.fillStyle = '#1a1a2e';
        ctx.font = 'bold 11px ui-monospace, Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('踏め!', wx, wsy + 4);
        ctx.textAlign = 'left';
      }
    }

    // プレイヤー（フラッシュ中は白と交互）
    const isFlash = this._flashTimer > 0 && Math.floor(this._flashTimer / DJ_FLASH_INTERVAL) % 2 === 0;
    ctx.fillStyle = isFlash ? '#ffffff' : COLORS.player;
    this._drawVerts(ctx, this.playerBody);

    // 二段ジャンプ 円形ゲージ（プレイヤー頭上）
    {
      const px = this.playerBody.position.x;
      const py = this._sy(this.playerBody.position.y);
      const gr = 9;
      const gx = px;
      const gy = py - PLAYER_H / 2 - gr - 5;

      ctx.save();
      if (this._canDoubleJump) {
        // 使用可能: 復帰直後(_flashTimer > 0)だけグロー表示
        if (this._flashTimer > 0) {
          const t = this._flashTimer / DJ_FLASH_DURATION; // 1→0
          const r = gr + 6 * t;                           // 外側に広がる
          // 外輪グロー
          ctx.globalAlpha = t * 0.6;
          ctx.beginPath();
          ctx.arc(gx, gy, r, 0, Math.PI * 2);
          ctx.fillStyle = '#5ee89a';
          ctx.fill();
          // 本体円
          ctx.globalAlpha = 0.4 + 0.6 * t;
          ctx.beginPath();
          ctx.arc(gx, gy, gr, 0, Math.PI * 2);
          ctx.fillStyle = '#5ee89a';
          ctx.fill();
        }
        // (通常時は何も表示しない)
      } else {
        // CT中: グレー背景 + 紫の扇形
        const ratio = 1 - this._djCooldown / DJ_COOLDOWN;
        ctx.beginPath();
        ctx.arc(gx, gy, gr, 0, Math.PI * 2);
        ctx.fillStyle = '#2a2d3a';
        ctx.fill();
        if (ratio > 0) {
          ctx.beginPath();
          ctx.moveTo(gx, gy);
          ctx.arc(gx, gy, gr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
          ctx.closePath();
          ctx.fillStyle = '#b06bff';
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(gx, gy, gr, 0, Math.PI * 2);
        ctx.strokeStyle = '#5a5d7a';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.restore();
    }

    // 吹っ飛びミスエフェクト（ボスモード）
    if (this.currentMode === 'boss' && this._wallHitFlash > 0) {
      const t      = this._wallHitFlash / 600; // 1→0
      const px     = this.playerBody.position.x;
      const onLeft = px < W / 2;
      ctx.save();
      // 画面端から広がる赤フラッシュ
      ctx.globalAlpha = t * 0.55;
      const grad = ctx.createLinearGradient(
        onLeft ? 0 : W, 0,
        onLeft ? W * 0.45 : W * 0.55, 0
      );
      grad.addColorStop(0, '#ff2040');
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      // OUT! テキスト
      ctx.globalAlpha = t;
      ctx.fillStyle   = '#ff4060';
      ctx.font        = `bold ${Math.round(36 + 12 * (1 - t))}px ui-monospace, Consolas, monospace`;
      ctx.textAlign   = 'center';
      ctx.fillText('OUT!', onLeft ? W * 0.18 : W * 0.82, H / 2);
      ctx.textAlign   = 'left';
      ctx.restore();
    }

    // ゴール近くの表示
    const goalSY = this.goalY !== null ? this._sy(this.goalY) : null;
    if (goalSY !== null && goalSY > -30 && goalSY < H + 30) {
      ctx.fillStyle = COLORS.goal;
      ctx.font = 'bold 14px ui-monospace, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('★  G O A L  ★', W / 2, goalSY - 22);
      ctx.textAlign = 'left';
    }

    // ===== 左上 ハートHUD（残機表示）=====
    {
      const hy0     = 23;   // ハート上部中心Y
      const spacing = 40;   // ハート間隔（26→40、約50%拡大）
      const r       = 9;    // 半円半径（6→9、50%拡大）
      const off     = 7;    // 二円の横オフセット（5→7）
      const tip     = 20;   // 下頂点オフセット（13→20）
      const startX  = 14 + r + off; // 左端余白
      for (let i = 0; i < MAX_LIVES; i++) {
        const hx     = startX + i * spacing;
        const filled = i < this.lives;
        ctx.fillStyle = filled ? '#ff4060' : '#333344';
        ctx.beginPath();
        ctx.arc(hx - off, hy0, r, Math.PI, 0);
        ctx.arc(hx + off, hy0, r, Math.PI, 0);
        ctx.lineTo(hx, hy0 + tip);
        ctx.closePath();
        ctx.fill();
        if (!filled) {
          ctx.strokeStyle = '#555566';
          ctx.lineWidth   = 1;
          ctx.stroke();
        }
      }
    }

    // HUD（右上: ステージ情報）
    const height = Math.max(0, Math.floor(START_Y - this.playerBody.position.y));
    const hudX   = W - 14;
    ctx.fillStyle = COLORS.text;
    ctx.font      = 'bold 15px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'right';
    if (this.currentMode === 'boss') {
      ctx.fillText(`BOSS PHASE ${this._bossPhase}`, hudX, 26);
      ctx.fillText(`残機 ${this.lives}`, hudX, 48);
      if (this._bossPhase === 2) {
        ctx.fillStyle = '#a0c8ff';
        ctx.font      = '12px ui-monospace, Consolas, monospace';
        ctx.fillText('青い床に乗ると崩落 → ボスに当てるとスタン', hudX, 70);
      } else if (this._bossPhase === 4) {
        ctx.fillStyle = COLORS.bossWeak;
        ctx.font      = '12px ui-monospace, Consolas, monospace';
        ctx.fillText('黄色に光った瞬間に飛び乗れ！ → 訒れると超高速突進が来る', hudX, 70);
      } else if (this._bossPhase === 5) {
        ctx.fillStyle = BOSS5_MINION_COLOR;
        ctx.font      = '12px ui-monospace, Consolas, monospace';
        ctx.fillText('停留中の頭を踏め！ 紫の手下は踏むと大ジャンプ台になる', hudX, 70);
      }
    } else {
      if (this.currentMode === 'stage') {
        const toGoal = Math.max(0, this.stageGoalHeight - height);
        ctx.fillText(`Stage ${this.currentStage}/${STAGE_COUNT}`, hudX, 26);
        ctx.fillText(`ゴールまで ${toGoal} m`, hudX, 48);
      } else {
        ctx.fillText('HEAVENS MODE', hudX, 26);
        ctx.fillText(`最高到達点 ${Math.floor(this.bestHeavensHeight)} m`, hudX, 48);
      }
      ctx.fillStyle = COLORS.text;
      ctx.font      = 'bold 15px ui-monospace, Consolas, monospace';
      ctx.fillText(`高度 ${height} m`, hudX, 70);
      ctx.fillText(`残機 ${this.lives}`, hudX, 92);
      ctx.fillStyle = COLORS.heal;
      ctx.font      = '13px ui-monospace, Consolas, monospace';
      ctx.fillText('◆ 回復床: 残機 +1', hudX, 114);
    }
    ctx.textAlign = 'left';
    if (this.debugMode) {
      // デバッグコンソールオーバーレイ
      const cw = 500, ch = 82, cx = W / 2 - cw / 2, cy = 12;
      ctx.fillStyle = 'rgba(0,0,0,0.80)';
      ctx.fillRect(cx, cy, cw, ch);
      ctx.strokeStyle = '#ffb347';
      ctx.lineWidth = 2;
      ctx.strokeRect(cx, cy, cw, ch);
      ctx.lineWidth = 1;

      const bx = cx + 10;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffb347';
      ctx.font = 'bold 12px ui-monospace, Consolas, monospace';
      ctx.fillText('[DEBUG CONSOLE]  Space: 浮遊  |  無敵ON', bx, cy + 16);

      const buf    = this.input.getTextBuffer();
      const cursor = Math.floor(Date.now() / 500) % 2 === 0 ? '█' : ' ';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px ui-monospace, Consolas, monospace';
      ctx.fillText(`> ${buf}${cursor}`, bx, cy + 40);

      ctx.fillStyle = '#aaaaaa';
      ctx.font = '11px ui-monospace, Consolas, monospace';
      ctx.fillText('1-' + STAGE_COUNT + ': ステージ  b1-b6: ボス戦  x: 終了  [Enter] で実行', bx, cy + 66);
    }

    // 操作説明
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.muted;
    ctx.font = '12px ui-monospace, Consolas, monospace';
    ctx.fillText('← → / AD: 移動  ↑ / W / Space: ジャンプ', 14, H - 12);

    // バーチャルパッド描画（タッチデバイスのみ）
    if (this._isTouchDevice) this._renderVpad(ctx);

    // オーバーレイ
    if (this.state === 'title') {
      const title = this._titleMessage || 'PLATFORMER WEB';
      const sub = this.heavensUnlocked
        ? `Space / R: Stage1 開始   H: Heavens   Best ${Math.floor(this.bestHeavensHeight)}m`
        : 'Space / R でスタート';
      this._overlay(title, sub, this._titleMessage === 'GAME OVER' ? '#ff6b7a' : COLORS.goal);
    }
    if (this.state === 'stageclear') {
      const isBossNext = this._pendingBossPhase > 0;
      const subMsg = isBossNext
        ? `BOSS PHASE ${this._pendingBossPhase} へ挑戦！  [ Space / R ]`
        : `次は Stage ${this._nextStage} へ  [ Space / R ]`;
      this._overlay(
        `STAGE ${this.currentStage} CLEAR`,
        subMsg,
        '#7df0a4'
      );
    }
    if (this.state === 'bossclear') {
      const nextMsg = this._nextStage > STAGE_COUNT
        ? 'HEAVENS MODE アンロック  [ Space / R ]'
        : `Stage ${this._nextStage} へ  [ Space / R ]`;
      this._overlay(
        `BOSS PHASE ${this._bossPhase} CLEAR!`,
        nextMsg,
        COLORS.bossWeak
      );
    }
  }

  // ===== バーチャルパッド描画 =====
  // canvas論理座標(960×540)でボタンを描く。DOM透明ゾーンと位置を合わせる。
  _renderVpad(ctx) {
    const inp  = this.input;
    const lOn  = inp.isVirtualDown('ArrowLeft');
    const rOn  = inp.isVirtualDown('ArrowRight');

    ctx.save();

    // ---- ボタン描画ヘルパー ----
    const drawBtn = (cx, cy, r, label, active) => {
      // 外円（グロー）
      ctx.globalAlpha = active ? 0.20 : 0.06;
      ctx.fillStyle   = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx, cy, r + 8, 0, Math.PI * 2);
      ctx.fill();

      // 本体円
      ctx.globalAlpha = active ? 0.55 : 0.22;
      ctx.fillStyle   = active ? '#a8d8ff' : '#ffffff';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      // 枠
      ctx.globalAlpha = active ? 0.90 : 0.45;
      ctx.strokeStyle = active ? '#70b8ff' : 'rgba(255,255,255,0.7)';
      ctx.lineWidth   = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

      // ラベル
      ctx.globalAlpha    = active ? 1.0 : 0.65;
      ctx.fillStyle      = '#ffffff';
      ctx.font           = `bold ${Math.round(r * 0.72)}px ui-monospace, monospace`;
      ctx.textAlign      = 'center';
      ctx.textBaseline   = 'middle';
      ctx.fillText(label, cx, cy + 1);
      ctx.textBaseline   = 'alphabetic';
    };

    const R = 50; // 移動ボタン半径（論理px）

    // ◀ 左移動: DOM vpad-left-btn の中心 = 左12.5% × 下22.5%上 = (120, 418)
    drawBtn(120, 418, R, '◀', lOn);

    // ▶ 右移動: DOM vpad-right-btn の中心 = 左37.5% × 下22.5%上 = (360, 418)
    drawBtn(360, 418, R, '▶', rOn);

    // ▲ ジャンプ: 右50%の中央下寄り = (720, 442)
    const JR = 60;
    // ジャンプは one-shot なので押し下げ状態なし → 常に通常表示
    ctx.globalAlpha = 0.08;
    ctx.fillStyle   = '#80ff80';
    ctx.beginPath();
    ctx.arc(720, 442, JR + 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.20;
    ctx.fillStyle   = '#80ff80';
    ctx.beginPath();
    ctx.arc(720, 442, JR, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.50;
    ctx.strokeStyle = 'rgba(140,255,140,0.8)';
    ctx.lineWidth   = 2.5;
    ctx.beginPath();
    ctx.arc(720, 442, JR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha    = 0.65;
    ctx.fillStyle      = '#c0ffc0';
    ctx.font           = `bold ${Math.round(JR * 0.72)}px ui-monospace, monospace`;
    ctx.textAlign      = 'center';
    ctx.textBaseline   = 'middle';
    ctx.fillText('▲', 720, 443);
    ctx.textBaseline   = 'alphabetic';
    ctx.textAlign      = 'left';

    ctx.restore();
  }

  _drawVerts(ctx, body) {
    const v = body.vertices;
    ctx.beginPath();
    ctx.moveTo(v[0].x, this._sy(v[0].y));
    for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, this._sy(v[i].y));
    ctx.closePath();
    ctx.fill();
  }

  _overlay(title, sub, color) {
    const ctx = this.ctx;
    ctx.fillStyle = COLORS.overlay;
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.font = 'bold 52px ui-monospace, Consolas, monospace';
    ctx.fillText(title, W / 2, H / 2 - 24);
    ctx.fillStyle = COLORS.text;
    ctx.font = '20px ui-monospace, Consolas, monospace';
    ctx.fillText(sub, W / 2, H / 2 + 24);
    ctx.textAlign = 'left';
  }
}
