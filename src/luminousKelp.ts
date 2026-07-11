// A grove of surface-reaching giant kelp assembled from one coherent atlas.
// Each stalk is an articulated stem chain; branches, tendrils, crowns and pod
// clusters attach to shared anatomical joints and sway on independent clocks.
import type { KAPLAYCtx, Color, Quad, Vec2 } from "kaplay";
import { sandTopAt } from "./backdrop";
import { LUMINOUS_KELP_PART, LUMINOUS_KELP_TIP } from "./luminousKelpAtlas";
import { profile, withDrawProfile } from "./profiling";
import { RES } from "./res";

const S = RES;
const TRUNK_SWAY_RANGE = 2;
// Pull neighbouring modules well into one another. The atlas deliberately has
// soft, hairy ends, so this overlap reads as one continuous stem instead of a
// stack of independently cut sprites.
const JOINT_OVERLAP = 0.88;
const REAR_Z = -180; // behind fish and the sand crest
const FRONT_Z = 18; // selected stalks occlude passing fish

type Point = { x: number; y: number };
type PartName = keyof typeof LUMINOUS_KELP_PART;
type Layer = "rear" | "front";

// One kelp module ready to draw. The sway controller mutates pos/angle (and, for
// pods, scale/opacity) in place every frame; everything else — the atlas frame
// quad, its pixel size, the tint — is hoisted here once so the per-frame draw
// allocates nothing. baseScale is the numeric scale the stem geometry is built
// from; scale is the (usually matching) draw vector, which bridges/pods override.
type KelpPart = {
  name: PartName;
  frame: number;
  pos: Vec2;
  angle: number;
  scale: Vec2;
  baseScale: number;
  color: Color;
  opacity: number;
  zOffset: number;
  quad?: Quad;
  width: number;
  height: number;
};

export type LuminousKelpSpec = {
  fx: number;
  scale: number;
  layer: Layer;
  phase: number;
  surface: number;
  depth: number;
  podRichness: number;
};

type Range = readonly [number, number];
type GroveSlot = {
  fx: number;
  jitter: number;
  scale: Range;
  layer: Layer;
  surface: Range;
  depth: Range;
  podRichness: Range;
};

// A few low juvenile stalks soften the left edge, then five mature root bands
// keep the dense forest in the rightmost quarter. Values inside each band are
// rolled once per load; compact scales let crowns interweave densely without
// throwing stray branches into the central swimming window.
export const LUMINOUS_KELP_GROVE: readonly GroveSlot[] = [
  {
    fx: 0.705,
    jitter: 0.006,
    scale: [0.46, 0.56],
    layer: "rear",
    surface: [0.43, 0.52],
    depth: [8, 13],
    podRichness: [0.16, 0.34],
  },
  {
    fx: 0.738,
    jitter: 0.007,
    scale: [0.54, 0.66],
    layer: "rear",
    surface: [0.32, 0.43],
    depth: [9, 15],
    podRichness: [0.24, 0.46],
  },
  {
    fx: 0.765,
    jitter: 0.006,
    scale: [0.6, 0.72],
    layer: "front",
    surface: [0.22, 0.34],
    depth: [16, 22],
    podRichness: [0.3, 0.54],
  },
  {
    fx: 0.785,
    jitter: 0.005,
    scale: [0.76, 0.86],
    layer: "rear",
    surface: [0.025, 0.075],
    depth: [6, 10],
    podRichness: [0.42, 0.68],
  },
  {
    fx: 0.83,
    jitter: 0.006,
    scale: [0.86, 0.98],
    layer: "front",
    surface: [-0.015, 0.04],
    depth: [17, 23],
    podRichness: [0.62, 0.88],
  },
  {
    fx: 0.875,
    jitter: 0.006,
    scale: [0.94, 1.06],
    layer: "rear",
    surface: [-0.055, 0.01],
    depth: [6, 11],
    podRichness: [0.72, 1],
  },
  {
    fx: 0.92,
    jitter: 0.006,
    scale: [0.86, 1],
    layer: "front",
    surface: [-0.025, 0.03],
    depth: [17, 23],
    podRichness: [0.58, 0.92],
  },
  {
    fx: 0.965,
    jitter: 0.004,
    scale: [0.78, 0.9],
    layer: "rear",
    surface: [0.025, 0.08],
    depth: [6, 10],
    podRichness: [0.38, 0.7],
  },
];

function transformedTip(
  origin: Point,
  angle: number,
  tip: Point,
  scale: number,
) {
  const radians = (angle * Math.PI) / 180;
  const x = tip.x * scale * JOINT_OVERLAP;
  const y = tip.y * scale * JOINT_OVERLAP;
  return {
    x: origin.x + x * Math.cos(radians) - y * Math.sin(radians),
    y: origin.y + x * Math.sin(radians) + y * Math.cos(radians),
  };
}

function offsetDownStem(point: Point, angle: number, distance: number) {
  const radians = (angle * Math.PI) / 180;
  return {
    x: point.x - Math.sin(radians) * distance,
    y: point.y + Math.cos(radians) * distance,
  };
}

const STEM_PARTS: PartName[] = [
  "straightStem",
  "straightStem",
  "leftStem",
  "rightStem",
];

export function spawnLuminousKelp(k: KAPLAYCtx, spec: LuminousKelpSpec) {
  const rootX = Math.max(
    18 * S,
    Math.min(k.width() - 18 * S, spec.fx * k.width()),
  );
  const rootY = sandTopAt(rootX) + spec.depth * S;
  const targetY = spec.surface * k.height();
  const z = spec.layer === "front" ? FRONT_Z : REAR_Z;
  const rear = spec.layer === "rear";
  const defaultOpacity = rear ? 0.88 : 0.98;

  const data = k.getSprite("luminous-kelp")?.data;
  const rearColor = k.rgb(186, 207, 190);
  const frontColor = k.rgb(238, 249, 232);

  const makePart = (
    name: PartName,
    scale = spec.scale,
    zOffset = 0,
    opacity = defaultOpacity,
  ): KelpPart => {
    const frame = LUMINOUS_KELP_PART[name];
    const quad = data?.frames[frame];
    return {
      name,
      frame,
      pos: k.vec2(rootX, rootY),
      angle: 0,
      scale: k.vec2(scale, scale),
      baseScale: scale,
      color: rear ? rearColor : frontColor,
      opacity,
      zOffset,
      quad,
      width: data && quad ? data.tex.width * quad.w : 0,
      height: data && quad ? data.tex.height * quad.h : 0,
    };
  };

  const base = makePart("holdfast", spec.scale, 0.02);
  const baseRise =
    Math.abs(LUMINOUS_KELP_TIP.holdfast.y) * spec.scale * JOINT_OVERLAP;
  const nominalRise =
    Math.abs(LUMINOUS_KELP_TIP.straightStem.y) * spec.scale * JOINT_OVERLAP;
  const segmentCount = Math.max(
    5,
    Math.min(10, Math.ceil((rootY - targetY - baseRise) / nominalRise)),
  );

  // Choose fruit-bearing joints before constructing foliage. The lowest fruit
  // becomes a natural growth line: below it the plant uses restrained trunk
  // modules only, while branches and ornamental growth begin at or above it.
  const podCandidates = Array.from(
    new Set([
      Math.min(segmentCount - 1, Math.max(2, Math.floor(segmentCount * 0.26))),
      Math.min(segmentCount - 1, Math.max(3, Math.floor(segmentCount * 0.4))),
      Math.min(segmentCount - 1, Math.max(4, Math.floor(segmentCount * 0.54))),
      Math.min(segmentCount - 1, Math.max(5, Math.floor(segmentCount * 0.68))),
      Math.min(segmentCount - 1, Math.max(6, Math.floor(segmentCount * 0.82))),
    ]),
  );
  let podJoints = podCandidates.filter(() => k.chance(spec.podRichness));
  const minimumPodJoints = spec.podRichness > 0.72 ? 3 : 2;
  while (podJoints.length < Math.min(minimumPodJoints, podCandidates.length)) {
    const missing = podCandidates.filter((joint) => !podJoints.includes(joint));
    if (!missing.length) break;
    podJoints.push(k.choose(missing));
  }
  podJoints.sort((a, b) => a - b);
  podJoints = podJoints.slice(0, spec.podRichness > 0.82 ? 4 : 3);
  const lowestPodJoint =
    podJoints[0] ?? Math.max(2, Math.floor(segmentCount * 0.4));

  // A constrained random walk gives each trunk an uneven identity. The lower
  // section is always straight and cumulative left/right bias is capped, so
  // random construction cannot make a corkscrew or expose impossible joints.
  let bendBalance = 0;
  let previousStem: PartName = "straightStem";
  const stemPlan = Array.from(
    { length: segmentCount },
    (_, index): PartName => {
      if (index + 1 < lowestPodJoint) return "straightStem";
      let candidates = STEM_PARTS.filter(
        (name) => name !== previousStem || name === "straightStem",
      );
      if (bendBalance <= -1)
        candidates = candidates.filter((name) => name !== "leftStem");
      if (bendBalance >= 1)
        candidates = candidates.filter((name) => name !== "rightStem");
      const name = k.choose(candidates);
      bendBalance += name === "leftStem" ? -1 : name === "rightStem" ? 1 : 0;
      previousStem = name;
      return name;
    },
  );
  const stems = stemPlan.map((name, index) =>
    makePart(name, spec.scale * k.rand(0.985, 1.015), 0.03 + index * 0.002),
  );

  // Soft sleeves of matching stem texture bridge module boundaries. They tuck
  // downward into the lower segment and fade toward the crown, so sparse upper
  // stalks keep their open silhouette without exposing hard sprite cuts.
  const seamJoints = [
    ...stems.slice(0, -1).map((_, index) => index + 2),
    stems.length + 1, // final stem-to-crown attachment
  ];
  const jointBridges = seamJoints.map((joint, index) => {
    const topness = Math.min(1, joint / (stems.length + 1));
    const bridgeScale = spec.scale * k.rand(0.5, 0.58);
    const opacity = (rear ? 0.64 : 0.72) - topness * (rear ? 0.18 : 0.22);
    const bridge = makePart(
      "straightStem",
      bridgeScale,
      0.057 + index * 0.0002,
      opacity,
    );
    bridge.scale.x = bridgeScale * k.rand(0.48, 0.58);
    bridge.scale.y = bridgeScale * k.rand(0.86, 1.02);
    return {
      ...bridge,
      joint,
      tuck: spec.scale * k.rand(11, 17),
    };
  });

  // Dense side growth at alternating stem joints. Its scale is smaller than the
  // trunk so neighbouring plants interweave without becoming a solid rectangle.
  const eligibleBranchJoints = stems
    .slice(1, -1)
    .map((_, index) => index + 1)
    .filter((joint) => joint >= lowestPodJoint);
  const branchChance = k.rand(0.68, 0.9);
  const chosenBranchJoints = eligibleBranchJoints.filter(() =>
    k.chance(branchChance),
  );
  while (chosenBranchJoints.length < Math.min(3, eligibleBranchJoints.length)) {
    const fallback =
      eligibleBranchJoints[
        Math.floor(
          ((chosenBranchJoints.length + 1) * eligibleBranchJoints.length) / 4,
        )
      ];
    if (fallback !== undefined && !chosenBranchJoints.includes(fallback))
      chosenBranchJoints.push(fallback);
    else {
      const missing = eligibleBranchJoints.find(
        (joint) => !chosenBranchJoints.includes(joint),
      );
      if (missing === undefined) break;
      chosenBranchJoints.push(missing);
    }
  }
  chosenBranchJoints.sort((a, b) => a - b);
  let branchSide = k.chance(0.5) ? -1 : 1;
  const branches = chosenBranchJoints.flatMap((joint, index) => {
    if (index > 0 && k.chance(0.72)) branchSide *= -1;
    const primarySide = branchSide;
    const makeBranch = (side: number, secondary = false) => {
      const name: PartName =
        !secondary && k.chance(0.14)
          ? "featheryTuft"
          : side < 0
            ? "leftBranch"
            : "rightBranch";
      const scale =
        spec.scale * (secondary ? k.rand(0.56, 0.68) : k.rand(0.74, 0.88));
      return {
        ...makePart(name, scale, secondary ? -0.035 : -0.02),
        joint,
        side,
        secondary,
      };
    };
    // Upper joints sometimes receive a smaller counter-branch, but the chance
    // stays low enough that each plant keeps a lopsided natural silhouette.
    return joint >= Math.floor(stems.length * 0.5) && k.chance(0.3)
      ? [makeBranch(primarySide), makeBranch(-primarySide, true)]
      : [makeBranch(primarySide)];
  });

  const centralCrown = k.choose<PartName>([
    "fanCrown",
    "forkedCrown",
    "featheryTuft",
  ]);
  const canopySides = k.chance(0.58) ? [-1, 1] : [k.chance(0.5) ? -1 : 1];
  const crowns = [
    {
      ...makePart(centralCrown, spec.scale * k.rand(0.86, 1), 0.04),
      angleOffset: k.rand(-2, 2),
    },
    ...canopySides.map((side) => ({
      ...makePart(
        side < 0 ? "leftCanopy" : "rightCanopy",
        spec.scale * k.rand(0.7, 0.84),
        0.03,
      ),
      angleOffset: side * k.rand(11, 16),
    })),
  ];

  // Keep only an occasional larger collar as natural variation; continuity is
  // handled by the unobtrusive stem bridges above rather than repeated rosettes.
  const collars = stems
    .map((_, joint) => joint)
    .filter(
      (joint) =>
        joint >= lowestPodJoint && joint < stems.length - 1 && k.chance(0.2),
    )
    .slice(0, 1)
    .map((joint) => ({
      ...makePart("foliageCollar", spec.scale * k.rand(0.34, 0.42), 0.061),
      joint,
    }));

  const pods = podJoints.map((joint, index) => ({
    ...makePart(
      k.chance(spec.podRichness * 0.72) ? "largePods" : "smallPods",
      spec.scale * k.rand(0.5, 0.64),
      0.07,
    ),
    joint,
    phase: spec.phase + index * 2.4 + k.rand(-0.5, 0.5),
  }));

  const firstTendrilSide = k.chance(0.5) ? -1 : 1;
  const tendrils = [
    {
      ...makePart(
        k.chance(0.5) ? "trailingTendril" : "forkedTendril",
        spec.scale * k.rand(0.48, 0.6),
        -0.01,
      ),
      joint: Math.max(lowestPodJoint, segmentCount - k.randi(2, 4)),
      side: firstTendrilSide,
    },
    ...(k.chance(0.56)
      ? [
          {
            ...makePart(
              "trailingTendril" as PartName,
              spec.scale * k.rand(0.44, 0.54),
              -0.012,
            ),
            joint: Math.max(lowestPodJoint, segmentCount - 2),
            side: -firstTendrilSide,
          },
        ]
      : []),
  ];

  const place = (part: KelpPart, point: Point, angle: number) => {
    part.pos.x = point.x;
    part.pos.y = point.y;
    part.angle = angle;
  };

  // Collapse the whole stalk into one back-to-front draw list. The negative
  // zOffsets (branches, tendrils) tuck behind the trunk; pods and collars sit in
  // front — sorting once here reproduces the exact stacking that Kaplay's global
  // z-sort used to give ~34 separate game objects, now in a single draw pass.
  const drawList: KelpPart[] = [
    base,
    ...stems,
    ...jointBridges,
    ...branches,
    ...crowns,
    ...collars,
    ...pods,
    ...tendrils,
  ];
  drawList.sort((a, b) => a.zOffset - b.zOffset);

  const controller = k.add([
    k.z(z),
    {
      update() {
        profile("kelp", () => {
          const time = k.time();
      const current =
        Math.sin(time * 0.25 + spec.phase) * 0.74 +
        Math.sin(time * 0.11 + spec.phase * 0.57) * 0.34;
      const points: Point[] = [{ x: rootX, y: rootY }];
      const angles: number[] = [0];

      place(base, points[0], 0);
      points.push(
        transformedTip(points[0], 0, LUMINOUS_KELP_TIP.holdfast, spec.scale),
      );

      stems.forEach((stem, index) => {
        const flexibility = (index + 1) / stems.length;
        const angle =
          TRUNK_SWAY_RANGE *
          (current * (1.15 + flexibility * 3.1) +
            Math.sin(
              time * (0.31 + index * 0.017) + spec.phase + index * 0.73,
            ) *
              (0.22 + flexibility * 0.62));
        const point = points[index + 1];
        angles[index + 1] = angle;
        place(stem, point, angle);
        points.push(
          transformedTip(
            point,
            angle,
            LUMINOUS_KELP_TIP[stem.name],
            stem.baseScale,
          ),
        );
      });

      jointBridges.forEach((bridge, index) => {
        const lowerAngle = angles[bridge.joint - 1] ?? 0;
        const upperAngle = angles[bridge.joint] ?? lowerAngle;
        const breathing =
          Math.sin(time * 0.29 + spec.phase + index * 0.61) * 0.18;
        const angle = (lowerAngle + upperAngle) * 0.5 + breathing;
        place(
          bridge,
          offsetDownStem(points[bridge.joint], angle, bridge.tuck),
          angle,
        );
      });

      branches.forEach((branch, index) => {
        const parentAngle = angles[branch.joint] ?? 0;
        const flutter =
          Math.sin(time * (0.42 + index * 0.028) + spec.phase + index * 1.37) *
          (branch.secondary ? 2 : 1.55);
        const spread = branch.secondary ? 24 : 17 + (branch.joint % 3) * 2.5;
        place(
          branch,
          points[branch.joint],
          parentAngle + branch.side * spread + flutter,
        );
      });

      collars.forEach((collar, index) => {
        place(
          collar,
          points[collar.joint],
          (angles[collar.joint] ?? 0) +
            Math.sin(time * 0.33 + spec.phase + index) * 0.7,
        );
      });

      pods.forEach((pod, index) => {
        const parentAngle = angles[pod.joint] ?? 0;
        place(
          pod,
          points[pod.joint],
          parentAngle + Math.sin(time * 0.37 + pod.phase) * 2.1,
        );
        const glow = 0.5 + 0.5 * Math.sin(time * 0.92 + pod.phase);
        const scale = pod.baseScale * (1 + glow * 0.025);
        pod.scale.x = scale;
        pod.scale.y = scale;
        pod.opacity = (rear ? 0.78 : 0.9) + glow * (rear ? 0.12 : 0.1);
      });

      tendrils.forEach((tendril, index) => {
        const parentAngle = angles[tendril.joint] ?? 0;
        place(
          tendril,
          points[tendril.joint],
          parentAngle +
            tendril.side * 8 +
            Math.sin(time * (0.48 + index * 0.07) + spec.phase + index * 2.2) *
              2.6,
        );
      });

      const crownPoint = points[points.length - 1];
      const crownParentAngle = angles[angles.length - 1] ?? 0;
      crowns.forEach((crown, index) => {
        const flutter =
          Math.sin(time * (0.36 + index * 0.045) + spec.phase + index * 2.1) *
          (1.1 + index * 0.35);
        place(crown, crownPoint, crownParentAngle + crown.angleOffset + flutter);
        });
        });
      },
      draw() {
        withDrawProfile("kelp", () => {
          if (data) {
            for (const p of drawList)
              k.drawUVQuad({
                tex: data.tex,
                quad: p.quad,
                width: p.width,
                height: p.height,
                pos: p.pos,
                anchor: "center",
                scale: p.scale,
                angle: p.angle,
                color: p.color,
                opacity: p.opacity,
              });
            return;
          }
          // Fallback if the atlas somehow isn't resolved yet.
          for (const p of drawList)
            k.drawSprite({
              sprite: "luminous-kelp",
              frame: p.frame,
              pos: p.pos,
              anchor: "center",
              scale: p.scale,
              angle: p.angle,
              color: p.color,
              opacity: p.opacity,
            });
        });
      },
    },
  ]);

  return {
    base,
    stems,
    jointBridges,
    branches,
    crowns,
    collars,
    pods,
    tendrils,
    controller,
  };
}

export function spawnLuminousKelpGrove(k: KAPLAYCtx) {
  return LUMINOUS_KELP_GROVE.map((slot) =>
    spawnLuminousKelp(k, {
      fx: slot.fx + k.rand(-slot.jitter, slot.jitter),
      scale: k.rand(...slot.scale),
      layer: slot.layer,
      phase: k.rand(0, Math.PI * 2),
      surface: k.rand(...slot.surface),
      depth: k.rand(...slot.depth),
      podRichness: k.rand(...slot.podRichness),
    }),
  );
}
