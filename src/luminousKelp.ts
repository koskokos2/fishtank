// A tall modular plant assembled as a real parent-to-child stem chain. Each
// atlas component has its root at tile centre and exports its tip vector; the
// next section is planted at that transformed tip. This keeps the stalk seamless
// while allowing current bends to accumulate naturally toward the flexible top.
import type { KAPLAYCtx } from "kaplay";
import { sandTopAt } from "./backdrop";
import {
  LUMINOUS_KELP_BUSHY_PART,
  LUMINOUS_KELP_PART,
  LUMINOUS_KELP_TIP,
} from "./luminousKelpAtlas";
import { RES } from "./res";

const S = RES;
const JOINT_OVERLAP = 0.975;

type Point = { x: number; y: number };

function transformedTip(origin: Point, angle: number, tip: Point, amount = 1) {
  const radians = (angle * Math.PI) / 180;
  const x = tip.x * amount;
  const y = tip.y * amount;
  return {
    x: origin.x + x * Math.cos(radians) - y * Math.sin(radians),
    y: origin.y + x * Math.sin(radians) + y * Math.cos(radians),
  };
}

export function spawnLuminousKelp(
  k: KAPLAYCtx,
  atX = k.width() * 0.82,
  plantScale = 1,
) {
  const rootX = Math.max(70 * S, Math.min(k.width() - 70 * S, atX));
  // Keep this tall plant close to the sand crest. The old deep foreground tier
  // lowered its whole silhouette enough to make it read as a short shrub.
  const rootY = sandTopAt(rootX) + k.rand(4, 10) * S;
  const phase = k.rand(0, Math.PI * 2);

  const makePart = (
    frame: number,
    z: number,
    sprite = "luminous-kelp",
    scale = plantScale,
  ) => {
    const part = k.add([
      k.sprite(sprite),
      k.pos(rootX, rootY),
      k.anchor("center"),
      k.rotate(0),
      k.scale(scale),
      k.opacity(1),
      k.z(z),
    ]);
    part.frame = frame;
    return part;
  };

  // Children render just behind their parent. The few pixels of overlap conceal
  // the plain stem ends without collars, sockets, or visible attachment caps.
  const base = makePart(LUMINOUS_KELP_PART.base, 13);
  const lowerStem = makePart(LUMINOUS_KELP_PART.lowerStem, 12.9);
  const middleStem = makePart(LUMINOUS_KELP_PART.middleStem, 12.8);
  const upperStem = makePart(LUMINOUS_KELP_PART.lowerStem, 12.7);
  upperStem.flipX = true;
  const crown = makePart(LUMINOUS_KELP_PART.crown, 12.6);
  const bushyLeft = makePart(
    LUMINOUS_KELP_BUSHY_PART.leftBranch,
    12.45,
    "luminous-kelp-bushy",
    plantScale * 0.72,
  );
  const bushyRight = makePart(
    LUMINOUS_KELP_BUSHY_PART.rightBranch,
    12.5,
    "luminous-kelp-bushy",
    plantScale * 0.72,
  );
  const bushyCrown = makePart(
    LUMINOUS_KELP_BUSHY_PART.crown,
    12.55,
    "luminous-kelp-bushy",
    plantScale * 0.78,
  );
  const magicalPods = makePart(
    LUMINOUS_KELP_BUSHY_PART.pods,
    12.65,
    "luminous-kelp-bushy",
    plantScale * 0.86,
  );

  const place = (part: typeof base, point: Point, angle: number) => {
    part.pos.x = point.x;
    part.pos.y = point.y;
    part.angle = angle;
  };

  const updatePlant = () => {
    const time = k.time();
    const current =
      Math.sin(time * 0.34 + phase) +
      Math.sin(time * 0.17 + phase * 0.61) * 0.42;

    // The rooted base never rocks. Each following section adds only a little
    // relative bend, but those bends accumulate into a broad, organic top sway.
    place(base, { x: rootX, y: rootY }, 0);

    const lowerRoot = transformedTip(
      base.pos,
      base.angle,
      LUMINOUS_KELP_TIP.base,
      JOINT_OVERLAP * plantScale,
    );
    const lowerAngle = current * 0.9 + Math.sin(time * 0.53 + phase + 0.8) * 0.45;
    place(lowerStem, lowerRoot, lowerAngle);

    const middleRoot = transformedTip(
      lowerStem.pos,
      lowerStem.angle,
      LUMINOUS_KELP_TIP.lowerStem,
      JOINT_OVERLAP * plantScale,
    );
    const middleAngle =
      lowerAngle +
      current * 0.85 +
      Math.sin(time * 0.61 + phase + 2.1) * 0.65;
    place(middleStem, middleRoot, middleAngle);

    const upperRoot = transformedTip(
      middleStem.pos,
      middleStem.angle,
      LUMINOUS_KELP_TIP.middleStem,
      JOINT_OVERLAP * plantScale,
    );
    const upperAngle =
      middleAngle +
      current * 0.7 +
      Math.sin(time * 0.69 + phase + 3.4) * 0.7;
    place(upperStem, upperRoot, upperAngle);

    // Both side branches share the exact middle/upper joint. The two central
    // stems render in front of their roots, closing the gap and hiding the old
    // modules' attachment collars.
    place(
      bushyLeft,
      upperRoot,
      middleAngle + current * 1.1 + Math.sin(time * 0.73 + phase + 1.2) * 1.2,
    );
    place(
      bushyRight,
      upperRoot,
      middleAngle + current * 0.95 + Math.sin(time * 0.67 + phase + 2.8) * 1.1,
    );

    const crownRoot = transformedTip(
      upperStem.pos,
      upperStem.angle,
      {
        x: -LUMINOUS_KELP_TIP.lowerStem.x,
        y: LUMINOUS_KELP_TIP.lowerStem.y,
      },
      JOINT_OVERLAP * plantScale,
    );
    const crownAngle =
      upperAngle +
      current * 1.05 +
      Math.sin(time * 0.77 + phase + 4.6) * 1.1;
    place(crown, crownRoot, crownAngle);
    place(
      bushyCrown,
      crownRoot,
      upperAngle + current * 1.2 + Math.sin(time * 0.71 + phase + 5.5) * 1.2,
    );

    // Reuse the previous atlas's luminous amber pods. Their top pivot shares the
    // crown joint, so the plain upper stem hides the collar while the fruit hangs
    // freely around it and pulses without stretching the structural stem.
    place(
      magicalPods,
      crownRoot,
      upperAngle + current * 0.55 + Math.sin(time * 0.59 + phase + 0.3) * 0.8,
    );

    const glow = 0.5 + 0.5 * Math.sin(time * 1.12 + phase);
    const podScale = plantScale * 0.86 * (1 + glow * 0.025);
    magicalPods.scale.x = podScale;
    magicalPods.scale.y = podScale;
    magicalPods.opacity = 0.86 + glow * 0.14;
  };

  const controller = k.add([k.pos(0, 0)]);
  controller.onUpdate(updatePlant);
  updatePlant();

  return {
    base,
    parts: [
      lowerStem,
      middleStem,
      upperStem,
      crown,
      bushyLeft,
      bushyRight,
      bushyCrown,
      magicalPods,
    ],
    controller,
  };
}
