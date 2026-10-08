# Gen3 Supercars (Camaro ZL1 / Mustang GT / GR Supra) - vehicle research for a Bathurst driving game

Compiled 2026-10-07. Scope: 2023+ Repco Supercars Championship Gen3 cars at Mount Panorama.
Sources are cited as `[S#]`; full URLs are in the **Source key** at the end. Every URL there was opened or returned content during this research.

**Evidence grades**

| Grade | Meaning |
|---|---|
| **A** | Official or primary: Supercars rules or site, Xtrac, Ford release (via Motor1), sim-developer spec sheet |
| **B** | Reputable secondary or on-record commentary (single source) |
| **C** | Gen1/Gen2 car, undated video, or sim-guide number used as a proxy |
| **E** | My engineering estimate. Reasoning is shown. Not a published number |

Where sources conflict, the range is shown and the trusted value is stated.

---

## 1. Dimensions (Camaro and Mustang share one control chassis)

| Parameter | Value | Grade | Source / note |
|---|---|---|---|
| Wheelbase | **2,765.5 mm** (iRacing sheet: 2,767 mm). Gen2 was 2,822 mm | A | [S2], [S3], [S4] (2,765 mm). It is the midpoint of the road-car wheelbases, 2,720 mm Mustang [S11] and 2,812 mm Camaro [S12] = 2,766 mm. The 2022 WhichCar piece says the same: "halfway" |
| Overall length | **4,881 mm** | B | [S3] sim spec sheet. Road cars: Mustang S650 4,810 mm [S11], Camaro 4,783 mm [S12] |
| Overall width | **1,960 mm** | B | [S3]. Gen3 is "100 mm wider and 100 mm shorter" than Gen2 [S7]. Road cars: Mustang 1,915 mm, Camaro 1,897 mm |
| Overall height | Not published. **Estimate 1,330 mm Mustang / 1,290 mm Camaro, +/-30 mm** | E | Roof is 102.5 mm lower than Gen2 [S2]. Road-car heights are Mustang 1,395-1,400 mm [S11], Camaro 1,349 mm [S12]. I subtracted ~65 mm for race ride height versus road-car clearance |
| Front / rear track | Not published. **Estimate 1,630 mm both axles, +/-40 mm** | E | WhichCar [S2] says "track ... around the two-metre mark" vs Gen2 1,913 mm. That figure is almost certainly overall width mislabelled "track": a 1.9 m axle track plus 300 mm tyres would be over 2.2 m. My estimate: 1,960 mm width minus 300 mm tyre minus ~30 mm arch gap |
| Ride height (floor, static) | Not published. **Estimate 60 mm front / 75 mm rear, +/-15 mm** | E | Rear is adjustable upward: a 15 mm damper spacer was permitted in 2023 [S50]. DJR ran "neutral-to-positive rake" [S50] |
| Wheel | **18 x 11 in** forged alloy (Rimstock), max 11.75 kg, offset 25 mm (was 52 mm on Gen2) | A | [S4], [S10], [S2] |
| Tyre | Dunlop SP Sport Maxx slick. **Tread width 290-300 mm, rolling diameter 680 mm** (rolling radius 0.340 m) | A | [S4]. The 2013 Dunlop designation was 280/680R18 [S45] |
| Tyre minimum pressure | **17 psi (117 kPa)** at any time on circuit. Lowered to 15 psi at Perth, Darwin and Townsville in 2024 (tracks with less tyre load) | A | [S9] rule D17.1.17; [S9b]. Hot or cold working pressures for Gen3: NOT FOUND |

### Body shape: Camaro vs Mustang

Sourced facts:

- Doors, roof, bonnet and windows keep the road car's key dimensions [S61]. The glasshouse matches the road car's [S60]. Tail lamps are carried over from the road car [S10]. The control chassis is shaped for two-door bodies [S47].
- The control chassis has a lower roofline than Gen2, "allowing for a sleeker Mustang" [S48].
- Wheelbase is a compromise. Per Triple Eight's Jeromy Moore: the wheel arch moved **forward on the Camaro and rearward on the Mustang**, so side-on the cars are hard to tell apart [S2].
- Rear-wing profile is set by Supercars. Manufacturers style only the endplates [S2].
- The Camaro rear wing was **widened 100 mm** (two 50 mm 3D-printed spacers) and moved **50 mm rearward** in the 2024 aero update, "to match the Mustang" [S41], [S42].
- Mustang changes for The Bend 2025, a drag-reduction kit [S43]: removal of the side-skirt leading-edge packer, wing position and angle-range change, smaller North American-spec door mirrors.
- The exhaust exit moved from ahead of the rear wheels to just behind the front wheels (prototype stage) [S2].
- The fuel tank sits in front of the rear axle and the driver sits towards the centre of the car [S10].

Not found in any text source (headlight shape, bonnet vents, nose details): use reference photos. From general knowledge of the road cars only, treat as unverified:

- Mustang S650 has a long bonnet, a fastback rear and three-bar tail lamps.
- Camaro (6th gen, ZL1 trim name) has a shorter, tighter glasshouse, slim horizontal tail lamps and a ZL1-style vented bonnet.

Superseded claim: the 2022 WhichCar piece says the prototype Camaro had paddles. Supercars then kept a **manual sequential lever** for both cars [S11a], [S5].

---

## 2. Mass and balance

| Parameter | Value | Grade | Source / note |
|---|---|---|---|
| Minimum weight incl. driver, **excluding fuel** | **1,335 kg** (Newcastle, Mar 2023) -> **1,340 kg** from Sandown, Sep 2023 -> **1,345 kg** for 2026. 1,340 kg applied at Bathurst 2023-2025 | A | [S15], [S17], [S16]. Rules: minimum is measured dry and must be met "during and immediately after" competition [S8] C4.1.4. supercars.com's car page lists 1,350 kg [S1]; trusted value is the rules wording as quoted by [S16] |
| Minimum driver mass (suit, seat, ballast) | 95 kg | A | [S10] |
| Minimum front-axle load | **725 kg** (2023-25), **730 kg** (2026) | A | [S15], [S16] |
| Dry front weight share | **54.1 %** (725/1,340); 54.3 % in 2026 | A (derived) | Teams ballast the nose to hit the minimum, so real dry balance is about this |
| Mass with driver and full fuel | **1,439 kg** (iRacing "wet weight with driver"; dry 1,340 kg) | B | [S3]. Implied fuel load 99 kg |
| Fuel tank | **135 L** (Supercars car page). Wikipedia says ~130 L | B | [S1] vs [S10]. 99 kg / 0.775 kg/L (E75 estimate) = 128 L, which fits ~130 L. Trusted: 130-135 L, use 132 L |
| Fuel | E75 | A | [S10] |
| Full-tank front weight share | **~51 %** | E | Added 99 kg at ~2.5 m behind the front axle (tank is ahead of the rear axle, [S10]). Front share rises back to ~54 % as fuel burns |
| Centre-of-gravity height | Not published. **Estimate 0.38 m** (was 0.44 m) | E | Only relative CoG data exists: Camaro vs Mustang differed by **2.3 mm**, fixed by moving 4.97 kg of Camaro ballast rearward [S18]. Gen3 is lower and wider than Gen2 for mechanical grip (100 mm lower roll hoop, 100 mm wider track; Autosport, The Race Torque). Road sports cars on taller suspension sit at 0.40-0.45 m (Alfa 4C, Corvette C7; Wikipedia, Automobile handling). The game's tuned tyre friction (~1.94) needs track/(2h) above it, or the car tips onto two wheels in normal corners (2026-10-08 wheel-lift fix) |
| Yaw inertia | **~2,500 kg*m^2, +/-20 %** | E | m*a*b with a=1.35 m, b=1.41 m gives ~2,750; racing cars sit a little lower |

---

## 3. Engine

| Parameter | Camaro ZL1 | Mustang GT | Grade | Source / note |
|---|---|---|---|---|
| Engine | Chevrolet Racing LTR 5.7 L naturally-aspirated V8, alloy block, **pushrod, 1 cam, 2 valves/cyl**. Built by KRE | Ford Coyote-based **5.4 L naturally-aspirated V8, DOHC, 4 valves/cyl**, alloy block, variable cam timing. Built by Herrod | A | [S1], [S10], [S20], [S19] |
| Power | ~600 bhp (**447 kW**) | ~600 bhp (**447 kW**) | A | [S1], [S3], [S5] (Ford: ">600 hp (447 kW)"). Gen2 was ~659 bhp [S21] |
| Peak torque | **690 Nm** (iRacing sheet) | **>650 Nm** (Ford, via Motor1) | A / B | [S3], [S5]. Caution: the iRacing sheet prints identical figures for both cars (even 5.7 L for the Coyote), so 690 Nm is a generic sim number. Gearbox rating is 670 Nm [S6]. Trusted: Ford's own figure and the gearbox rating bracket it, so use **660 Nm** (range 650-690) |
| Rev limit | **7,500 rpm** | **7,500 rpm** | A | [S1], [S3]. The limit was kept to preserve existing gearing and noise levels [S22] |
| Peak power rpm | Not published. **~7,000 rpm** | same | E | At 447 kW and ~7,000 rpm, torque = 610 Nm, which is consistent with a 650-660 Nm peak lower down |
| Peak torque rpm | Not published. **~5,000 rpm** | same | E | Typical NA V8 shape |
| Idle | Not published. **~1,400 rpm** | same | E | Racing V8 with a large cam |
| Intake | Single throttle body (not individual ram tubes); induction noise is quieter than Gen2 | same | B | [S7] |
| Exhaust noise limit | 95 dB(A) at 30 m from the side | same | A | [S8] |
| Crank / firing order | **Cross-plane** (high confidence by inference). GM LS/LT order **1-8-7-2-6-5-4-3** | **Cross-plane** (high confidence by inference). Coyote order **1-5-4-8-6-3-7-2** | B / E | No Supercars text states the crank type. The Ford engine started from the 5.2 L Predator block and heads [S5a], and Wikipedia says Predator is cross-plane [S13]. Firing orders are from the road-engine families [S13], [S14]. The flat-plane Voodoo is a different engine |

**Estimated torque/power curve (E, anchored to 447 kW and ~660 Nm).** Both engines were dyno-overlaid for parity ("literally overlaid") [S4a]. Altitude correction is separate (below).

| rpm | 3,000 | 4,000 | 5,000 | 6,000 | 7,000 | 7,500 |
|---|---|---|---|---|---|---|
| Torque (Nm) | 520 | 590 | 650 | 640 | 610 | 560 |
| Power (kW) | 163 | 247 | 340 | 402 | 447 | 440 |

**Altitude at Bathurst:** the circuit sits at roughly 700-870 m (NSW contour data, local file `data/raw/elevation-profile.csv`; [S35] gives 174 m of relief). Standard-atmosphere pressure at ~750 m is 92.7 kPa, or 91.5 % of sea level. Air density is **~1.12 kg/m^3** at 15 C. A naturally-aspirated engine loses roughly that fraction, so **use ~0.92 x rated power** (E). A prominent theory is that the Coyote loses more at altitude than the GM pushrod; Supercars ran barometric testing before the 2025 race [S23].

**Parity notes**

- Parity is judged on Accumulated Engine Power (power in 50 rpm steps on a 200 rpm/s ramp) plus torque and economy on a static dyno [S19].
- Shift cut in May 2023: Mustang **30 ms** (V2 map) vs Camaro **105 ms** [S19]. In 2025 Ford also received "a faster shift recovery setting" [S43].
- 2025 Bathurst practice speed trap: Camaros led by roughly 2-8 km/h (see section 7) [S23]. That is a parity fight, not a physics rule. For the game, treat the engines as equal, with an optional ~1 % Mustang penalty at Bathurst.
- Intake restrictor and other 2025-26 parity changes were not read in full; not used here.

**Audio-synth notes**

- V8 firing frequency = rpm / 30 Hz: **~47 Hz at 1,400 rpm idle, 250 Hz at 7,500 rpm**.
- Cross-plane crank: each bank fires unevenly, which is the classic V8 "burble". Bank pattern derived from the road-engine cylinder numbering (not a Supercars source): GM L-R-L-R-R-L-R-L, Coyote R-L-R-L-L-R-L-R. A flat-plane crank would alternate banks evenly and sound higher and smoother; it is not what these engines use (see crank row above).
- No source describes valvetrain sound (pushrod vs DOHC) beyond Supercars' remark that the engines sound similar to Coyote-powered MARC cars [S7]; treat any difference between the two cars as a creative choice.
- Gen3 has less induction noise than Gen2 [S7]. Supercars said it would shape exhausts so both cars "sound great" [S7].

---

## 4. Drivetrain

| Parameter | Value | Grade | Source / note |
|---|---|---|---|
| Gearbox | **Xtrac P1293**, 6-speed sequential + reverse, transaxle, spiral-bevel final drive, quick-change input drop gears, fixed **spool** output, 62 kg. Rated 670 Nm | A | [S6], [S5], [S10] |
| Shift | **Manual sequential lever** on both cars, clutchless, no paddles. iRacing says no clutch or blip is required, but a downshift blip helps avoid rear-wheel hop | A | [S5], [S11a], [S3] |
| Clutch | Triple plate | B | [S10] |
| Drop gear at Mt Panorama | **0.931** (29/27 teeth). Back-up 1.000; 0.909 was also carried as a taller option | A | [S8] Div C table C10.5; [S26]; [S3] |
| Drop gears used elsewhere (2023 table) | 1.000 (Phillip Island, Sydney, The Bend), 1.042 (Sandown, Hidden Valley), 1.074-1.130 (slow and street tracks). A lower number = taller overall gearing | A | [S8] |
| Individual gear ratios and final drive | **NOT FOUND.** Individual ratios and final drive are fixed; only the drop gear changes [S10] | - | Not public |
| Overall top-gear ratio (engine:wheel, incl. drop + final) | **~3.16 : 1** | E (anchored) | Triple Eight's Jeromy Moore: "304 km/h on the hard limiter" with the 0.931 drop gear [S26]. 304 km/h on a 0.340 m rolling radius = 2,372 wheel rpm; 7,500 / 2,372 = 3.16. With a 0.335 m loaded radius it is ~3.12 |
| Gear max speed at 7,500 rpm (all gears) | **~100 / 135 / 175 / 215 / 258 / 304 km/h**, overall ratios ~9.6 / 7.1 / 5.5 / 4.5 / 3.7 / 3.16 | E | Only 6th is anchored. Spacing is typical for a sequential 'box and fits the gear-per-corner evidence in section 7 (Griffins in 3rd, Cutting/Dipper/Elbow in 2nd, Chase to 2nd). Tune against telemetry |
| Driveline efficiency | **~0.92** | E | Spiral-bevel transaxle, spool |
| Torque interruption on upshift | Camaro **105 ms**, Mustang **30-60 ms** (parity-adjusted; Ford later received a "faster shift recovery setting") | B | [S19], [S43]. Treat as the ECU shift cut, not total gear-change time |
| 0-100 km/h | **3.4 s** (Supercars marketing figure) | B | [S1]. Use as a launch validation target |
| Gear changes per lap at Bathurst | **~30** | B | [S36] |

---

## 5. Aero

| Parameter | Gen3 (2023 launch) | Gen3 (2024+ update) | Gen2 | Grade | Source / note |
|---|---|---|---|---|---|
| Downforce at 200 km/h | **~140 kg** | **~168 kg** (+~20 %) | ~450 kg | A / B | Launch: [S2], [S10], [S53]. 2024 revision "~20 % more downforce" [S27], [S10]. Gen2 [S2], [S53] |
| Downforce at 300 km/h | ~315-320 kg | ~380 kg | ~800 kg through The Chase | B / E | Larkham: Gen2 ~800 kg at 300 km/h, Gen3 takes "about 60 %" off [S38], so ~320 kg. Scaling 140 kg by v^2 gives 315 kg |
| ClA (lift coefficient x area) | **0.74 m^2** | **0.89 m^2** | - | E | 140 kg x 9.81 / (0.5 x 1.2 x 55.6^2) |
| CdA (drag coefficient x area) | **~1.0 m^2, +/-0.2** | **~1.15 m^2, +/-0.2** | - | E | See derivation below. Cd is ~0.48 / 0.55 for a ~2.1 m^2 frontal area (E) |
| Aero balance | Rear-biased. **~40 % front** | same | - | E | The 2020 tender capped aero at 300 N front / 600 N rear at 200 km/h [S4] (33 % front). iRacing says what little downforce exists sits "near the rear" and gives high-speed understeer [S3]. The 2023 Mustang had more front and less rear than the Camaro [S2a]. Absolute split NOT FOUND |
| Drag coefficient / frontal area, official | **NOT FOUND**. Supercars says it has a fixed drag number it wants to hit but does not publish it | | | - | [S58] |
| Wind-tunnel rig | Windshear (NC): 3 m x 9 m rolling road, up to 180 mph, Dec 2023 test | | | A | [S54], [S55] |
| 2024 effect on top speed | **~10 km/h slower** down Conrod expected (more drag and downforce) | | | B | [S27] |
| Parity | Windshear Dec 2023: Mustang and Camaro "level". 2025 Windshear: Camaro more forward balance, Mustang "peakier" | | | B | [S55], [S49] |

**CdA derivation (E).** I ran a straight-line model of Conrod: 1,330 m of full throttle [S36] on a ~-4 % grade (local NSW contour data), 447 kW x 0.92 altitude factor, 0.92 driveline efficiency, 0.340 m rolling radius, the gear spacing above, 1,380-1,440 kg, rho 1.12.

- It reproduces the "nearly 20 s" of full throttle from Forrest's Elbow to the end of Conrod [S59] (21-22 s).
- 2023-spec trap speeds of "low 290s" [S25] need **CdA ~1.0 m^2**.
- 2025-spec trap speeds of 276-286 km/h [S23] need **CdA ~1.15 m^2**.
- A ~10 % drag cut from a tow reaches the 300.5 km/h GPS reading [S25].
- Treat the result as order-of-magnitude (+/-20 %). The model uses an assumed power curve, gearing and altitude factor.

---

## 6. Brakes and tyres

| Parameter | Value | Grade | Source / note |
|---|---|---|---|
| Brake system | AP Racing control system. **395 mm front disc, 6-piston caliper; 355 mm rear disc, 4-piston caliper** | B | [S10]. The tender requested six-pot front, four-pot rear [S4a]. Caution: Wikipedia's citation is an old (2016) operations manual and the same figures were used on Gen1/Gen2, so Gen3 disc sizes are unverified. WhichCar notes the carried-over rear uprights were machined slightly to take the new brakes [S2] |
| Design target | **1.5 g** braking performance; 1,500 km brake-package life | A | [S4] (Sept 2020 tender) |
| Cooling / temps | Bathurst brakes cool on the straights and take big hits at the bottom of The Chase and again at Murray's Corner. Pad/rotor changes are common | B | [S36]. Gen1 (2017) note: "washing off 200 km/h at once", +400 C on the rotor [S46]. 10.95 kg rotor mass in that article is **Gen1/Gen2**, not Gen3 |
| Peak braking decel | **Not published. Estimate 1.7 g peak at low-mid speed, ~1.3-1.8 g averaged over the Chase zone** | E | Slick mu ~1.6-1.7. Chase: 285 -> ~115 km/h over 150-200 m = 1.8-1.3 g average, including ~0.3 g of aero drag at the start of the zone |
| Peak lateral g | **Not published. Estimate 1.4-1.6 g at low-mid speed; ~1.6-1.8 g at The Grate** | E | Apex speed 80 km/h at a ~35-40 m effective radius = 1.2-1.4 g (anchor: [S36]). Outer-front tyre load of ~1,100 kg at The Grate [S36] |
| Compounds | Soft (new construction from 2025) and Super Soft remain; the **Soft is used at Bathurst**. Rules list H/S/SS/W; Bathurst 2023 was Soft | A | [S44], [S44a], [S9] D17.1.9 |
| Bathurst 2025 allocation | 8 pre-marked + 52 event-marked Soft sets plus wets | A | [S44] |
| Tyre wear/heat | Heavy degradation on the Soft at Bathurst 2023, per van Gisbergen. Soft was a new choice for Bathurst that year | B | [S24], [S44a] |
| Tyre pressure | Minimum 17 psi on circuit. Gen1-era hot pressure ~31 psi | A / C | [S9]; Gen1-era [S45a]. Gen3 hot pressure NOT FOUND, use ~20-22 psi hot (E) |

---

## 7. Performance at Bathurst

Circuit length 6,213 m (6.2 km); Conrod Straight 1.916 km [S35]. Supercars lists average speed 180 km/h and top speed 300 km/h [S34].

### 7.1 Gen3 lap times

| Year | Friday qualifying best | Shootout pole | Race fastest lap (lap #) | Race winners / time |
|---|---|---|---|---|
| 2023 | **2:04.6644** Kostecki, Camaro [S31] | **2:04.2719** Kostecki, Camaro [S31] | **2:07.5431** Brown/Perkins (lap 4), 175.4 km/h [S30] | van Gisbergen/Stanaway, 6:07:07.4957 [S31] |
| 2024 | 2:05.6452 Payne, Mustang (provisional pole) [S31] | **2:05.5119** Kostecki, Camaro [S31] | **2:07.8610** Feeney/Whincup (lap 142), 174.9 km/h [S29] | Kostecki/Hazelwood, 5:58:03.0649, **167.6 km/h**, fastest ever [S33] |
| 2025 | **2:04.0307** Kostecki, Mustang (Gen3 record, 180.3 km/h) [S28] | **2:04.0413** Kostecki, Mustang [S31], [S32] | **2:06.7265** Brown/Pye (lap 32), 176.5 km/h = **Gen3 race lap record** [S28] | Payne/Tander, 6:52:14.938 [S31] |

- Supercars' circuit page prints the 2025 race record as 2:06.7625 [S34]; the results table [S28] shows 2:06.7265 at 176.496 km/h, which matches the arithmetic (6,213 m / 126.7265 s). Trusted: 2:06.7265.
- Gen2 record for scale: 2:03.373 (Mostert, 2021, [S27a]). Gen3 pole is ~0.7 s slower (0.5 %). Triple Eight's Jeromy Moore predicted "2:05 or 2:04" for Gen3 [S27a].
- Race-pace fastest laps are 2:06.7-2:07.9; the fuel-light, tyre-fresh Shootout lap is ~2:04.0-2:04.3.

### 7.2 Top speeds

| Item | Value | Grade | Source |
|---|---|---|---|
| GPS peak on Conrod | **300.5 km/h** (van Gisbergen, Friday qualifying 2023), with a big tow and favourable wind. Soft tyre, 0.931 drop gear. First official 300 km/h in a Supercar | A | [S25], [S24] |
| Official speed trap, 2023 | "**low 290s**" | A | [S25], [S24] |
| Gearing ceiling | **304 km/h** on the limiter with 0.931 | B | [S26] |
| 2024-spec expectation | ~290 km/h at Bathurst, ~10 km/h slower (more drag/downforce) | B | [S27] |
| Official speed trap, 2025 practice | Best single reading **286 km/h** (Golding, Camaro). Third-fastest reading per car (average of two sessions): Chevrolets 277.5-283.5, Fords 275.5-280 km/h | A | [S23] |
| Typical range, 2026 preview | 290-300 km/h depending on breeze and Elbow exit speed | B | [S36] |
| Full-throttle time, Elbow to end of Conrod | ~20 s; full-throttle distance 1,330 m | B | [S59], [S36] |
| Speed at **end of Mountain Straight** (Griffins braking) | Gen3 NOT FOUND. Older-car quotes: ~250 km/h (Brock, Monaro) to ~260 km/h (Larkham, Gen1) [S9a]. **Estimate 245-255 km/h** | C / E | Straight-line model: from ~95 km/h out of Hell, ~1,000-1,050 m at about +4.5 % grade (local NSW contour data), gives 240-255 km/h in 17-19 s (a 2026 Supercars preview says roughly 15 s of straight-line driving after Turn 1 [S59]; loose wording, same ballpark). Wikipedia's 290 km/h figure [S35] is uncited and conflicts with all of this; rejected |

### 7.3 Corner by corner

Basis codes: **[G3]** = Gen3-era source (2023+); **[C]** = Gen1/Gen2, undated video or sim guide; **[E]** = my estimate. Braking markers refer to the 200/150/100/50 m boards. Distances are from sim guides, not telemetry.

| Corner | Entry km/h | Apex km/h | Gear | Braking / technique | Basis |
|---|---|---|---|---|---|
| **Hell Corner (T1)** | ~205-215 | **~85-90** | 2nd | Brake about the **100 m board** (iRacing Gen3 slightly earlier than 100). Average decel ~1.1-1.3 g. "Over 200" at the line [S54a] | Entry/gear [C] [S52], [S54a]; apex [E] (Crompton says the slowest corner is the Elbow at 80, so Hell >= 80 [S36]) |
| **Mountain Straight** | exits Hell ~95-100, reaches **245-255** | - | 3rd-4th-5th-6th | Shift to 4th near a mid-track bump [S54a] | [E] |
| **Griffins Bend (T2)** | ~245-255 | **~125-140** | **3rd** | Just before the 100 m board (iRacing Gen3). Peak decel ~1.4-1.8 g | Gear [G3] [S37], [S55a]; apex [C] (Larkham Gen1 "about 130"; Brock Monaro "160-odd" [S9a]); entry [E] |
| **The Cutting (T3/T4)** | ~145-165 | **80-85** | 2nd | Lift/trail-brake. Short-shift to 3rd over the bump on exit | Apex [G3] [S36]; gear [C] |
| **Reid Park (T5-T7)** | - | ~110-130 first right, ~105-120 second | 3rd | Partial throttle, "lifting here is death" (blind) | [E] from R~85-95 m; gear [C] [S54a] |
| **Sulman Park / The Grate** | - | ~140-160 | 3rd-4th | Biggest vertical + lateral load. **Right-front tyre ~1,100 kg** | Load [G3] [S36]; speed [E] |
| **McPhillamy Park (T10)** | ~200+ | ~165-180 | 4th | Brakes then turn in over a blind crest; downhill | Entry [C]; apex [E] |
| **Skyline** | **~220-240** at the crest | - | 4th -> 3rd -> 2nd | Brake near the crest, straight-line braking before The Esses | [C] [S54a] 240 vs Wikipedia 220 [S35]; Gen3 NOT FOUND |
| **The Esses** | - | ~110-150 | **3rd early, then 2nd** | Downhill, early downshifts | Gear [G3] [S37]; speeds [E] |
| **The Dipper** | - | **80-85** | 2nd | Off-camber; car goes light then compresses | Apex [G3] [S36]; gear [C] |
| **Forrest's Elbow** | ~180 | **80** (slowest corner) | 2nd (sims show 1st-2nd) | Elbow exit speed sets the Conrod top speed | Apex [G3] [S36]; entry [C] [S56] |
| **Conrod Straight** | exits Elbow ~90-100 | **290-300** top | 6th | WOT 1,330 m; trap just before the kink | [G3] |
| **The Chase kink** | **285** (fastest corner) | - | 6th | Kink is not flat in Gen3 [S26]; expected to be a lift [S53] | [G3] [S36] |
| **The Chase (L-R)** | 285 -> | **~110-120** | **2nd** on exit | Brake **150-200 m** before (sim boards 150 m; Gen3 iRacing near 200 m, low confidence). Average decel 1.3-1.8 g | Min speed [C] 110 (Hino 2017 [S51]) / 120 (Wikipedia [S35]); gear [G3] [S37]; decel [E] |
| **Murray's Corner (T23)** | ~215-220 | ~75-85 | 2nd | **100 m board**; biggest brake-temperature spike, big lock-up risk | Gear/board [C] [S52]; speeds [E] (sim: 380 m from Chase exit) |
| **Pit Straight** | ~205-215 at the line | - | 4th | - | [E] |

- **The Chase geometry check (2026-10-07).** The game's left apex (T21) has a 29 m centreline radius, and the measured car's ideal apex speed is about 100 km/h, below the cited 110-120 km/h. A NSW Spatial Services aerial photo at 0.1 m per pixel (`NSW_Imagery` MapServer export) confirms the shape: a circle fit to the photo's asphalt centreline gives 27-29 m, the OSM way follows the asphalt within about 1.5 m, and the dark asphalt is about 10-11 m wide (the game uses 12.6 m). More kerb use or more solver work does not widen the racing line (48-49 m radius). So the geometry stays as it is. The 110-120 km/h figures are Gen1 and Wikipedia numbers, not Gen3 data. With the user's tuned handling, the game's ideal apex speed is 112 km/h. Diagnostics: `tests/debug/chase2.test.ts` and `tests/debug/corner-mins.test.ts`.
- Lap-level budget (Crompton): 55 % of the lap at wide-open throttle, 35 % turning, ~30 gear changes per lap [S36].
- Brake temperature is dominated by the bottom of The Chase and the final corner [S36].
- Fastest/slowest conflict: Wikipedia calls Murray's the slowest corner [S35]; Crompton names the Elbow at 80 km/h [S36]. Both are about 80 km/h, so use 80 km/h for each.

---

## 8. Official timing sectors

| Sector | Boundaries | Basis |
|---|---|---|
| S1 | Control line -> the Mountain Straight, Griffins Bend and The Cutting, ending **after The Cutting**, at "the peak of this hill" before McPhillamy Park. Roughly **2.4-2.5 km** from the line (E, from OSM-derived chainage and the elapsed times below) | The Roar: S1 runs from the line "up until the Cutting" [S40]. 2025 Shootout broadcast placed the first split on the hill after The Cutting [S37] |
| S2 | -> across the top (Reid/Sulman/McPhillamy, Skyline, Esses, Dipper) **to Forrest's Elbow** | [S40], [S37] |
| S3 | Forrest's Elbow -> Conrod Straight, The Chase, Murray's Corner, line. Described as "largely Conrod Straight" | [S40], [S39] |
| Speed trap | On Conrod, "just short of the right-hand kink into The Chase" | [S25] |
| Exact timing-loop coordinates | **NOT FOUND**. The Natsoft timing configuration for Bathurst lists micro-sector links but not loop locations [S57] | |

Sector times for Gen3:

- 2025 pole lap (broadcast): **S1 = 50.847 s** at the hill split [S37]. Final lap 2:04.04.
- Feb 2024 demonstration, not a push lap [S39]: Camaro 2:07.5845 = **51.9606 / 34.1152 / 41.5087**; Mustang 2:07.7195 = 52.0864 / 34.0350 / 41.5981.
- Proportions from the demo: S1 40.7 %, S2 26.7 %, S3 32.6 %. Scaled to a 2:04.0 lap: **~50.5 / 33.1 / 40.4 s**.
- Gen2 comparison: Mostert's 2:03.373 lap showed a first split of ~50.47 s (from video captions, low confidence) [S56].
- Sanity check on distance: with S1 at 2.45 km, S2 1.55 km and S3 2.2 km, average speeds are 170 / 163 / 193 km/h, which is plausible (E).

---

## 9. Physics tuning targets (what to put in the game)

Values in bold are the recommended inputs. "Source" lists the supporting numbers; grades are in the section tables above.

| Parameter | Value to use | Source |
|---|---|---|
| Mass, race start (full fuel, with driver) | **1,440 kg** | [S3] 1,439 kg |
| Mass, minimum dry with driver | **1,340 kg** (2023-25); 1,345 kg for 2026 | [S15], [S17], [S16] |
| Fuel tank / full fuel mass | **132 L / 99 kg** (E75 ~0.775 kg/L) | [S1], [S10], [S3] |
| Front weight share | **54 % dry, ~51 % full fuel** | [S15] 725/1,340; E |
| Wheelbase | **2.766 m** | [S2], [S3] |
| Track (F/R) | **1.63 m** (E) | [S2] width context; E |
| Overall L x W x H | **4.88 x 1.96 x 1.33 m** (height E) | [S3]; E |
| CG height | **0.38 m** (E) | [S18] (relative only); E; section 1 |
| Yaw inertia | **2,500 kg*m^2** (E) | E |
| Wheel / tyre | **18x11 in; rolling radius 0.340 m; tread 295 mm** | [S4] |
| Peak power | **447 kW** at ~7,000 rpm (rated) | [S1], [S3], [S5] |
| Altitude derate at Bathurst | **x 0.92** (E); optional Mustang x 0.91 | E; [S23] |
| Peak torque | **660 Nm** at ~5,000 rpm (range 650-690) | [S5], [S3], [S6] |
| Rev limit / idle | **7,500 rpm / ~1,400 rpm (E)** | [S1], [S3]; E |
| Upshift torque cut | **105 ms Camaro / 45 ms Mustang** | [S19] |
| Drop gear (Bathurst) | **0.931** (alt 1.000) | [S8] |
| Overall ratios (1st-6th) | **9.6 / 7.1 / 5.5 / 4.5 / 3.7 / 3.16** (E; 6th anchored) | [S26] + E |
| Driveline efficiency | **0.92** (E) | E |
| Differential | **Spool** (locked rear axle) | [S6] |
| Downforce at 200 km/h | **140 kg (2023 spec) / 168 kg (2024+ spec)** | [S2], [S27] |
| ClA | **0.74 / 0.89 m^2** | derived |
| CdA | **1.0 / 1.15 m^2** (E, +/-0.2) | derived; [S25], [S23] |
| Aero balance | **~40 % front** (E) | [S4], [S3] |
| Air density at Bathurst | **1.12 kg/m^3** (15 C, ~750 m) | E |
| Rolling resistance Crr | **0.012** (E) | E |
| Brakes | **395 mm / 355 mm discs; 6-pot front, 4-pot rear** | [S10] (Gen3 sizes unverified) |
| Peak braking decel | **1.7 g** (E); design target 1.5 g | [S4]; E |
| Peak lateral grip | **1.5 g** low-mid speed (E) | [S36]; E |
| Min tyre pressure | **17 psi cold/hot floor** (running ~20-22 psi hot, E) | [S9] |
| Top speed | **Gear-limited ~304 km/h; speed trap 290-293 (2023 spec) / 280-286 (2025 spec)**; GPS peak 300.5 km/h with a tow | [S25], [S26], [S23] |
| End of Mountain Straight | **~250 km/h** (E) | [S9a]; E |
| The Chase kink / minimum | **285 km/h / 110-120 km/h** | [S36]; [S51], [S35] |
| Slow corners (apex) | **Elbow 80, Dipper 80-85, Cutting 80-85 km/h** | [S36] |
| Hot-lap target | **2:04.0-2:04.3** (2023/2025 Shootout, ~180 km/h average) | [S31], [S28] |
| Race-pace target | **2:06.7-2:07.9** fastest laps; race average ~167-176 km/h | [S28]-[S30], [S33] |
| Sector split | **~41 % / 27 % / 32 %** (S1 ends after The Cutting, S2 ends at Forrest's Elbow) | [S39], [S37], [S40] |
| 0-100 km/h | **3.4 s** | [S1] |

---

## 10. Least-confident numbers and how to firm them up

1. **Track widths, ride heights, overall height** - not public (GSD/VSD documents are restricted; [S8] C4.9 only says "as specified in the GSD").
2. **Gear ratios** - only 6th gear is anchored (304 km/h at 7,500 rpm with the 0.931 drop gear). The other five are a plausible spread, not data.
3. **CdA and ClA** - ClA is solid (140 kg at 200 km/h, +20 % in 2024), but CdA comes from back-solving trap speeds with an assumed power curve and altitude derate.
4. **Torque and power curves** - only peak power (447 kW) and peak torque (650-690 Nm) are published. Peak rpm points, shape and idle are typical-V8 estimates.
5. **Peak lateral and braking g** - never published for Gen3. Only the 1.5 g design target [S4] and 80-85 km/h apex speeds [S36] are available.
6. **Per-corner entry and apex speeds** except Elbow, Dipper, Cutting, Chase kink - no Gen3 telemetry was available. Most values are estimates or Gen1/Gen2 quotes.
7. **Centre-of-gravity height and yaw inertia** - estimates only.
8. **Brake disc sizes** - the 395/355 mm figures trace to older operations manuals and may not match Gen3.
9. **Sector boundary coordinates** - located by commentary and elapsed-time arithmetic, not an official map.
10. **Camaro vs Mustang visual details** - only chassis/arch, wing and mirror differences are sourced.

Best next sources: iRacing or Garage 61 telemetry on the Gen3 cars at Bathurst; the Natsoft timing-loop map; a real Gen3 Camaro or Mustang telemetry overlay.

---

## 11. Toyota GR Supra (2026 entry)

Toyota joined the championship in 2026 with the GR Supra. Walkinshaw TWG Racing (the homologation team) runs cars #1 and #2. Brad Jones Racing runs cars #8, #14 and #96 [S66]. The game's Supra liveries are fictional, like the other two cars.

| Item | Value | Status | Source |
|---|---|---|---|
| Chassis, wheelbase, wheels, tyres | Gen3 control parts, the same as the Camaro and the Mustang | Confirmed by the rules | [S47], [S64] |
| Engine | 5.2 L quad-cam V8, Lexus 2UR-GSE based, 94 x 94 mm bore and stroke, hydraulic variable valve timing, own inlet manifold | Confirmed | [S62], [S63] |
| Displacement history | First built as 5.0 L, then taken to 5.2 L for parity (the rules allow 5.0 to 5.7 L) | Confirmed | [S62] |
| Power and torque | Matched to the other two engines across the rev range by the parity rules; limit 7,500 rpm | Confirmed (rule) | [S62], [S64] |
| Firing order | 1-8-7-3-6-5-4-2, odd cylinders on one bank (2UR family) | Secondary source | [S67] |
| Overall height | About 1.23 m in the game: the road A90 is 1,292-1,295 mm, the lowest of the three road cars; the game takes off about the same as for the other two | Estimate | — |
| Upshift torque cut | 0.045 s in the game, the same as the other DOHC car (Mustang) | Assumption | — |

In the game, `CAR_SPECS.supra` uses the shared Gen3 mass, balance, driveline and aero values. With the same power, the test AI laps in the same time as the Mustang.

## 12. Holden Torana A9X (1979 Group C, a tribute car)

The 2026 Bathurst 1000 marks 20 years since Peter Brock's death. The game adds his most famous car: the Holden Dealer Team LX Torana SS A9X hatchback #05, winner of the 1979 Hardie-Ferodo 1000 (Brock and Jim Richards). It won by six laps, led every lap, and Brock set the lap record on the final lap. The car runs period-correct 1979 Group C physics, so it is much slower than a Gen3 car. Sources are inline below; "Estimate" rows give the reasoning. The visual reference is docs/references/cars-torana.md.

| Item | Real value | Game value | Status and source |
|---|---|---|---|
| Length, width, height (road car) | 4,509 x 1,704 x 1,321 mm | length 4.51 m | Confirmed ([CarsGuide](https://www.carsguide.com.au/holden/torana/price/1977/ss-a9x)) |
| Width with bolt-on flares | not published | 1.80 m | Estimate: 10-inch rims against 6-inch road rims, plus flares |
| Race height | not published | 1.30 m | Estimate: about 100 mm ride height against 127 mm on the road car |
| Wheelbase | 2,586 mm | 2.586 m | Confirmed (CarsGuide) |
| Track front / rear | road 1,400 / 1,372 mm; A9X books give 1,453-1,486 / 1,425-1,450 mm | 1.54 / 1.52 m | Estimate for the race car with 10-inch rims |
| Front overhang | not published | 0.92 m | Estimate: total overhang 1.923 m split by the side-view photos |
| Race weight with driver | not published (road car 1,213-1,242 kg) | 1,300 kg | Estimate: light shell and stripped trim, plus cage and a large drop tank ([Shannons](https://club.shannons.com.au/club/news/racing-garage/lx-torana-a9x-too-good-for-its-own-good/)) |
| Weight split | not published | 52 % front | Estimate: front V8, low rear tank |
| CG height | not published | 0.42 m | Estimate: higher than Gen3 (0.38 m), but kept under the tip-over limit track / (2 x CG height) against the tuned tyre friction |
| Engine | Holden 308 V8, 5,044 cc, 101.6 x 77.8 mm, pushrod, two valves per cylinder; L34-based Group C build at 10.5:1 | 5.0 L pushrod V8 | Confirmed ([Wikipedia: Holden V8](https://en.wikipedia.org/wiki/Holden_V8_engine), [Street Machine](https://www.streetmachine.com.au/features/peter-brock-holden-torana-a9x-engine-bathurst)) |
| Induction | twin Weber 48IDF on the 1979 winner (a Holley on the sister #76 car) | audio: carburettor voice | Confirmed (Street Machine; [CarExpert](https://www.carexpert.com.au/car-news/the-time-i-drove-a-bathurst-legend-and-almost-put-it-into-the-wall)) |
| Power, torque | 285-290 kW, about 475 Nm (Wheels 1980); builders claim 380-400 hp | peak 289 kW at about 6,100 rpm, 475 Nm at about 5,000 rpm | Confirmed range; rpm of the peaks estimated |
| Rev limit | rules limit 6,800 rpm; engine builders used 6,500-6,800 | redline 6,500, limiter 6,800 rpm | Confirmed (Street Machine) |
| Firing order | 1-2-7-8-4-5-6-3 (odd cylinders on the driver's bank) | the same | Weak secondary sources ([CarsCounsel](https://carscounsel.com/holden-308-firing-order/)); check a workshop manual |
| Gearbox | Borg-Warner Super T10 4-speed. Two ratio sets were CAMS-homologated for the A9X: 2.43 / 1.61 / 1.23 / 1.00 and 2.64 / 1.61 / 1.23 / 1.00 | 2.43 / 1.61 / 1.23 / 1.00, reverse 2.35 | Box confirmed ([Wikipedia: Holden Torana](https://en.wikipedia.org/wiki/Holden_Torana)). The two homologated sets: forum post by "Dr Terry", 11 Aug 2008 ([gmh-torana.com: Borg Warner Super T10](https://www.gmh-torana.com/forums/topic/29810-borg-warner-super-t10/)); it says the clusters were changed for different tracks. Which set #05 ran at Bathurst in 1979 is not recorded; 2.43 chosen by the user (2026-10-08). Reverse 2.35 is the same set in the [Richmond Gear Super T10 catalogue](https://www.richmondgear.com/wp-content/uploads/pdfs/richmond/RG25.pdf) (a modern build). Road A9X (M21): 2.54 / 1.83 / 1.38 / 1.00 ([QTCC LX specifications](http://www.qtcc.org.au/lx_specs.php)) |
| Final drive | 2.60:1 Salisbury at Bathurst (disputed) | 2.60 | "2.6:1 final drive Bathurst", "44.8 km/h per 1000 rpm (2.6:1 final drive)" and "Conrod straight 270 km/h @ 6000 rpm" ([QTCC LX specifications](http://www.qtcc.org.au/lx_specs.php), read through the [Wayback Machine](https://web.archive.org/web/2020/http://www.qtcc.org.au/lx_specs.php)); 2.60 Detroit Locker on the #76 sister car in historic racing ([CarExpert](https://www.carexpert.com.au/car-news/the-time-i-drove-a-bathurst-legend-and-almost-put-it-into-the-wall)). Homologated axles: 2.60, 2.78, 3.08, 3.36, 3.55, 3.90, 4.44 (same forum thread). Against 2.60: the 1979 HDT team manager John Sheppard, quoted in Just Torana magazine, "maybe we used a 2.78 ratio at Bathurst... I don't recall"; the cars' keeper Dan Bowden agrees ([gmh-torana.com thread](https://www.gmh-torana.com/forums/topic/44717-new-issue-of-just-toranas-out/)). Kept at 2.60 by user decision (2026-10-08) |
| Tyres | Bridgestone slicks ([Motor Sport, Dec 1979](https://www.motorsportmagazine.com/archive/article/december-1979/55/the-great-race-2/)) | 0.31 m radius, 0.27 m wide | Radius calibrated from 44.8 km/h per 1,000 rpm in top on the 2.60 axle; width estimated for 10-inch rims |
| Wheels | about 15 x 10 in, five studs, dark face, polished deep-dish lip | 15 in classic rim | Estimate from photos and the 10-inch rim limit |
| Brakes | four-wheel discs, 276 mm vented front | disc radius 0.138 m | Front disc confirmed (parts listing); race data not found |
| Aero | no published Cd; a fibreglass air dam, a tailgate spoiler and a rear-facing bonnet scoop | CdA 1.05 m², no downforce | Estimate: calibrated so the game car reaches 250.9 km/h on Conrod, inside the 249-269 km/h trap speed |
| Tyre friction | not published | tyreMu 1.21 | Calibrated: the game lap at the measured handling matches the lap target below |
| Tyre heat gain | not applicable | tyreHeatGain 1.5 | Calibrated: the tyre heat model is driven by g-forces and is tuned on Gen3 cars, so the slower Torana's tyres stayed 10-15 °C cold. With 1.5 the Torana is within 4.5 °C of the Camaro at The Cutting on lap 1, and its 3-lap peak (104 °C) stays below the Camaro's (122 °C) |
| Steering | manual rack, large wheel, 10.97 m turning circle (road car) | 0.40 rad max road-wheel angle | Estimate |
| 1979 pole | 2:20.500, Brock | — | Confirmed ([Wikipedia: 1979 Hardie-Ferodo 1000](https://en.wikipedia.org/wiki/1979_Hardie-Ferodo_1000)) |
| 1979 lap record | 2:21.1, Brock, lap 163 (the final lap) | — | Confirmed (Wikipedia) |
| Conrod trap speed | 249-269 km/h (155-167 mph) for the V8 Toranas | — | Confirmed (Motor Sport) |
| Effect of the Chase (added 1987) | about 3-5 s per lap | about +5 s for this car | [Supercars: evolution of the lap record](https://www.supercars.com/news/championship/faster-and-faster-evolution-of-bathursts-best-lap-time/) |

Lap target in the game: the 1979 pole plus the Chase is about 145.5 s. The game's Camaro laps 1.041 times the real Gen3 pole (129.07 s against 124.0 s), so the target is 1.041 x 145.5 = 151.45 s with the measured handling (MEASURED_HANDLING in src/config/handling.ts). The game car laps 150.98 s at 250.9 km/h on Conrod (tests/torana-pace.test.ts). The game's default handling adds grip to every car, so the player's laps are faster: 142.29 s.

Risk: the wall-clearance pass window for the tyre heat gain is narrow. Values from 1.40 to 1.52 pass every driving test; above about 1.54 the race-warm colour-following test touches the wall. Change tyreMu, cdA or the gain only with the torana driving tests (tests/physics.test.ts, tests/line-follower.test.ts) and tests/debug/torana-impacts.test.ts.

Least certain: race weight, CG height, flared track, tyre sizes, which homologated gear set and axle the car ran in 1979, Cd, steering lock. A copy of Dr Terry's A9X book or the 1979 CAMS Group C regulations would close most of these gaps.

## Source key

URLs were opened or returned content during this research unless noted. Direct fetch failed for whichcar.com.au (403); [S2] was read through a Wayback Machine copy of the same page.

- **[S1]** https://supercars.com/the-gen3-supercars - official car page: 1,350 kg, 135 L, 7,500 rpm, 600 hp, 0-100 km/h 3.4 s
- **[S2]** https://www.whichcar.com.au/features/here-s-all-the-technical-details-on-the-gen3-supercars-ford-mustang-and-chevrolet-camaro (read via https://web.archive.org/web/2022/https://www.whichcar.com.au/features/here-s-all-the-technical-details-on-the-gen3-supercars-ford-mustang-and-chevrolet-camaro) - 2022 prototype-stage technical deep dive
- **[S2a]** https://www.speedcafe.com/?p=636615 - "Gen3 Supercars set for further aero testing" (early 2023): Mustang claimed to have more front and less rear downforce than the Camaro
- **[S3]** https://s100.iracing.com/wp-content/uploads/2024/12/Gen-3-Supercars-Manual_V3.pdf - iRacing Gen3 manual: dimensions, 1,340/1,439 kg, 600 bhp, 690 Nm, setup text
- **[S4]** https://www.supercars.com/news/gen3-prototype-aim-for-march-2021 - Sept 2020 tender: wheelbase 2,765 mm, 300 N/600 N aero, 1.5 g, tyre/wheel specs
- **[S4a]** https://www.speedcafe.com/?p=501795 - tender: six-pot front, four-pot rear; https://www.supercars.com/news/larkham-impressed-by-gen3-engine-work - torque curves "overlaid"
- **[S5]** https://www.motor1.com/news/614578/ford-mustang-gt-supercar-australia/ - >600 hp (447 kW), >650 Nm, lever-actuated sequential Xtrac P1293 6-speed
- **[S5a]** https://www.fordmuscle.com/news/listen-to-a-ford-gen3-supercar-engine-scream-on-the-dyno - 5.4 L, started from the 5.2 L Predator block and heads, dry sump
- **[S6]** https://www.xtrac.com/product/p1293-australian-supercars-transaxle/ - P1293: 670 Nm, 62 kg, six speeds, spool, drop gears
- **[S7]** https://www.speedcafe.com/?p=543431 - Gen3 sound, single throttle body, "100 mm wider and 100 mm shorter"
- **[S8]** https://assets.ctfassets.net/xd502h20t7lh/6jzlq41Yed9rcngBGdOPJF/5e425e09e3fc8299ab7b89dec78b66d3/2022-Div-C-Final-Issued-10.02.2023.pdf - Operations Manual 2023 Division C: drop-gear table, minimum-weight rules, 95 dB(A), dimensions only "per GSD"
- **[S9]** https://assets.ctfassets.net/xd502h20t7lh/3H42SlyV499tyTzr6Nagtv/d26be653eeb1c9acd18a9c63f123714a/2023-Div-D-Final-Issued-10.02.2023.pdf - Operations Manual 2023 Division D: tyre types, 17 psi minimum
- **[S9a]** Older-car proxies read by sub-agent: https://www.crash.net/v8/feature/103634/1/peter-brocks-lap-of-mount-panorama-bathurst (Brock, Monaro: 250 km/h into Griffins, "160-odd" through it) and https://www.youtube.com/watch?v=YGykmw1M_Y4 (Larkham, Gen1: ~260 km/h in, ~130 km/h apex)
- **[S9b]** https://www.supercars.com/news/explained-why-minimum-tyre-pressure-supercars-2024 - 15 psi at Perth, Darwin, Townsville in 2024 (read by sub-agent)
- **[S10]** https://en.wikipedia.org/wiki/Supercars_Championship - 395/355 mm discs, 18-inch wheels, E75, tail lamps, tank position, 95 kg driver, fixed ratios with drop gears
- **[S11]** https://en.wikipedia.org/wiki/Ford_Mustang_(seventh_generation) - road-car dimensions
- **[S11a]** https://www.supercars.com/news/further-upgrades-to-begin-on-gen3-cars - manual sequential mechanism fitted to the Gen3 prototypes
- **[S12]** https://en.wikipedia.org/wiki/Chevrolet_Camaro_(sixth_generation) - road-car dimensions
- **[S13]** https://en.wikipedia.org/wiki/Ford_Modular_engine - Coyote firing order, Predator cross-plane
- **[S14]** https://en.wikipedia.org/wiki/GM_LS-based_small-block_engine - LS firing order 1-8-7-2-6-5-4-3
- **[S15]** https://www.supercars.com/news/minimum-weights-for-gen3-confirmed/ - 1,335 kg, 725 kg front axle (Mar 2023)
- **[S16]** https://www.v8sleuth.com.au/another-minimum-weight-increase-for-gen3-supercars - 1,345 kg / 730 kg for 2026, history
- **[S17]** https://www.speedcafe.com/?p=671284 - 1,340 kg from Sandown 2023
- **[S18]** https://www.supercars.com/news/gen3-centre-of-gravity-changes-explained - 2.3 mm CoG difference, 4.97 kg ballast
- **[S19]** https://www.autosport.com/supercars/news/the-burning-supercars-parity-questions-answered/10473636/ - AEP method, shift cut 30 ms vs 105 ms (26 May 2023)
- **[S20]** https://www.raceenginetechnology.com/Suppliers/ford-and-chevrolet-australian-supercars-v8s - engine configurations
- **[S21]** https://pmw-magazine.com/news/engine-technology/australian-supercars-gives-first-look-at-new-engine-packages.html - ~600 bhp vs 659 bhp Gen2
- **[S22]** https://www.speedcafe.com/?p=646041 - 7,500 rpm limit kept to preserve gearing and noise
- **[S23]** https://www.v8sleuth.com.au/?p=236883 - 2025 Bathurst practice speed-trap table, altitude theory
- **[S24]** https://www.v8sleuth.com.au/?p=124970 - 300.5 km/h data, tow, low-290s trap, 0.931/0.909 ratios
- **[S25]** https://www.supercars.com/news/300km-h-barrier-hit-during-in-bathurst-qualifying - 300.5 km/h GPS, trap location
- **[S26]** https://www.v8sleuth.com.au/gen3-cars-tipped-to-crack-300km-h-at-bathurst/ - 304 km/h on the limiter, 0.931 drop gear
- **[S27]** https://speedcafe.com/video-lower-top-speed-tipped-for-2024-spec-supercars/ - 2024 spec: ~20 % more downforce, ~10 km/h slower
- **[S27a]** https://www.v8sleuth.com.au/mystery-surrounds-bathursts-new-magic-number/ - Gen2 record 2:03.3732, Moore prediction
- **[S28]** https://www.motorsport.com/v8supercars/results/2025/bathurst-1000-659847/?st=FL (fastest laps) and ...?st=Q (qualifying)
- **[S29]** https://es.motorsport.com/v8supercars/results/2024/bathurst-1000/?st=FL - 2024 race fastest laps
- **[S30]** https://au.motorsport.com/v8supercars/results/2023/bathurst-630260/?st=FL - 2023 race fastest laps
- **[S31]** https://en.wikipedia.org/wiki/2023_Bathurst_1000, https://en.wikipedia.org/wiki/2024_Bathurst_1000, https://en.wikipedia.org/wiki/2025_Bathurst_1000 - qualifying/Shootout tables
- **[S32]** https://www.supercars.com/news/supercars-news-2025-results-bathurst-1000-top-ten-shootout-report-fastest-lap-times-video-brodie-kostecki and https://www.supercars.com/news/supercars-news-2025-bathurst-1000-qualifying-by-the-numbers-brodie-kostecki-stats-margins
- **[S33]** https://www.v8sleuth.com.au/kostecki-hazelwood-win-fastest-ever-bathurst-1000/ - 5:58:03.0649, 167.598 km/h
- **[S34]** https://supercars.com/circuit/mount-panorama-motor-racing-circuit - circuit stats, Gen3 race record listing
- **[S35]** https://en.wikipedia.org/wiki/Mount_Panorama_Circuit - 6.213 km, 174 m relief, Conrod 1.916 km, Chase min speed ~120 km/h
- **[S36]** https://www.youtube.com/watch?v=_sQdOz7boP8 - Neil Crompton "Pedders Preview" Bathurst 2026 (transcript read): Chase 285, Elbow 80, Cutting/Dipper 80-85, 55 % WOT, 1,100 kg tyre load, 30 gear changes, 1,330 m WOT
- **[S37]** https://www.youtube.com/watch?v=TeL9NAALD78 - 2025 Shootout pole-lap broadcast (transcript): 3rd at Turn 2, S1 50.847, 2nd at The Chase exit
- **[S38]** https://www.youtube.com/watch?v=56N_GnpRCYE - Larkham on Gen3 aero: Gen2 ~800 kg at 300 km/h, ~60 % removed
- **[S39]** https://speedcafe.com/lap-times-in-for-gen3-supercars-engine-test/ - Feb 2024 demo sector times
- **[S40]** https://www.theroar.com.au/?p=928107 - sector definitions
- **[S41]** https://speedcafe.com/intrigue-surrounds-gen3-downforce-levels/ - Camaro wing +100 mm, +50 mm rearward
- **[S42]** https://www.v8sleuth.com.au/?p=132106 - wider Camaro wing "to match the Mustang"
- **[S43]** https://www.supercars.com/news/supercars-news-2025-parity-adjustments-the-bend-bathurst-1000-technical-evaluation-ford-chevrolet - 2025 Ford changes
- **[S44]** https://www.supercars.com/news/the-beginners-guide-to-supercars-tyres-all-you-need-to-know - compounds and allocation; **[S44a]** https://www.v8sleuth.com.au/?p=108742 - 2023: "Softer rubber locked in for Bathurst, Sandown enduros"
- **[S45]** https://www.jaxtyres.com.au/blog/dunlop-v8-supercars-tyre-fast-facts - 2013 tyre 280/680R18; **[S45a]** https://www.jaxtyres.com.au/blog/tyre-talk--v8-supercar-tyre-specifications - Gen1-era pressures
- **[S46]** https://www.supercars.com/news/supercars-brakes-beefed-up-for-bathurst - 2017 (Gen1/Gen2) rotor note
- **[S47]** https://www.motorsport.com/v8supercars/news/gen3-supercars-road-car-dna/6525780/ - road-car DNA; two-door control chassis; ~150 kg downforce target (2021)
- **[S48]** https://www.supercars.com/news/first-look-at-gen3-ford-mustang - lower roofline, fastback
- **[S49]** https://flatchatracing.substack.com/p/weve-got-parity - 2025 parity/aero balance comments
- **[S50]** https://www.v8sleuth.com.au/the-tech-rule-change-that-could-help-djr/ - 15 mm rear damper spacer, rake
- **[S51]** https://www.supercars.com/news/championship/hino-track-guide-supercheap-auto-bathurst-1000/ - Gen1 track guide: 300 km/h into The Chase, 110 km/h minimum (read by sub-agent)
- **[S52]** https://www.youtube.com/watch?v=bqPwxPZSGhM - iRacing Gen3 Camaro Bathurst guide (gears and braking boards)
- **[S53]** https://www.youtube.com/watch?v=kUtjehG7Nb0 - Gen3 Unpacked: Gen2 ~450 kg vs Gen3 "closer to 140 kilos"; The Chase becomes a lift
- **[S54]** https://supercars.com/news/explained-supercars-wind-tunnel-testing - Windshear rig; **[S54a]** https://www.youtube.com/watch?v=8kmVPhVylL0 - Winterbottom corner-by-corner (undated car)
- **[S55]** https://www.v8sleuth.com.au/?p=129622 - Windshear: Mustang and Camaro "level"; **[S55a]** https://www.youtube.com/watch?v=NRsJHZBSnas - Kostecki/Larko Gen3 2024 (Turn 2 in 3rd)
- **[S56]** https://www.youtube.com/watch?v=OuLfT-lsz_8 - Gen2 Mustang 2021 record lap commentary
- **[S59]** https://www.supercars.com/news/supercars-news-2026-expert-analysis-bathurst-1000-brodie-kostecki-engineer-qualfying-form-guide-rules - 2026 analysis: ~15 s up Mountain Straight after Turn 1, nearly 20 s at full throttle Elbow to end of Conrod (read by sub-agent)
- **[S60]** https://autotrader.co.nz/news/revealed-supercars-debuts-gen3-ford-mustang-and-chevrolet-camaro - Gen3 glasshouse matches road cars
- **[S61]** https://www.justcars.com.au/news-and-reviews/gen3-supercars-revealed/922349 - doors, roof, bonnet, windows share road-car dimensions; "lower, wider and 100 kg lighter" than Gen2
- **[S58]** https://www.supercars.com/news/simulation-work-proving-gen3-a-greater-racing-product - CFD/drag target statement, no figures (read by sub-agent)
- **[S57]** https://help.hhtiming.com/series-specific-info/supercars/ - Natsoft timing configuration; micro-sector links only, no loop locations (read by sub-agent)
- **[S62]** https://www.drive.com.au/news/toyotas-v8-supercars-engine-inside-the-5-2-litre-with-lexus-roots/ - Toyota Supercar engine: 5.2 L 2UR-GSE based, 94 x 94 mm, first 5.0 L, parity, 7,500 rpm
- **[S63]** https://speedcafe.com/supercars-news-2025-toyota-supra-reveal-v8-engine-specifications-details-gen3-comments-reaction/ - Toyota reveals the V8 details of the GR Supra Supercar
- **[S64]** https://www.supercars.com/news/supercars-news-v8-engine-for-new-toyota-gr-supra - Supercars.com: V8 engine for the new Toyota GR Supra
- **[S65]** https://www.motorsport.com/v8supercars/news/toyota-unveils-v8-powered-supra-for-2026-supercars-season/10755466/ - Motorsport.com: Toyota unveils the V8 Supra for 2026
- **[S66]** https://en.wikipedia.org/wiki/2026_Supercars_Championship - 2026 entry list (Toyota teams and car numbers)
- **[S67]** https://rerev.com/firing-orders/lexus/5-0l/ - Lexus 5.0 L (2UR) firing order 1-8-7-3-6-5-4-2
