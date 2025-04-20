/**
 * 3D Tennis Court Visualization
 * 
 * This script creates and manages a 3D tennis court using Three.js.
 * It allows users to place tennis balls and targets on the court.
 */

// Global variables
let scene, camera, renderer, court, ball, target, connectionLine, intersectionMarker, ballProjection;

// Court dimensions (in meters)
const COURT_LENGTH = 23.77;
const COURT_WIDTH = 10.97;
const SINGLES_WIDTH = 8.23;
const SERVICE_LINE_DISTANCE = 6.4;
const NET_HEIGHT = 1.07;
const NET_CENTER_HEIGHT = 0.914;

// Physics constants
const GRAVITY = 9.81; // m/s²
const AIR_DENSITY = 1.21; // kg/m³
const BALL_RADIUS = 0.033; // m (standard tennis ball)
const BALL_MASS = 0.057; // kg (standard tennis ball)
const BALL_AREA = Math.PI * BALL_RADIUS * BALL_RADIUS; // m²

// Trajectory parameters
let trajectoryPoints = []; // Will store calculated trajectory points
let trajectoryLine; // Will reference the trajectory visualization

/**
 * Initialize the 3D scene, camera, renderer, and objects
 */
function init() {
    // Create scene with sky blue background
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);

    // Set up camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(-10, 10, 15); // Positioned to view the baseline
    camera.lookAt(0, 0, 0);

    // Set up renderer with antialiasing
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('scene-container').appendChild(renderer.domElement);

    // Create court surface
    createCourtSurface();
    
    // Add court lines
    addCourtLines();

    // Add net
    addNet();

    // Create ball in default position (center of baseline, 3 meter high)
    createTennisBall(0, 3, -COURT_LENGTH / 2);

    // Ensure ball projection is properly initialized
    updateBallProjection();

    // Update baseline position and distance in the actual creation
    updateBallPosition(-1, 0.3, 3); // Baseline: -1m, Distance: 0.3m, Height: 3m

    // Place initial target
    createTarget(3.6, 0, SERVICE_LINE_DISTANCE - 0.6); // Width: 3.6m, Depth: -0.6m

    // Update the connection line and intersection marker
    updateConnectionLine();

    // Add lighting
    setupLighting();

    // Add orbit controls for camera manipulation
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; // Add smooth damping effect
    controls.dampingFactor = 0.05;

    // Add event listeners
    setupEventListeners();

    // Start animation loop
    animate();
}

/**
 * Create the court surface (green plane)
 */
function createCourtSurface() {
    // Create a material with different front and back side materials
    const courtMaterialTop = new THREE.MeshStandardMaterial({
        color: 0x4CAF50, // Green court
        roughness: 0.8,
        metalness: 0.2,
        side: THREE.FrontSide
    });

    const courtMaterialBottom = new THREE.MeshPhongMaterial({
        color: 0x808080, // Grey color
        transparent: true,
        opacity: 0.5,
        side: THREE.BackSide
    });

    // Create a group to hold both materials
    court = new THREE.Group();

    // Create the court geometry
    const courtGeometry = new THREE.PlaneGeometry(COURT_WIDTH, COURT_LENGTH);

    // Create front mesh (top of court)
    const courtTop = new THREE.Mesh(courtGeometry, courtMaterialTop);
    courtTop.rotation.x = -Math.PI / 2; // Rotate to horizontal
    courtTop.receiveShadow = true;

    // Create back mesh (bottom of court)
    const courtBottom = new THREE.Mesh(courtGeometry, courtMaterialBottom);
    courtBottom.rotation.x = -Math.PI / 2; // Rotate to horizontal
    
    // Add both to group
    court.add(courtTop);
    court.add(courtBottom);
    
    scene.add(court);
}

/**
 * Add white lines to the tennis court
 */
function addCourtLines() {
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
    
    // Calculate dimensions
    const alleyWidth = (COURT_WIDTH - SINGLES_WIDTH) / 2;
    
    // Outer boundary (doubles court)
    addLine(-COURT_WIDTH/2, -COURT_LENGTH/2, COURT_WIDTH/2, -COURT_LENGTH/2, lineMaterial);
    addLine(COURT_WIDTH/2, -COURT_LENGTH/2, COURT_WIDTH/2, COURT_LENGTH/2, lineMaterial);
    addLine(COURT_WIDTH/2, COURT_LENGTH/2, -COURT_WIDTH/2, COURT_LENGTH/2, lineMaterial);
    addLine(-COURT_WIDTH/2, COURT_LENGTH/2, -COURT_WIDTH/2, -COURT_LENGTH/2, lineMaterial);

    // Singles sidelines
    addLine(-SINGLES_WIDTH/2, -COURT_LENGTH/2, -SINGLES_WIDTH/2, COURT_LENGTH/2, lineMaterial);
    addLine(SINGLES_WIDTH/2, -COURT_LENGTH/2, SINGLES_WIDTH/2, COURT_LENGTH/2, lineMaterial);

    // Service lines
    addLine(-SINGLES_WIDTH/2, -SERVICE_LINE_DISTANCE, SINGLES_WIDTH/2, -SERVICE_LINE_DISTANCE, lineMaterial);
    addLine(-SINGLES_WIDTH/2, SERVICE_LINE_DISTANCE, SINGLES_WIDTH/2, SERVICE_LINE_DISTANCE, lineMaterial);

    // Center service line
    addLine(0, -SERVICE_LINE_DISTANCE, 0, SERVICE_LINE_DISTANCE, lineMaterial);

    // Net line (for visualization)
    addLine(-COURT_WIDTH/2, 0, COURT_WIDTH/2, 0, lineMaterial);

    // Baseline center marks
    const centerMarkLength = 0.10; // 10 cm
    addLine(-centerMarkLength/2, -COURT_LENGTH/2, centerMarkLength/2, -COURT_LENGTH/2, lineMaterial);
    addLine(-centerMarkLength/2, COURT_LENGTH/2, centerMarkLength/2, COURT_LENGTH/2, lineMaterial);
}

/**
 * Helper function to add a line to the scene
 * 
 * @param {number} x1 - Starting x coordinate
 * @param {number} z1 - Starting z coordinate
 * @param {number} x2 - Ending x coordinate
 * @param {number} z2 - Ending z coordinate
 * @param {THREE.Material} material - Line material
 */
function addLine(x1, z1, x2, z2, material) {
    const points = [];
    points.push(new THREE.Vector3(x1, 0.01, z1)); // Slight elevation to prevent z-fighting
    points.push(new THREE.Vector3(x2, 0.01, z2));
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, material);
    scene.add(line);
}

/**
 * Add the tennis net to the court
 */
function addNet() {
    const netPostDistance = SINGLES_WIDTH + (2 * 0.91); // Singles width plus 0.91m on each side

    // Net posts
    const postGeometry = new THREE.CylinderGeometry(0.05, 0.05, NET_HEIGHT, 32);
    const postMaterial = new THREE.MeshStandardMaterial({color: 0x888888});
    
    const leftPost = new THREE.Mesh(postGeometry, postMaterial);
    leftPost.position.set(-netPostDistance/2, NET_HEIGHT/2, 0);
    leftPost.castShadow = true;
    scene.add(leftPost);
    
    const rightPost = new THREE.Mesh(postGeometry, postMaterial);
    rightPost.position.set(netPostDistance/2, NET_HEIGHT/2, 0);
    rightPost.castShadow = true;
    scene.add(rightPost);

    // Net mesh
    const netGeometry = new THREE.PlaneGeometry(netPostDistance, NET_HEIGHT, 50, 20);
    const netMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7,
        wireframe: true
    });
    
    const net = new THREE.Mesh(netGeometry, netMaterial);
    
    // Custom positioning to create the correct curve in the net
    const netPositions = net.geometry.attributes.position;
    for (let i = 0; i < netPositions.count; i++) {
        const x = netPositions.getX(i);
        const y = netPositions.getY(i);
        
        // Calculate the net height at this position (dips in the middle)
        const normalizedX = x / (netPostDistance/2);
        const topY = NET_CENTER_HEIGHT + (NET_HEIGHT - NET_CENTER_HEIGHT) * Math.abs(normalizedX);
        const bottomY = 0;
        
        // Interpolate based on the y position
        const newY = bottomY + (y + NET_HEIGHT/2) / NET_HEIGHT * (topY - bottomY);
        netPositions.setY(i, newY);
    }
    
    netPositions.needsUpdate = true;
    net.position.set(0, 0, 0);
    scene.add(net);

    // Add net cord (white line at the top of the net)
    const cordGeometry = new THREE.BufferGeometry();
    const cordPoints = [];

    // Parameter to control the "sagginess" of the net
    const sagFactor = 0.8;
    
    for (let i = -netPostDistance/2; i <= netPostDistance/2; i += 0.1) {
        // Normalize i to range from -1 to 1
        const normalizedI = i / (netPostDistance/2);

        // Calculate height using hyperbolic cosine function
        // cosh(0) = 1, so we subtract 1 to make the center point at NET_CENTER_HEIGHT
        const y = NET_CENTER_HEIGHT + (NET_HEIGHT - NET_CENTER_HEIGHT) * 
              (Math.cosh(sagFactor * normalizedI) - 1) / (Math.cosh(sagFactor) - 1);
        cordPoints.push(new THREE.Vector3(i, y, 0));
    }
    
    cordGeometry.setFromPoints(cordPoints);
    const cordMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
    const cord = new THREE.Line(cordGeometry, cordMaterial);
    scene.add(cord);
}

/**
 * Create a tennis ball at the specified position
 * 
 * @param {number} width - X position (width coordinate)
 * @param {number} height - Y position (height above ground)
 * @param {number} z - Z position (depth on court)
 */
function createTennisBall(width, height, z) {
    // Remove existing ball if present
    if (ball) {
        scene.remove(ball);
        // Remove associated light
        scene.children.forEach(child => {
            if (child instanceof THREE.PointLight && child.userData.isBallLight) {
                scene.remove(child);
            }
        });
        // Remove existing projection
        if (ballProjection) {
            scene.remove(ballProjection);
        }
    }

    const ballGeometry = new THREE.SphereGeometry(0.1, 32, 32);
    const ballMaterial = new THREE.MeshPhongMaterial({
        color: 0xFFFF00, // Yellow ball
        emissive: 0x333300,
        shininess: 30
    });
    
    ball = new THREE.Mesh(ballGeometry, ballMaterial);
    ball.castShadow = true;
    ball.position.set(width, height, z);
    scene.add(ball);
    
    console.log(`Ball created at position: (${width}, ${height}, ${z})`);

    // Add a point light near the ball to make it more visible
    const ballLight = new THREE.PointLight(0xFFFFFF, 1.5, 6);
    ballLight.position.set(width, height + 0.5, z);
    ballLight.userData.isBallLight = true;
    scene.add(ballLight);

    // Create the ball projection on the court
    createBallProjection(width, z);
}

/**
 * Update the ball's position based on user input
 * 
 * @param {number} baselinePosition - Position along baseline (x-coordinate)
 * @param {number} distanceFromBaseline - Distance from baseline into court
 * @param {number} height - Height above ground
 */
function updateBallPosition(baselinePosition, distanceFromBaseline, height) {
    // Clamp the baseline position to ensure the ball stays within court boundaries
    const clampedBaselinePos = Math.max(-COURT_WIDTH/2, Math.min(COURT_WIDTH/2, baselinePosition));
    
    // Calculate z-coordinate (baseline is at -COURT_LENGTH/2)
    const zPosition = -COURT_LENGTH/2 + distanceFromBaseline;
    
    if (ball) {
        ball.position.set(clampedBaselinePos, height, zPosition);
        
        // Update the light position as well
        scene.children.forEach(child => {
            if (child instanceof THREE.PointLight && child.userData.isBallLight) {
                child.position.set(clampedBaselinePos, height + 0.5, zPosition);
            }
        });

        // Update the ball projection
        updateBallProjection();
        
        console.log(`Ball updated to position: (${clampedBaselinePos}, ${height}, ${zPosition})`);
    } else {
        createTennisBall(clampedBaselinePos, height, zPosition);
    }

    // Update the connection line and intersection marker
    updateConnectionLine();
}

/**
 * Handle the ball placement button click
 */
function handleBallPlacement() {
    const baselinePosition = parseFloat(document.getElementById('baseline-position').value);
    const distanceFromBaseline = parseFloat(document.getElementById('distance-from-baseline').value);
    let ballHeight = parseFloat(document.getElementById('ball-height').value);
    
    // Set a default height if not provided or if it's zero
    if (isNaN(ballHeight) || ballHeight <= 0) {
        ballHeight = 1; // Default height of 1 meter
        document.getElementById('ball-height').value = "1";
    }
    
    updateBallPosition(baselinePosition, distanceFromBaseline, ballHeight);
}

/**
 * Create a projection of the ball on the court surface
 * 
 * @param {number} x - X position (same as ball's x position)
 * @param {number} z - Z position (same as ball's z position)
 */
function createBallProjection(x, z) {
    // Use the same size as the target (0.05 radius)
    const projectionGeometry = new THREE.CircleGeometry(0.05, 32);
    const projectionMaterial = new THREE.MeshBasicMaterial({
        color: 0x333333,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide
    });
    
    ballProjection = new THREE.Mesh(projectionGeometry, projectionMaterial);
    
    // Position at the ball's x,z coordinates but at y=0.01 (slightly above court to prevent z-fighting)
    ballProjection.position.set(x, 0.01, z);
    
    // Rotate to lie flat on the court
    ballProjection.rotation.x = -Math.PI / 2;
    
    scene.add(ballProjection);
}

/**
 * Update the ball projection position to match the ball's x,z coordinates
 */
function updateBallProjection() {
    if (ball && ballProjection) {
        ballProjection.position.x = ball.position.x;
        ballProjection.position.z = ball.position.z;
    }
}

/**
 * Create a target at the specified position
 * 
 * @param {number} width - X position (width coordinate)
 * @param {number} height - Y position (height above ground)
 * @param {number} z - Z position (depth on court)
 */
function createTarget(width, height, z) {
    // Remove existing target if present
    if (target) {
        scene.remove(target);
    }

    const targetGeometry = new THREE.SphereGeometry(0.05, 32, 32);
    const targetMaterial = new THREE.MeshPhongMaterial({
        color: 0xFF0000, // Red target
        emissive: 0x330000,
        shininess: 30
    });
    
    target = new THREE.Mesh(targetGeometry, targetMaterial);
    target.position.set(width, height, z);
    scene.add(target);
    
    console.log(`Target created at position: (${width}, ${height}, ${z})`);
}

/**
 * Update the target's position based on user input
 * 
 * @param {number} width - Distance from center (x-coordinate)
 * @param {number} depth - Distance from service line (+ toward baseline, - toward net)
 */
function updateTargetPosition(width, depth) {
    // Clamp the width to ensure the target stays within court boundaries
    const clampedWidth = Math.max(-COURT_WIDTH/2, Math.min(COURT_WIDTH/2, width));
    
    // Calculate z-coordinate (service line is at SERVICE_LINE_DISTANCE)
    const zPosition = SERVICE_LINE_DISTANCE + depth;
    
    // Target height is fixed at 0 (on the ground)
    const targetHeight = 0;
    
    if (target) {
        target.position.set(clampedWidth, targetHeight, zPosition);
        console.log(`Target updated to position: (${clampedWidth}, ${targetHeight}, ${zPosition})`);
    } else {
        createTarget(clampedWidth, targetHeight, zPosition);
    }

    // Update the connection line and intersection marker
    updateConnectionLine();
}

/**
 * Handle the target placement button click
 */
function handleTargetPlacement() {
    const targetWidth = parseFloat(document.getElementById('target-width').value);
    const targetDepth = parseFloat(document.getElementById('target-depth').value);
    
    updateTargetPosition(targetWidth, targetDepth);
}

// Add this function to create and update the connection line and intersection marker
function updateConnectionLine() {
    // Remove existing line and marker if they exist
    if (connectionLine) {
        scene.remove(connectionLine);
    }
    if (intersectionMarker) {
        scene.remove(intersectionMarker);
    }
    
    if (!ball || !target) return;

    // Get trajectory parameters from UI
    const initialSpeedKmh = parseFloat(document.getElementById('initial-speed').value) || 180;
    const initialSpeed = initialSpeedKmh / 3.6; // Convert km/h to m/s
    const launchAngle = parseFloat(document.getElementById('launch-angle').value) || 10;
    const spinRateRPM  = parseFloat(document.getElementById('spin-rate').value) || 1800;
    const spinRate = spinRateRPM / 60; // Convert RPM to rotations per second
    const spinAxis = parseFloat(document.getElementById('spin-axis').value) || 90;

    // Calculate initial velocity vector
    // Direction from ball to court center (or wherever you want to aim)
    const horizontalDirection = new THREE.Vector3(
        0 - ball.position.x, // Aim toward center of court
        0,
        SERVICE_LINE_DISTANCE - ball.position.z // Aim toward service line
    ).normalize();

    // Apply launch angle
    const launchRadians = launchAngle * Math.PI / 180;
    const initialVelocity = new THREE.Vector3(
        horizontalDirection.x * initialSpeed * Math.cos(launchRadians),
        initialSpeed * Math.sin(launchRadians),
        horizontalDirection.z * initialSpeed * Math.cos(launchRadians)
    );

    // Calculate spin vector
    const spinRadians = spinAxis * Math.PI / 180;
    const spinVector = new THREE.Vector3(
        Math.sin(spinRadians) * spinRate,
        Math.cos(spinRadians) * spinRate,
        0
    );

    // Calculate trajectory
    const result = calculateTrajectory(
        ball.position.clone(),
        initialVelocity,
        spinVector
    );

    trajectoryPoints = result.trajectoryPoints;

    // Visualize trajectory
    visualizeTrajectory(trajectoryPoints);
    
    // Find intersection with net plane
    findNetIntersection(trajectoryPoints);
    
    // Update target position to landing point if available
    if (result.landingPoint) {
        if (target) {
            scene.remove(target);
        }
        
        // Create new target at landing point
        createTarget(result.landingPoint.x, 0, result.landingPoint.z);
    }
}

/**
 * Find where the trajectory intersects with the net and mark it
 * 
 * @param {Array} trajectoryPoints - Array of points along the trajectory
 */
function findNetIntersection(trajectoryPoints) {
    // Check each segment of the trajectory for intersection with net plane (z=0)
    for (let i = 0; i < trajectoryPoints.length - 1; i++) {
        const p1 = trajectoryPoints[i];
        const p2 = trajectoryPoints[i + 1];
        
        // If this segment crosses the net plane (z=0)
        if ((p1.z <= 0 && p2.z >= 0) || (p1.z >= 0 && p2.z <= 0)) {
            // Calculate intersection point using parametric equation
            const t = Math.abs(p1.z) / Math.abs(p2.z - p1.z);
            const intersectionPoint = new THREE.Vector3(
                p1.x + t * (p2.x - p1.x),
                p1.y + t * (p2.y - p1.y),
                0
            );
            
            // Calculate the net height at this x position
            const netPostDistance = SINGLES_WIDTH + (2 * 0.91);
            const normalizedX = intersectionPoint.x / (netPostDistance/2);
            const netHeightAtX = NET_CENTER_HEIGHT + (NET_HEIGHT - NET_CENTER_HEIGHT) * Math.abs(normalizedX);
            
            // Calculate clearance (positive if above net, negative if through net)
            const clearance = intersectionPoint.y - netHeightAtX;
            
            // Update the DOM-based net clearance display
            const clearanceValueElement = document.getElementById('clearance-value');
            if (clearanceValueElement) {
                clearanceValueElement.textContent = clearance.toFixed(2) + ' m';
                
                // Update color based on clearance
                if (clearance > 0) {
                    clearanceValueElement.className = 'positive-clearance';
                } else {
                    clearanceValueElement.className = 'negative-clearance';
                }
            }
            
            // Determine color based on whether the trajectory crosses above or through the net
            const markerColor = clearance > 0 ? 0x00FF00 : 0xFF0000; // Green if above, red if through
            
            // Create a sphere to mark the intersection
            const markerGeometry = new THREE.SphereGeometry(0.08, 16, 16);
            const markerMaterial = new THREE.MeshBasicMaterial({ color: markerColor });
            intersectionMarker = new THREE.Mesh(markerGeometry, markerMaterial);
            intersectionMarker.position.copy(intersectionPoint);
            scene.add(intersectionMarker);
            
            console.log(`Intersection at (${intersectionPoint.x.toFixed(2)}, ${intersectionPoint.y.toFixed(2)}, ${intersectionPoint.z.toFixed(2)})`);
            console.log(`Net height at this position: ${netHeightAtX.toFixed(2)}`);
            console.log(`Line crosses ${intersectionPoint.y > netHeightAtX ? 'ABOVE' : 'THROUGH'} the net`);
            
            break;
        }
    }
}

/**
 * Set up lighting for the scene
 */
function setupLighting() {
    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    // Add directional light (sunlight)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    
    // Configure shadow properties
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -15;
    directionalLight.shadow.camera.right = 15;
    directionalLight.shadow.camera.top = 15;
    directionalLight.shadow.camera.bottom = -15;
    
    scene.add(directionalLight);
}

/**
 * Set up event listeners for user interaction
 */
function setupEventListeners() {
    // Add input change listeners
    document.getElementById('baseline-position').addEventListener('input', handleBallPositionChange);
    document.getElementById('distance-from-baseline').addEventListener('input', handleBallPositionChange);
    document.getElementById('ball-height').addEventListener('input', handleBallPositionChange);

    // New trajectory parameter listeners
    document.getElementById('initial-speed').addEventListener('input', updateConnectionLine);
    document.getElementById('launch-angle').addEventListener('input', updateConnectionLine);
    document.getElementById('spin-rate').addEventListener('input', updateConnectionLine);
    document.getElementById('spin-axis').addEventListener('input', updateConnectionLine);

    // Set initial values
    document.getElementById('baseline-position').value = "-1";
    document.getElementById('distance-from-baseline').value = "0.3";
    document.getElementById('ball-height').value = "3";
    document.getElementById('initial-speed').value = "180"; // 180 km/h = 50 m/s
    document.getElementById('launch-angle').value = "10";
    document.getElementById('spin-rate').value = "1800"; // 1800 RPM = 30 rotations per second
    document.getElementById('spin-axis').value = "90"; // 90 = topsin
    
    // Add toggle panel functionality
    document.getElementById('toggle-panel').addEventListener('click', function() {
        const panel = document.getElementById('control-panel');
        panel.classList.toggle('panel-collapsed');
    });
    
    // Handle window resize
    window.addEventListener('resize', onWindowResize, false);
}

/**
 * Handle changes to ball position input fields
 */
function handleBallPositionChange() {
    const baselinePosition = parseFloat(document.getElementById('baseline-position').value);
    const distanceFromBaseline = parseFloat(document.getElementById('distance-from-baseline').value);
    let ballHeight = parseFloat(document.getElementById('ball-height').value);
    
    // Set a default height if not provided or if it's negative
    if (isNaN(ballHeight) || ballHeight < 0) {
        ballHeight = 0; // Default height
        document.getElementById('ball-height').value = "0";
        updateConnectionLine(); // Update trajectory
    }
    
    updateBallPosition(baselinePosition, distanceFromBaseline, ballHeight);
}

function calculateLiftCoefficient(speed, spinRate) {
    const spinSpeed = BALL_RADIUS * spinRate; // vspin = R*ω
    return 1 / (2 + (speed / spinSpeed));
}

function calculateDragCoefficient(speed, spinRate) {
    const spinSpeed = BALL_RADIUS * spinRate;
    const ratio = speed / spinSpeed;
    return 0.55 + 1 / Math.pow(22.5 + 4.2 * Math.pow(ratio, 2.5), 0.4);
}

/**
 * Calculate the trajectory of a tennis ball considering gravity, drag, and Magnus effect
 * 
 * @param {THREE.Vector3} initialPos - Initial position of the ball
 * @param {THREE.Vector3} initialVel - Initial velocity vector
 * @param {THREE.Vector3} spinVector - Spin vector (direction and magnitude)
 * @param {number} dt - Time step for simulation (seconds)
 * @param {number} steps - Number of steps to simulate
 * @returns {Array} Array of position vectors representing the trajectory
 */
function calculateTrajectory(initialPos, initialVel, spinVector, dt = 0.005, steps = 1000) {
    const positions = [initialPos.clone()];
    let position = initialPos.clone();
    let velocity = initialVel.clone();
    let landingPoint = null;
    
    for (let i = 0; i < steps; i++) {
        // Calculate speed (magnitude of velocity)
        const speed = velocity.length();
        if (speed === 0) break;
        
        // Unit vector in direction of velocity
        const velocityUnit = velocity.clone().normalize();
        
        // Drag force: -0.5 * Cd * rho * A * v^2 * v_hat
        const dragCoef = calculateDragCoefficient(speed, spinVector.length());
        const dragForce = velocityUnit.clone().multiplyScalar(-0.5 * dragCoef * AIR_DENSITY * BALL_AREA * speed * speed);
        
        // Magnus force: 0.5 * Cl * rho * A * v^2 * (spin × v_hat)
        const magnusDirection = new THREE.Vector3();
        magnusDirection.crossVectors(spinVector, velocityUnit);
        const liftCoef = calculateLiftCoefficient(speed, spinVector.length());
        const magnusForce = magnusDirection.multiplyScalar(0.5 * liftCoef * AIR_DENSITY * BALL_AREA * speed * speed);
        
        // Gravity force: (0, -m*g, 0)
        const gravityForce = new THREE.Vector3(0, -BALL_MASS * GRAVITY, 0);
        
        // Sum forces and calculate acceleration
        const totalForce = new THREE.Vector3().addVectors(dragForce, magnusForce).add(gravityForce);
        const acceleration = totalForce.multiplyScalar(1 / BALL_MASS);
        
        // Update velocity and position (Euler integration)
        velocity.add(acceleration.clone().multiplyScalar(dt));
        position.add(velocity.clone().multiplyScalar(dt));
        
        // Add position to trajectory
        positions.push(position.clone());
        
        // Stop if ball hits the ground
        if (position.y <= 0) {
            position.y = 0; // Set exactly to ground level
            positions.push(position.clone());
            landingPoint = position.clone();
            break;
        }
    }
    
    return {
        trajectoryPoints: positions,
        landingPoint: landingPoint
    };
}

/**
 * Create or update the visual representation of the ball trajectory
 * 
 * @param {Array} trajectoryPoints - Array of Vector3 points along the trajectory
 */
function visualizeTrajectory(trajectoryPoints) {
    // Remove existing trajectory line if it exists
    if (trajectoryLine) {
        scene.remove(trajectoryLine);
    }
    
    // Create geometry from trajectory points
    const geometry = new THREE.BufferGeometry().setFromPoints(trajectoryPoints);
    
    // Create material for the trajectory line
    const material = new THREE.LineBasicMaterial({
        color: 0x00ffff,
        linewidth: 2,
        opacity: 1.0,
        transparent: true
    });
    
    // Create the line and add it to the scene
    trajectoryLine = new THREE.Line(geometry, material);
    scene.add(trajectoryLine);
    console.log("Trajectory line added with", trajectoryPoints.length, "points");
}

/**
 * Handle window resize events
 */
function onWindowResize() {
    // Update main camera
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
}

/**
 * Animation loop
 */
function animate() {
    requestAnimationFrame(animate);
    
    // Render the main scene
    renderer.render(scene, camera);
}

// Initialize the application when the page loads
init();