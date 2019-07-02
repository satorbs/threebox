var THREE = require("../three64.js");
var Threebox = require('../Threebox.js');
var utils = require("../Utils/Utils.js");
var Constants = require("../constants.js");

const FOV = 0.6435011087932844;

function CameraSync(map, camera, world) {
    this.map = map;
    this.camera = camera;
    this.active = true;

    this.camera.matrixAutoUpdate = false;   // We're in charge of the camera now!

    // Postion and configure the world group so we can scale it appropriately when the camera zooms
    this.world = world || new THREE.Group();
    this.world.position.x = this.world.position.y = Constants.WORLD_SIZE/2
    this.world.matrixAutoUpdate = false;

    // set up basic camera state
    this.state = {
        fov: Constants.FOV,
        translateCenter: new THREE.Matrix4().makeTranslation(Constants.WORLD_SIZE/2, -Constants.WORLD_SIZE / 2, 0),
        worldSizeRatio: Constants.TILE_SIZE / Constants.WORLD_SIZE
    };

    // Listen for move events from the map and update the Three.js camera
    var _this = this;
    this.map.on('move', function() {
        _this.updateCamera();
    });

    this.setupCamera();
}

CameraSync.prototype = {
    setupCamera: function() {
        const tr = this.map.transform;
        const halfFov = this.state.fov / 2;
        const cameraToCenterDistance = 0.5 / Math.tan(halfFov) * tr.height;

        this.state.cameraToCenterDistance = cameraToCenterDistance;
        this.state.cameraTranslateZ = new THREE.Matrix4().makeTranslation(0, 0, cameraToCenterDistance);
    
        this.updateCamera();
    },

    updateCamera: function(ev) {
        if(!this.camera) {
            console.log('nocamera')
            return;
        }

        const tr = this.map.transform;
        const halfFov = this.state.fov / 2;
        const groundAngle = Math.PI / 2 + tr._pitch;
        const topHalfSurfaceDistance = Math.sin(halfFov) * this.state.cameraToCenterDistance / Math.sin(Math.PI - groundAngle - halfFov);

        // Calculate z distance of the farthest fragment that should be rendered.
        const furthestDistance = Math.cos(Math.PI / 2 - tr._pitch) * topHalfSurfaceDistance + this.state.cameraToCenterDistance;

        // Add a bit extra to avoid precision problems when a fragment's distance is exactly `furthestDistance`
        const farZ = furthestDistance * 1.01;

        this.camera.projectionMatrix = utils.makePerspectiveMatrix(this.state.fov, tr.width / tr.height, 1, farZ);
        

        // Unlike the Mapbox GL JS camera, separate camera translation and rotation out into its world matrix
        // If this is applied directly to the projection matrix, it will work OK but break raycasting
        var cameraWorldMatrix = this.calcCameraMatrix(tr._pitch, tr.angle);
        this.camera.matrixWorld.copy(cameraWorldMatrix);

        var zoomPow =  tr.scale * this.state.worldSizeRatio;
        // Handle scaling and translation of objects in the map in the world's matrix transform, not the camera
        var scale = new THREE.Matrix4;
        var translateMap = new THREE.Matrix4;
        var rotateMap = new THREE.Matrix4;

        scale.makeScale(zoomPow, zoomPow , zoomPow);

        var x = tr.x || tr.point.x;
        var y = tr.y || tr.point.y;
        translateMap.makeTranslation(-x, y , 0);
        rotateMap.makeRotationZ(Math.PI);

        this.world.matrix = new THREE.Matrix4()
            .premultiply(rotateMap)
            .premultiply(this.state.translateCenter)
            .premultiply(scale)
            .premultiply(translateMap)


        // utils.prettyPrintMatrix(this.camera.projectionMatrix.elements);
    },

    calcCameraMatrix(pitch, angle) {
        var cameraRotateX = new THREE.Matrix4().makeRotationX(pitch);
        var cameraRotateZ = new THREE.Matrix4().makeRotationZ(angle);
        return new THREE.Matrix4()
            .premultiply(this.state.cameraTranslateZ)
            .premultiply(cameraRotateX)
            .premultiply(cameraRotateZ);
    }
}

module.exports = exports = CameraSync;