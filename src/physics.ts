import * as THREE from 'three';

export class PhysicsNode {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  force: THREE.Vector3;
  mass: number;
  isWheel: boolean;
  wheelRadius: number;
  steerAngle: number = 0;

  constructor(x: number, y: number, z: number, mass = 15, isWheel = false, wheelRadius = 0.45) {
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3();
    this.force = new THREE.Vector3();
    this.mass = mass;
    this.isWheel = isWheel;
    this.wheelRadius = wheelRadius;
  }
}

export class PhysicsBeam {
  n1: PhysicsNode;
  n2: PhysicsNode;
  restLength: number;
  initialLength: number;
  stiffness: number;
  damping: number;
  deformThreshold: number;
  maxDeform: number;
  stress: number = 0;

  constructor(
    n1: PhysicsNode,
    n2: PhysicsNode,
    stiffness = 18000,
    damping = 180,
    deformThreshold = 0.14
  ) {
    this.n1 = n1;
    this.n2 = n2;
    this.restLength = n1.pos.distanceTo(n2.pos);
    this.initialLength = this.restLength;
    this.stiffness = stiffness;
    this.damping = damping;
    this.deformThreshold = deformThreshold;
    this.maxDeform = this.restLength * 0.45;
  }

  solve() {
    const delta = new THREE.Vector3().subVectors(this.n2.pos, this.n1.pos);
    const currentLength = delta.length();
    if (currentLength === 0) return;

    const diff = currentLength - this.restLength;
    const strain = Math.abs(diff) / this.initialLength;
    this.stress = Math.min(strain / this.deformThreshold, 1.0);

    // Plastic deformation (permanent metal bending on hard impacts)
    if (strain > this.deformThreshold) {
      const plasticChange = (diff - Math.sign(diff) * this.deformThreshold * this.initialLength) * 0.35;
      this.restLength = THREE.MathUtils.clamp(
        this.restLength + plasticChange,
        this.initialLength - this.maxDeform,
        this.initialLength + this.maxDeform
      );
    }

    const dir = delta.divideScalar(currentLength);
    const relVel = new THREE.Vector3().subVectors(this.n2.vel, this.n1.vel);
    const velAlongBeam = relVel.dot(dir);

    // Hooke's Law spring force + damping
    const forceMag = (currentLength - this.restLength) * this.stiffness + velAlongBeam * this.damping;
    const forceVec = dir.multiplyScalar(forceMag);

    this.n1.force.add(forceVec);
    this.n2.force.sub(forceVec);
  }
}

export interface ObstacleBox {
  min: THREE.Vector3;
  max: THREE.Vector3;
}

export class SoftBodyVehicle {
  nodes: PhysicsNode[] = [];
  beams: PhysicsBeam[] = [];
  wheelNodes: { fl: PhysicsNode; fr: PhysicsNode; rl: PhysicsNode; rr: PhysicsNode };

  constructor() {
    this.wheelNodes = this.buildChassis();
  }

  reset() {
    this.nodes = [];
    this.beams = [];
    this.wheelNodes = this.buildChassis();
  }

  private buildChassis() {
    const w = 0.95;
    const h = 0.65;
    const l = 2.1;
    const yOffset = 1.1;

    // 8 Main Chassis Nodes
    const flb = new PhysicsNode(-w, yOffset, l, 35);            // 0: Front Left Bottom
    const frb = new PhysicsNode(w, yOffset, l, 35);             // 1: Front Right Bottom
    const rlb = new PhysicsNode(-w, yOffset, -l, 35);           // 2: Rear Left Bottom
    const rrb = new PhysicsNode(w, yOffset, -l, 35);            // 3: Rear Right Bottom

    const flt = new PhysicsNode(-w * 0.85, yOffset + h, l * 0.75, 25);  // 4: Front Left Top
    const frt = new PhysicsNode(w * 0.85, yOffset + h, l * 0.75, 25);   // 5: Front Right Top
    const rlt = new PhysicsNode(-w * 0.85, yOffset + h, -l * 0.85, 25); // 6: Rear Left Top
    const rrt = new PhysicsNode(w * 0.85, yOffset + h, -l * 0.85, 25);  // 7: Rear Right Top

    // Front Bumper Crumple Node
    const bumper = new PhysicsNode(0, yOffset + 0.1, l + 0.55, 20);     // 8

    // 4 Wheel Hub Nodes
    const wheelY = yOffset - 0.35;
    const wheelW = w + 0.25;
    const wheelL = l - 0.55;

    const wFL = new PhysicsNode(-wheelW, wheelY, wheelL, 25, true, 0.45);
    const wFR = new PhysicsNode(wheelW, wheelY, wheelL, 25, true, 0.45);
    const wRL = new PhysicsNode(-wheelW, wheelY, -wheelL, 25, true, 0.45);
    const wRR = new PhysicsNode(wheelW, wheelY, -wheelL, 25, true, 0.45);

    this.nodes.push(flb, frb, rlb, rrb, flt, frt, rlt, rrt, bumper, wFL, wFR, wRL, wRR);

    const connect = (a: PhysicsNode, b: PhysicsNode, stiff = 26000, damp = 240, deform = 0.12) => {
      this.beams.push(new PhysicsBeam(a, b, stiff, damp, deform));
    };

    // Rigid Cross-Braced Chassis Frame
    const chassis = [flb, frb, rlb, rrb, flt, frt, rlt, rrt];
    for (let i = 0; i < chassis.length; i++) {
      for (let j = i + 1; j < chassis.length; j++) {
        connect(chassis[i], chassis[j], 28000, 260, 0.11);
      }
    }

    // Soft Front Crumple Zone
    connect(bumper, flb, 14000, 150, 0.06);
    connect(bumper, frb, 14000, 150, 0.06);
    connect(bumper, flt, 12000, 150, 0.06);
    connect(bumper, frt, 12000, 150, 0.06);

    // Double-Wishbone + Coilover Suspension
    const attachWheel = (wheel: PhysicsNode, bottomNear: PhysicsNode, bottomFar: PhysicsNode, topNear: PhysicsNode) => {
      connect(wheel, bottomNear, 19000, 220, 0.28);
      connect(wheel, bottomFar, 19000, 220, 0.28);
      connect(wheel, topNear, 11000, 280, 0.35);
    };

    attachWheel(wFL, flb, rlb, flt);
    attachWheel(wFR, frb, rrb, frt);
    attachWheel(wRL, rlb, flb, rlt);
    attachWheel(wRR, rrb, frb, rrt);

    // Track Width Stabilizer Beams
    connect(wFL, wFR, 15000, 180, 0.25);
    connect(wRL, wRR, 15000, 180, 0.25);

    return { fl: wFL, fr: wFR, rl: wRL, rr: wRR };
  }

  getCenter(): THREE.Vector3 {
    const sum = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
      sum.add(this.nodes[i].pos);
    }
    return sum.divideScalar(8);
  }

  getForwardVector(): THREE.Vector3 {
    const frontCenter = new THREE.Vector3().addVectors(this.nodes[0].pos, this.nodes[1].pos).multiplyScalar(0.5);
    const rearCenter = new THREE.Vector3().addVectors(this.nodes[2].pos, this.nodes[3].pos).multiplyScalar(0.5);
    return frontCenter.sub(rearCenter).normalize();
  }

  getRightVector(): THREE.Vector3 {
    const forward = this.getForwardVector();
    return new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  }

  getDeformationPercent(): number {
    let totalStrain = 0;
    for (const b of this.beams) {
      totalStrain += Math.abs(b.restLength - b.initialLength) / b.initialLength;
    }
    return Math.min(100, Math.round((totalStrain / this.beams.length) * 400));
  }

  step(dt: number, throttle: number, steer: number, brake: boolean, obstacles: ObstacleBox[]) {
    const subSteps = 12;
    const subDt = dt / subSteps;

    const forward = this.getForwardVector();
    const right = this.getRightVector();

    for (let s = 0; s < subSteps; s++) {
      // 1. Apply Gravity
      for (const n of this.nodes) {
        n.force.set(0, -9.81 * n.mass, 0);
      }

      // 2. Solve Spring & Damper Beams
      for (const b of this.beams) {
        b.solve();
      }

      // 3. Integrate Motion & Resolve Collisions
      for (const n of this.nodes) {
        const accel = n.force.clone().divideScalar(n.mass);
        n.vel.addScaledVector(accel, subDt);
        n.vel.multiplyScalar(0.999);
        n.pos.addScaledVector(n.vel, subDt);

        const radius = n.isWheel ? n.wheelRadius : 0.12;

        // Ground & Tire Grip Physics
        if (n.pos.y < radius) {
          n.pos.y = radius;
          if (n.vel.y < 0) n.vel.y = 0;

          if (n.isWheel) {
            const isFront = n === this.wheelNodes.fl || n === this.wheelNodes.fr;
            const wheelSteer = isFront ? steer * 0.45 : 0;
            n.steerAngle = wheelSteer;

            const wheelForward = forward.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), wheelSteer);
            const wheelRight = right.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), wheelSteer);

            if (throttle !== 0 && !brake) {
              n.vel.addScaledVector(wheelForward, throttle * 16 * subDt);
            }

            // Lateral Tire Friction
            const lateralSpeed = n.vel.dot(wheelRight);
            n.vel.addScaledVector(wheelRight, -lateralSpeed * Math.min(1, 14 * subDt));

            // Rolling Drag & Braking
            const forwardSpeed = n.vel.dot(wheelForward);
            const dragFactor = brake ? 12 : 0.4;
            n.vel.addScaledVector(wheelForward, -forwardSpeed * Math.min(1, dragFactor * subDt));
          } else {
            n.vel.x *= 0.92;
            n.vel.z *= 0.92;
          }
        }

        // Obstacle Box Collision
        for (const box of obstacles) {
          if (
            n.pos.x + radius > box.min.x && n.pos.x - radius < box.max.x &&
            n.pos.y + radius > box.min.y && n.pos.y - radius < box.max.y &&
            n.pos.z + radius > box.min.z && n.pos.z - radius < box.max.z
          ) {
            const dx1 = Math.abs((n.pos.x + radius) - box.min.x);
            const dx2 = Math.abs(box.max.x - (n.pos.x - radius));
            const dy1 = Math.abs((n.pos.y + radius) - box.min.y);
            const dy2 = Math.abs(box.max.y - (n.pos.y - radius));
            const dz1 = Math.abs((n.pos.z + radius) - box.min.z);
            const dz2 = Math.abs(box.max.z - (n.pos.z - radius));

            const minPen = Math.min(dx1, dx2, dy1, dy2, dz1, dz2);

            if (minPen === dx1) { n.pos.x = box.min.x - radius; n.vel.x *= -0.3; }
            else if (minPen === dx2) { n.pos.x = box.max.x + radius; n.vel.x *= -0.3; }
            else if (minPen === dy1) { n.pos.y = box.min.y - radius; n.vel.y *= -0.3; }
            else if (minPen === dy2) { n.pos.y = box.max.y + radius; n.vel.y = 0; }
            else if (minPen === dz1) { n.pos.z = box.min.z - radius; n.vel.z *= -0.3; }
            else if (minPen === dz2) { n.pos.z = box.max.z + radius; n.vel.z *= -0.3; }

            n.vel.multiplyScalar(0.85);
          }
        }
      }
    }
  }
}
