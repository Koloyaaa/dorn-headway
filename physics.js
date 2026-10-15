(function () {
  "use strict";

  let nextBodyId = 1;

  function worldPoint(body, part) {
    const c = Math.cos(body.angle);
    const s = Math.sin(body.angle);
    return {
      x: body.x + part.x * c - part.y * s,
      y: body.y + part.x * s + part.y * c,
    };
  }

  function distance(ax, ay, bx, by) {
    return Math.hypot(ax - bx, ay - by);
  }

  class Body {
    constructor(spec) {
      this.id = nextBodyId;
      nextBodyId += 1;
      this.tag = spec.tag || "";
      this.data = spec.data || {};
      this.angle = spec.angle || 0;
      this.vx = spec.vx || 0;
      this.vy = spec.vy || 0;
      this.omega = spec.omega || 0;
      this.parts = spec.parts.map((p) => ({
        x: p.x,
        y: p.y,
        r: p.r,
        mass: p.mass,
        kind: p.kind || "plain",
        bornAt: p.bornAt === undefined ? null : p.bornAt,
      }));

      let mass = 0;
      let mx = 0;
      let my = 0;
      for (const p of this.parts) {
        mass += p.mass;
        mx += p.x * p.mass;
        my += p.y * p.mass;
      }
      const cx = mx / mass;
      const cy = my / mass;

      let inertia = 0;
      for (const p of this.parts) {
        p.x -= cx;
        p.y -= cy;
        inertia += 0.5 * p.mass * p.r * p.r + p.mass * (p.x * p.x + p.y * p.y);
      }

      this.x = cx;
      this.y = cy;
      this.mass = mass;
      this.invMass = 1 / mass;
      this.inertia = inertia;
      this.invInertia = 1 / inertia;
      if (spec.kinematic) {
        this.kinematic = true;
        this.invMass = 0;
        this.invInertia = 0;
      }
    }

    attachCircle(partSpec, partVel) {
      const vel = partVel || { x: 0, y: 0 };
      const oldMass = this.mass;
      const oldX = this.x;
      const oldY = this.y;
      const oldVx = this.vx;
      const oldVy = this.vy;
      const oldOmega = this.omega;
      const oldInertia = this.inertia;

      const worldParts = this.parts.map((p) => {
        const wp = worldPoint(this, p);
        return { x: wp.x, y: wp.y, r: p.r, mass: p.mass, kind: p.kind, bornAt: p.bornAt };
      });
      worldParts.push({
        x: partSpec.x,
        y: partSpec.y,
        r: partSpec.r,
        mass: partSpec.mass,
        kind: partSpec.kind || "ear",
        bornAt: partSpec.bornAt === undefined ? null : partSpec.bornAt,
      });

      let mass = 0;
      let mx = 0;
      let my = 0;
      for (const p of worldParts) {
        mass += p.mass;
        mx += p.x * p.mass;
        my += p.y * p.mass;
      }
      const cx = mx / mass;
      const cy = my / mass;

      const angularMomentum =
        oldMass * ((oldX - cx) * oldVy - (oldY - cy) * oldVx) +
        oldInertia * oldOmega +
        partSpec.mass * ((partSpec.x - cx) * vel.y - (partSpec.y - cy) * vel.x);

      let inertia = 0;
      for (const p of worldParts) {
        const lx = p.x - cx;
        const ly = p.y - cy;
        inertia += 0.5 * p.mass * p.r * p.r + p.mass * (lx * lx + ly * ly);
      }

      const cos = Math.cos(this.angle);
      const sin = Math.sin(this.angle);
      this.parts = worldParts.map((p) => {
        const wx = p.x - cx;
        const wy = p.y - cy;
        return {
          x: wx * cos + wy * sin,
          y: -wx * sin + wy * cos,
          r: p.r,
          mass: p.mass,
          kind: p.kind,
          bornAt: p.bornAt,
        };
      });

      this.x = cx;
      this.y = cy;
      this.vx = (oldMass * oldVx + partSpec.mass * vel.x) / mass;
      this.vy = (oldMass * oldVy + partSpec.mass * vel.y) / mass;
      this.mass = mass;
      this.invMass = 1 / mass;
      this.inertia = inertia;
      this.invInertia = 1 / inertia;
      this.omega = angularMomentum / inertia;
    }
  }

  function createWorld(options) {
    const opts = options || {};
    const iterations = opts.iterations || 8;
    const slop = opts.slop || 0.5;
    const correction = opts.correction || 0.8;
    const objectRestitution = opts.objectRestitution === undefined ? 0 : opts.objectRestitution;
    const wallRestitution = opts.wallRestitution === undefined ? 1 : opts.wallRestitution;
    const kinematicRestitution = opts.kinematicRestitution === undefined ? 1 : opts.kinematicRestitution;

    const elasticHistory = new Map();
    let stepIndex = 0;

    const world = {
      width: opts.width || 800,
      height: opts.height || 600,
      bodies: [],

      addBody(spec) {
        const body = new Body(spec);
        world.bodies.push(body);
        return body;
      },

      removeBody(body) {
        const index = world.bodies.indexOf(body);
        if (index >= 0) world.bodies.splice(index, 1);
      },

      clear() {
        world.bodies.length = 0;
      },

      step(dt) {
        const bodies = world.bodies;
        for (const body of bodies) {
          if (body.kinematic) continue;
          body.x += body.vx * dt;
          body.y += body.vy * dt;
          body.angle += body.omega * dt;
        }
        const contacts = [];
        collectContacts(contacts);
        prepareContacts(contacts);
        solveVelocity(contacts);
        correctPositions(contacts);
        stepIndex += 1;
      },
    };

    function addWallContact(contacts, body, part, wp, nx, ny, pen) {
      const px = wp.x + nx * part.r;
      const py = wp.y + ny * part.r;
      contacts.push({
        a: body,
        b: null,
        nx,
        ny,
        pen,
        ra: { x: px - body.x, y: py - body.y },
        rb: null,
        rest: wallRestitution,
      });
    }

    function collectContacts(contacts) {
      const bodies = world.bodies;
      for (let i = 0; i < bodies.length; i += 1) {
        const a = bodies[i];
        for (const part of a.parts) {
          const wp = worldPoint(a, part);
          if (wp.x - part.r < 0) {
            addWallContact(contacts, a, part, wp, -1, 0, part.r - wp.x);
          } else if (wp.x + part.r > world.width) {
            addWallContact(contacts, a, part, wp, 1, 0, wp.x + part.r - world.width);
          }
          if (wp.y - part.r < 0) {
            addWallContact(contacts, a, part, wp, 0, -1, part.r - wp.y);
          } else if (wp.y + part.r > world.height) {
            addWallContact(contacts, a, part, wp, 0, 1, wp.y + part.r - world.height);
          }
        }

        for (let j = i + 1; j < bodies.length; j += 1) {
          const b = bodies[j];
          for (const partA of a.parts) {
            const wpa = worldPoint(a, partA);
            for (const partB of b.parts) {
              const wpb = worldPoint(b, partB);
              const dx = wpb.x - wpa.x;
              const dy = wpb.y - wpa.y;
              const radiusSum = partA.r + partB.r;
              const distanceSq = dx * dx + dy * dy;
              if (distanceSq >= radiusSum * radiusSum) continue;
              const dist = Math.sqrt(distanceSq) || 0.0001;
              const nx = dx / dist;
              const ny = dy / dist;
              const px = wpa.x + nx * partA.r;
              const py = wpa.y + ny * partA.r;
              const driven = a.kinematic || b.kinematic;
              contacts.push({
                a,
                b,
                nx,
                ny,
                pen: radiusSum - dist,
                ra: { x: px - a.x, y: py - a.y },
                rb: { x: px - b.x, y: py - b.y },
                rest: driven ? kinematicRestitution : objectRestitution,
              });
            }
          }
        }
      }
    }

    function contactRelativeVelocity(contact) {
      const a = contact.a;
      const b = contact.b;
      const vax = a.vx - a.omega * contact.ra.y;
      const vay = a.vy + a.omega * contact.ra.x;
      const vbx = b ? b.vx - b.omega * contact.rb.y : 0;
      const vby = b ? b.vy + b.omega * contact.rb.x : 0;
      return {
        vax,
        vay,
        vbx,
        vby,
        vn: (vbx - vax) * contact.nx + (vby - vay) * contact.ny,
      };
    }

    function pairKeyFor(contact) {
      if (contact.b) {
        const low = Math.min(contact.a.id, contact.b.id);
        const high = Math.max(contact.a.id, contact.b.id);
        return `p${low}-${high}`;
      }
      return `w${contact.a.id}-${contact.nx},${contact.ny}`;
    }

    function prepareContacts(contacts) {
      const present = new Set();
      const groups = new Map();
      for (const contact of contacts) {
        contact.vn0 = contactRelativeVelocity(contact).vn;
        contact.elastic = false;
        const key = pairKeyFor(contact);
        contact.pairKey = key;
        present.add(key);
        let group = groups.get(key);
        if (!group) {
          group = [];
          groups.set(key, group);
        }
        group.push(contact);
      }

      for (const key of [...elasticHistory.keys()]) {
        if (!present.has(key)) elasticHistory.delete(key);
      }

      for (const group of groups.values()) {
        const key = group[0].pairKey;
        if (elasticHistory.has(key)) continue;
        let deepest = null;
        for (const contact of group) {
          if (contact.vn0 >= 0) continue;
          if (!deepest || contact.vn0 < deepest.vn0) deepest = contact;
        }
        if (deepest) {
          deepest.elastic = true;
          elasticHistory.set(key, stepIndex);
        }
      }
    }

    function solveVelocity(contacts) {
      for (let iteration = 0; iteration < iterations; iteration += 1) {
        for (const contact of contacts) {
          if (contact.vn0 >= 0) continue;
          const target = contact.elastic ? -contact.rest * contact.vn0 : 0;
          const a = contact.a;
          const b = contact.b;
          const nx = contact.nx;
          const ny = contact.ny;

          const { vn } = contactRelativeVelocity(contact);
          if (vn >= target) continue;

          const ran = contact.ra.x * ny - contact.ra.y * nx;
          let k = a.invMass + ran * ran * a.invInertia;
          let rbn = 0;
          if (b) {
            rbn = contact.rb.x * ny - contact.rb.y * nx;
            k += b.invMass + rbn * rbn * b.invInertia;
          }
          if (k <= 0) continue;

          const impulse = (target - vn) / k;
          a.vx -= nx * impulse * a.invMass;
          a.vy -= ny * impulse * a.invMass;
          a.omega -= ran * impulse * a.invInertia;
          if (b) {
            b.vx += nx * impulse * b.invMass;
            b.vy += ny * impulse * b.invMass;
            b.omega += rbn * impulse * b.invInertia;
          }
        }
      }
    }

    function correctPositions(contacts) {
      for (const contact of contacts) {
        const a = contact.a;
        const b = contact.b;
        const depth = contact.pen - slop;
        if (depth <= 0) continue;
        const totalInv = a.invMass + (b ? b.invMass : 0);
        if (totalInv <= 0) continue;
        const push = (depth * correction) / totalInv;
        a.x -= contact.nx * push * a.invMass;
        a.y -= contact.ny * push * a.invMass;
        if (b) {
          b.x += contact.nx * push * b.invMass;
          b.y += contact.ny * push * b.invMass;
        }
      }
    }

    return world;
  }

  window.BouncePhysics = {
    createWorld,
    worldPoint,
    distance,
  };
})();
