# Techniques and physics

Implementation references: car physics (Pacejka Magic Formula, Marco Monster's car physics, bicycle model, weight transfer), browser physics engines, racing-line optimisation (TUM FTM repositories), procedural road and track generation, terrain and elevation data, three.js InstancedMesh, shadows, tone mapping and performance, WebAudio engine-sound building blocks, the Gamepad API, fixed timestep and ghost-replay design, and lap-timing and sector design.

Descriptions of photos and videos are written from page titles, captions and metadata; the media itself was not downloaded, so check the framing before relying on a specific angle. Every URL was fetched or came from a search result when this library was compiled (2026-10-07); a few sites (for example artstation.com, bathurst.nsw.gov.au, cgtrader.com, fandom.com) refuse automated requests with 403 or 202 responses but did appear in search results.

**Reference count: 121**

## Car physics: tyre models, weight transfer, bicycle model (26)

- [Marco Monster: Car Physics for Games (mirror)](https://www.asawicki.info/Mirror/Car%20Physics%20for%20Games/Car%20Physics%20for%20Games.html) — The classic game-oriented walk-through of longitudinal and lateral forces, weight transfer, traction curves, slip angle and drag; start here for the arcade-sim hybrid.
- [Marco Monster: Car Physics for Games (folder index)](https://www.asawicki.info/Mirror/Car%20Physics%20for%20Games/) — Directory of the mirrored document and its images, in case figures need to be fetched separately.
- [Edy: Pacejka '94 parameters explained](https://www.edy.es/dev/docs/pacejka-94-parameters-explained-a-comprehensive-guide/) — Plain-language guide to the Magic Formula coefficients (B, C, D, E) and how each shapes the grip curve; use to tune a tyre model.
- [Wikipedia: Hans B. Pacejka](https://en.wikipedia.org/wiki/Hans_B._Pacejka) — Background on the author of the Magic Formula tyre model with links to the formulae.
- [Wikipedia: Tire model](https://en.wikipedia.org/wiki/Tire_model) — Overview of tyre force models including the Magic Formula and simpler alternatives (linear, brush).
- [Wikipedia: Slip (vehicle dynamics)](https://en.wikipedia.org/wiki/Slip_%28vehicle_dynamics%29) — Definitions of slip ratio and slip angle, the inputs to the tyre force function.
- [Wikipedia: Tire load sensitivity](https://en.wikipedia.org/wiki/Tire_load_sensitivity) — Why grip does not scale linearly with load; important for weight-transfer behaviour.
- [Wikipedia: Weight transfer](https://en.wikipedia.org/wiki/Weight_transfer) — Longitudinal and lateral load transfer under braking, acceleration and cornering.
- [Wikipedia: Circle of forces (traction circle)](https://en.wikipedia.org/wiki/Circle_of_forces) — The friction circle limiting combined braking and cornering; a simple way to couple the tyre forces.
- [Wikipedia: Vehicle dynamics](https://en.wikipedia.org/wiki/Vehicle_dynamics) — Broad overview linking suspension, tyres and handling terms.
- [Wikipedia: Understeer and oversteer](https://en.wikipedia.org/wiki/Understeer_and_oversteer) — Definitions and causes; useful to design the handling balance of each car.
- [Wikipedia: Ackermann steering geometry](https://en.wikipedia.org/wiki/Ackermann_steering_geometry) — How inner and outer front wheel angles differ in a turn.
- [Wikipedia: Downforce](https://en.wikipedia.org/wiki/Downforce) — Aerodynamic load and how it scales with speed squared; for Conrod versus Esses behaviour.
- [Wikipedia: Drag (physics)](https://en.wikipedia.org/wiki/Drag_%28physics%29) — Drag equation for top-speed limits on Conrod Straight.
- [Wikipedia: Rolling resistance](https://en.wikipedia.org/wiki/Rolling_resistance) — Rolling resistance model for coast-down and top speed.
- [Wikipedia: Differential (mechanical device)](https://en.wikipedia.org/wiki/Differential_%28mechanical_device%29) — Differential types including limited-slip, relevant to exit traction.
- [Wikipedia: Engine braking](https://en.wikipedia.org/wiki/Engine_braking) — Engine-braking behaviour to model on downshifts.
- [Wikipedia: Heel-and-toe](https://en.wikipedia.org/wiki/Heel-and-toe) — Technique behind rev-matched downshifts, optionally to model for sound and animation.
- [Wikipedia: Torque](https://en.wikipedia.org/wiki/Torque) — Torque fundamentals for the engine and drivetrain model.
- [Wikipedia: Gear train (gear ratios)](https://en.wikipedia.org/wiki/Gear_train) — Gear ratio mathematics for a sequential gearbox model.
- [Algorithms for Automated Driving: kinematic bicycle model](https://thomasfermi.github.io/Algorithms-for-Automated-Driving/Control/BicycleModel.html) — Clear derivation of the kinematic bicycle model, a low-cost basis for a car controller or AI.
- [PythonRobotics documentation](https://atsushisakai.github.io/PythonRobotics/) — Includes vehicle models and path tracking algorithms with runnable code.
- [PythonRobotics: pure pursuit path tracking](https://atsushisakai.github.io/PythonRobotics/modules/6_path_tracking/pure_pursuit_tracking/pure_pursuit_tracking.html) — A simple steering controller to make AI cars follow the racing line.
- [PythonRobotics: Stanley controller](https://atsushisakai.github.io/PythonRobotics/modules/6_path_tracking/stanley_control/stanley_control.html) — Another path-following controller for AI cars using cross-track error.
- [Gaffer On Games: integration basics](https://gafferongames.com/post/integration_basics/) — Euler vs RK4 and why the integrator matters for stable vehicle simulation.
- [Gaffer On Games: physics in 3D](https://gafferongames.com/post/physics_in_3d/) — Rigid body rotation and inertia; relevant if the chassis uses a rigid-body engine.

## Vehicle physics engines for the browser (10)

- [cannon-es documentation](https://pmndrs.github.io/cannon-es/) — Maintained fork of cannon.js, a lightweight physics engine that includes a raycast vehicle.
- [cannon-es: RaycastVehicle class](https://pmndrs.github.io/cannon-es/docs/classes/RaycastVehicle.html) — API for the raycast vehicle (wheels as rays, suspension and friction).
- [cannon-es: raycast vehicle demo](https://pmndrs.github.io/cannon-es/examples/raycast_vehicle) — Live demo of a driveable raycast vehicle.
- [GitHub: cannon-es](https://github.com/pmndrs/cannon-es) — Source and issues for cannon-es.
- [cannon.js: raycast vehicle demo](https://schteppe.github.io/cannon.js/demos/raycastVehicle.html) — The original cannon.js vehicle demo.
- [Rapier physics engine](https://rapier.rs/) — Rust physics engine with official JavaScript bindings (WASM); a modern option for the chassis and collisions.
- [Rapier: getting started with JavaScript](https://rapier.rs/docs/user_guides/javascript/getting_started_js) — Setup for Rapier in JS.
- [Rapier: rigid bodies](https://rapier.rs/docs/user_guides/javascript/rigid_bodies) — Rigid-body setup (mass, damping, CCD) for a car chassis.
- [GitHub: dimforge/rapier.js](https://github.com/dimforge/rapier.js) — Official JavaScript bindings for the Rapier engine; the repository to read for API details and examples.
- [GitHub: ammo.js](https://github.com/kripken/ammo.js) — Bullet physics compiled to JS; its btRaycastVehicle is widely used for three.js car games.

## Racing line calculation and lap simulation (6)

- [TUM FTM: global_racetrajectory_optimization](https://github.com/TUMFTM/global_racetrajectory_optimization) — Open-source minimum-curvature, shortest-path and minimum-time raceline optimisation for a track centreline with widths.
- [TUM FTM: trajectory_planning_helpers](https://github.com/TUMFTM/trajectory_planning_helpers) — Helper functions (spline fitting, curvature, velocity profile) used by the raceline optimiser.
- [TUM FTM: laptime-simulation](https://github.com/TUMFTM/laptime-simulation) — Quasi-steady-state lap-time simulation, useful for benchmarking the car model against plausible lap times.
- [TUM FTM: racetrack-database](https://github.com/TUMFTM/racetrack-database) — Centre-line and width data for race tracks in CSV; use the file format as a template for a Bathurst centreline.
- [TUM racetrack-database README](https://github.com/TUMFTM/racetrack-database/blob/master/README.md) — Describes the CSV format (x, y, track widths) to emulate for the Mount Panorama dataset.
- [Wikipedia: Racing line](https://en.wikipedia.org/wiki/Racing_line) — Concepts of apex, early/late apex and the fastest line through corners.

## Procedural roads, splines and terrain (16)

- [three.js: CatmullRomCurve3](https://threejs.org/docs/pages/CatmullRomCurve3.html) — Spline class to define the track centreline from sampled points.
- [three.js: ExtrudeGeometry](https://threejs.org/docs/pages/ExtrudeGeometry.html) — Extrude a cross-section along a path to build the road mesh.
- [three.js: TubeGeometry](https://threejs.org/docs/pages/TubeGeometry.html) — Tube along a curve; its Frenet frames are the basis for banking and normals.
- [three.js example: spline extrusion](https://threejs.org/examples/webgl_geometry_extrude_splines.html) — Demonstration of extruding shapes along splines.
- [three.js: PlaneGeometry](https://threejs.org/docs/pages/PlaneGeometry.html) — Base for terrain meshes that are displaced by a heightmap.
- [A Primer on Bezier Curves](https://pomax.github.io/bezierinfo/) — Thorough maths and interactive demos for curves, arc length and offsets, needed for kerb and edge lines.
- [Freya Holmer: the continuity of splines](https://www.youtube.com/watch?v=jvPPXbo87ds) — Freya Holmer's video on spline continuity (C0, C1, C2) and choosing the right spline for smooth roads and paths.
- [GitHub: SebLague Path-Creator](https://github.com/SebLague/Path-Creator) — Path/road generation approach in Unity (bezier paths with road mesh generation); ideas port easily to three.js.
- [Wikipedia: Spline interpolation](https://en.wikipedia.org/wiki/Spline_interpolation) — Mathematical background for interpolating the track samples.
- [Wikipedia: Centripetal Catmull-Rom spline](https://en.wikipedia.org/wiki/Centripetal_Catmull%E2%80%93Rom_spline) — Why centripetal parameterisation avoids cusps and overshoot in tight corners.
- [Wikipedia: Frenet-Serret formulas](https://en.wikipedia.org/wiki/Frenet%E2%80%93Serret_formulas) — Tangent/normal/binormal frames along a curve for road orientation.
- [ASAM OpenDRIVE](https://www.asam.net/standards/detail/opendrive/) — Industry standard for describing road networks (lanes, elevation, superelevation); a model for the track data schema.
- [OpenStreetMap wiki: Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) — How to query OSM ways and nodes (the circuit relation, corners, campgrounds) by script.
- [Mapbox: Terrain-RGB v1](https://docs.mapbox.com/data/tilesets/reference/mapbox-terrain-rgb-v1/) — Elevation-in-RGB tile format and the decoding formula for heightmaps.
- [AWS Open Data: Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) — Global elevation tiles (including Terrarium PNG tiles) free for use in a Bathurst heightmap.
- [Open-Meteo: Elevation API](https://open-meteo.com/en/docs/elevation-api) — Simple HTTP elevation lookup for sampling heights along the centreline.

## three.js rendering: instancing, shadows, tone mapping, performance (20)

- [three.js: InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html) — Draw thousands of trees, posts, barriers or tyres in one call; critical for the roadside.
- [three.js: BatchedMesh](https://threejs.org/docs/pages/BatchedMesh.html) — Batch different geometries with one draw call; useful for varied scenery.
- [three.js: LOD](https://threejs.org/docs/pages/LOD.html) — Level-of-detail switching for cars and buildings.
- [three.js example: instancing performance](https://threejs.org/examples/webgl_instancing_performance.html) — Benchmark of instancing counts and costs.
- [three.js example: dynamic instancing](https://threejs.org/examples/webgl_instancing_dynamic.html) — Updating instances per frame, relevant to animated crowd/flag props.
- [three.js example: level of detail](https://threejs.org/examples/webgl_lod.html) — Working LOD example.
- [three.js: LightShadow](https://threejs.org/docs/pages/LightShadow.html) — Shadow map size, bias and camera settings.
- [three.js: DirectionalLightShadow](https://threejs.org/docs/pages/DirectionalLightShadow.html) — Orthographic shadow frustum settings for the sun on a large track.
- [three.js example: shadow map](https://threejs.org/examples/webgl_shadowmap.html) — Reference shadow setup.
- [three.js example: cascaded shadow maps](https://threejs.org/examples/webgl_shadowmap_csm.html) — CSM for large outdoor scenes with sharp near shadows and distant coverage.
- [three.js: WebGLRenderer (toneMapping, toneMappingExposure)](https://threejs.org/docs/pages/WebGLRenderer.html) — Renderer options including tone mapping and output colour space.
- [three.js example: tone mapping](https://threejs.org/examples/webgl_tonemapping.html) — Compares tone-mapping operators (ACES, AgX, Neutral) with exposure.
- [three.js: PMREMGenerator](https://threejs.org/docs/pages/PMREMGenerator.html) — Prefiltered environment maps for image-based lighting and reflections.
- [three.js: Fog](https://threejs.org/docs/pages/Fog.html) — Linear fog for depth and horizon haze.
- [three.js example: sky shader](https://threejs.org/examples/webgl_shaders_sky.html) — Procedural sky with sun elevation for time-of-day.
- [three.js example: unreal bloom](https://threejs.org/examples/webgl_postprocessing_unreal_bloom.html) — Bloom for brake lights and sun glare.
- [three.js: GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html) — Loading glTF models for cars and props.
- [three.js example: KTX2 textures](https://threejs.org/examples/webgl_loader_texture_ktx2.html) — GPU-compressed textures to cut memory and load time.
- [GitHub: glTF-Transform](https://github.com/donmccurdy/glTF-Transform) — Tool for optimising glTF files (dedupe, compress, simplify).
- [glTF Report](https://gltf.report/) — Quick glTF inspector and optimiser in the browser.

## WebAudio: engine sound synthesis and spatial audio (23)

- [MDN: Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) — Overview of the audio graph model.
- [MDN: using the Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_Web_Audio_API) — Step-by-step tutorial for building an audio graph.
- [MDN: Web Audio API best practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices) — Autoplay, AudioContext lifecycle and performance guidance.
- [MDN: AudioContext.resume()](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/resume) — Needed to start audio after the first user gesture.
- [MDN: AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet) — Custom audio processing on the audio thread for synthesised engine sound.
- [MDN: AudioWorkletNode](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletNode) — The node used to run an AudioWorklet processor, with parameters.
- [MDN: OscillatorNode](https://developer.mozilla.org/en-US/docs/Web/API/OscillatorNode) — Basic periodic source for additive engine tones.
- [MDN: AudioBufferSourceNode](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode) — Looped sample playback for recorded engine loops.
- [MDN: playbackRate](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/playbackRate) — Pitch-shifting a loop with RPM, the simplest engine-sound approach.
- [MDN: AudioParam](https://developer.mozilla.org/en-US/docs/Web/API/AudioParam) — Scheduling and smoothing values like gain and frequency.
- [MDN: GainNode](https://developer.mozilla.org/en-US/docs/Web/API/GainNode) — Volume control for crossfading RPM-banded loops.
- [MDN: WaveShaperNode](https://developer.mozilla.org/en-US/docs/Web/API/WaveShaperNode) — Distortion for exhaust character and rev-limiter crackle.
- [MDN: BiquadFilterNode](https://developer.mozilla.org/en-US/docs/Web/API/BiquadFilterNode) — Low-pass/band-pass filters for muffling and body resonance.
- [MDN: DynamicsCompressorNode](https://developer.mozilla.org/en-US/docs/Web/API/DynamicsCompressorNode) — Compression to keep many sounds from clipping.
- [MDN: ConvolverNode](https://developer.mozilla.org/en-US/docs/Web/API/ConvolverNode) — Convolution reverb for the mountain and cuttings.
- [MDN: PannerNode](https://developer.mozilla.org/en-US/docs/Web/API/PannerNode) — 3D positional audio for passing cars and trackside sound.
- [MDN: Web audio spatialization basics](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Web_audio_spatialization_basics) — Practical guide to panning and distance models.
- [three.js: PositionalAudio](https://threejs.org/docs/pages/PositionalAudio.html) — Attach positional audio to objects in the 3D scene.
- [three.js: AudioListener](https://threejs.org/docs/pages/AudioListener.html) — Listener tied to the camera.
- [GitHub: ange-yaghi/engine-sim](https://github.com/ange-yaghi/engine-sim) — Open-source combustion engine simulator that generates engine sound from a physical simulation; a source of ideas for engine audio.
- [Simulating an entire car engine (yes, it makes noise)](https://www.youtube.com/watch?v=RKT-sKtR970) — AngeTheGreat's video about simulating an entire car engine and generating its sound; the creator of the engine-sim project.
- [Tone.js](https://tonejs.github.io/) — Web Audio framework for synthesis, handy for prototyping synthesised sounds.
- [howler.js](https://howlerjs.com/) — Audio library for playing sample banks with spatial audio.

## Gamepad API and input (8)

- [MDN: Gamepad API](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API) — Overview of the API for controllers and steering wheels.
- [MDN: using the Gamepad API](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API) — Polling pattern with requestAnimationFrame, button/axis indices and the standard mapping.
- [MDN: Gamepad interface](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad) — Properties for axes, buttons and mapping.
- [MDN: navigator.getGamepads()](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/getGamepads) — Per-frame polling method for the controller snapshot.
- [MDN: gamepadconnected event](https://developer.mozilla.org/en-US/docs/Web/API/Window/gamepadconnected_event) — Detecting controllers being plugged in.
- [MDN: Gamepad.vibrationActuator](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad/vibrationActuator) — Rumble feedback hook for kerbs and collisions.
- [MDN: GamepadHapticActuator](https://developer.mozilla.org/en-US/docs/Web/API/GamepadHapticActuator) — Haptic effect interface.
- [MDN: GamepadHapticActuator.playEffect()](https://developer.mozilla.org/en-US/docs/Web/API/GamepadHapticActuator/playEffect) — API to play dual-rumble effects (strength, duration).

## Fixed timestep, deterministic simulation and ghost replays (7)

- [Gaffer On Games: fix your timestep](https://gafferongames.com/post/fix_your_timestep/) — Fixed-step simulation with interpolation, the foundation for deterministic replays.
- [Gaffer On Games: deterministic lockstep](https://gafferongames.com/post/deterministic_lockstep/) — Sending only inputs and re-simulating, an option for compact ghost replays (if physics are deterministic).
- [Gaffer On Games: snapshot interpolation](https://gafferongames.com/post/snapshot_interpolation/) — Recording and interpolating state snapshots; the other way to store a ghost.
- [Gaffer On Games: state synchronization](https://gafferongames.com/post/state_synchronization/) — Compressing and sending state deltas; relevant to compact ghost data.
- [Game Programming Patterns: Command](https://gameprogrammingpatterns.com/command.html) — The command pattern for input recording and replay.
- [MDN: requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame) — Frame loop basics and timestamps.
- [MDN: performance.now()](https://developer.mozilla.org/en-US/docs/Web/API/Performance/now) — High-resolution timer for lap timing (watch the precision limits).

## Lap timing, sectors and timing-line design (5)

- [Wikipedia: Line-line intersection](https://en.wikipedia.org/wiki/Line%E2%80%93line_intersection) — Math for detecting when a car's path crosses a timing line between frames.
- [Wikipedia: Chip (transponder) timing](https://en.wikipedia.org/wiki/Chip_timing) — How real transponder loops timestamp crossings; the model for virtual timing loops.
- [Wikipedia: Photo finish](https://en.wikipedia.org/wiki/Photo_finish) — Context for sub-frame accurate finish timing.
- [Wikipedia: Fastest lap](https://en.wikipedia.org/wiki/Fastest_lap) — How fastest laps are defined and recorded.
- [Wikipedia: Time trial](https://en.wikipedia.org/wiki/Time_trial) — Time-trial concepts that apply to a single-car lap mode.
