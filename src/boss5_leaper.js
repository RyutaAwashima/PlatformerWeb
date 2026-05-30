// Boss5: BossLeaper クラス
import { Bodies, Body, World } from 'matter-js';
import { LeaperMinion } from './boss5_minion.js';

export class BossLeaper {
  constructor(x, y, world) {
    this.hp = BOSS5_HP_MAX;
    this.bW = BOSS5_W;
    this.bH = BOSS5_H;
    this.x = x;
    this.y = y;
    this.state = 'roam'; // roam|jump_up|perch|dive_warn|diving|shockwave|stunned|dead
    this.timer = 0;
    this.vx = 0;
    this.vy = 0;
    this._weakActive = false;
    this._hitFlash = 0;
    this._minions = [];
    this._minionTimers = [200, 600, 1000]; // ミニオン投下タイミング
    this._minionIndex = 0;
    this._diveTargetX = x;
    this._diveWarnY = BOSS5_PERCH_Y + 18;
    this.body = Bodies.rectangle(x, y, this.bW, this.bH, {
      label: 'boss', isSensor: true, isStatic: true,
    });
    this.weakBody = Bodies.rectangle(x, -9999, Math.round(this.bW * 0.55), 12, {
      label: 'bossWeak', isSensor: true, isStatic: true,
    });
    World.add(world, [this.body, this.weakBody]);
  }

  update(dt, playerX, world) {
    this.timer += dt;
    if (this._hitFlash > 0) this._hitFlash -= dt;
    // ミニオン更新
    for (const m of this._minions) m.update(dt);
    this._minions = this._minions.filter(m => !m.isDead);
    if (this._minions.length > BOSS5_MINION_MAX) {
      // 古いものから消す
      this._minions.sort((a, b) => a.life - b.life);
      while (this._minions.length > BOSS5_MINION_MAX) {
        const gone = this._minions.shift();
        World.remove(world, gone.body);
      }
    }
    switch (this.state) {
      case 'roam': {
        const dir = playerX > this.x ? 1 : -1;
        this.x += dir * BOSS5_WALK_SPD * (dt / 16.67);
        if (this.timer >= BOSS5_ROAM_MS) {
          this.state = 'jump_up';
          this.timer = 0;
          this.vy = BOSS5_JUMP_VY;
        }
        break;
      }
      case 'jump_up': {
        this.vy += BOSS5_GRAVITY * (dt / 16.67);
        this.y += this.vy * (dt / 16.67);
        if (this.y <= BOSS5_PERCH_Y) {
          this.y = BOSS5_PERCH_Y;
          this.vy = 0;
          this.state = 'perch';
          this.timer = 0;
          this._minionIndex = 0;
        }
        break;
      }
      case 'perch': {
        this._weakActive = true;
        // ミニオン投下
        while (this._minionIndex < this._minionTimers.length && this.timer >= this._minionTimers[this._minionIndex]) {
          const mx = this.x + (Math.random() - 0.5) * 160;
          const minion = new LeaperMinion(mx, this.y + 18, world);
          this._minions.push(minion);
          this._minionIndex++;
        }
        if (this.timer >= BOSS5_PERCH_MS) {
          this._weakActive = false;
          this.state = 'dive_warn';
          this.timer = 0;
          this._diveTargetX = playerX;
        }
        break;
      }
      case 'dive_warn': {
        // ゆっくり降下しつつ床にマーカー
        this.y += 0.7 * (dt / 16.67);
        if (this.timer >= BOSS5_WARN_MS) {
          this.state = 'diving';
          this.timer = 0;
          this.vy = 0;
        }
        break;
      }
      case 'diving': {
        this._weakActive = true;
        this.vy += BOSS5_DIVE_GRAV * (dt / 16.67);
        this.y += this.vy * (dt / 16.67);
        if (this.y >= BOSS_FLOOR_Y - this.bH / 2) {
          this.y = BOSS_FLOOR_Y - this.bH / 2;
          this.vy = 0;
          this._weakActive = false;
          this.state = 'shockwave';
          this.timer = 0;
        }
        break;
      }
      case 'shockwave': {
        // TODO: 衝撃波実装
        if (this.timer >= 1200) {
          this.state = 'roam';
          this.timer = 0;
        }
        break;
      }
      case 'stunned': {
        if (this.timer >= BOSS5_STUN_MS) {
          this.state = 'roam';
          this.timer = 0;
        }
        break;
      }
      case 'dead': {
        // 何もしない
        break;
      }
    }
    Body.setPosition(this.body, { x: this.x, y: this.y });
    Body.setPosition(this.weakBody, {
      x: this.x,
      y: this._weakActive ? this.y - this.bH / 2 - 5 : -9999,
    });
  }

  stompWeak() {
    // perch/dive中に踏まれたら即スタン
    if (this.state !== 'perch' && this.state !== 'diving') return;
    this._weakActive = true;
    this._hitFlash = 500;
    this.state = 'stunned';
    this.timer = 0;
  }

  stomp() {
    // スタン中に踏まれたらダメージ
    if (this.state !== 'stunned') return;
    this.hp--;
    this._hitFlash = 320;
    this._weakActive = false;
    if (this.hp <= 0) {
      this.state = 'dead';
    } else {
      this.state = 'roam';
      this.timer = 0;
    }
  }
}
