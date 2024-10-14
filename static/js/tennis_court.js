let scene, camera, renderer, court, ball, target;

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(-10, 10, 15); // Positioned to view the baseline where the ball will appear
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('scene-container').appendChild(renderer.domElement);

    // Create court surface
    const courtGeometry = new THREE.PlaneGeometry(10.97, 23.77); // Width is the short side, length is the long side
    const courtMaterial = new THREE.MeshBasicMaterial({color: 0x4CAF50}); // Green court
    court = new THREE.Mesh(courtGeometry, courtMaterial);
    court.rotation.x = -Math.PI / 2;
    scene.add(court);

    // Add court lines
    addCourtLines();

    // Add net
    addNet();

    // Create ball in default position
    createTennisBall(0, 2, -23.77 / 2); // Center of baseline, 1 meter high

    // Place initial target
    createTarget(0, 0, 6.4);

    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    // Add directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(10, 10, 10);
    scene.add(directionalLight);

    // Add orbit controls
    const controls = new THREE.OrbitControls(camera, renderer.domElement);

    // Add event listener for ball placement
    document.getElementById('place-ball').addEventListener('click', handleBallPlacement);
    document.getElementById('place-target').addEventListener('click', handleTargetPlacement);

    // Handle window resize
    window.addEventListener('resize', onWindowResize, false);

    animate();
}

function addCourtLines() {
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
    
    // Court dimensions
    const courtLength = 23.77;
    const courtWidth = 10.97;
    const singlesWidth = 8.23;
    const serviceLineDistance = 6.4;
    const alleyWidth = (courtWidth - singlesWidth) / 2;

    // Outer boundary (doubles court)
    addLine(-courtWidth/2, -courtLength/2, courtWidth/2, -courtLength/2, lineMaterial);
    addLine(courtWidth/2, -courtLength/2, courtWidth/2, courtLength/2, lineMaterial);
    addLine(courtWidth/2, courtLength/2, -courtWidth/2, courtLength/2, lineMaterial);
    addLine(-courtWidth/2, courtLength/2, -courtWidth/2, -courtLength/2, lineMaterial);

    // Singles sidelines
    addLine(-singlesWidth/2, -courtLength/2, -singlesWidth/2, courtLength/2, lineMaterial);
    addLine(singlesWidth/2, -courtLength/2, singlesWidth/2, courtLength/2, lineMaterial);

    // Service lines (corrected to not extend into doubles alleys)
    addLine(-singlesWidth/2, -serviceLineDistance, singlesWidth/2, -serviceLineDistance, lineMaterial);
    addLine(-singlesWidth/2, serviceLineDistance, singlesWidth/2, serviceLineDistance, lineMaterial);

    // Center service line
    addLine(0, -serviceLineDistance, 0, serviceLineDistance, lineMaterial);

    // Net line (for visualization)
    addLine(-courtWidth/2, 0, courtWidth/2, 0, lineMaterial);

    // Baseline center marks
    const centerMarkLength = 0.10; // 10 cm
    addLine(-centerMarkLength/2, -courtLength/2, centerMarkLength/2, -courtLength/2, lineMaterial);
    addLine(-centerMarkLength/2, courtLength/2, centerMarkLength/2, courtLength/2, lineMaterial);
}

function addLine(x1, z1, x2, z2, material) {
    const points = [];
    points.push(new THREE.Vector3(x1, 0.01, z1));
    points.push(new THREE.Vector3(x2, 0.01, z2));
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, material);
    scene.add(line);
}

function addNet() {
    const singlesWidth = 8.23;
    const netPostDistance = singlesWidth + (2 * 0.91); // Singles width plus 0.91m on each side
    const netHeight = 1.07; // Height of the net at the posts
    const netCenterHeight = 0.914; // Height of the net at the center

    // Net posts
    const postGeometry = new THREE.CylinderGeometry(0.05, 0.05, netHeight, 32);
    const postMaterial = new THREE.MeshBasicMaterial({color: 0x888888});
    
    const leftPost = new THREE.Mesh(postGeometry, postMaterial);
    leftPost.position.set(-netPostDistance/2, netHeight/2, 0);
    scene.add(leftPost);

    const rightPost = new THREE.Mesh(postGeometry, postMaterial);
    rightPost.position.set(netPostDistance/2, netHeight/2, 0);
    scene.add(rightPost);

    // Net mesh
    const netGeometry = new THREE.PlaneGeometry(netPostDistance, netHeight, 50, 20);
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
        const normalizedX = x / (netPostDistance/2);
        const topY = netCenterHeight + (netHeight - netCenterHeight) * Math.abs(normalizedX);
        const bottomY = 0;
        const newY = bottomY + (y + netHeight/2) / netHeight * (topY - bottomY);
        netPositions.setY(i, newY);
    }
    netPositions.needsUpdate = true;

    net.position.set(0, 0, 0);
    scene.add(net);

    // Add net cord (white line at the top of the net)
    const cordGeometry = new THREE.BufferGeometry();
    const cordPoints = [];
    for (let i = -netPostDistance/2; i <= netPostDistance/2; i += 0.1) {
        const normalizedI = i / (netPostDistance/2);
        const y = netCenterHeight + (netHeight - netCenterHeight) * Math.abs(normalizedI);
        cordPoints.push(new THREE.Vector3(i, y, 0));
    }
    cordGeometry.setFromPoints(cordPoints);
    const cordMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
    const cord = new THREE.Line(cordGeometry, cordMaterial);
    scene.add(cord);
}

function createTennisBall(width, height, z) {
    const ballGeometry = new THREE.SphereGeometry(0.1, 32, 32);
    const ballMaterial = new THREE.MeshPhongMaterial({ 
        color: 0xFFFF00, // Keeping it red for better visibility
        emissive: 0x333300,
        shininess: 30
    });
    ball = new THREE.Mesh(ballGeometry, ballMaterial);
    
    // Position the ball on the baseline
    const courtWidth = 10.97; // Short side of the court
    const courtLength = 23.77; // Long side of the court
    ball.position.set(width, height, z); // This places it on the baseline at the negative z-end
    
    scene.add(ball);

    console.log(`Ball created at position: (${width}, ${height}, ${z})`);

    // Add a point light near the ball to make it more visible
    const ballLight = new THREE.PointLight(0xFFFFFF, 0.5, 3);
    ballLight.position.set(width, height + 0.5, z);
    scene.add(ballLight);
}


function updateBallPosition(width, height) {
    const courtWidth = 10.97; // Short side of the court
    const courtLength = 23.77; // Long side of the court
    // Clamp the width to ensure the ball stays within the court boundaries
    const clampedWidth = Math.max(-courtWidth/2, Math.min(courtWidth/2, width));
    
    if (ball) {
        ball.position.set(clampedWidth, height, -courtLength / 2); // Baseline at the negative z-end
        // Update the light position as well
        scene.children.forEach(child => {
            if (child instanceof THREE.PointLight) {
                child.position.set(clampedWidth, height + 0.5, -courtLength / 2);
            }
        });
        console.log(`Ball updated to position: (${clampedWidth}, ${height}, ${-courtLength / 2})`);
    } else {
        createTennisBall(clampedWidth, height);
    }
}

function handleBallPlacement() {
    const widthCoord = parseFloat(document.getElementById('width-coord').value);
    let heightCoord = parseFloat(document.getElementById('height-coord').value);
    
    // Set a default height if not provided or if it's zero
    if (isNaN(heightCoord) || heightCoord <= 0) {
        heightCoord = 1; // Default height of 1 meter
    }
    
    updateBallPosition(widthCoord, heightCoord);
}

function createTarget(width, height, z) {
    const targetGeometry = new THREE.SphereGeometry(0.05, 32, 32);
    const targetMaterial = new THREE.MeshPhongMaterial({
      color: 0xFF0000,
      emissive: 0x330000,
      shininess: 30
    });
    target = new THREE.Mesh(targetGeometry, targetMaterial);
    
    const courtLength = 23.77;
    target.position.set(width, height, z);
    scene.add(target);
    
    console.log(`Target created at position: (${width}, ${height}, ${z})`);
}
  
function updateTargetPosition(width, height) {
    const courtWidth = 10.97;
    const courtLength = 23.77;
    const clampedWidth = Math.max(-courtWidth/2, Math.min(courtWidth/2, width));
    
    if (target) {
      target.position.set(clampedWidth, height, courtLength / 2);
      console.log(`Target updated to position: (${clampedWidth}, ${height}, ${courtLength / 2})`);
    } else {
      createTarget(clampedWidth, height, courtLength / 2);
    }
}
  
function handleTargetPlacement() {
    const widthCoord = parseFloat(document.getElementById('target-width-coord').value);
    let heightCoord = parseFloat(document.getElementById('target-height-coord').value);
    
    if (isNaN(heightCoord) || heightCoord < 0) {
      heightCoord = 0;
    }
    
    updateTargetPosition(widthCoord, heightCoord);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}

init();
