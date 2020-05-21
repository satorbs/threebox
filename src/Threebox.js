var THREE = require('./three64.js');    // Modified version to use 64-bit double precision floats for matrix math
var Constants = require('./constants.js');
var CameraSync = require('./Camera/CameraSync.js');
var utils = require('./Utils/Utils.js');
var SymbolLayer3D = require('./Layers/SymbolLayer3D.js');

function Threebox(map, gl, options) {
    this.map = map;

    // set up a THREE.js environment
    var ctxOptions = {
        alpha: true,
        antialias: true,
        canvas: map.getCanvas(),
        context: gl
    };
    Object.assign(ctxOptions, options);
    
    var zIndex = ctxOptions.zIndex;
    if (zIndex) {
        ctxOptions.canvas.style.zIndex = zIndex;
    }
    this.renderer = new THREE.WebGLRenderer(ctxOptions);
    this.renderer.setSize(map.transform.width, map.transform.height);
    this.renderer.shadowMap.enabled = true;
    this.renderer.autoClear = false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera( 28, window.innerWidth / window.innerHeight, 100, 1000000);
    this.renderCallback = null;
    
    // The CameraSync object will keep the Mapbox and THREE.js camera movements in sync.
    // It requires a world group to scale as we zoom in. Rotation is handled in the camera's
    // projection matrix itself (as is field of view and near/far clipping)
    // It automatically registers to listen for move events on the map so we don't need to do that here
    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.cameraSync = new CameraSync(this.map, this.camera, this.world);

    this.map.on('resize', () => {
        this.renderer.setSize(this.map.transform.width, this.map.transform.height);
        this.cameraSync.setupCamera();
    });

    this.update();
}

Threebox.prototype = {
    SymbolLayer3D: SymbolLayer3D,

    update: function() {
        // render the scene after reset current state
        this.renderer.resetGLState();
        this.renderer.render(this.scene, this.camera);

        if (this.renderCallback) {
            this.renderCallback();
            this.renderCallback = null;
        }
    },

    projectToWorld: function (coords) {
        // Spherical mercator forward projection, re-scaling to WORLD_SIZE
        var projected = [
            -Constants.MERCATOR_A * coords[0] * Constants.DEG2RAD * Constants.PROJECTION_WORLD_SIZE,
            -Constants.MERCATOR_A * Math.log(Math.tan((Math.PI*0.25) + (0.5 * coords[1] * Constants.DEG2RAD))) * Constants.PROJECTION_WORLD_SIZE
        ];
     
        var pixelsPerMeter = this.projectedUnitsPerMeter(coords[1]);

        // z dimension
        var height = coords[2] || 0;
        projected.push( height * pixelsPerMeter );

        return new THREE.Vector3(projected[0], projected[1], projected[2]);
    },
    projectedUnitsPerMeter: function(latitude) {
        return Math.abs(Constants.WORLD_SIZE * (1 / Math.cos(latitude * Constants.DEG2RAD)) / Constants.EARTH_CIRCUMFERENCE);
    },
    _scaleVerticesToMeters: function(centerLatLng, vertices) {
        var pixelsPerMeter = this.projectedUnitsPerMeter(centerLatLng[1]);
        var centerProjected = this.projectToWorld(centerLatLng);

        for (var i = 0; i < vertices.length; i++) {
            vertices[i].multiplyScalar(pixelsPerMeter);
        }

        return vertices;
    },
    
    unprojectFromWorld: function (pixel) {
        var unprojected = [
            -pixel.x / (Constants.MERCATOR_A * Constants.DEG2RAD * Constants.PROJECTION_WORLD_SIZE),
            2*(Math.atan(Math.exp(pixel.y/(Constants.PROJECTION_WORLD_SIZE*(-Constants.MERCATOR_A))))-Math.PI/4)/Constants.DEG2RAD
        ];

        var pixelsPerMeter = this.projectedUnitsPerMeter(unprojected[1]);

        // z dimension
        var height = pixel.z || 0;
        unprojected.push( height / pixelsPerMeter );

        return unprojected;
    },

    addAtCoordinate: function(obj, lnglat, options) {
        var geoGroup = new THREE.Group();
        geoGroup.userData.isGeoGroup = true;
        geoGroup.add(obj);
        this.world.add(geoGroup);

        return this.moveToCoordinate(obj, lnglat, options);
    },

    moveToCoordinate: function(obj, lnglat, options) {
        // Place the given object on the map, centered around the provided longitude and latitude
        // The object's internal coordinates are assumed to be in meter-offset format, meaning
        // 1 unit represents 1 meter distance away from the provided coordinate.
        
        if (options === undefined) options = {};

        // Figure out if this object is a geoGroup and should be positioned and scaled directly, or if its parent
        const geoGroup = this.getGeoGroup(obj);
        if (!geoGroup) return;

        // Scale the model so that its units are interpreted as meters at the given latitude
        const pixelsPerMeter = this.projectedUnitsPerMeter(lnglat[1]);
        const scale = new THREE.Vector3(1, 1, 1).multiplyScalar(pixelsPerMeter);

        geoGroup.scale.copy(scale);
        geoGroup.position.copy(this.projectToWorld(lnglat));
        obj.coordinates = lnglat;

        if (options.callback) {
            this.renderCallback = options.callback;
        }

        return obj;
    },

    getGeoGroup: function(obj) {
        var geoGroup = null;
        if (obj.userData.isGeoGroup) geoGroup = obj;
        else if (this._isContainedGeoGroup(obj)) geoGroup = obj.parent;
        else console.error('Cannot set geographic coordinates of object that does not have an associated GeoGroup. Object must be added to scene with "addAtCoordinate()".');

        return geoGroup;
    },

    toCameraMatrix: function(pitch, angle) {
        return this.cameraSync.calcCameraMatrix(pitch, angle);
    },
    
    remove: function(obj) {
        this.world.remove(this.getGeoGroup(obj));
    },
    
    setSpotLight: function(target, color) {
        var spotlight = new THREE.SpotLight(color, 2, 1, Math.PI / 4)
        spotlight.target = target;
        spotlight.castShadow = true;
        spotlight.position.set(10, 15, 30);
        spotlight.matrixWorldNeedsUpdate = true;
        this.world.add(spotlight);
    },
    
    setupDefaultLights: function() {
        this.scene.add( new THREE.AmbientLight( 0xCCCCCC ) );
        
        var sunlight = new THREE.DirectionalLight(0xffffff, 1.5);
        // sunlight.position.set(0,800,1000);
        sunlight.castShadow = true;
        sunlight.position.set(10, 15, 30);
        sunlight.matrixWorldNeedsUpdate = true;
        this.world.add(sunlight);
        //this.world.add(sunlight.target);
        
        // var lights = [];
        // lights[ 0 ] = new THREE.PointLight( 0x999999, 1, 0 );
        // lights[ 1 ] = new THREE.PointLight( 0x999999, 1, 0 );
        // lights[ 2 ] = new THREE.PointLight( 0x999999, 0.2, 0 );
        
        // lights[ 0 ].position.set( 0, 200, 1000 );
        // lights[ 1 ].position.set( 100, 200, 1000 );
        // lights[ 2 ].position.set( -100, -200, 0 );
        
        // //scene.add( lights[ 0 ] );
        // this.scene.add( lights[ 1 ] );
        // this.scene.add( lights[ 2 ] );
        
    },

    // privates
    _isContainedGeoGroup: function(obj) {
        return obj.parent && obj.parent.userData.isGeoGroup;
    }
}

module.exports = exports = Threebox;

