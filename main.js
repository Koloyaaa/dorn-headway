(function () {
  "use strict";

  const physics = window.BouncePhysics;

  const SMALL_RADIUS = 18;
  const BIG_RADIUS = SMALL_RADIUS * 2;
  const SMALL_MASS = 4;
  const BIG_MASS = 16;
  const BALLOON_RADIUS = 9;
  const BALLOON_MASS = 1;
  const BALLOON_SPEED_MULT = 12;
  const LAUNCH_SPEED = 560;
  const TOOL_COOLDOWNS = { ball: 0.35, balloon: 0.15, bomb: 3, blackhole: 5 };
  const BOMB_RADIUS = SMALL_RADIUS;
  const BOMB_MASS = SMALL_MASS;
  const EXPLOSION_IMPULSE = 30000000;
  const EXPLOSION_MAX_DELTA_V = 2200;
  const EXPLOSION_DESTROY_RADIUS = SMALL_RADIUS * 1.5;
  const BLACKHOLE_RADIUS = BALLOON_RADIUS;
  const BLACKHOLE_MASS = 8192;
  const BLACKHOLE_HALF_LIFE = 0.5;
  const BLACKHOLE_GRAVITY = 20000;
  const BLACKHOLE_SPEED = LAUNCH_SPEED / 8;
  const BLACKHOLE_CART_BONUS = 128;
  const BLACKHOLE_DISK_RADIUS = BIG_RADIUS;
  const AIM_MIN = 0.18;
  const AIM_MAX = Math.PI - 0.18;
  const GHOST_RADIUS = SMALL_RADIUS * 0.6;
  const MAX_OPEN_BIGS = 3;
  const SPAWN_INTERVAL = 2.4;
  const BIG_MIN_SPEED = 30;
  const BIG_MAX_SPEED = 130;
  const SPIN_CHANCE = 0.5;
  const BIG_MAX_SPIN_RPS = 1;
  const SPIN_UNIT = Math.PI * 2;
  const FIXED_DT = 1 / 240;
  const ATTACH_FADE = 0.25;
  const EMITTER_Y = 56;
  const EMITTER_SPEED = 520;
  const EMITTER_MIN_FACTOR = 0.15;
  const EMITTER_MAX_FACTOR = 0.85;
  const WALL_RESTITUTION = 1;
  const OBJECT_RESTITUTION = 1;
  const CART_HIT_RESTITUTION = 1;
  const SPAWN_TOP_ZONE = 210;
  const SPAWN_BOTTOM_ZONE = 230;

  const CART_SPEED = 190;
  const CART_GAP_BASE = 1.8;
  const TURBO_CART_GAP = 0.95;
  const CART_FIRST_DELAY = 2.5;
  const CART_HP = 5;
  const HIT_SPEED = 150;
  const HIT_POINTS_PER_DAMAGE = 3;
  const HIT_POINTS_BY_TYPE = { ball: 2, big: 4, head: 6, balloon: 1 };
  const BOMB_CART_HIT_POINTS = 12;
  const ABSORB_RADIUS = 118;
  const CART_BASELINE = 84;
  const ELECTRIC_FIELD_STRENGTH = 12000;

  const canvas = document.getElementById("board");
  const context = canvas.getContext("2d");
  const stepsNode = document.getElementById("hud-steps");
  const deliveredNode = document.getElementById("hud-delivered");
  const emptyNode = document.getElementById("hud-empty");
  const blownNode = document.getElementById("hud-blown");
  const streakNode = document.getElementById("hud-streak");
  const rateNode = document.getElementById("hud-rate");
  const pauseOverlay = document.getElementById("pause-overlay");
  const resumeButton = document.getElementById("resume-button");
  const restartButton = document.getElementById("restart-button");
  const homeOverlay = document.getElementById("start-overlay");
  const startButton = document.getElementById("start-button");
  const endOverlay = document.getElementById("end-overlay");
  const endReason = document.getElementById("end-reason");
  const endStats = document.getElementById("end-stats");
  const endAgainButton = document.getElementById("end-again");
  const endHomeButton = document.getElementById("end-home");
  const invincibleToggle = document.getElementById("invincible-toggle");
  const strictToggle = document.getElementById("strict-toggle");
  const turboToggle = document.getElementById("turbo-toggle");
  const settingsOverlay = document.getElementById("settings-overlay");
  const settingsOpenButton = document.getElementById("settings-open");
  const settingsBackButton = document.getElementById("settings-back");
  const pauseHomeButton = document.getElementById("pause-home");
  const helpOverlay = document.getElementById("help-overlay");
  const helpOpenButton = document.getElementById("help-open");
  const helpBackButton = document.getElementById("help-back");
  const aboutOverlay = document.getElementById("about-overlay");
  const aboutButton = document.getElementById("about-button");
  const aboutBackButton = document.getElementById("about-back");
  const gameLogo = document.querySelector(".game-logo");
  const stageHead = document.querySelector(".stage-head");
  const toolDock = document.getElementById("tool-dock");
  const toolNameNode = document.getElementById("tool-name");

  const SETTINGS_KEY = "dorn-headway-settings-v1";

  function loadSettings() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || "null");
      return {
        invincible: Boolean(saved && saved.invincible),
        strict: Boolean(saved && saved.strict),
        turbo: Boolean(saved && saved.turbo),
      };
    } catch (_) {
      return { invincible: false, strict: false, turbo: false };
    }
  }

  function saveSettings() {
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (_) {
      // settings just won't persist
    }
  }

  const world = physics.createWorld({
    width: window.innerWidth,
    height: window.innerHeight,
    iterations: 8,
    objectRestitution: OBJECT_RESTITUTION,
    wallRestitution: WALL_RESTITUTION,
    kinematicRestitution: CART_HIT_RESTITUTION,
  });

  let viewWidth = window.innerWidth;
  let viewHeight = window.innerHeight;
  let pixelRatio = 1;

  const settings = loadSettings();
  const TOOLS = ["ball", "balloon", "bomb", "blackhole"];
  const TOOL_NAMES = { ball: "小圆", balloon: "气球", bomb: "炸弹", blackhole: "黑洞" };
  const SLOW_MOTION_SCALE = 1 / 8;
  const heldKeys = new Set();
  const lastLaunchByTool = { ball: -Infinity, balloon: -Infinity, bomb: -Infinity, blackhole: -Infinity };
  let selectedToolIndex = 0;
  let emitterFactor = 0.5;
  let timeScale = 1;
  let lastPointer = null;
  let started = false;
  let ended = false;
  let consecutiveBlown = 0;
  let aim = Math.PI / 2;
  let stepCount = 0;
  let headCount = 0;
  let deliveredCount = 0;
  let emptyCount = 0;
  let blownCount = 0;
  let spawnCooldown = 0.8;
  let simTime = 0;
  let paused = false;

  const carts = [];
  let cartSpawnCooldown = CART_FIRST_DELAY;
  const particles = [];
  const toasts = [];
  const shockRings = [];

  function applyViewport() {
    viewWidth = window.innerWidth;
    viewHeight = window.innerHeight;
    pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(viewWidth * pixelRatio);
    canvas.height = Math.round(viewHeight * pixelRatio);
    canvas.style.width = viewWidth + "px";
    canvas.style.height = viewHeight + "px";
    world.width = viewWidth;
    world.height = viewHeight;
  }

  function emitterPoint() {
    return { x: viewWidth * emitterFactor, y: EMITTER_Y };
  }

  function addBall(x, y, vx, vy) {
    return world.addBody({
      parts: [{ x, y, r: SMALL_RADIUS, mass: SMALL_MASS, kind: "ball" }],
      vx,
      vy,
      tag: "ball",
    });
  }

  function addBalloon(x, y, vx, vy) {
    return world.addBody({
      parts: [{ x, y, r: BALLOON_RADIUS, mass: BALLOON_MASS, kind: "balloon" }],
      vx,
      vy,
      tag: "balloon",
    });
  }

  function addBomb(x, y, vx, vy) {
    return world.addBody({
      parts: [{ x, y, r: BOMB_RADIUS, mass: BOMB_MASS, kind: "bomb" }],
      vx,
      vy,
      tag: "bomb",
    });
  }

  function addBlackhole(x, y, vx, vy) {
    return world.addBody({
      parts: [{ x, y, r: BLACKHOLE_RADIUS, mass: BLACKHOLE_MASS, kind: "blackhole" }],
      vx,
      vy,
      tag: "blackhole",
    });
  }

  function addBigCircle(x, y) {
    const speed = BIG_MIN_SPEED + Math.random() * (BIG_MAX_SPEED - BIG_MIN_SPEED);
    const direction = Math.random() * Math.PI * 2;
    const omega = Math.random() < SPIN_CHANCE
      ? (Math.random() * 2 - 1) * BIG_MAX_SPIN_RPS * SPIN_UNIT
      : 0;
    return world.addBody({
      parts: [{ x, y, r: BIG_RADIUS, mass: BIG_MASS, kind: "big" }],
      vx: Math.cos(direction) * speed,
      vy: Math.sin(direction) * speed,
      omega,
      tag: "big",
      data: { ears: 0 },
    });
  }

  function findSpawnSpot() {
    const margin = BIG_RADIUS + 26;
    const emitter = emitterPoint();
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const x = margin + Math.random() * Math.max(1, viewWidth - margin * 2);
      const y = SPAWN_TOP_ZONE
        + Math.random() * Math.max(1, viewHeight - SPAWN_TOP_ZONE - SPAWN_BOTTOM_ZONE);
      if (physics.distance(x, y, emitter.x, emitter.y) < 190) continue;
      let clear = true;
      for (const body of world.bodies) {
        for (const part of body.parts) {
          const wp = physics.worldPoint(body, part);
          if (physics.distance(x, y, wp.x, wp.y) < BIG_RADIUS + part.r + 28) {
            clear = false;
            break;
          }
        }
        if (!clear) break;
      }
      if (clear) return { x, y };
    }
    return null;
  }

  function spawnBigCircle() {
    const spot = findSpawnSpot();
    if (!spot) return null;
    return addBigCircle(spot.x, spot.y);
  }

  function fire() {
    if (!started || ended || paused) return false;
    const tool = TOOLS[selectedToolIndex];
    if (simTime - lastLaunchByTool[tool] < TOOL_COOLDOWNS[tool]) return false;
    lastLaunchByTool[tool] = simTime;
    const emitter = emitterPoint();
    const dirX = Math.cos(aim);
    const dirY = Math.sin(aim);
    if (tool === "balloon") {
      const speed = LAUNCH_SPEED * BALLOON_SPEED_MULT;
      addBalloon(emitter.x, emitter.y, dirX * speed, dirY * speed);
    } else if (tool === "bomb") {
      addBomb(emitter.x, emitter.y, dirX * LAUNCH_SPEED, dirY * LAUNCH_SPEED);
    } else if (tool === "blackhole") {
      addBlackhole(emitter.x, emitter.y, dirX * BLACKHOLE_SPEED, dirY * BLACKHOLE_SPEED);
    } else {
      addBall(emitter.x, emitter.y, dirX * LAUNCH_SPEED, dirY * LAUNCH_SPEED);
    }
    stepCount += 1;
    updateHud();
    return true;
  }

  function bigPartOf(body) {
    for (const part of body.parts) {
      if (part.kind === "big") return part;
    }
    return body.parts[0];
  }

  function ghostPoint(big) {
    if (big.parts.length < 2) return null;
    const bigPos = physics.worldPoint(big, bigPartOf(big));
    const earPos = physics.worldPoint(big, big.parts[1]);
    const dx = earPos.x - bigPos.x;
    const dy = earPos.y - bigPos.y;
    const dist = Math.hypot(dx, dy) || 1;
    return {
      x: bigPos.x - (dx / dist) * (BIG_RADIUS + SMALL_RADIUS),
      y: bigPos.y - (dy / dist) * (BIG_RADIUS + SMALL_RADIUS),
    };
  }

  function translationTravel(a, b) {
    return (Math.hypot(a.vx, a.vy) + Math.hypot(b.vx, b.vy)) * FIXED_DT;
  }

  function ghostTravel(a, b) {
    const ghostSpeed = Math.hypot(a.vx, a.vy) + Math.abs(a.omega) * (BIG_RADIUS + SMALL_RADIUS);
    return (ghostSpeed + Math.hypot(b.vx, b.vy)) * FIXED_DT;
  }

  function tryAttach() {
    let balls = world.bodies.filter((body) => body.tag === "ball");
    if (!balls.length) return;

    for (const big of world.bodies) {
      if (big.tag !== "big" || big.data.ears >= 2) continue;
      const bigPos = physics.worldPoint(big, bigPartOf(big));
      for (const ball of balls) {
        const ballPos = physics.worldPoint(ball, ball.parts[0]);
        let attachPos = null;

        if (big.data.ears === 0) {
          const dist = physics.distance(ballPos.x, ballPos.y, bigPos.x, bigPos.y);
          const tolerance = translationTravel(big, ball) + 0.75;
          if (dist <= BIG_RADIUS + SMALL_RADIUS + tolerance) {
            const nx = dist > 0.001 ? (ballPos.x - bigPos.x) / dist : -Math.cos(aim);
            const ny = dist > 0.001 ? (ballPos.y - bigPos.y) / dist : -Math.sin(aim);
            attachPos = {
              x: bigPos.x + nx * (BIG_RADIUS + SMALL_RADIUS),
              y: bigPos.y + ny * (BIG_RADIUS + SMALL_RADIUS),
            };
          }
        } else {
          const ghost = ghostPoint(big);
          if (ghost) {
            const dist = physics.distance(ballPos.x, ballPos.y, ghost.x, ghost.y);
            const tolerance = ghostTravel(big, ball) + 0.75;
            if (dist <= GHOST_RADIUS + tolerance) attachPos = ghost;
          }
        }

        if (attachPos) {
          attachEar(big, ball, attachPos);
          balls = balls.filter((item) => item !== ball);
          break;
        }
      }
    }
  }

  function attachEar(big, ball, position) {
    const isSecond = big.data.ears === 1;
    const ballVel = { x: ball.vx, y: ball.vy };
    world.removeBody(ball);
    big.attachCircle(
      {
        x: position.x,
        y: position.y,
        r: SMALL_RADIUS,
        mass: SMALL_MASS,
        kind: isSecond ? "ear2" : "ear1",
        bornAt: simTime,
      },
      ballVel
    );
    big.data.ears += 1;
    if (big.data.ears === 2) {
      headCount += 1;
      updateHud();
    }
  }

  function currentCartGap() {
    return settings.turbo ? TURBO_CART_GAP : CART_GAP_BASE;
  }

  function spawnCart() {
    const startX = -150;
    const cartY = viewHeight - CART_BASELINE;
    const cart = world.addBody({
      parts: [
        { x: startX, y: cartY - 2, r: 52, mass: 20, kind: "cart-body" },
        { x: startX - 60, y: cartY - 8, r: 18, mass: 5, kind: "cart-arm" },
        { x: startX + 60, y: cartY - 8, r: 18, mass: 5, kind: "cart-arm" },
      ],
      vx: CART_SPEED,
      vy: 0,
      kinematic: true,
      tag: "cart",
      data: { hp: CART_HP, maxHp: CART_HP, state: "active", flashUntil: 0, loaded: false, hitPoints: 0 },
    });
    carts.push(cart);
    return cart;
  }

  function updateCarts(dt) {
    if (settings.turbo) {
      cartSpawnCooldown -= dt;
      if (cartSpawnCooldown <= 0) {
        spawnCart();
        cartSpawnCooldown = currentCartGap();
      }
    } else if (carts.length === 0) {
      cartSpawnCooldown -= dt;
      if (cartSpawnCooldown <= 0) {
        spawnCart();
        cartSpawnCooldown = CART_GAP_BASE;
      }
    }

    for (let i = carts.length - 1; i >= 0; i -= 1) {
      const cart = carts[i];
      cart.x += CART_SPEED * dt;
      cart.vx = CART_SPEED;

      if (cart.data.state === "active") tryAbsorbHeadFor(cart);
      checkCartHits(cart);

      if (cart.x > viewWidth + 170) {
        if (cart.data.loaded) {
          deliveredCount += 1;
          consecutiveBlown = 0;
          pushToast("送达 +1");
        } else {
          emptyCount += 1;
          pushToast("空车…");
        }
        world.removeBody(cart);
        carts.splice(i, 1);
        updateHud();
      }
    }
  }

  function tryAbsorbHeadFor(cart) {
    let best = null;
    let bestDist = Infinity;
    for (const body of world.bodies) {
      if (body.tag !== "big" || body.data.ears !== 2) continue;
      const headPos = physics.worldPoint(body, bigPartOf(body));
      const dist = physics.distance(headPos.x, headPos.y, cart.x, cart.y + 6);
      if (dist <= ABSORB_RADIUS && dist < bestDist) {
        best = body;
        bestDist = dist;
      }
    }
    if (best) {
      world.removeBody(best);
      cart.data.loaded = true;
      cart.data.state = "loaded";
      cart.data.hitPoints = 0;
      pushToast("接住了！");
    }
  }

  function applyCartDamage(cart, points) {
    if (cart.data.hp <= 0) return;
    cart.data.flashUntil = simTime + 0.28;
    cart.data.hitPoints += points;
    while (cart.data.hitPoints >= HIT_POINTS_PER_DAMAGE && cart.data.hp > 0) {
      cart.data.hitPoints -= HIT_POINTS_PER_DAMAGE;
      cart.data.hp -= 1;
    }
    if (cart.data.hp <= 0) {
      cart.data.hp = 0;
      explodeCart(cart);
    }
  }

  function checkCartHits(cart) {
    const state = cart.data.state;
    const activeHits = state === "active";
    const strictHits = state === "loaded" && settings.strict;
    if (!activeHits && !strictHits) return;

    for (const body of world.bodies) {
      if (body === cart) continue;
      if (body.tag === "balloon" || body.tag === "bomb" || body.tag === "blackhole") continue;

      let touching = false;
      for (const partA of body.parts) {
        const wa = physics.worldPoint(body, partA);
        for (const partB of cart.parts) {
          const wb = physics.worldPoint(cart, partB);
          if (physics.distance(wa.x, wa.y, wb.x, wb.y) <= partA.r + partB.r + 2) {
            touching = true;
            break;
          }
        }
        if (touching) break;
      }

      if (!touching) {
        if (body.data.hitCarts) body.data.hitCarts.delete(cart);
        continue;
      }
      if (body.data.lastCartHitAt !== undefined && simTime - body.data.lastCartHitAt < 0.35) continue;
      const relSpeed = Math.hypot(body.vx - cart.vx, body.vy);
      if (relSpeed < HIT_SPEED) continue;
      if (!body.data.hitCarts) body.data.hitCarts = new WeakSet();
      if (body.data.hitCarts.has(cart)) continue;
      body.data.hitCarts.add(cart);
      body.data.lastCartHitAt = simTime;
      applyCartDamage(cart, activeHits ? hitPointsFor(body) : 1);
      if (cart.data.hp <= 0) return;
    }
  }

  function hitPointsFor(body) {
    if (body.tag === "ball") return HIT_POINTS_BY_TYPE.ball;
    if (body.tag === "big" && body.data.ears === 2) return HIT_POINTS_BY_TYPE.head;
    return HIT_POINTS_BY_TYPE.big;
  }

  function explodeCart(cart) {
    spawnBurst(cart.x, cart.y);
    world.removeBody(cart);
    const index = carts.indexOf(cart);
    if (index >= 0) carts.splice(index, 1);
    blownCount += 1;
    consecutiveBlown += 1;
    pushToast("炸单！");
    updateHud();
    if (!settings.invincible && consecutiveBlown >= blowLimitThreshold()) {
      endGame();
    }
  }

  function blowLimitThreshold() {
    return 8 - Math.log(deliveredCount + 1);
  }

  function allowedStreak() {
    return Math.max(0, Math.ceil(blowLimitThreshold()) - 1);
  }

  function endGame() {
    ended = true;
    timeScale = 1;
    setPaused(false);
    toolDock.hidden = true;
    toolNameNode.hidden = true;
    endReason.textContent = `连续炸单 ${consecutiveBlown} 次，超过了当前上限 ${allowedStreak()} 次（送达 ${deliveredCount} 次后，送货越多容错越小）。`;
    const rate = deliveryRate();
    endStats.textContent = `送达 ${deliveredCount} · 空车 ${emptyCount} · 炸单 ${blownCount} · 送达率 ${rate === null ? "--" : `${rate}%`}`;
    endOverlay.hidden = false;
  }

  function startRun() {
    homeOverlay.hidden = true;
    endOverlay.hidden = true;
    toolDock.hidden = false;
    toolNameNode.hidden = false;
    started = true;
    ended = false;
    setPaused(false);
    resetGame();
    syncToolDock();
  }

  function goHome() {
    started = false;
    ended = false;
    timeScale = 1;
    setPaused(false);
    world.clear();
    carts.length = 0;
    particles.length = 0;
    toasts.length = 0;
    toolDock.hidden = true;
    toolNameNode.hidden = true;
    settingsOverlay.hidden = true;
    helpOverlay.hidden = true;
    aboutOverlay.hidden = true;
    homeOverlay.hidden = false;
    endOverlay.hidden = true;
  }

  function spawnBurst(x, y, palette) {
    const colors = palette || ["#e8a25f", "#8fa4b3"];
    for (let i = 0; i < 24; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 90 + Math.random() * 280;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 3 + Math.random() * 5,
        born: simTime,
        life: 0.45 + Math.random() * 0.35,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (simTime - p.born >= p.life) particles.splice(i, 1);
    }
  }

  function pushToast(text) {
    toasts.push({ text, born: simTime });
    if (toasts.length > 4) toasts.shift();
  }

  function updateToasts() {
    while (toasts.length && simTime - toasts[0].born > 1.7) toasts.shift();
  }

  function deliveryRate() {
    const total = deliveredCount + emptyCount + blownCount;
    if (total === 0) return null;
    return Math.round((deliveredCount / total) * 100);
  }

  function updateHud() {
    stepsNode.textContent = String(stepCount);
    deliveredNode.textContent = String(deliveredCount);
    emptyNode.textContent = String(emptyCount);
    blownNode.textContent = String(blownCount);
    streakNode.textContent = String(consecutiveBlown);
    const rate = deliveryRate();
    rateNode.textContent = rate === null ? "--" : `${rate}%`;
  }

  function updateEmitter(dt) {
    let direction = 0;
    if (heldKeys.has("KeyA")) direction -= 1;
    if (heldKeys.has("KeyD")) direction += 1;
    if (!direction) return;
    const realDt = dt / timeScale;
    emitterFactor = Math.min(
      EMITTER_MAX_FACTOR,
      Math.max(EMITTER_MIN_FACTOR, emitterFactor + direction * (EMITTER_SPEED / viewWidth) * realDt)
    );
    if (lastPointer) updateAim(lastPointer.x, lastPointer.y);
  }

  function checkBalloonImpacts() {
    for (const balloon of [...world.bodies]) {
      if (balloon.tag !== "balloon") continue;
      const part = balloon.parts[0];
      const wp = physics.worldPoint(balloon, part);
      let impacted = wp.x - part.r <= 0 || wp.x + part.r >= viewWidth
        || wp.y - part.r <= 0 || wp.y + part.r >= viewHeight;
      let hitCart = null;
      if (!impacted) {
        for (const body of world.bodies) {
          if (body === balloon) continue;
          let touched = false;
          for (const other of body.parts) {
            const w2 = physics.worldPoint(body, other);
            if (physics.distance(wp.x, wp.y, w2.x, w2.y) <= part.r + other.r + 2) {
              touched = true;
              break;
            }
          }
          if (touched) {
            impacted = true;
            if (body.tag === "cart") hitCart = body;
            break;
          }
        }
      }
      if (impacted) popBalloon(balloon, wp, hitCart);
    }
  }

  function popBalloon(balloon, pos, cart) {
    world.removeBody(balloon);
    spawnBurst(pos.x, pos.y, ["#f2a8bb", "#e089a3"]);
    if (!cart) return;
    const state = cart.data.state;
    const canHit = state === "active" || (state === "loaded" && settings.strict);
    if (!canHit) return;
    applyCartDamage(cart, HIT_POINTS_BY_TYPE.balloon);
  }

  function checkBombImpacts() {
    for (const bomb of [...world.bodies]) {
      if (bomb.tag !== "bomb") continue;
      const part = bomb.parts[0];
      const wp = physics.worldPoint(bomb, part);
      let impacted = wp.x - part.r <= 0 || wp.x + part.r >= viewWidth
        || wp.y - part.r <= 0 || wp.y + part.r >= viewHeight;
      if (!impacted) {
        for (const body of world.bodies) {
          if (body === bomb) continue;
          let touched = false;
          for (const other of body.parts) {
            const w2 = physics.worldPoint(body, other);
            if (physics.distance(wp.x, wp.y, w2.x, w2.y) <= part.r + other.r + 2) {
              touched = true;
              break;
            }
          }
          if (touched) {
            impacted = true;
            break;
          }
        }
      }
      if (impacted) explodeBomb(bomb, wp);
    }
  }

  function explodeBomb(bomb, pos) {
    world.removeBody(bomb);
    spawnBurst(pos.x, pos.y, ["#f09a4e", "#e0703a", "#ffc98a"]);
    shockRings.push({ x: pos.x, y: pos.y, born: simTime, life: 0.4, radiusFrom: 18, radiusTo: 110 });

    for (const body of [...world.bodies]) {
      if (body.tag === "cart") {
        let close = false;
        for (const part of body.parts) {
          const wp = physics.worldPoint(body, part);
          if (physics.distance(pos.x, pos.y, wp.x, wp.y) <= part.r + EXPLOSION_DESTROY_RADIUS) {
            close = true;
            break;
          }
        }
        if (close) {
          const state = body.data.state;
          const canHit = state === "active" || (state === "loaded" && settings.strict);
          if (canHit) {
            applyCartDamage(body, state === "active" ? BOMB_CART_HIT_POINTS : 1);
          }
          continue;
        }
      }

      let destroyed = false;
      if (body.tag !== "blackhole") {
        for (const part of body.parts) {
          const wp = physics.worldPoint(body, part);
          if (physics.distance(pos.x, pos.y, wp.x, wp.y) <= part.r + EXPLOSION_DESTROY_RADIUS) {
            destroyed = true;
            break;
          }
        }
      }
      if (destroyed) {
        world.removeBody(body);
        continue;
      }

      const dx = body.x - pos.x;
      const dy = body.y - pos.y;
      const dist = Math.max(EXPLOSION_DESTROY_RADIUS, Math.hypot(dx, dy));
      const impulse = EXPLOSION_IMPULSE / (dist * dist);
      const inv = 1 / dist;
      let dvx = dx * inv * impulse * body.invMass;
      let dvy = dy * inv * impulse * body.invMass;
      const dv = Math.hypot(dvx, dvy);
      if (dv > EXPLOSION_MAX_DELTA_V) {
        const scale = EXPLOSION_MAX_DELTA_V / dv;
        dvx *= scale;
        dvy *= scale;
      }
      body.vx += dvx;
      body.vy += dvy;
    }
  }

  function updateBlackholes(dt) {
    for (const hole of [...world.bodies]) {
      if (hole.tag !== "blackhole") continue;
      if (!world.bodies.includes(hole)) continue;
      const part = hole.parts[0];
      let wp = physics.worldPoint(hole, part);

      hole.mass *= Math.pow(0.5, dt / BLACKHOLE_HALF_LIFE);
      if (hole.mass < 1) {
        world.removeBody(hole);
        spawnBurst(wp.x, wp.y, ["#8a7ab8", "#b8a8dd"]);
        continue;
      }

      for (const body of [...world.bodies]) {
        if (body === hole) continue;
        if (!world.bodies.includes(body)) continue;

        if (body.tag === "blackhole") {
          const bpart = body.parts[0];
          const bwp = physics.worldPoint(body, bpart);
          if (physics.distance(wp.x, wp.y, bwp.x, bwp.y) <= part.r + bpart.r + 2) {
            const total = hole.mass + body.mass;
            hole.x = (hole.x * hole.mass + body.x * body.mass) / total;
            hole.y = (hole.y * hole.mass + body.y * body.mass) / total;
            hole.vx = (hole.vx * hole.mass + body.vx * body.mass) / total;
            hole.vy = (hole.vy * hole.mass + body.vy * body.mass) / total;
            hole.mass = total;
            spawnBurst(wp.x, wp.y, ["#8a7ab8", "#b8a8dd"]);
            world.removeBody(body);
            wp = physics.worldPoint(hole, part);
            continue;
          }
        } else if (body.tag === "cart") {
          let eaten = false;
          for (const cpart of body.parts) {
            const cw = physics.worldPoint(body, cpart);
            if (physics.distance(wp.x, wp.y, cw.x, cw.y) <= part.r + cpart.r + 2) {
              eaten = true;
              break;
            }
          }
          if (eaten) {
            hole.mass += BLACKHOLE_CART_BONUS;
            explodeCart(body);
          }
          continue;
        } else {
          let eaten = false;
          for (const other of body.parts) {
            const ow = physics.worldPoint(body, other);
            if (physics.distance(wp.x, wp.y, ow.x, ow.y) <= part.r + other.r + 2) {
              eaten = true;
              break;
            }
          }
          if (eaten) {
            hole.mass += body.mass;
            spawnBurst(wp.x, wp.y, ["#8a7ab8", "#b8a8dd"]);
            world.removeBody(body);
            continue;
          }
        }

        const dx = wp.x - body.x;
        const dy = wp.y - body.y;
        const dist = Math.max(part.r + 4, Math.hypot(dx, dy));
        const accel = (BLACKHOLE_GRAVITY * hole.mass) / (dist * dist);
        const inv = 1 / dist;
        body.vx += dx * inv * accel * dt;
        body.vy += dy * inv * accel * dt;
      }

      hole.invMass = 1 / hole.mass;
      hole.inertia = 0.5 * hole.mass * part.r * part.r;
      hole.invInertia = 1 / hole.inertia;
    }
  }

  function updateShockRings() {
    for (let i = shockRings.length - 1; i >= 0; i -= 1) {
      if (simTime - shockRings[i].born >= shockRings[i].life) shockRings.splice(i, 1);
    }
  }

  function chargeOf(body) {
    if (body.tag === "ball") return -1;
    if (body.tag !== "big") return 0;
    let charge = 0;
    for (const part of body.parts) {
      if (part.kind === "big") charge += 2;
      else if (part.kind === "ear1" || part.kind === "ear2") charge -= 1;
    }
    return charge;
  }

  function updateElectricField(dt) {
    const wHeld = heldKeys.has("KeyW");
    const sHeld = heldKeys.has("KeyS");
    if (wHeld === sHeld) return;
    const sign = sHeld ? 1 : -1;
    const ux = 0;
    const uy = sign;
    for (const body of world.bodies) {
      const charge = chargeOf(body);
      if (charge === 0) continue;
      const dv = charge * ELECTRIC_FIELD_STRENGTH * body.invMass * dt;
      body.vx += ux * dv;
      body.vy += uy * dv;
    }
  }

  function tick(dt) {
    simTime += dt;
    updateEmitter(dt);
    updateElectricField(dt);
    tryAttach();
    world.step(dt);
    checkBalloonImpacts();
    checkBombImpacts();
    updateBlackholes(dt);
    updateCarts(dt);
    updateParticles(dt);
    updateShockRings();
    updateToasts();

    spawnCooldown -= dt;
    const openBigs = world.bodies.filter((body) => body.tag === "big" && body.data.ears < 2).length;
    if (openBigs < MAX_OPEN_BIGS && spawnCooldown <= 0) {
      spawnCooldown = spawnBigCircle() ? SPAWN_INTERVAL : 0.6;
    }
  }

  function attachFillColor(part) {
    const t = part.bornAt === null
      ? 1
      : Math.min(1, Math.max(0, (simTime - part.bornAt) / ATTACH_FADE));
    const from = [255, 255, 255];
    const to = [170, 183, 194];
    const r = Math.round(from[0] + (to[0] - from[0]) * t);
    const g = Math.round(from[1] + (to[1] - from[1]) * t);
    const b = Math.round(from[2] + (to[2] - from[2]) * t);
    return `rgb(${r},${g},${b})`;
  }

  function drawBlackhole(x, y, radius) {
    const disk = context.createRadialGradient(x, y, radius + 1, x, y, BLACKHOLE_DISK_RADIUS);
    disk.addColorStop(0, "rgba(255, 150, 70, 0.55)");
    disk.addColorStop(0.5, "rgba(180, 100, 200, 0.28)");
    disk.addColorStop(1, "rgba(180, 100, 200, 0)");
    context.beginPath();
    context.arc(x, y, BLACKHOLE_DISK_RADIUS, 0, Math.PI * 2);
    context.fillStyle = disk;
    context.fill();

    for (let i = 0; i < 3; i += 1) {
      const start = simTime * 2.4 + i * ((Math.PI * 2) / 3);
      context.beginPath();
      context.arc(x, y, BLACKHOLE_DISK_RADIUS * 0.72, start, start + 1.1);
      context.strokeStyle = "rgba(240, 170, 110, 0.65)";
      context.lineWidth = 2.5;
      context.stroke();
    }

    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fillStyle = "#0b0d10";
    context.fill();
  }

  function drawCircle(x, y, radius, part) {
    if (part.kind === "blackhole") {
      drawBlackhole(x, y, radius);
      return;
    }
    let fill = "#ffffff";
    let stroke = "#2b3a46";
    if (part.kind === "big") {
      fill = "#aab7c2";
      stroke = "#78889a";
    } else if (part.kind === "ear1" || part.kind === "ear2") {
      fill = attachFillColor(part);
      stroke = "#78889a";
    } else if (part.kind === "balloon") {
      fill = "#f2a8bb";
      stroke = "#d8839b";
    } else if (part.kind === "bomb") {
      fill = "#e59a4e";
      stroke = "#c47a34";
    }
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fillStyle = fill;
    context.fill();
    context.lineWidth = 2;
    context.strokeStyle = stroke;
    context.stroke();
  }

  function roundRectPath(x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  function drawGhosts() {
    context.save();
    for (const big of world.bodies) {
      if (big.tag !== "big" || big.data.ears !== 1) continue;
      const ghost = ghostPoint(big);
      if (!ghost) continue;
      context.beginPath();
      context.arc(ghost.x, ghost.y, GHOST_RADIUS, 0, Math.PI * 2);
      context.fillStyle = "rgba(113, 138, 156, 0.16)";
      context.fill();
      context.setLineDash([5, 6]);
      context.lineWidth = 2;
      context.strokeStyle = "rgba(113, 138, 156, 0.9)";
      context.stroke();
      context.setLineDash([]);
    }
    context.restore();
  }

  function drawBodies() {
    for (const body of world.bodies) {
      if (body.tag === "cart") continue;
      const placed = body.parts.map((part) => ({
        part,
        pos: physics.worldPoint(body, part),
      }));
      placed.sort((a, b) => b.part.r - a.part.r);
      for (const item of placed) {
        drawCircle(item.pos.x, item.pos.y, item.part.r, item.part);
      }
    }
  }

  function drawBelt() {
    const top = viewHeight - 34;
    context.fillStyle = "#c9d5de";
    context.fillRect(0, top, viewWidth, 34);
    context.save();
    context.beginPath();
    context.rect(0, top, viewWidth, 34);
    context.clip();
    context.strokeStyle = "rgba(137, 155, 169, 0.5)";
    context.lineWidth = 9;
    const spacing = 38;
    const offset = (simTime * CART_SPEED) % spacing;
    for (let sx = -60 + offset; sx < viewWidth + 60; sx += spacing) {
      context.beginPath();
      context.moveTo(sx, top + 34);
      context.lineTo(sx + 18, top);
      context.stroke();
    }
    context.restore();
    context.fillStyle = "rgba(120, 136, 154, 0.35)";
    context.fillRect(0, top, viewWidth, 2);
  }

  function drawLoadedHead(cx, cy) {
    for (const side of [-54, 54]) {
      context.beginPath();
      context.arc(cx + side, cy, 18, 0, Math.PI * 2);
      context.fillStyle = "#aab7c2";
      context.fill();
      context.strokeStyle = "#78889a";
      context.lineWidth = 2;
      context.stroke();
    }

    context.beginPath();
    context.arc(cx, cy, 36, 0, Math.PI * 2);
    context.fillStyle = "#aab7c2";
    context.fill();
    context.strokeStyle = "#78889a";
    context.lineWidth = 2;
    context.stroke();

    context.fillStyle = "#1d2d3a";
    context.beginPath();
    context.arc(cx - 13, cy - 7, 4.5, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.arc(cx + 13, cy - 7, 4.5, 0, Math.PI * 2);
    context.fill();

    context.beginPath();
    context.arc(cx, cy + 7, 12, Math.PI * 0.18, Math.PI * 0.82);
    context.strokeStyle = "#1d2d3a";
    context.lineWidth = 3;
    context.lineCap = "round";
    context.stroke();
  }

  function drawCarts() {
    for (const cart of carts) drawCart(cart);
  }

  function drawCart(cart) {
    const x = cart.x;
    const y = cart.y + 4;
    const state = cart.data.state;
    const flash = cart.data.flashUntil > simTime;

    if (state === "active") {
      context.save();
      context.beginPath();
      context.arc(x, y - 10, ABSORB_RADIUS, 0, Math.PI * 2);
      context.setLineDash([7, 9]);
      context.lineWidth = 2;
      context.strokeStyle = "rgba(90, 130, 160, 0.42)";
      context.stroke();
      context.restore();
    }

    context.save();
    context.translate(x, y);

    context.fillStyle = "#71889a";
    context.strokeStyle = "#566b7c";
    context.lineWidth = 2.5;
    for (const fx of [-30, 30]) {
      context.beginPath();
      context.arc(fx, 58, 16, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    }

    for (const ax of [-62, 62]) {
      context.beginPath();
      context.arc(ax, -8, 18, 0, Math.PI * 2);
      context.fillStyle = "#8ba0b0";
      context.fill();
      context.stroke();
    }

    const gradient = context.createLinearGradient(0, -58, 0, 60);
    gradient.addColorStop(0, "#aec0cc");
    gradient.addColorStop(1, "#7f94a4");
    roundRectPath(-56, -56, 112, 112, 44);
    context.fillStyle = gradient;
    context.fill();
    context.strokeStyle = "#566b7c";
    context.lineWidth = 2.5;
    context.stroke();

    if (state === "active") {
      context.beginPath();
      context.arc(0, -58, 26, 0, Math.PI);
      context.fillStyle = "#61798b";
      context.fill();
      context.beginPath();
      context.arc(0, -58, 19, 0, Math.PI);
      context.fillStyle = "#4d6373";
      context.fill();
    }

    context.beginPath();
    context.ellipse(-24, -30, 17, 11, -0.5, 0, Math.PI * 2);
    context.fillStyle = "rgba(255, 255, 255, 0.32)";
    context.fill();

    if (flash) {
      roundRectPath(-56, -56, 112, 112, 44);
      context.fillStyle = "rgba(214, 74, 64, 0.4)";
      context.fill();
    }

    context.restore();

    const showHp = state === "active" || (state === "loaded" && settings.strict);
    if (showHp) {
      const count = cart.data.maxHp;
      const bw = 14;
      const bh = 9;
      const gap = 4;
      const total = count * bw + (count - 1) * gap;
      const bx = x - total / 2;
      const by = y - 150;
      for (let i = 0; i < count; i += 1) {
        roundRectPath(bx + i * (bw + gap), by, bw, bh, 4);
        context.fillStyle = i < cart.data.hp ? "#61ad76" : "rgba(120, 140, 155, 0.3)";
        context.fill();
      }
      const dotY = by + 16;
      for (let i = 0; i < HIT_POINTS_PER_DAMAGE; i += 1) {
        context.beginPath();
        context.arc(bx + 8 + i * 14, dotY, 4.5, 0, Math.PI * 2);
        context.fillStyle = i < cart.data.hitPoints ? "#d64a40" : "rgba(120, 140, 155, 0.32)";
        context.fill();
      }
    }

    if (state === "loaded") {
      drawLoadedHead(x, y - 66);
    }
  }

  function drawParticles() {
    for (const p of particles) {
      const t = (simTime - p.born) / p.life;
      context.globalAlpha = Math.max(0, 1 - t);
      context.beginPath();
      context.arc(p.x, p.y, p.r * (1 - t * 0.5), 0, Math.PI * 2);
      context.fillStyle = p.color;
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function drawFrame() {
    context.save();
    context.strokeStyle = "rgba(120, 136, 154, 0.55)";
    context.lineWidth = 2;
    context.strokeRect(1, 1, viewWidth - 2, viewHeight - 2);
    context.restore();
  }

  function drawEmitter() {
    const emitter = emitterPoint();
    const tool = TOOLS[selectedToolIndex];
    const ready = simTime - lastLaunchByTool[tool] >= TOOL_COOLDOWNS[tool];
    context.save();
    context.beginPath();
    context.arc(emitter.x, emitter.y, 13, 0, Math.PI * 2);
    context.fillStyle = ready ? "#31424f" : "#b9c6d0";
    context.fill();
    context.beginPath();
    context.arc(emitter.x, emitter.y, 6, 0, Math.PI * 2);
    context.fillStyle = ready ? "#ffffff" : "#e6edf2";
    context.fill();
    context.restore();
  }

  function raycastScene(origin, dir, projectileRadius) {
    let wallT = Infinity;
    if (dir.x > 0.0001) wallT = Math.min(wallT, (viewWidth - origin.x) / dir.x);
    if (dir.x < -0.0001) wallT = Math.min(wallT, -origin.x / dir.x);
    if (dir.y > 0.0001) wallT = Math.min(wallT, (viewHeight - origin.y) / dir.y);
    if (dir.y < -0.0001) wallT = Math.min(wallT, -origin.y / dir.y);
    let bestT = wallT;
    let bestType = "wall";

    const hitCircle = (center, radius) => {
      const ox = center.x - origin.x;
      const oy = center.y - origin.y;
      const projection = ox * dir.x + oy * dir.y;
      if (projection < 0) return null;
      const perpendicularSq = ox * ox + oy * oy - projection * projection;
      const reach = radius + projectileRadius;
      if (perpendicularSq > reach * reach) return null;
      return projection - Math.sqrt(reach * reach - perpendicularSq);
    };

    for (const body of world.bodies) {
      for (const part of body.parts) {
        const pos = physics.worldPoint(body, part);
        const t = hitCircle(pos, part.r);
        if (t !== null && t < bestT) {
          bestT = t;
          bestType = body.tag === "big" && body.data.ears < 2 && part.kind === "big"
            ? "big"
            : "other";
        }
      }
      if (body.tag === "big" && body.data.ears === 1) {
        const ghost = ghostPoint(body);
        if (ghost) {
          const t = hitCircle(ghost, GHOST_RADIUS);
          if (t !== null && t < bestT) {
            bestT = t;
            bestType = "ghost";
          }
        }
      }
    }
    return { t: bestT, type: bestType };
  }

  function drawAimLine() {
    const emitter = emitterPoint();
    const dir = { x: Math.cos(aim), y: Math.sin(aim) };
    const projectileRadius = TOOLS[selectedToolIndex] === "balloon" ? BALLOON_RADIUS : SMALL_RADIUS;
    const hit = raycastScene(emitter, dir, projectileRadius);
    const endT = Number.isFinite(hit.t) ? hit.t : 170;
    const endX = emitter.x + dir.x * endT;
    const endY = emitter.y + dir.y * endT;

    let color = "rgba(49, 83, 105, 0.45)";
    if (hit.type === "big") color = "rgba(76, 159, 110, 0.8)";
    else if (hit.type === "ghost") color = "rgba(200, 162, 77, 0.9)";

    context.save();
    context.setLineDash([6, 8]);
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(emitter.x, emitter.y);
    context.lineTo(endX, endY);
    context.stroke();
    context.setLineDash([]);
    if (hit.type === "big" || hit.type === "ghost") {
      context.beginPath();
      context.arc(endX, endY, 5, 0, Math.PI * 2);
      context.strokeStyle = color;
      context.lineWidth = 2;
      context.stroke();
    }
    context.restore();
  }

  function drawToasts() {
    context.save();
    context.textAlign = "center";
    context.font = "700 22px 'Microsoft YaHei', sans-serif";
    let index = 0;
    for (const t of toasts) {
      const age = simTime - t.born;
      const alpha = age < 1.1 ? 1 : Math.max(0, 1 - (age - 1.1) / 0.5);
      const y = 126 + index * 36 - age * 16;
      context.globalAlpha = alpha;
      context.fillStyle = "rgba(29, 45, 58, 0.85)";
      context.fillText(t.text, viewWidth / 2, y);
      index += 1;
    }
    context.restore();
  }

  function drawSlowMotion() {
    if (timeScale >= 1) return;
    context.save();
    context.fillStyle = "rgba(70, 110, 150, 0.07)";
    context.fillRect(0, 0, viewWidth, viewHeight);
    context.font = "600 15px 'Microsoft YaHei', sans-serif";
    context.fillStyle = "rgba(45, 95, 128, 0.8)";
    context.textAlign = "center";
    context.fillText("时间减缓", viewWidth / 2, 38);
    context.restore();
  }

  function drawShockRings() {
    for (const ring of shockRings) {
      const t = (simTime - ring.born) / ring.life;
      const radius = ring.radiusFrom + (ring.radiusTo - ring.radiusFrom) * t;
      context.beginPath();
      context.arc(ring.x, ring.y, radius, 0, Math.PI * 2);
      context.strokeStyle = `rgba(240, 154, 78, ${(0.7 * (1 - t)).toFixed(3)})`;
      context.lineWidth = 3;
      context.stroke();
    }
  }

  function drawElectricField() {
    const wHeld = heldKeys.has("KeyW");
    const sHeld = heldKeys.has("KeyS");
    if (wHeld === sHeld) return;
    const sign = sHeld ? 1 : -1;
    const ux = 0;
    const uy = sign;
    const px = -uy;
    const py = ux;
    const spacing = 46;
    const diag = Math.hypot(viewWidth, viewHeight);
    const centerX = viewWidth / 2;
    const centerY = viewHeight / 2;

    context.save();
    context.strokeStyle = "rgba(80, 200, 220, 0.38)";
    context.lineWidth = 1.6;
    context.setLineDash([14, 12]);
    context.lineDashOffset = -simTime * 170 * sign;
    for (let offset = -diag; offset <= diag; offset += spacing) {
      const ox = centerX + px * offset;
      const oy = centerY + py * offset;
      context.beginPath();
      context.moveTo(ox - ux * diag, oy - uy * diag);
      context.lineTo(ox + ux * diag, oy + uy * diag);
      context.stroke();
    }
    context.restore();
  }

  function render() {
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.fillStyle = "#edf2f7";
    context.fillRect(0, 0, viewWidth, viewHeight);
    drawFrame();
    drawBelt();
    drawGhosts();
    drawElectricField();
    drawBodies();
    drawCarts();
    drawParticles();
    drawShockRings();
    drawAimLine();
    drawEmitter();
    drawToasts();
    drawSlowMotion();
    syncToolCooldowns();
  }

  let accumulator = 0;
  let lastFrame = 0;

  function frame(now) {
    window.requestAnimationFrame(frame);
    const rawDt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.05) : 0;
    lastFrame = now;
    if (started && !ended && !paused) {
      accumulator += rawDt * timeScale;
      let guard = 0;
      while (accumulator >= FIXED_DT && guard < 20) {
        tick(FIXED_DT);
        accumulator -= FIXED_DT;
        guard += 1;
      }
      if (guard >= 20) accumulator = 0;
    } else {
      accumulator = 0;
    }
    render();
  }

  function setPaused(value) {
    paused = value;
    pauseOverlay.hidden = !paused;
    if (paused) {
      accumulator = 0;
      timeScale = 1;
    }
  }

  function resetGame() {
    world.clear();
    carts.length = 0;
    cartSpawnCooldown = CART_FIRST_DELAY;
    particles.length = 0;
    toasts.length = 0;
    simTime = 0;
    accumulator = 0;
    stepCount = 0;
    headCount = 0;
    deliveredCount = 0;
    emptyCount = 0;
    blownCount = 0;
    consecutiveBlown = 0;
    spawnCooldown = 0.8;
    for (const tool of TOOLS) lastLaunchByTool[tool] = -Infinity;
    shockRings.length = 0;
    emitterFactor = 0.5;
    aim = Math.PI / 2;
    for (let i = 0; i < 2; i += 1) spawnBigCircle();
    updateHud();
  }

  function updateAim(clientX, clientY) {
    const emitter = emitterPoint();
    const angle = Math.atan2(clientY - emitter.y, clientX - emitter.x);
    aim = Math.max(AIM_MIN, Math.min(AIM_MAX, angle));
  }

  canvas.addEventListener("pointermove", (event) => {
    if (!started || ended || paused) return;
    lastPointer = { x: event.clientX, y: event.clientY };
    updateAim(event.clientX, event.clientY);
  });

  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  function handlePress(event) {
    lastPointer = { x: event.clientX, y: event.clientY };
    if (event.button === 2) {
      timeScale = SLOW_MOTION_SCALE;
      return;
    }
    event.preventDefault();
    updateAim(event.clientX, event.clientY);
    fire();
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (!started || ended || paused) return;
    handlePress(event);
  });

  canvas.addEventListener("mousedown", (event) => {
    if (!started || ended || paused) return;
    // Pointer Events 规范：已有按键按住时，其余按键只发 mouse 事件、不发 pointer 事件。
    // 这里用 buttons 位掩码识别"组合按键"场景并兜底。
    if (event.button === 0 && (event.buttons & 2)) {
      handlePress(event);
    } else if (event.button === 2 && (event.buttons & 1)) {
      timeScale = SLOW_MOTION_SCALE;
    }
  });

  function handleReleaseButton(event) {
    if ((event.buttons & 2) === 0) timeScale = 1;
  }

  canvas.addEventListener("pointerup", handleReleaseButton);

  canvas.addEventListener("mouseup", handleReleaseButton);

  window.addEventListener("blur", () => {
    timeScale = 1;
  });

  window.addEventListener("keydown", (event) => {
    if (event.code === "Escape") {
      if (started && !ended) setPaused(!paused);
      return;
    }
    if (event.code === "KeyR" || event.code === "KeyF") {
      if (!event.repeat && started && !ended && !paused) {
        cycleTool(event.code === "KeyR" ? -1 : 1);
      }
      return;
    }
    if (event.code === "KeyA" || event.code === "KeyD"
      || event.code === "KeyW" || event.code === "KeyS") {
      heldKeys.add(event.code);
      return;
    }
    if (event.code === "Space") {
      event.preventDefault();
      fire();
    }
  });

  window.addEventListener("keyup", (event) => {
    if (event.code === "KeyA" || event.code === "KeyD"
      || event.code === "KeyW" || event.code === "KeyS") {
      heldKeys.delete(event.code);
    }
  });

  window.addEventListener("wheel", (event) => {
    if (!started || ended || paused) return;
    cycleTool(event.deltaY > 0 ? 1 : -1);
  }, { passive: true });

  function syncToolDock() {
    const slots = toolDock.querySelectorAll(".tool-slot");
    slots.forEach((slot, index) => {
      slot.classList.toggle("is-selected", index === selectedToolIndex);
    });
    const active = slots[selectedToolIndex];
    if (active) {
      const rect = active.getBoundingClientRect();
      if (rect.height > 0) {
        toolNameNode.style.top = `${rect.top + rect.height / 2}px`;
      }
      toolNameNode.textContent = TOOL_NAMES[TOOLS[selectedToolIndex]];
    }
  }

  function syncToolCooldowns() {
    const slots = toolDock.querySelectorAll(".tool-slot");
    slots.forEach((slot, index) => {
      const tool = TOOLS[index];
      const cdNode = slot.querySelector(".tool-cd");
      if (!cdNode) return;
      const ratio = Math.max(0, Math.min(1,
        (lastLaunchByTool[tool] + TOOL_COOLDOWNS[tool] - simTime) / TOOL_COOLDOWNS[tool]));
      const rounded = Math.round(ratio * 100) / 100;
      if (cdNode.dataset.ratio === String(rounded)) return;
      cdNode.dataset.ratio = String(rounded);
      cdNode.style.background = rounded > 0.002
        ? `conic-gradient(rgba(90, 110, 130, 0.55) ${(rounded * 360).toFixed(1)}deg, rgba(0, 0, 0, 0) 0deg)`
        : "";
    });
  }

  function cycleTool(delta) {
    selectedToolIndex = (selectedToolIndex + delta + TOOLS.length) % TOOLS.length;
    syncToolDock();
  }

  toolDock.addEventListener("click", (event) => {
    const slot = event.target.closest(".tool-slot");
    if (!slot) return;
    selectedToolIndex = Number(slot.dataset.index) || 0;
    syncToolDock();
  });
  syncToolDock();

  window.addEventListener("resize", applyViewport);

  resumeButton.addEventListener("click", () => setPaused(false));
  restartButton.addEventListener("click", () => {
    resetGame();
    setPaused(false);
  });

  startButton.addEventListener("click", startRun);
  endAgainButton.addEventListener("click", startRun);
  endHomeButton.addEventListener("click", goHome);

  window.HeadBounce = {
    get world() {
      return world;
    },
    stats() {
      return {
        steps: stepCount,
        heads: headCount,
        delivered: deliveredCount,
        empty: emptyCount,
        blown: blownCount,
        openBigs: world.bodies.filter((body) => body.tag === "big" && body.data.ears < 2).length,
        carts: carts.length,
        gap: +currentCartGap().toFixed(2),
      };
    },
    fire,
    reset: resetGame,
    debug: {
      launch(x, y, vx, vy) {
        return addBall(x, y, vx, vy);
      },
      freezeBigAtCenter() {
        for (const body of world.bodies) {
          if (body.tag === "big") {
            body.vx = 0;
            body.vy = 0;
            body.omega = 0;
            body.x = viewWidth / 2;
            body.y = viewHeight / 2;
            return true;
          }
        }
        return false;
      },
      addHead(x, y) {
        return world.addBody({
          parts: [
            { x, y, r: 36, mass: 16, kind: "big" },
            { x, y: y - 54, r: 18, mass: 4, kind: "ear1" },
            { x, y: y + 54, r: 18, mass: 4, kind: "ear2" },
          ],
          tag: "big",
          data: { ears: 2 },
        });
      },
      spawnCartNow() {
        const cart = spawnCart();
        return { x: cart.x, state: cart.data.state };
      },
      cartsInfo() {
        return carts.map((cart) => ({
          x: +cart.x.toFixed(1),
          y: +cart.y.toFixed(1),
          hp: cart.data.hp,
          state: cart.data.state,
          hitPoints: cart.data.hitPoints,
        }));
      },
      aimInfo() {
        const emitter = emitterPoint();
        const dir = { x: Math.cos(aim), y: Math.sin(aim) };
        const projectileRadius = TOOLS[selectedToolIndex] === "balloon" ? BALLOON_RADIUS : SMALL_RADIUS;
        const hit = raycastScene(emitter, dir, projectileRadius);
        return {
          type: hit.type,
          t: Number.isFinite(hit.t) ? +hit.t.toFixed(1) : null,
          endX: Number.isFinite(hit.t) ? +(emitter.x + dir.x * hit.t).toFixed(0) : null,
          endY: Number.isFinite(hit.t) ? +(emitter.y + dir.y * hit.t).toFixed(0) : null,
          aim: +aim.toFixed(3),
          emitterFactor: +emitterFactor.toFixed(3),
        };
      },
      forceBlow() {
        const cart = carts[0] || spawnCart();
        cart.data.hp = 0;
        explodeCart(cart);
        return { consecutiveBlown, delivered: deliveredCount, blown: blownCount, ended, carts: carts.length };
      },
      state() {
        return {
          started,
          ended,
          paused,
          consecutiveBlown,
          delivered: deliveredCount,
          empty: emptyCount,
          blown: blownCount,
          invincible: settings.invincible,
          strict: settings.strict,
          turbo: settings.turbo,
          blowThreshold: +blowLimitThreshold().toFixed(2),
          allowedStreak: allowedStreak(),
          carts: carts.length,
          gap: +currentCartGap().toFixed(2),
        };
      },
      setInvincible(value) {
        settings.invincible = Boolean(value);
        invincibleToggle.checked = settings.invincible;
        saveSettings();
        return settings.invincible;
      },
      setStrict(value) {
        settings.strict = Boolean(value);
        strictToggle.checked = settings.strict;
        saveSettings();
        return settings.strict;
      },
      setTurbo(value) {
        settings.turbo = Boolean(value);
        turboToggle.checked = settings.turbo;
        saveSettings();
        return settings.turbo;
      },
    },
  };

  invincibleToggle.checked = settings.invincible;
  invincibleToggle.addEventListener("change", () => {
    settings.invincible = invincibleToggle.checked;
    saveSettings();
  });
  strictToggle.checked = settings.strict;
  strictToggle.addEventListener("change", () => {
    settings.strict = strictToggle.checked;
    saveSettings();
  });
  turboToggle.checked = settings.turbo;
  turboToggle.addEventListener("change", () => {
    settings.turbo = turboToggle.checked;
    saveSettings();
  });
  settingsOpenButton.addEventListener("click", () => {
    homeOverlay.hidden = true;
    settingsOverlay.hidden = false;
  });
  settingsBackButton.addEventListener("click", () => {
    settingsOverlay.hidden = true;
    homeOverlay.hidden = false;
  });
  helpOpenButton.addEventListener("click", () => {
    homeOverlay.hidden = true;
    helpOverlay.hidden = false;
  });
  helpBackButton.addEventListener("click", () => {
    helpOverlay.hidden = true;
    homeOverlay.hidden = false;
  });
  aboutButton.addEventListener("click", () => {
    homeOverlay.hidden = true;
    aboutOverlay.hidden = false;
  });
  aboutBackButton.addEventListener("click", () => {
    aboutOverlay.hidden = true;
    homeOverlay.hidden = false;
  });
  pauseHomeButton.addEventListener("click", goHome);

  gameLogo.addEventListener("click", () => {
    gameLogo.classList.remove("is-bouncing");
    void gameLogo.offsetWidth;
    gameLogo.classList.add("is-bouncing");
  });
  gameLogo.addEventListener("animationend", () => {
    gameLogo.classList.remove("is-bouncing");
  });

  let headState = { dx: 0, dy: 0, rot: 0, scale: 1 };
  let headAnim = null;
  let headTimer = 0;

  function headTransform(state) {
    return `translate(${state.dx.toFixed(1)}px, ${state.dy.toFixed(1)}px) `
      + `rotate(${state.rot.toFixed(1)}deg) scale(${state.scale.toFixed(3)})`;
  }

  function scheduleHeadDrift(delay) {
    window.clearTimeout(headTimer);
    headTimer = window.setTimeout(driftStageHead, delay);
  }

  function driftStageHead() {
    const next = {
      dx: (Math.random() * 2 - 1) * 52,
      dy: -8 - Math.random() * 36,
      rot: (Math.random() * 2 - 1) * 12,
      scale: 0.96 + Math.random() * 0.08,
    };
    const duration = 1.9 + Math.random() * 1.7;
    if (headAnim) headAnim.cancel();
    headAnim = stageHead.animate(
      [{ transform: headTransform(headState) }, { transform: headTransform(next) }],
      { duration: duration * 1000, easing: "ease-in-out", fill: "forwards" }
    );
    headState = next;
    scheduleHeadDrift((duration + 0.4 + Math.random() * 1.3) * 1000);
  }

  driftStageHead();
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) scheduleHeadDrift(80);
  });

  applyViewport();
  resetGame();
  window.requestAnimationFrame(frame);
})();
