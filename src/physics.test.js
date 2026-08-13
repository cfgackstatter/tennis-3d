import { describe, expect, it } from 'vitest';
import {
    BALL_RADIUS,
    NET_CENTER_HEIGHT,
    NET_HEIGHT,
    NET_POST_DISTANCE,
    SERVICE_LINE_DISTANCE,
    aerodynamicCoefficients,
    airDensityAtAltitude,
    airProperties,
    calculateTrajectory,
    classifyLanding,
    launchVelocity,
    netHeightAt,
    netIntersection,
    rpmToOmega,
    spinKind,
    spinVectorFromRpm,
    vec,
} from './physics.js';
import { PRESETS, startZ } from './presets.js';

describe('netHeightAt', () => {
    it('is 0.914 m at center and 1.07 m at the posts', () => {
        expect(netHeightAt(0)).toBeCloseTo(NET_CENTER_HEIGHT, 5);
        expect(netHeightAt(NET_POST_DISTANCE / 2)).toBeCloseTo(NET_HEIGHT, 5);
        expect(netHeightAt(-NET_POST_DISTANCE / 2)).toBeCloseTo(NET_HEIGHT, 5);
    });

    it('is lowest at the center', () => {
        expect(netHeightAt(0)).toBeLessThan(netHeightAt(NET_POST_DISTANCE / 4));
    });
});

describe('aerodynamicCoefficients', () => {
    it('has no lift without spin', () => {
        const { dragCoef, liftCoef } = aerodynamicCoefficients(40, 0);
        expect(dragCoef).toBeCloseTo(0.58, 5);
        expect(liftCoef).toBe(0);
    });

    it('matches S / (1 + 2S) for a mid-wear ball', () => {
        const speed = 44.4;
        const omega = rpmToOmega(1800);
        const S = (BALL_RADIUS * omega) / speed;
        const { liftCoef } = aerodynamicCoefficients(speed, omega, 0.5, BALL_RADIUS);
        expect(liftCoef).toBeCloseTo(S / (1 + 2 * S), 10);
        expect(liftCoef).toBeGreaterThan(0.08);
        expect(liftCoef).toBeLessThan(0.28);
    });

    it('raises drag on a new fluffy ball', () => {
        const worn = aerodynamicCoefficients(40, 0, 0);
        const fresh = aerodynamicCoefficients(40, 0, 1);
        expect(fresh.dragCoef).toBeGreaterThan(worn.dragCoef);
        expect(worn.dragCoef).toBeCloseTo(0.51, 5);
        expect(fresh.dragCoef).toBeCloseTo(0.65, 5);
    });

    it('increases lift as spin increases', () => {
        const slow = aerodynamicCoefficients(30, rpmToOmega(500)).liftCoef;
        const fast = aerodynamicCoefficients(30, rpmToOmega(2500)).liftCoef;
        expect(fast).toBeGreaterThan(slow);
    });

    it('makes a fluffy ball land shorter than a worn one', () => {
        const pos = vec(0, 2.8, startZ(0.45));
        const vel = launchVelocity(192 / 3.6, (-6 * Math.PI) / 180, 0);
        const spin = spinVectorFromRpm(2500, (25 * Math.PI) / 180);
        const worn = calculateTrajectory(pos, vel, spin, { fuzz: 0 });
        const fluffy = calculateTrajectory(pos, vel, spin, { fuzz: 1 });
        expect(fluffy.landingPoint.z).toBeLessThan(worn.landingPoint.z);
    });

    it('loses spin in flight, more so with fluffy felt', () => {
        const pos = vec(0, 2.8, startZ(0.45));
        const vel = launchVelocity(35, (8 * Math.PI) / 180, 0);
        const spin = spinVectorFromRpm(3000, Math.PI / 2);
        const worn = calculateTrajectory(pos, vel, spin, { fuzz: 0 });
        const fluffy = calculateTrajectory(pos, vel, spin, { fuzz: 1 });
        expect(worn.finalSpin).toBeLessThan(rpmToOmega(3000));
        expect(fluffy.finalSpin).toBeLessThan(worn.finalSpin);
    });
});

describe('launchVelocity', () => {
    it('is straight ahead along +z when both angles are zero', () => {
        const v = launchVelocity(10, 0, 0);
        expect(v.x).toBeCloseTo(0, 10);
        expect(v.y).toBeCloseTo(0, 10);
        expect(v.z).toBeCloseTo(10, 10);
    });
});

describe('calculateTrajectory', () => {
    it('lands on the ground (y = 0) and stays in front of the server', () => {
        const { landingPoint, trajectoryPoints } = calculateTrajectory(
            vec(0, 3, -11.5),
            launchVelocity(160 / 3.6, (-5 * Math.PI) / 180, 0),
            spinVectorFromRpm(0, 0)
        );

        expect(landingPoint).not.toBeNull();
        expect(landingPoint.y).toBe(0);
        expect(landingPoint.z).toBeGreaterThan(-11.5);
        expect(trajectoryPoints.at(-1).y).toBe(0);
    });

    it('makes topspin land shorter than a no-spin shot', () => {
        const pos = vec(0, 3, -11.5);
        const vel = launchVelocity(35, (-3 * Math.PI) / 180, 0);
        const none = calculateTrajectory(pos, vel, vec(0, 0, 0));
        const topspin = calculateTrajectory(pos, vel, spinVectorFromRpm(3000, Math.PI / 2));

        expect(none.landingPoint).not.toBeNull();
        expect(topspin.landingPoint).not.toBeNull();
        expect(topspin.landingPoint.z).toBeLessThan(none.landingPoint.z);
    });

    it('clears the net on a default first-serve-like shot', () => {
        const { trajectoryPoints } = calculateTrajectory(
            vec(-1, 3, -11.585),
            launchVelocity(160 / 3.6, (-5 * Math.PI) / 180, (10 * Math.PI) / 180),
            spinVectorFromRpm(1800, (15 * Math.PI) / 180)
        );
        const hit = netIntersection(trajectoryPoints);
        expect(hit).not.toBeNull();
        expect(hit.clearance).toBeGreaterThan(0);
    });

    it('reports flight time, apex, and impact speed when the ball lands', () => {
        const result = calculateTrajectory(
            vec(0, 2.8, -11.4),
            launchVelocity(192 / 3.6, (-7 * Math.PI) / 180, 0),
            spinVectorFromRpm(2500, (25 * Math.PI) / 180)
        );
        expect(result.flightTime).toBeGreaterThan(0.2);
        expect(result.flightTime).toBeLessThan(1.2);
        expect(result.peakHeight).toBeGreaterThanOrEqual(2.0);
        expect(result.impactSpeed).toBeGreaterThan(20);
        expect(result.impactSpeed).toBeLessThan(192 / 3.6);
    });
});

describe('classifyLanding', () => {
    it('calls a net clip', () => {
        const call = classifyLanding(vec(0, 0, 4), { clearance: -0.1 });
        expect(call.code).toBe('net');
    });
});

describe('atmosphere and spin labels', () => {
    it('thins the air with altitude', () => {
        expect(airDensityAtAltitude(0)).toBeCloseTo(1.225, 3);
        expect(airDensityAtAltitude(1600)).toBeLessThan(1.05);
    });

    it('is less dense when hotter or more humid', () => {
        const coolDry = airProperties({ altitude: 0, temperatureC: 5, relativeHumidity: 20 });
        const hotHumid = airProperties({ altitude: 0, temperatureC: 35, relativeHumidity: 90 });
        expect(hotHumid.density).toBeLessThan(coolDry.density);
        expect(coolDry.density).toBeGreaterThan(1.22);
        expect(hotHumid.density).toBeLessThan(1.16);
    });

    it('makes the same serve land longer in thin air', () => {
        const preset = PRESETS.find((item) => item.id === 'first-serve');
        const serve = () => [
            vec(preset.baseline, preset.height, startZ(preset.distance)),
            launchVelocity(
                preset.speed / 3.6,
                (preset.vAngle * Math.PI) / 180,
                (preset.hAngle * Math.PI) / 180
            ),
            spinVectorFromRpm(preset.spin, (preset.axis * Math.PI) / 180),
        ];

        const seaLevel = calculateTrajectory(...serve(), {
            airDensity: airProperties({ altitude: 0, temperatureC: 15, relativeHumidity: 40 }).density,
        });
        const denver = calculateTrajectory(...serve(), {
            airDensity: airProperties({ altitude: 1600, temperatureC: 25, relativeHumidity: 20 }).density,
        });

        expect(denver.landingPoint.z).toBeGreaterThan(seaLevel.landingPoint.z);
    });

    it('labels topspin and backspin axes', () => {
        expect(spinKind(90)).toBe('Topspin');
        expect(spinKind(60)).toBe('Kick (7-to-1)');
        expect(spinKind(270)).toBe('Backspin');
    });
});

describe('ATP presets', () => {
    for (const preset of PRESETS) {
        it(`${preset.label} clears the net and lands`, () => {
            const pos = vec(preset.baseline, preset.height, startZ(preset.distance));
            const result = calculateTrajectory(
                pos,
                launchVelocity(
                    preset.speed / 3.6,
                    (preset.vAngle * Math.PI) / 180,
                    (preset.hAngle * Math.PI) / 180
                ),
                spinVectorFromRpm(preset.spin, (preset.axis * Math.PI) / 180)
            );
            const hit = netIntersection(result.trajectoryPoints);
            expect(result.landingPoint).not.toBeNull();
            expect(hit).not.toBeNull();
            expect(hit.clearance).toBeGreaterThan(0);
        });
    }

    it('lands the 1st serve in the service box', () => {
        const preset = PRESETS.find((item) => item.id === 'first-serve');
        const result = calculateTrajectory(
            vec(preset.baseline, preset.height, startZ(preset.distance)),
            launchVelocity(
                preset.speed / 3.6,
                (preset.vAngle * Math.PI) / 180,
                (preset.hAngle * Math.PI) / 180
            ),
            spinVectorFromRpm(preset.spin, (preset.axis * Math.PI) / 180)
        );
        const hit = netIntersection(result.trajectoryPoints);
        const call = classifyLanding(result.landingPoint, hit);
        expect(call.code, `landed z=${result.landingPoint.z.toFixed(2)} x=${result.landingPoint.x.toFixed(2)} clearance=${hit?.clearance}`).toBe('serve');
        expect(result.landingPoint.z).toBeGreaterThan(0);
        expect(result.landingPoint.z).toBeLessThanOrEqual(SERVICE_LINE_DISTANCE);
    });

    it('lands the kick serve in the service box', () => {
        const preset = PRESETS.find((item) => item.id === 'kick-serve');
        const result = calculateTrajectory(
            vec(preset.baseline, preset.height, startZ(preset.distance)),
            launchVelocity(
                preset.speed / 3.6,
                (preset.vAngle * Math.PI) / 180,
                (preset.hAngle * Math.PI) / 180
            ),
            spinVectorFromRpm(preset.spin, (preset.axis * Math.PI) / 180)
        );
        const call = classifyLanding(result.landingPoint, netIntersection(result.trajectoryPoints));
        expect(call.code).toBe('serve');
    });
});
