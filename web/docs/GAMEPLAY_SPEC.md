# Shadoken — Gameplay Mechanics Spec (single source of truth)

Extracted from the original Unity C# (`Assets/Source`) + serialized prefab/scene
values. All constants are the **actual serialized values**. The web rewrite
(Phaser 3 arcade physics) must follow **Strategy A** below.

> The ninja does **NOT** use engine gravity. `gravityScale=0`; gravity is a
> **constant fall velocity** (terminal from frame 1), and all motion is done by
> setting velocity in the ninja's own rotated reference frame. This is the most
> important thing to replicate.

## Global constants
- Physics gravity vector: `(0,-20)` (rotated on world-rotate) — only affects generic bodies; ninjas/arrows override it.
- 60 fps target. School size `TotalBipedCount = 42`.

## Ninja (Biped) — serialized tuning
| Field | Value |
|---|---|
| movementSpeed (ground) | **58** |
| airborneMovementSpeed | **42** |
| gravity (constant fall speed) | **54** |
| jumpForceRange | **(54, 64)** random per jump |
| jump/bounce decay | **108/s** (= gravity*2) |
| spawnUpwardVelocity | **80** |
| submergedMovementScale | **0.43** (scales whole velocity vector in water) |
| water entryVelocityScale | **0.088** (splash brake on entry) |
| nitroMovementSpeedAddition | **+43** |
| normousScale | **×1.5** |
| maxGroundAngle | **45°** |
| hitbox | **2.2 × 2.0** |

### Rotated reference frame (core)
`RelativeVelocity` = velocity expressed along the ninja's own `right`/`up`.
Gravity always pulls along `-localUp`. After a 90° rotation the same movement
code drives motion on a new world axis → "walk on any axis".

### Movement (every frame)
- Horizontal: **no acceleration, no friction.** `localVx = moveSpeed * moveScale * dir`; snap to 0 on no input.
  - `moveSpeed = (grounded?58:42) + (nitro?43:0)`, `moveScale = submerged?0.43:1`.
- Vertical (gravity as constant velocity, jump decays):
  - `jump()`: only if grounded OR submerged; `jumpVelocity = random(54,64) + 54`; skip if `bounceVelocity > jumpForce`.
  - each frame: decay `jumpVelocity`/`bounceVelocity` by `dt*108`; `localVy = (jumpVelocity - 54) + bounceVelocity`; multiply whole local vector by `moveScale`.
  - at rest airborne → `localVy = -54` (constant fall). Spawn pop = 80.

### Grounding
Contact counts as ground if angle(localUp, normal) ≤ 45° AND contact is below body
center. MACHINE-layer Surface: `KillImpactor` → die; `Bounciness` → `bounceVelocity`.
Biped-on-biped: stack into towers, adopt lower ninja's grounded state. When grounded
with no jump/bounce, force `localVy = 0`.

### Swarm grouping
Airborne ninjas &gt;10 units from living centroid get nudged back:
`vel += dir * abs(dot(dir, vel)) * 0.2`.

## Rotate mechanic (90° in facing direction)
One "Rotate" input, direction = last non-zero horizontal input (facing):
1. Every ninja `rotationDeg += 90*dir` (re-aims personal gravity + move axes).
2. World: `worldAngle = (worldAngle + 90*dir) mod 360`, rotate gravity vector, fire `onWorldAngleChanged`.
3. Camera: `targetAngle += 90*dir`, lerp to it.
- Gated by `allowMovement` and camera nausea. Each rotate adds 0.4 nausea; ≥1 (3 rapid rotates) → camera spins 800°/s and locks all input; cools 0.7/s. This is the cost that prevents rotate-spam.

### Lasers toggle on world angle
`vertical = |a|∈{0,180}`, `horizontal = |a|∈{90,270}`; a Beam is active when its
`activeDir` matches. Entering an active beam → die. Rotating flips lasers on/off.

## Water
Trigger zone. Enter: `velocity *= 0.088`, `submerged=true`. While submerged
`moveScale=0.43` (slow move/sink, swim up via jump). Exit restores. Does not change
gravity direction. Wave mesh is cosmetic.

## Obstacles (all one-hit kill; no health)
- **Weapons/arrows**: fire every 1.5s while chamber occupied; arrow constant velocity 100, lifespan 8s, hits ninja → die.
- **Machines**: smasher (push 42 @100 / pull 25, delay 3), saw (spin 200°/s), lava — Surfaces with `KillImpactor` kill; `machine_bounce` Surface `Bounciness=120` bounces (no kill).
- **Lasers/Beams**: orientation-activated (above), thickness 0.6.
- **Stray culling**: after all spawned, every 20 frames kill active ninjas off-camera &amp; &gt;200 from camera.

## Pickups (apply to ALL ninjas at once; award `Score += activeCount`)
| Type | Effect |
|---|---|
| Nitro | +43 move speed (harder control) |
| Normous | scale ×1.5 (bigger hitbox) |
| Normal | reset scale, cancel nitro (the antidote) |
| New | revive up to 7 dead ninjas at a living ninja (only if ≥7 dead) |
| Coin | +1 currency (persistent, not score) |

Non-coin pickups rate-limited 1s. Reversal `Normal` spawns w/ prob 1 while powered.

## Chambers (endless side-scroller)
Seeded RNG stitches prefab chambers into an infinite one-directional tunnel.
`chambersAtOnce=5`, `probabilityOfTurn=0.5`, look-ahead 2. First is a StartingCap;
each next chosen (Straight/Turn), rotated so its entry matches previous exit, placed
w/ overlap check. Entering a new chamber (first time): `Score += activeCount`,
activate its weapons, spawn one pickup, and when past midpoint generate ahead +
destroy oldest + drop a ProgressiveCap behind (no backtracking). Endless until all die.

## School of ninjas
42 ninjas, spawned by tapping/clicking in the world one at a time
(`spawnUpwardVelocity=80`, min spawn gap 0.064s, reject near edges/geometry). All
share ONE controller → one input drives all 42. Cohere via grouping, stack into
towers. Only when all 42 spawned does `allowMovement=true`. **New** pickup revives 7.

## Core loop & scoring
Title → tap to spawn 42 → traverse endless chambers with Move/Jump/Rotate, dodge
obstacles, grab pickups/coins → survive. Lose when `allSpawned && activeCount==0`.
No win — endless high-score. `Score += activeCount` on chamber-enter & powerup.
Coins are separate persistent currency. On reload, Score → HighScore.

## Camera
followOffset `(0,12,-62)`, position lerp 6, rotation lerp 9. Target = closest active
ninja. Nausea: +0.4/rotate, threshold 1 → spin 800°/s + input lock, cool 0.7/s.
Shake on death (0.8s, intensity 1.215).

## Controls
- Move L/R: A/D, arrows, stick, on-screen buttons → `Move(dir)` (clamped [-1,1]).
- Jump: Space / Xbox A / UI Jump → `Jump()`.
- Rotate: Shift / Xbox B / UI Rotate → `Rotate()` (uses facing as sign).
- Spawn: tap/click in world (not within ~60px of edge) → spawn a ninja.

---

## DERIVED WEB IMPLEMENTATION — Strategy A (REQUIRED)

Keep the physics world **axis-aligned**. Never rotate bodies. Track a single
integer `orientation ∈ {0,1,2,3}` (×90°) and remap local↔world yourself.

```ts
// orientation * 90°
const A = orientation * Math.PI / 2, c = Math.cos(A), s = Math.sin(A);
const toWorld = (lx:number, ly:number) => ({ x: lx*c - ly*s, y: lx*s + ly*c });
const toLocal = (wx:number, wy:number) => ({ x: wx*c + wy*s, y:-wx*s + wy*c });
```

- Ninjas: `body.setAllowGravity(false)`. Apply gravity as constant velocity along
  `-localUp`. Read `local = toLocal(body.velocity)`, edit `local.x/.y`,
  `body.setVelocity(...toWorld(local))`. **Do not** use Phaser `gravity.y`.
- Visuals: rotate the sprite (`setRotation(orientation*π/2)`) and camera
  (`cameras.main.setRotation`, lerped at ~9) for the flip; body stays axis-aligned.
- Grounded: use `body.blocked/touching` on the current gravity side
  (orientation 0 → `blocked.down`, 1 → `blocked.left`, 2 → `blocked.up`, 3 → `blocked.right`).
- Jump/bounce: scalars decaying at 108/s; `localVy = (jumpVelocity-54)+bounceVelocity`, then `* moveScale`.
- Lasers: enable/disable overlap zone when orientation parity matches `activeDir`.
- Projectiles: `setAllowGravity(false)`, `setVelocity(dirX*100, dirY*100)` each frame, 8s life.
- Bounce surface: manual decaying `bounceVelocity=120` (not Arcade restitution).
- Water: overlap zone; on enter `velocity *= 0.088`, `moveScale=0.43`; on exit restore.
- Seeded chambers: `Phaser.Math.RandomDataGenerator(seed)` for reproducible sequences (shared seed across multiplayer room).
- 60fps; movement has no acceleration/friction — snap. Use `dt` for decay & lerps.

### Constants (use directly)
`MOVE_GROUND=58, MOVE_AIR=42, GRAVITY=54, JUMP=[54,64], JUMP_DECAY=108/s,
SPAWN_UP=80, SUBMERGED=0.43, WATER_BRAKE=0.088, NITRO=+43, NORMOUS=×1.5,
ARROW_SPEED=100, ARROW_FIRE=1.5s, ARROW_LIFE=8s, SAW_SPIN=200°/s, BOUNCE=120,
SCHOOL=42, REVIVE=7, GROUP_DIST=10, GROUP_BOOST=0.2, STRAY_KILL_DIST=200,
CAM_FOLLOW_LERP=6, CAM_ROT_LERP=9, NAUSEA_PER_ROTATE=0.4, NAUSEA_COOL=0.7/s, NAUSEA_SPIN=800°/s`
