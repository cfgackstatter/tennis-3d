/** ITF court dimensions, meters. */
export const COURT_LENGTH = 23.77;
export const COURT_WIDTH = 10.97;
export const SINGLES_WIDTH = 8.23;
export const SERVICE_LINE_DISTANCE = 6.4;
export const NET_HEIGHT = 1.07;
export const NET_CENTER_HEIGHT = 0.914;
export const NET_POST_OVERHANG = 0.914;
export const NET_POST_DISTANCE = SINGLES_WIDTH + 2 * NET_POST_OVERHANG;
export const NET_SAG_FACTOR = 0.8;

export const GRAVITY = 9.81;
export const AIR_DENSITY = 1.21;
const SEA_LEVEL_PRESSURE = 101325;
const R_DRY_AIR = 287.058;
const R_WATER_VAPOR = 461.495;
const ISA_T0 = 288.15;
const ISA_LAPSE = 0.0065;
export const BALL_RADIUS = 0.0335;
export const BALL_MASS = 0.057;
const BALL_INERTIA = 3.2e-5;
export const FELT_NAP = 0.0015;
export const DEFAULT_FUZZ = 0.5;

export const TRAJECTORY_DT = 0.005;
export const TRAJECTORY_STEPS = 2000;

export function vec(x, y, z) {
    return { x, y, z };
}

function clone(v) {
    return { x: v.x, y: v.y, z: v.z };
}

function add(a, b) {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scale(v, s) {
    return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function length(v) {
    return Math.hypot(v.x, v.y, v.z);
}

function lengthSq(v) {
    return v.x * v.x + v.y * v.y + v.z * v.z;
}

function normalize(v) {
    const mag = length(v);
    return mag < 1e-12 ? vec(0, 0, 0) : scale(v, 1 / mag);
}

function cross(a, b) {
    return {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x,
    };
}

function lerp(a, b, t) {
    return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t,
    };
}

/**
 * Net cord height at court x. Catenary: 1.07 m at the posts, 0.914 m at center.
 */
export function netHeightAt(x) {
    const half = NET_POST_DISTANCE / 2;
    const normalized = Math.max(-1, Math.min(1, x / half));
    const denom = Math.cosh(NET_SAG_FACTOR) - 1;
    return NET_CENTER_HEIGHT + (NET_HEIGHT - NET_CENTER_HEIGHT) *
        (Math.cosh(NET_SAG_FACTOR * normalized) - 1) / denom;
}

export function rpmToOmega(rpm) {
    return rpm * 2 * Math.PI / 60;
}

function saturationVaporPressure(tempC) {
    return 610.94 * Math.exp((17.625 * tempC) / (tempC + 243.04));
}

function airPressureAtAltitude(meters) {
    const height = Math.max(0, meters);
    const isaTemp = ISA_T0 - ISA_LAPSE * height;
    if (isaTemp <= 200) {
        return SEA_LEVEL_PRESSURE * Math.exp(-GRAVITY * height / (R_DRY_AIR * ISA_T0));
    }
    return SEA_LEVEL_PRESSURE * (isaTemp / ISA_T0) ** (GRAVITY / (R_DRY_AIR * ISA_LAPSE));
}

function dynamicViscosity(tempC) {
    const kelvin = tempC + 273.15;
    return 1.458e-6 * (kelvin ** 1.5) / (kelvin + 110.4);
}

/**
 * Moist-air density from altitude, temperature, and relative humidity.
 * Higher / hotter / more humid air is thinner, so drag and Magnus both drop
 * and the ball carries farther.
 */
export function airProperties({ altitude = 0, temperatureC = 20, relativeHumidity = 50 } = {}) {
    const kelvin = temperatureC + 273.15;
    const humidity = Math.min(100, Math.max(0, relativeHumidity)) / 100;
    const pressure = airPressureAtAltitude(altitude);
    const vaporPressure = humidity * saturationVaporPressure(temperatureC);
    const dryPressure = Math.max(0, pressure - vaporPressure);
    const density = dryPressure / (R_DRY_AIR * kelvin) + vaporPressure / (R_WATER_VAPOR * kelvin);
    return { density, pressure, altitude, temperatureC, relativeHumidity };
}

/** Dry ISA air at 15 °C. Kept for simple altitude-only comparisons. */
export function airDensityAtAltitude(meters) {
    return airProperties({ altitude: meters, temperatureC: 15, relativeHumidity: 0 }).density;
}

function reynoldsNumber(speed, { temperatureC = 20, airDensity = AIR_DENSITY } = {}) {
    const nu = dynamicViscosity(temperatureC) / airDensity;
    return speed * (2 * BALL_RADIUS) / nu;
}

export function launchVelocity(speedMs, verticalRad, horizontalRad) {
    const horizontal = speedMs * Math.cos(verticalRad);
    return vec(
        horizontal * Math.sin(horizontalRad),
        speedMs * Math.sin(verticalRad),
        horizontal * Math.cos(horizontalRad)
    );
}

/** Axis 0°/180° = sidespin, 90° = topspin, 270° = backspin. */
export function spinVectorFromRpm(rpm, axisRad) {
    const omega = rpmToOmega(rpm);
    return vec(Math.sin(axisRad) * omega, Math.cos(axisRad) * omega, 0);
}

export function spinKind(axisDeg) {
    const wrapped = ((axisDeg % 360) + 360) % 360;
    if (wrapped >= 80 && wrapped <= 100) {
        return 'Topspin';
    }
    if (wrapped >= 45 && wrapped < 80) {
        return 'Kick (7-to-1)';
    }
    if (wrapped > 100 && wrapped <= 135) {
        return 'Topspin + slice';
    }
    if (wrapped >= 240 && wrapped <= 300) {
        return 'Backspin';
    }
    if (wrapped <= 30 || wrapped >= 330 || (wrapped >= 150 && wrapped <= 210)) {
        return 'Sidespin';
    }
    return wrapped < 180 ? 'Topspin + slice' : 'Backspin + slice';
}

function clamp01(value) {
    return Math.min(1, Math.max(0, value));
}

/** Felt nap raises the aerodynamic radius on a new ball (Mehta / Chadwick). */
export function ballGeometry(fuzz = DEFAULT_FUZZ) {
    const felt = clamp01(fuzz);
    const radius = BALL_RADIUS + FELT_NAP * felt;
    return { radius, area: Math.PI * radius * radius, felt };
}

/**
 * Drag and Magnus coefficients from spin parameter S = rω / v and felt.
 * Worn felt (0): Cd ≈ 0.51. New fluffy felt (1): Cd ≈ 0.65, plus a spin term.
 * Cl = [S / (1 + 2S)] × (0.92 + 0.16 fuzz); a mid-wear ball matches S/(1+2S).
 */
export function aerodynamicCoefficients(speed, omega, fuzz = DEFAULT_FUZZ, radius = BALL_RADIUS) {
    const felt = clamp01(fuzz);
    if (speed < 1e-6) {
        return { dragCoef: 0.51 + 0.14 * felt, liftCoef: 0, spinParam: 0 };
    }
    const spinParam = (radius * omega) / speed;
    const liftBase = spinParam > 0 ? spinParam / (1 + 2 * spinParam) : 0;
    return {
        dragCoef: 0.51 + 0.14 * felt + 0.07 * spinParam,
        liftCoef: liftBase * (0.92 + 0.16 * felt),
        spinParam,
    };
}

function motionDerivative(velocity, spin, airDensity, fuzz) {
    const { radius, area } = ballGeometry(fuzz);
    const speed = length(velocity);
    if (speed < 1e-8) {
        return { acceleration: vec(0, -GRAVITY, 0), spinDot: vec(0, 0, 0) };
    }

    const velocityUnit = scale(velocity, 1 / speed);
    const omega = length(spin);
    const { dragCoef, liftCoef } = aerodynamicCoefficients(speed, omega, fuzz, radius);
    const qA = 0.5 * airDensity * area * speed * speed;

    const dragForce = scale(velocityUnit, -dragCoef * qA);

    let magnusForce = vec(0, 0, 0);
    if (omega > 1e-8 && liftCoef > 0) {
        const direction = cross(scale(spin, 1 / omega), velocityUnit);
        if (lengthSq(direction) > 1e-12) {
            magnusForce = scale(normalize(direction), liftCoef * qA);
        }
    }

    const gravityForce = vec(0, -BALL_MASS * GRAVITY, 0);
    const acceleration = scale(add(add(dragForce, magnusForce), gravityForce), 1 / BALL_MASS);

    let spinDot = vec(0, 0, 0);
    if (omega > 1e-8) {
        const torqueCoeff = 0.015 + 0.035 * clamp01(fuzz);
        const torque = 0.5 * torqueCoeff * airDensity * area * radius * radius * speed * omega;
        spinDot = scale(spin, -torque / (BALL_INERTIA * omega));
    }

    return { acceleration, spinDot };
}

/**
 * Integrate gravity, drag, and Magnus force with Heun's method (RK2).
 * Spin is ω in rad/s.
 */
export function calculateTrajectory(initialPos, initialVel, spin, options = {}) {
    const dt = options.dt ?? TRAJECTORY_DT;
    const steps = options.steps ?? TRAJECTORY_STEPS;
    const airDensity = options.airDensity ?? AIR_DENSITY;
    const fuzz = options.fuzz ?? DEFAULT_FUZZ;

    const positions = [clone(initialPos)];
    let position = clone(initialPos);
    let velocity = clone(initialVel);
    let spinState = clone(spin);
    let landingPoint = null;
    let peakHeight = initialPos.y;
    let flightTime = null;
    let impactSpeed = null;
    let finalSpin = length(spin);

    for (let i = 0; i < steps; i++) {
        const d1 = motionDerivative(velocity, spinState, airDensity, fuzz);
        const velPred = add(velocity, scale(d1.acceleration, dt));
        const spinPred = add(spinState, scale(d1.spinDot, dt));
        const d2 = motionDerivative(velPred, spinPred, airDensity, fuzz);

        const newVelocity = add(velocity, scale(add(d1.acceleration, d2.acceleration), dt / 2));
        const newSpin = add(spinState, scale(add(d1.spinDot, d2.spinDot), dt / 2));
        const newPosition = add(position, scale(add(velocity, velPred), dt / 2));

        if (newPosition.y <= 0) {
            const dy = position.y - newPosition.y;
            const t = dy > 1e-12 ? position.y / dy : 1;
            landingPoint = lerp(position, newPosition, t);
            landingPoint.y = 0;
            positions.push(clone(landingPoint));
            flightTime = (i + t) * dt;
            impactSpeed = length(lerp(velocity, newVelocity, t));
            finalSpin = length(lerp(spinState, newSpin, t));
            break;
        }

        if (newPosition.y > peakHeight) {
            peakHeight = newPosition.y;
        }

        velocity = newVelocity;
        spinState = newSpin;
        position = newPosition;
        positions.push(clone(position));
        finalSpin = length(spinState);
    }

    return {
        trajectoryPoints: positions,
        landingPoint,
        peakHeight,
        flightTime,
        impactSpeed,
        finalSpin,
    };
}

export function launchForces(speed, omega, airDensity = AIR_DENSITY, temperatureC = 20, fuzz = DEFAULT_FUZZ) {
    const { radius, area } = ballGeometry(fuzz);
    const { dragCoef, liftCoef, spinParam } = aerodynamicCoefficients(speed, omega, fuzz, radius);
    const qA = 0.5 * airDensity * area * speed * speed;
    return {
        dragCoef,
        liftCoef,
        spinParam,
        dragForce: dragCoef * qA,
        magnusForce: liftCoef * qA,
        weight: BALL_MASS * GRAVITY,
        reynolds: reynoldsNumber(speed, { temperatureC, airDensity }),
    };
}

export function classifyLanding(landingPoint, netHit) {
    if (netHit && netHit.clearance <= 0) {
        return { code: 'net', label: 'Net', detail: 'Would clip the tape' };
    }
    if (!landingPoint) {
        return { code: 'air', label: 'In flight', detail: 'Did not reach the ground' };
    }

    const { x, z } = landingPoint;
    const halfLength = COURT_LENGTH / 2;
    const singlesHalf = SINGLES_WIDTH / 2;
    const doublesHalf = COURT_WIDTH / 2;
    const farHalf = z > 0;
    const inLength = z >= -halfLength && z <= halfLength;
    const inSinglesWidth = Math.abs(x) <= singlesHalf;
    const inDoublesWidth = Math.abs(x) <= doublesHalf;
    const inServiceBox = farHalf && z <= SERVICE_LINE_DISTANCE && inSinglesWidth;

    if (inServiceBox) {
        return { code: 'serve', label: 'Service box', detail: 'In for a serve' };
    }
    if (farHalf && z > halfLength) {
        return { code: 'long', label: 'Long', detail: 'Past the far baseline' };
    }
    if (farHalf && inSinglesWidth && inLength) {
        return { code: 'in', label: 'In', detail: 'Opposite singles court' };
    }
    if (farHalf && inDoublesWidth && inLength) {
        return { code: 'alley', label: 'Alley', detail: 'Doubles alley — wide for singles' };
    }
    if (farHalf && !inDoublesWidth) {
        return { code: 'wide', label: 'Wide', detail: 'Outside the doubles line' };
    }
    if (!farHalf) {
        return { code: 'short', label: 'This side', detail: 'Lands before the net' };
    }
    return { code: 'out', label: 'Out', detail: 'Outside the court' };
}

/**
 * Where the path crosses the net plane (z = 0).
 * @returns {{ point: {x,y,z}, clearance: number } | null}
 */
export function netIntersection(points) {
    for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        if ((p1.z <= 0 && p2.z >= 0) || (p1.z >= 0 && p2.z <= 0)) {
            const dz = p2.z - p1.z;
            const t = Math.abs(dz) < 1e-12 ? 0 : Math.abs(p1.z) / Math.abs(dz);
            const point = vec(
                p1.x + t * (p2.x - p1.x),
                p1.y + t * (p2.y - p1.y),
                0
            );
            return { point, clearance: point.y - netHeightAt(point.x) };
        }
    }
    return null;
}
