var THREE = require("../three64.js");
var Threebox = require('../Threebox.js');
var utils = require("../Utils/Utils.js");
var ThreeboxConstants = require("../constants.js");

const FOV = 0.6435011087932844;

function CameraSync(map, camera, world) {
    this.map = map;
    this.camera = camera;
    this.active = true;

    this.camera.matrixAutoUpdate = false;   // We're in charge of the camera now!

    // Postion and configure the world group so we can scale it appropriately when the camera zooms
    this.world = world || new THREE.Group();
    this.world.position.x = this.world.position.y = ThreeboxConstants.WORLD_SIZE/2
    this.world.matrixAutoUpdate = false;
    this.resize();

    // Listen for move events from the map and update the Three.js camera
    var _this = this;
    this.map.on('move', function() { _this.updateCamera(); });
    this.updateCamera();
}

CameraSync.prototype = {
    updateCamera: function(ev) {
        if(!this.camera) {
            console.log('nocamera')
            return;
        }

        // Build a projection matrix, paralleling the code found in Mapbox GL JS
        const halfFov = FOV / 2;
        const groundAngle = Math.PI / 2 + this.map.transform._pitch;
        const topHalfSurfaceDistance = Math.sin(halfFov) * this.cameraToCenterDistance / Math.sin(Math.PI - groundAngle - halfFov);

        // Calculate z distance of the farthest fragment that should be rendered.
        const furthestDistance = Math.cos(Math.PI / 2 - this.map.transform._pitch) * topHalfSurfaceDistance + this.cameraToCenterDistance;

        // Add a bit extra to avoid precision problems when a fragment's distance is exactly `furthestDistance`
        const farZ = furthestDistance * 1.01;

        this.camera.projectionMatrix = utils.makePerspectiveMatrix(FOV, this.map.transform.width / this.map.transform.height, 1, farZ);
        

        // Unlike the Mapbox GL JS camera, separate camera translation and rotation out into its world matrix
        // If this is applied directly to the projection matrix, it will work OK but break raycasting
        var cameraWorldMatrix = this.calcCameraMatrix(this.map.transform._pitch, this.map.transform.angle);
        this.camera.matrixWorld.copy(cameraWorldMatrix);


        var zoomPow =  this.map.transform.scale; 
        // Handle scaling and translation of objects in the map in the world's matrix transform, not the camera
        var scale = new THREE.Matrix4;
        var translateCenter = new THREE.Matrix4;
        var translateMap = new THREE.Matrix4;
        var rotateMap = new THREE.Matrix4;

        scale.makeScale(zoomPow, zoomPow , zoomPow );
        translateCenter.makeTranslation(ThreeboxConstants.WORLD_SIZE/2, -ThreeboxConstants.WORLD_SIZE / 2, 0);
        translateMap.makeTranslation(-this.map.transform.x, this.map.transform.y , 0);
        rotateMap.makeRotationZ(Math.PI);
        this.world.matrix = new THREE.Matrix4;
        this.world.matrix
            .premultiply(rotateMap)
            .premultiply(translateCenter)
            .premultiply(scale)
            .premultiply(translateMap)


        // utils.prettyPrintMatrix(this.camera.projectionMatrix.elements);
    },

    resize() {
        this.cameraToCenterDistance = 0.5 / Math.tan(FOV / 2) * this.map.transform.height;
    },

    calcCameraMatrix(pitch, angle) {
        const _pitch = pitch || this.map.transform._pitch
        const _angle = angle || this.map.transform.angle

        var cameraTranslateZ = new THREE.Matrix4().makeTranslation(0, 0, this.cameraToCenterDistance);
        var cameraRotateX = new THREE.Matrix4().makeRotationX(_pitch);
        var cameraRotateZ = new THREE.Matrix4().makeRotationZ(_angle);

        return new THREE.Matrix4()
            .premultiply(cameraTranslateZ)
            .premultiply(cameraRotateX)
            .premultiply(cameraRotateZ);
    }
}

module.exports = exports = CameraSync;