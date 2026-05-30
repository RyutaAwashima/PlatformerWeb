// Boss5: LeaperMinion クラス
import { Bodies, Body, World } from 'matter-js';

export class LeaperMinion {
  constructor(x, y, world) {
    this.x = x;
    this.y = y;
    this.vx = (Math.random() - 0.5) * 2.8; // 横方向に少しばらける
    this.vy = 0;
    this.life = BOSS5_MINION_LIFE;
    this._fadeTimer = 0;
    this._landed = false;
    this._landY = null;
    this.body = Bodies.rectangle(x, y, 28, 28, {
      restitution: BOSS5_MINION_BOUNCE,
      friction: 0.18,
      label: 'leaperMinion',
    });
    Body.setStatic(this.body, false);
    World.add(world, this.body);
  }

  update(dt) {
    this.life -= dt;
    this.x = this.body.position.x;
    this.y = this.body.position.y;
    if (!this._landed && this.body.velocity.y > 0.1 && Math.abs(this.body.position.y - this.y) < 2) {
      this._landed = true;
      this._landY = this.body.position.y;
    }
    if (this.life < BOSS5_MINION_FADE) {
      this._fadeTimer = BOSS5_MINION_FADE - this.life;
    }
  }

  get isDead() { return this.life <= 0; }
  get fadeAlpha() {
    if (this.life > BOSS5_MINION_FADE) return 1;
    return Math.max(0, this.life / BOSS5_MINION_FADE);
  }
}
