/**
 * 3D tennis court scene. Physics lives in physics.js so it can be tested
 * without WebGL.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
    COURT_LENGTH,
    COURT_WIDTH,
    NET_HEIGHT,
    NET_POST_DISTANCE,
    SERVICE_LINE_DISTANCE,
    SINGLES_WIDTH,
    airProperties,
    ballGeometry,
    calculateTrajectory,
    classifyLanding,
    launchForces,
    launchVelocity,
    netHeightAt,
    netIntersection,
    rpmToOmega,
    spinKind,
    spinVectorFromRpm,
} from './physics.js';
import { DEFAULT_PRESET_ID, PRESETS, startZ } from './presets.js';
import './style.css';

const VISUAL_BALL_RADIUS = 0.1;

let scene, camera, renderer, controls;
let ball, ballLight, ballProjection, target, intersectionMarker, trajectoryLine;
let activePresetId = DEFAULT_PRESET_ID;

function $(id) {
    return document.getElementById(id);
}

function readNumber(id, fallback) {
    const value = parseFloat($(id).value);
    return Number.isFinite(value) ? value : fallback;
}

function isMobile() {
    return window.matchMedia('(max-width: 800px)').matches;
}

function setPanelOpen(open) {
    $('control-panel').classList.toggle('is-collapsed', !open);
    document.body.classList.toggle('sheet-open', open && isMobile());
    $('toggle-panel').setAttribute('aria-expanded', String(open));
    $('toggle-panel').textContent = open ? 'Hide panel' : 'Tune shot';
}

function disposeObject(object) {
    if (!object) {
        return;
    }
    scene.remove(object);
    object.traverse((child) => {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
            child.material.forEach((material) => material.dispose());
        } else {
            child.material?.dispose();
        }
    });
}

function showWebGlError(container, message) {
    container.innerHTML = `<div class="webgl-error">${message}</div>`;
}

function init() {
    const container = $('scene-container');

    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) {
            showWebGlError(container, 'WebGL is not supported by your browser. Please try Chrome, Firefox, Edge, or enable hardware acceleration.');
            return;
        }
    } catch (e) {
        showWebGlError(container, 'Error initializing WebGL. Please try Chrome, Firefox, Edge, or enable hardware acceleration.');
        return;
    }

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1218);
    scene.fog = new THREE.Fog(0x0b1218, 28, 70);

    camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.set(-9, 8, 16);
    camera.lookAt(0, 0.6, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    setupLighting();
    createApron();
    createCourtSurface();
    addCourtLines();
    addNet();

    const preset = PRESETS.find((item) => item.id === DEFAULT_PRESET_ID);
    applyPreset(preset, { silent: true });
    createTennisBall(preset.baseline, preset.height, startZ(preset.distance));
    updateTrajectory();

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.target.set(0, 0.5, 0);

    renderPresets();
    setupEventListeners();
    setPanelOpen(!isMobile());
    animate();
}

function createApron() {
    const apron = new THREE.Mesh(
        new THREE.PlaneGeometry(COURT_WIDTH + 10, COURT_LENGTH + 10),
        new THREE.MeshStandardMaterial({ color: 0x141a20, roughness: 0.96, metalness: 0 })
    );
    apron.rotation.x = -Math.PI / 2;
    apron.position.y = -0.02;
    apron.receiveShadow = true;
    scene.add(apron);
}

function createCourtSurface() {
    const court = new THREE.Group();
    const courtGeometry = new THREE.PlaneGeometry(COURT_WIDTH, COURT_LENGTH);

    const courtTop = new THREE.Mesh(
        courtGeometry,
        new THREE.MeshStandardMaterial({
            color: 0x2c6a8f,
            roughness: 0.85,
            metalness: 0.05,
            side: THREE.FrontSide
        })
    );
    courtTop.rotation.x = -Math.PI / 2;
    courtTop.receiveShadow = true;

    const courtBottom = new THREE.Mesh(
        courtGeometry.clone(),
        new THREE.MeshPhongMaterial({
            color: 0x1a2228,
            transparent: true,
            opacity: 0.5,
            side: THREE.BackSide
        })
    );
    courtBottom.rotation.x = -Math.PI / 2;

    court.add(courtTop);
    court.add(courtBottom);
    scene.add(court);
}

function addCourtLines() {
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xf5f2ea });

    addLine(-COURT_WIDTH / 2, -COURT_LENGTH / 2, COURT_WIDTH / 2, -COURT_LENGTH / 2, lineMaterial);
    addLine(COURT_WIDTH / 2, -COURT_LENGTH / 2, COURT_WIDTH / 2, COURT_LENGTH / 2, lineMaterial);
    addLine(COURT_WIDTH / 2, COURT_LENGTH / 2, -COURT_WIDTH / 2, COURT_LENGTH / 2, lineMaterial);
    addLine(-COURT_WIDTH / 2, COURT_LENGTH / 2, -COURT_WIDTH / 2, -COURT_LENGTH / 2, lineMaterial);

    addLine(-SINGLES_WIDTH / 2, -COURT_LENGTH / 2, -SINGLES_WIDTH / 2, COURT_LENGTH / 2, lineMaterial);
    addLine(SINGLES_WIDTH / 2, -COURT_LENGTH / 2, SINGLES_WIDTH / 2, COURT_LENGTH / 2, lineMaterial);

    addLine(-SINGLES_WIDTH / 2, -SERVICE_LINE_DISTANCE, SINGLES_WIDTH / 2, -SERVICE_LINE_DISTANCE, lineMaterial);
    addLine(-SINGLES_WIDTH / 2, SERVICE_LINE_DISTANCE, SINGLES_WIDTH / 2, SERVICE_LINE_DISTANCE, lineMaterial);

    addLine(0, -SERVICE_LINE_DISTANCE, 0, SERVICE_LINE_DISTANCE, lineMaterial);
    addLine(-COURT_WIDTH / 2, 0, COURT_WIDTH / 2, 0, lineMaterial);

    const centerMarkLength = 0.10;
    addLine(-centerMarkLength / 2, -COURT_LENGTH / 2, centerMarkLength / 2, -COURT_LENGTH / 2, lineMaterial);
    addLine(-centerMarkLength / 2, COURT_LENGTH / 2, centerMarkLength / 2, COURT_LENGTH / 2, lineMaterial);
}

function addLine(x1, z1, x2, z2, material) {
    const points = [
        new THREE.Vector3(x1, 0.012, z1),
        new THREE.Vector3(x2, 0.012, z2)
    ];
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
}

function addNet() {
    const postGeometry = new THREE.CylinderGeometry(0.045, 0.045, NET_HEIGHT, 24);
    const postMaterial = new THREE.MeshStandardMaterial({ color: 0xcfc6b8, roughness: 0.4 });

    const leftPost = new THREE.Mesh(postGeometry, postMaterial);
    leftPost.position.set(-NET_POST_DISTANCE / 2, NET_HEIGHT / 2, 0);
    leftPost.castShadow = true;
    scene.add(leftPost);

    const rightPost = new THREE.Mesh(postGeometry, postMaterial);
    rightPost.position.set(NET_POST_DISTANCE / 2, NET_HEIGHT / 2, 0);
    rightPost.castShadow = true;
    scene.add(rightPost);

    const netGeometry = new THREE.PlaneGeometry(NET_POST_DISTANCE, NET_HEIGHT, 50, 20);
    const net = new THREE.Mesh(netGeometry, new THREE.MeshBasicMaterial({
        color: 0xe8e2d6,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.35,
        wireframe: true
    }));
    const netPositions = net.geometry.attributes.position;
    for (let i = 0; i < netPositions.count; i++) {
        const x = netPositions.getX(i);
        const y = netPositions.getY(i);
        const topY = netHeightAt(x);
        netPositions.setY(i, ((y + NET_HEIGHT / 2) / NET_HEIGHT) * topY);
    }
    netPositions.needsUpdate = true;
    scene.add(net);

    const cordPoints = [];
    for (let x = -NET_POST_DISTANCE / 2; x <= NET_POST_DISTANCE / 2; x += 0.1) {
        cordPoints.push(new THREE.Vector3(x, netHeightAt(x), 0));
    }
    scene.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(cordPoints),
        new THREE.LineBasicMaterial({ color: 0xf7f3ea })
    ));
}

function createTennisBall(width, height, z) {
    disposeObject(ball);
    disposeObject(ballLight);
    disposeObject(ballProjection);

    ball = new THREE.Mesh(
        new THREE.SphereGeometry(VISUAL_BALL_RADIUS, 32, 32),
        new THREE.MeshPhongMaterial({
            color: 0xd6ff3f,
            emissive: 0x3a4a00,
            shininess: 40
        })
    );
    ball.castShadow = true;
    ball.position.set(width, height, z);
    scene.add(ball);

    ballLight = new THREE.PointLight(0xf5ffb0, 1.2, 7);
    ballLight.position.set(width, height + 0.5, z);
    scene.add(ballLight);

    ballProjection = new THREE.Mesh(
        new THREE.CircleGeometry(0.08, 32),
        new THREE.MeshBasicMaterial({
            color: 0x0b1218,
            transparent: true,
            opacity: 0.45,
            side: THREE.DoubleSide
        })
    );
    ballProjection.position.set(width, 0.015, z);
    ballProjection.rotation.x = -Math.PI / 2;
    scene.add(ballProjection);
}

function createTarget(width, height, z) {
    disposeObject(target);
    const group = new THREE.Group();
    const disc = new THREE.Mesh(
        new THREE.RingGeometry(0.12, 0.2, 32),
        new THREE.MeshBasicMaterial({ color: 0xd6ff3f, side: THREE.DoubleSide })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.02;
    const bead = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 16, 16),
        new THREE.MeshPhongMaterial({ color: 0xd6ff3f, emissive: 0x334400 })
    );
    bead.position.y = 0.05;
    group.add(disc);
    group.add(bead);
    group.position.set(width, height, z);
    target = group;
    scene.add(target);
}

function updateTrajectory() {
    disposeObject(trajectoryLine);
    disposeObject(intersectionMarker);

    if (!ball) {
        return;
    }

    const speedKmh = readNumber('initial-speed', 192);
    const speed = speedKmh / 3.6;
    const vAngle = readNumber('launch-angle', -6) * Math.PI / 180;
    const hAngle = readNumber('horizontal-angle', 6) * Math.PI / 180;
    const spinRpm = readNumber('spin-rate', 2500);
    const axisDeg = readNumber('spin-axis', 25);
    const atmosphere = airProperties({
        altitude: Math.max(0, readNumber('altitude', 0)),
        temperatureC: readNumber('temperature', 20),
        relativeHumidity: readNumber('humidity', 50),
    });
    const fuzz = Math.min(100, Math.max(0, readNumber('fuzz', 50))) / 100;

    const result = calculateTrajectory(
        { x: ball.position.x, y: ball.position.y, z: ball.position.z },
        launchVelocity(speed, vAngle, hAngle),
        spinVectorFromRpm(spinRpm, axisDeg * Math.PI / 180),
        { airDensity: atmosphere.density, fuzz }
    );

    visualizeTrajectory(result.trajectoryPoints);
    const hit = markNetIntersection(result.trajectoryPoints);

    if (result.landingPoint) {
        createTarget(result.landingPoint.x, 0, result.landingPoint.z);
    } else {
        disposeObject(target);
        target = null;
    }

    updateReadouts(result, hit, speed, spinRpm, axisDeg, atmosphere, fuzz);
}

function markNetIntersection(points) {
    const hit = netIntersection(points);
    if (!hit) {
        return null;
    }

    intersectionMarker = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 16, 16),
        new THREE.MeshBasicMaterial({ color: hit.clearance > 0 ? 0x7dffb3 : 0xff6b4a })
    );
    intersectionMarker.position.set(hit.point.x, hit.point.y, hit.point.z);
    scene.add(intersectionMarker);
    return hit;
}

function updateReadouts(result, hit, speed, spinRpm, axisDeg, atmosphere, fuzz) {
    const call = classifyLanding(result.landingPoint, hit);
    const aero = launchForces(speed, rpmToOmega(spinRpm), atmosphere.density, atmosphere.temperatureC, fuzz);
    const wrap = $('stat-verdict-wrap');

    $('stat-verdict').textContent = call.label;
    $('stat-verdict-detail').textContent = call.detail;
    wrap.classList.remove('is-ok', 'is-bad', 'is-warn');
    if (call.code === 'serve' || call.code === 'in') {
        wrap.classList.add('is-ok');
    } else if (call.code === 'net' || call.code === 'long' || call.code === 'wide' || call.code === 'out') {
        wrap.classList.add('is-bad');
    } else {
        wrap.classList.add('is-warn');
    }

    const clearance = $('stat-clearance');
    if (hit) {
        clearance.textContent = `${hit.clearance >= 0 ? '+' : ''}${hit.clearance.toFixed(2)} m`;
        clearance.className = hit.clearance > 0 ? 'positive-clearance' : 'negative-clearance';
    } else {
        clearance.textContent = '—';
        clearance.className = '';
    }

    $('stat-flight').textContent = result.flightTime != null ? `${result.flightTime.toFixed(2)} s` : '—';
    $('stat-impact').textContent = result.impactSpeed != null
        ? `${(result.impactSpeed * 3.6).toFixed(0)} km/h`
        : '—';
    $('stat-apex').textContent = `${result.peakHeight.toFixed(2)} m`;

    if (result.landingPoint) {
        const range = Math.hypot(
            result.landingPoint.x - ball.position.x,
            result.landingPoint.z - ball.position.z
        );
        $('stat-range').textContent = `${range.toFixed(1)} m`;
        $('stat-xz').textContent = `${result.landingPoint.x.toFixed(2)}, ${result.landingPoint.z.toFixed(2)}`;
    } else {
        $('stat-range').textContent = '—';
        $('stat-xz').textContent = '—';
    }

    $('stat-spin-param').textContent = aero.spinParam.toFixed(3);
    $('stat-coeffs').textContent = `${aero.liftCoef.toFixed(3)} / ${aero.dragCoef.toFixed(2)}`;
    $('stat-reynolds').textContent = `${(aero.reynolds / 1000).toFixed(0)}k`;
    $('stat-forces').textContent = `${aero.dragForce.toFixed(2)} · ${aero.magnusForce.toFixed(2)} · ${aero.weight.toFixed(2)} N`;
    $('stat-spin-kind').textContent = spinKind(axisDeg);
    $('stat-air').textContent = `${atmosphere.density.toFixed(3)} · ${(atmosphere.pressure / 100).toFixed(0)} hPa`;

    const place = atmosphere.altitude === 0 ? 'sea level' : `${atmosphere.altitude} m`;
    $('density-hint').textContent =
        `ρ = ${atmosphere.density.toFixed(3)} kg/m³ · ${(atmosphere.pressure / 100).toFixed(0)} hPa · ${place}. ` +
        'Thinner air (high, hot, or humid) means less drag and less Magnus.';

    const { radius } = ballGeometry(fuzz);
    const feltLabel = fuzz < 0.25 ? 'worn' : fuzz > 0.75 ? 'new' : 'in-play';
    const impactRpm = result.finalSpin != null ? result.finalSpin * 60 / (2 * Math.PI) : null;
    $('fuzz-hint').textContent =
        `${Math.round(fuzz * 100)}% ${feltLabel} · r_eff ${(radius * 1000).toFixed(1)} mm · ` +
        `C_D ${aero.dragCoef.toFixed(2)}` +
        (impactRpm != null ? ` · spin at bounce ${impactRpm.toFixed(0)} rpm` : '');
}

function setupLighting() {
    scene.add(new THREE.AmbientLight(0xb9c6d2, 0.45));

    const key = new THREE.DirectionalLight(0xfff4e0, 1.05);
    key.position.set(8, 18, 10);
    key.castShadow = true;
    key.shadow.mapSize.width = 1024;
    key.shadow.mapSize.height = 1024;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 50;
    key.shadow.camera.left = -16;
    key.shadow.camera.right = 16;
    key.shadow.camera.top = 16;
    key.shadow.camera.bottom = -16;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0x7f9bb0, 0.35);
    fill.position.set(-12, 8, -6);
    scene.add(fill);
}

function renderPresets() {
    const nav = $('presets');
    nav.replaceChildren();
    for (const preset of PRESETS) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'preset-btn' + (preset.id === activePresetId ? ' is-active' : '');
        button.innerHTML = `<strong>${preset.label}</strong><span>${preset.blurb}</span>`;
        button.addEventListener('click', () => applyPreset(preset));
        nav.appendChild(button);
    }
}

function setPair(id, value) {
    const range = $(id);
    const num = $(`${id}-num`);
    const text = Number.isInteger(Number(range.step)) && Number(range.step) >= 1
        ? String(Math.round(value))
        : String(value);
    range.value = text;
    if (num) {
        num.value = text;
    }
}

function applyPreset(preset, { silent = false } = {}) {
    activePresetId = preset.id;
    setPair('baseline-position', preset.baseline);
    setPair('distance-from-baseline', preset.distance);
    setPair('ball-height', preset.height);
    setPair('initial-speed', preset.speed);
    setPair('launch-angle', preset.vAngle);
    setPair('horizontal-angle', preset.hAngle);
    setPair('spin-rate', preset.spin);
    setPair('spin-axis', preset.axis);
    $('preset-blurb').textContent = preset.blurb;
    renderPresets();
    if (!silent) {
        handleBallPositionChange();
    }
}

function bindPair(id, onChange) {
    const range = $(id);
    const num = $(`${id}-num`);
    const sync = (source) => {
        const value = source.value;
        range.value = value;
        if (num) {
            num.value = value;
        }
        activePresetId = 'custom';
        renderPresets();
        onChange();
    };
    range.addEventListener('input', () => sync(range));
    num?.addEventListener('input', () => sync(num));
}

function setupEventListeners() {
    bindPair('baseline-position', handleBallPositionChange);
    bindPair('distance-from-baseline', handleBallPositionChange);
    bindPair('ball-height', handleBallPositionChange);
    bindPair('initial-speed', updateTrajectory);
    bindPair('launch-angle', updateTrajectory);
    bindPair('horizontal-angle', updateTrajectory);
    bindPair('spin-rate', updateTrajectory);
    bindPair('spin-axis', updateTrajectory);
    bindPair('altitude', updateTrajectory);
    bindPair('temperature', updateTrajectory);
    bindPair('humidity', updateTrajectory);
    bindPair('fuzz', updateTrajectory);

    $('toggle-panel').addEventListener('click', () => {
        setPanelOpen($('control-panel').classList.contains('is-collapsed'));
    });
    $('close-panel').addEventListener('click', () => setPanelOpen(false));

    window.addEventListener('resize', onWindowResize);
}

function handleBallPositionChange() {
    const baselinePosition = Math.max(
        -COURT_WIDTH / 2,
        Math.min(COURT_WIDTH / 2, readNumber('baseline-position', -0.8))
    );
    const distanceFromBaseline = Math.max(0, readNumber('distance-from-baseline', 0.45));
    const ballHeight = Math.max(0, readNumber('ball-height', 2.8));
    const zPosition = startZ(distanceFromBaseline);

    if (!ball) {
        createTennisBall(baselinePosition, ballHeight, zPosition);
    } else {
        ball.position.set(baselinePosition, ballHeight, zPosition);
        if (ballLight) {
            ballLight.position.set(baselinePosition, ballHeight + 0.5, zPosition);
        }
        if (ballProjection) {
            ballProjection.position.x = baselinePosition;
            ballProjection.position.z = zPosition;
        }
    }

    updateTrajectory();
}

function visualizeTrajectory(trajectoryPoints) {
    const points = trajectoryPoints.map((p) => new THREE.Vector3(p.x, p.y, p.z));
    trajectoryLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color: 0xd6ff3f })
    );
    scene.add(trajectoryLine);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (!isMobile()) {
        document.body.classList.remove('sheet-open');
    }
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

init();
