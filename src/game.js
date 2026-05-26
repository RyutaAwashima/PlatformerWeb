import { Input } from './input.js';

const { Engine, Bodies, Body, World, Events } = Matter;

// ===== 定数 =====
const W = 960, H = 540;
const PLAYER_W = 28, PLAYER_H = 40;
const PLAYER_SPEED = 6;
const JUMP_VEL = -18;          // ジャンプ力（大きいほど高く飛ぶ）

const START_Y = 480;            // プレイヤー開始世界Y
const STAGE_COUNT = 6;
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
const PLAT_Y_GAP_MIN = 75;
const PLAT_Y_GAP_MAX = 105;
const PLAT_W_MIN = 120;
const PLAT_W_MAX = 220;
const PLAT_H = 16;

const COLORS = {
  bg:          '#0d0e14',
  player:      '#7df0a4',
  ground:      '#2e3044',
  platIdle:    '#4a4e6a',
  platWarn:    '#c8a040',
  platDanger:  '#d05828',
  platCritical:'#e02828',
  goal:        '#7deaff',
  heal:        '#58ff9f',
  healUsed:    '#2f5d43',
  healGlow:    'rgba(88,255,159,0.8)',
  text:        '#e6e6ea',
  muted:       '#5a5e7a',
  overlay:     'rgba(13,14,20,0.88)',
};

// ===== Platform ラッパー =====
class PlatformObj {
  constructor(body, {
    isGround = false,
    isGoal = false,
    isHealing = false,
    canCollapse = true,
  } = {}) {
    this.body         = body;
    this.isGround     = isGround;
    this.isGoal       = isGoal;
    this.isHealing    = isHealing;
    this.canCollapse  = canCollapse;
    this.healUsed     = false;
    this.state        = 'idle'; // idle | countdown | falling
    this.timer        = 0;
  }

  tryStartCountdown() {
    if (this.state === 'idle' && this.canCollapse) {
      this.state = 'countdown';
    }
  }

  update(dt) {
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

  get color() {
    if (this.isHealing) return this.healUsed ? COLORS.healUsed : COLORS.heal;
    if (this.isGoal)  return COLORS.goal;
    if (this.isGround) return COLORS.ground;
    if (this.state === 'idle') return COLORS.platIdle;
    const r = this.countdownRatio;
    if (r < 0.5)  return COLORS.platWarn;
    if (r < 0.75) return COLORS.platDanger;
    return COLORS.platCritical;
  }
}

// ===== Enemy =====
class Enemy {
  constructor(x, y) {
    this.baseX = x;
    this.baseY = y;
    this._t   = Math.random() * 1000; // ランダム位相
    this.patrolHalf  = 50 + Math.random() * 70;   // 横パトロール幅(px)
    this.patrolSpeed = 0.0006 + Math.random() * 0.0005; // rad/ms
    this.floatAmp    = 8  + Math.random() * 10;   // 上下浮遊幅(px)
    this.floatSpeed  = 0.0013 + Math.random() * 0.001;  // rad/ms
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
    this.currentStage = 1;
    this.currentMode = 'stage'; // stage | heavens
    this._nextStage = 1;
    this._titleMessage = '';
    this._init({ mode: 'stage', stage: 1, lives: MAX_LIVES });
    this.state = 'title';
    requestAnimationFrame(t => this._loop(t));
  }

  _stageGoalHeight(stage) {
    return BASE_GOAL_HEIGHT + (stage - 1) * GOAL_STEP_HEIGHT;
  }

  _stageConfig(mode, stage) {
    if (mode === 'heavens') {
      return {
        enemyRate: 0.28 + Math.random() * 0.34,
        healRate: 0.06 + Math.random() * 0.09,
      };
    }
    return {
      enemyRate: Math.min(0.22 + (stage - 1) * 0.06, 0.58),
      healRate: stage >= 3 ? Math.max(0.14 - (stage - 3) * 0.015, 0.06) : 0,
    };
  }

  // ===== 初期化 =====
  _init({ mode = 'stage', stage = 1, lives = MAX_LIVES } = {}) {
    this.engine = Engine.create({ gravity: { y: 2.0 } });
    const world = this.engine.world;

    this.state = 'playing';
    this.currentMode = mode;
    this.currentStage = stage;
    this.lives = lives;
    this.maxHeightReached     = 0;
    this.platforms            = [];
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
    this._genFrontier = spawnY - 30;
    this._generateBatch(12);

    // カメラ（プレイヤーを上から65%の位置に置く）
    this.cameraTop = spawnY - H * 0.65;

    // 衝突イベント
    Events.on(this.engine, 'collisionStart', e => {
      for (const { bodyA, bodyB } of e.pairs) {
        const other = bodyA === this.playerBody ? bodyB
                    : bodyB === this.playerBody ? bodyA : null;
        if (other === null) continue;

        // 敵との衝突 → ノックバック（CT中は無視）
        const hitEnemy = this.enemies.find(en => en.body === other);
        if (hitEnemy) {
          if (this._knockbackTimer <= 0) {
            const kx = Math.sign(this.playerBody.position.x - other.position.x) * ENEMY_KNOCK_VX;
            Body.setVelocity(this.playerBody, { x: kx, y: ENEMY_KNOCK_VY });
            this._knockbackTimer = KNOCKBACK_DURATION;
            this._contacts  = 0;
            this._jumpsLeft = 1;
          }
          continue; // _contacts は加算しない
        }

        // 台との衝突
        this._contacts++;
        this._jumpsLeft = 2; // 着地でリセット（DJ-CTはリセットしない）
        const plat = this.platforms.find(p => p.body === other);
        if (!plat) continue;

        if (plat.isHealing && !plat.healUsed) {
          plat.healUsed = true;
          this.lives = Math.min(MAX_LIVES, this.lives + 1);
          continue;
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

  _generateBatch(count) {
    let y = this._genFrontier;
    for (let i = 0; i < count; i++) {
      y -= PLAT_Y_GAP_MIN + Math.random() * (PLAT_Y_GAP_MAX - PLAT_Y_GAP_MIN);
      if (this.currentMode === 'stage' && y <= this.goalY + 40) break;

      const canSpawnHeal = this.currentStageConfig.healRate > 0 && Math.random() < this.currentStageConfig.healRate;

      const w = PLAT_W_MIN + Math.random() * (PLAT_W_MAX - PLAT_W_MIN);
      const x = w / 2 + 20 + Math.random() * (W - w - 40);

      if (canSpawnHeal) {
        this._addPlat(x, y, Math.max(130, w * 0.7), PLAT_H, { isHealing: true, canCollapse: false });
      } else {
        this._addPlat(x, y, w, PLAT_H, { canCollapse: true });
      }

      if (!canSpawnHeal && Math.random() < this.currentStageConfig.enemyRate) {
        this._spawnEnemy(30 + Math.random() * (W - 60), y - 45 - Math.random() * 25);
      }
    }
    this._genFrontier = y;
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

    // タイトル / クリア 操作
    if (this.state !== 'playing') {
      if (this.state === 'title' && (inp.isPressed('Space') || inp.isPressed('KeyR'))) {
        this._titleMessage = '';
        this._init({ mode: 'stage', stage: 1, lives: MAX_LIVES });
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

    Engine.update(this.engine, dt);
    inp.flush();

    // 台の更新
    for (const p of this.platforms) p.update(dt);

    // 画面外に落ちた台を除去
    const cullY = this.cameraTop + H + 400;
    const dead = this.platforms.filter(p => p.state === 'falling' && p.body.position.y > cullY);
    for (const p of dead) World.remove(this.engine.world, p.body);
    this.platforms = this.platforms.filter(p => !dead.includes(p));

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

    // プラットフォーム
    for (const plat of this.platforms) {
      const sy = this._sy(plat.body.position.y);
      if (sy < -80 || sy > H + 80) continue;

      if (plat.isHealing && !plat.healUsed) {
        ctx.save();
        ctx.shadowBlur = 20;
        ctx.shadowColor = COLORS.healGlow;
        ctx.fillStyle = COLORS.heal;
        this._drawVerts(ctx, plat.body);
        ctx.restore();
      }

      ctx.fillStyle = plat.color;
      this._drawVerts(ctx, plat.body);

      // カウントダウンバー（静止中のみ）
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
