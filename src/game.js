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
const STAGE_COUNT = 9;
const BASE_GOAL_HEIGHT = 1700;  // Stage1 の必要高度(px)
const GOAL_STEP_HEIGHT = 220;   // ステージごとの追加高度(px)
const HEAVENS_UNLOCK_STAGE = STAGE_COUNT;
const MAX_LIVES = 3;

const PLATFORM_COUNTDOWN  = 1800; // ms: 踏んでから落下開始まで
const DJ_COOLDOWN         = 3000; // ms: 二段ジャンプのクールタイム
const DJ_FLASH_DURATION   = 800;  // ms: 使用可能フラッシュの継続時間
const DJ_FLASH_INTERVAL   = 80;   // ms: フラッシュの点滅間隔
const ENEMY_KNOCK_VX    = 14;   // 吹き飛ばし横速度
const ENEMY_KNOCK_VY    = -12;  // 吹き飛ばし上速度
const KNOCKBACK_DURATION = 380; // ms: ノックバック中の入力無効時間
const STOMP_VY          = -24;  // 踏みつけバウンス速度（通常ジャンプより強い）
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
};

// ===== Platform ラッパー =====
class PlatformObj {
  constructor(body, {
    isGround    = false,
    isGoal      = false,
    isHealing   = false,
    canCollapse = true,
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
    this.canCollapse = canCollapse;
    this.healUsed    = false;
    this.state       = 'idle';
    this.timer       = 0;

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
    if (this.state !== 'countdown') return;
    this.timer += dt;
    if (this.timer >= PLATFORM_COUNTDOWN) {
      this.state = 'falling';
      Body.setStatic(this.body, false);
      Body.setVelocity(this.body, { x: 0, y: 5 });
      Body.setAngularVelocity(this.body, (Math.random() - 0.5) * 0.05);
    }
  }

  get countdownRatio() { return Math.min(1, this.timer / PLATFORM_COUNTDOWN); }
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

// ===== Game =====
export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.input  = new Input();
    this._lastTime = null;
    this.heavensUnlocked = false;
    this.bestHeavensHeight = 0;
    this.debugMode = false;
    this.currentStage = 1;
    this.currentMode = 'stage'; // stage | heavens
    this._nextStage = 1;
    this._titleMessage = '';
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
    return {
      enemyRate:   Math.min(0.22 + (stage - 1) * 0.06, 0.58),
      healInterval: stage >= 3 ? HEAL_INTERVAL : 0,
      movingRate:  stage >= 4 ? Math.min((stage - 3) * 0.10, 0.30) : 0,
      blinkRate:   stage >= 5 ? Math.min((stage - 4) * 0.08, 0.20) : 0,
      elevRate:    stage >= 6 ? Math.min((stage - 5) * 0.08, 0.18) : 0,
      windRate:    stage >= 7 ? Math.min((stage - 6) * 0.40, 0.80) : 0,
    };
  }

  // ===== 初期化 =====
  _init({ mode = 'stage', stage = 1, lives = MAX_LIVES, newRun = false } = {}) {
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
    this.stageGoalHeight = this.currentMode === 'stage' ? this._stageGoalHeight(this.currentStage) : null;
    this.goalY = this.stageGoalHeight !== null ? START_Y - this.stageGoalHeight : null;
    this.currentStageConfig = this._stageConfig(this.currentMode, this.currentStage);

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
      ? spawnY - 170 - this.currentStageConfig.healInterval
      : -9999999;
    this.windZones     = [];
    this._windFrontier = spawnY - 600;  // 最初の風ゾーンは600px上空から生成開始
    this._generateBatch(12);

    // カメラ（プレイヤーを上から65%の位置に置く）
    this.cameraTop = spawnY - H * 0.65;

    // 衝突イベント
    Events.on(this.engine, 'collisionStart', e => {
      for (const { bodyA, bodyB } of e.pairs) {
        const other = bodyA === this.playerBody ? bodyB
                    : bodyB === this.playerBody ? bodyA : null;
        if (other === null) continue;

        // Matter.js: 正Y方向が下 → velocity.y > 0 で落下中
        const playerFalling = this.playerBody.velocity.y > 0;
        const playerAbove   = this.playerBody.position.y < other.position.y;

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
          if (this.currentStage >= HEAVENS_UNLOCK_STAGE) {
            this.heavensUnlocked = true;
            this.state = 'title';
            this._titleMessage = 'HEAVENS MODE UNLOCKED';
          } else {
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

      // 回復床の直後は明滅床を優先配置（タイミング次第できつい）
      if (this._blinkAfterHeal && cfg.blinkRate > 0) {
        this._addBlinkingPlat(x, y, w);
        this._blinkAfterHeal = false;
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
    const en = new Enemy(x, y);
    World.add(this.engine.world, en.body);
    this.enemies.push(en);
  }

  _loseLife() {
    const nextLives = this.lives - 1;
    if (nextLives <= 0) {
      if (this.currentMode === 'heavens') {
        this.bestHeavensHeight = Math.max(this.bestHeavensHeight, Math.floor(this.maxHeightReached));
      }
      this.state = 'title';
      this._titleMessage = 'GAME OVER';
      return;
    }
    this._init({ mode: this.currentMode, stage: this.currentStage, lives: nextLives });
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

    // デバッグショートカット
    if (inp.isPressed('Digit0')) {
      this.debugMode = !this.debugMode;
      this._titleMessage = this.debugMode ? 'DEBUG MODE ON' : '';
    }
    if (this.debugMode) {
      if (inp.isPressed('Digit1')) this._debugJumpToStage(this.currentStage - 1);
      if (inp.isPressed('Digit2')) this._debugJumpToStage(this.currentStage + 1);
      if (inp.isPressed('Digit3')) this._debugEnterHeavens();
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
        this._init({ mode: 'stage', stage: this._nextStage, lives: this.lives });
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

    // 画面外に落ちた台を除去
    const cullY = this.cameraTop + H + 400;
    const dead = this.platforms.filter(p => p.state === 'falling' && p.body.position.y > cullY);
    for (const p of dead) World.remove(this.engine.world, p.body);
    this.platforms = this.platforms.filter(p => !dead.includes(p));

    // 上昇完了エレベーターを除去
    const deadElev = this.platforms.filter(p => p.isElevator && p.elevState === 'gone');
    for (const p of deadElev) { World.remove(this.engine.world, p.body); this._ridingPlatforms.delete(p); }
    this.platforms = this.platforms.filter(p => !(p.isElevator && p.elevState === 'gone'));

    // 敵の更新・カリング
    for (const en of this.enemies) en.update(dt);
    const deadEn = this.enemies.filter(en => en.baseY > this.cameraTop + H + 400);
    for (const en of deadEn) World.remove(this.engine.world, en.body);
    this.enemies = this.enemies.filter(en => !deadEn.includes(en));

    // カメラ追従（上方向のみ）
    const targetTop = b.position.y - H * 0.65;
    if (targetTop < this.cameraTop) this.cameraTop += (targetTop - this.cameraTop) * 0.12;

    // 高度更新
    const h = START_Y - b.position.y;
    if (h > this.maxHeightReached) {
      this.maxHeightReached = h;
    }

    // 追加生成
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

    // 風ゾーンアニメーション時間更新
    for (const zone of this.windZones) zone._animT += dt;

    // 画面外に消えた瞬間に落下判定
    if (b.position.y - PLAYER_H * 0.5 > this.cameraTop + H) {
      this._loseLife();
      return;
    }
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

      ctx.fillStyle = plat.color;
      this._drawVerts(ctx, plat.body);

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
      const ex = en.body.position.x;
      const esy = this._sy(en.body.position.y);
      if (esy < -60 || esy > H + 60) continue;
      // 胴体
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

    // プレイヤー（フラッシュ中は白と交互）
    const isFlash = this._flashTimer > 0 && Math.floor(this._flashTimer / DJ_FLASH_INTERVAL) % 2 === 0;
    ctx.fillStyle = isFlash ? '#ffffff' : COLORS.player;
    this._drawVerts(ctx, this.playerBody);

    // ゴール近くの表示
    const goalSY = this.goalY !== null ? this._sy(this.goalY) : null;
    if (goalSY !== null && goalSY > -30 && goalSY < H + 30) {
      ctx.fillStyle = COLORS.goal;
      ctx.font = 'bold 14px ui-monospace, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('★  G O A L  ★', W / 2, goalSY - 22);
      ctx.textAlign = 'left';
    }

    // HUD
    const height = Math.max(0, Math.floor(START_Y - this.playerBody.position.y));
    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 15px ui-monospace, Consolas, monospace';
    if (this.currentMode === 'stage') {
      const toGoal = Math.max(0, this.stageGoalHeight - height);
      ctx.fillText(`Stage ${this.currentStage}/${STAGE_COUNT}`, 14, 26);
      ctx.fillText(`ゴールまで ${toGoal} m`, 14, 48);
    } else {
      ctx.fillText('HEAVENS MODE', 14, 26);
      ctx.fillText(`最高到達点 ${Math.floor(this.bestHeavensHeight)} m`, 14, 48);
    }
    ctx.fillText(`高度 ${height} m`, 14, 70);
    ctx.fillText(`ライフ ${this.lives}`, 14, 92);
    ctx.fillStyle = COLORS.heal;
    ctx.font = '13px ui-monospace, Consolas, monospace';
    ctx.fillText('◆ 回復床: 1回だけライフ +1', 14, 114);
    if (this.debugMode) {
      ctx.fillStyle = '#ffb347';
      ctx.font = '12px ui-monospace, Consolas, monospace';
      ctx.fillText('DEBUG: 1 戻る / 2 進む / 3 Heavens / Space 長押し浮遊', 14, 136);
    }

    // 二段ジャンプ インジケータ（右上）
    if (this._canDoubleJump) {
      ctx.fillStyle = '#7df0a4';
      ctx.font = 'bold 13px ui-monospace, Consolas, monospace';
      ctx.textAlign = 'right';
      ctx.fillText('2段J ▲ 使用可', W - 12, 22);
    } else {
      const ratio = 1 - this._djCooldown / DJ_COOLDOWN;
      // CTバー
      ctx.fillStyle = '#2a2d3a';
      ctx.fillRect(W - 162, 10, 150, 10);
      ctx.fillStyle = '#b06bff';
      ctx.fillRect(W - 162, 10, 150 * ratio, 10);
      ctx.fillStyle = COLORS.muted;
      ctx.font = '11px ui-monospace, Consolas, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`2段J CT ${(this._djCooldown / 1000).toFixed(1)}s`, W - 12, 34);
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.muted;
    ctx.font = '12px ui-monospace, Consolas, monospace';
    ctx.fillText('← → / AD: 移動  ↑ / W / Space: ジャンプ', 14, H - 12);

    // オーバーレイ
    if (this.state === 'title') {
      const title = this._titleMessage || 'PLATFORMER WEB';
      const sub = this.heavensUnlocked
        ? `Space / R: Stage1 開始   H: Heavens   Best ${Math.floor(this.bestHeavensHeight)}m`
        : 'Space / R でスタート';
      this._overlay(title, sub, this._titleMessage === 'GAME OVER' ? '#ff6b7a' : COLORS.goal);
    }
    if (this.state === 'stageclear') {
      this._overlay(
        `STAGE ${this.currentStage} CLEAR`,
        `次は Stage ${this._nextStage} へ  [ Space / R ]`,
        '#7df0a4'
      );
    }
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
