var renderer, scene, camera, raycaster, meshes = [];
var mouse = new THREE.Vector2();

var counties = d3.map();

// transormation matrix
var positioning;

var MAX_EXTRUSION = 50;

var variables = [], currentVariable;

// function that maps variable_value number to extrusion value
// requires the maximum possible variable_value
var getExtrusion;

// function that maps variable_value number to luminance
// requires the maximum possible variable_value
var getLuminance;

function initRenderer() {
	renderer = new THREE.WebGLRenderer();

	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.setClearColor(0x000000);

	document.body.appendChild(renderer.domElement);
}

function initThree() {
	initRenderer();

	raycaster = new THREE.Raycaster();

	scene = new THREE.Scene();

	initCamera();
	initLights();

	controls = new THREE.TrackballControls(camera, renderer.domElement);
	controls.minDistance = 10;
	controls.maxDistance = 5000;

	animate();
}

function initCamera() {
	camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 10000);
//	camera.position.set(-1.9540240848986357,49.5684101788394,6.257355848756459);
//	camera.up.set(-0.6078708992433252,-0.08628447972888699,0.78933387005184);
	camera.position.set(0,1500,0);
	camera.up.set(0,0,1);

	// restoreCameraOrientation(camera);
}

function initLights() {
	var pointLight = new THREE.PointLight(0xFFFFFF);
	pointLight.position.set(-800, 800, 800);
	scene.add(pointLight);

	var pointLight2 = new THREE.PointLight(0xFFFFFF);
	pointLight2.position.set(800, 800, 800);
	scene.add(pointLight2);

	var pointLight3 = new THREE.PointLight(0xFFFFFF);
	pointLight3.position.set(0, 800, -800);
	scene.add(pointLight3);
}

function initLine() {
    var material = new THREE.LineBasicMaterial({
        color: 0x0000ff
    });

	var geometry = new THREE.Geometry();
	geometry.vertices.push(
		new THREE.Vector3( 0, 0, 0 ),
		new THREE.Vector3( 0, 100, 0 )
	);

	var line = new THREE.Line( geometry, material );
	scene.add( line );
}

function updateInfoBox() {
	raycaster.setFromCamera( mouse, camera );

	var intersects = raycaster.intersectObjects(scene.children);

	var html = '';

	for (var i=0; i<intersects.length; i++) {
		var stateCode = intersects[i].object.userData.stateCode;
		if (stateCode) {
			var state = counties.get(stateCode);
			var variable_value = state.get(currentVariable);
			html = state.get('name') + ': ' + variable_value;
			break;
		}
	}

	document.getElementById('infobox').innerHTML = html;
}

function animate() {
	controls.update();
	renderer.render(scene, camera);
	updateInfoBox();

	requestAnimationFrame(animate);
}

function onDocumentMouseMove( event ) {
	mouse.x = ( event.clientX / window.innerWidth ) * 2 - 1;
	mouse.y = - ( event.clientY / window.innerHeight ) * 2 + 1;
}

function onWindowResize() {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();

	renderer.setSize(window.innerWidth, window.innerHeight);
}


function cameraIter(callback) {
	['position', 'up'].forEach(callback);
}

function saveCameraOrientation() {
	cameraIter(function (key) {
		sessionStorage.setItem('camera.' + key, JSON.stringify(camera[key].toArray()));
	});
}

function restoreCameraOrientation() {
	cameraIter(function (key) {
		var val = JSON.parse(sessionStorage.getItem('camera.' + key));
		if (val) {
			camera[key].fromArray(val);
		}
	});
}

var RO_CENTER;

function initGeometry(features) {
  var projection = d3.geo.albers()
    .translate([window.innerWidth / 2, window.innerHeight / 2]);

	var path = d3.geo.path().projection(projection);

	features.forEach(function(feature) {
		var contour = transformSVGPath(path(feature));

		var state = counties.get(feature.properties.STATE);
		state.set('contour', contour);
		state.set('name', feature.properties.NAME);
	});
}

function initPositioningTransform() {
	positioning = new THREE.Matrix4();

	var tmp = new THREE.Matrix4();
	positioning.multiply(tmp.makeRotationX(Math.PI/2));
	positioning.multiply(tmp.makeTranslation(-480, -250, 0));
}

function updateMeshes(Variable) {
	// remove curren meshes
	meshes.forEach(function(mesh) {
		scene.remove(mesh);
	});

	meshes = counties.entries().map(function(entry) {
		var stateCode = entry.key, state = entry.value;
		var variable_value = state.get(Variable);
		var extrusion = getExtrusion(variable_value);
		var luminance = getLuminance(variable_value);
		var color = d3.hsl(105, 0.8, luminance).toString();

		var extrudeMaterial = new THREE.MeshLambertMaterial({color: color});
		var faceMaterial = new THREE.MeshBasicMaterial({color: color});

		var geometry = state.get('contour').extrude({
			amount: extrusion,
			bevelEnabled: false,
			extrudeMaterial: 0,
			material: 1
		});

		var mesh = new THREE.Mesh(geometry, new THREE.MeshFaceMaterial(
			[extrudeMaterial, faceMaterial]));

		mesh.userData.stateCode = stateCode;

		mesh.applyMatrix(positioning);
		mesh.translateZ(-extrusion);

		scene.add(mesh);

		return mesh;
	});
}

// concurrently load multiple data sources; the callback will be invoked when everything is loaded
function loadData(sources, callback) {
	var remaining = sources.length;
	var results = {}

	sources.forEach(function(source) {
		function handler(error, data) {
			if (error) throw error;

			results[source.key] = data;

			remaining--;

			if (!remaining) {
				callback(results);
			}
		}

		args = source.args.slice();
		args.push(handler);
		d3[source.type].apply(d3, args);
	});
}

var dataSources = [
	{type: 'json', args: ['map/us-states-topo.json'], key: 'us_map'},
	{type: 'csv', args: ['map/random_display_data.csv'], key: 'display_data'}
];

function extractvariables(display_data) {
	return Object.keys(display_data[0]).filter(function(key) {
		key = key.trim()
		return key !== 'FIPS';
	});
}

function prepareCensusData(display_data) {
	var max_variable_value = 0;
	var Variable_sums = {};

	display_data.forEach(function(row) {
		var stateCode = row.FIPS.trim();

		var datum = d3.map();

		variables.forEach(function(Variable) {
			var value = Number(row[Variable].trim());

			datum.set(Variable, value);

			if (value > max_variable_value) {
				max_variable_value = value;
			}
		});

		counties.set(stateCode, datum);
	});

	return max_variable_value;
}

initThree();
initPositioningTransform();
// initLine();

var VariableButtons = React.createClass({
	getVariableFromHash: function() {
		var re = new RegExp('#/var/*');
		var match = window.location.hash.match(re);
		var currentVariable;

		if (match) {
			currentVariable = +match[1];
			if (this.props.variables.indexOf(currentVariable) > -1) {
				return currentVariable;
			}
		}

		return false;
	},

	getInitialState: function() {
		var currentVariable = this.getVariableFromHash();

		if (!currentVariable) {
			currentVariable = this.props.variables[0];
		}

		return {currentVariable: currentVariable};
	},

	componentDidMount: function() {
		window.addEventListener('hashchange', this.onHashChange);
	},

	componentWillUnmount: function() {
		window.removeEventListener('hashchange', this.onHashChange);
	},

	onHashChange: function(Variable) {
		var Variable = this.getVariableFromHash();

		if (Variable) {
			this.setState({currentVariable: Variable});
		}
	},

	render: function() {
		var self = this;

		currentVariable = self.state.currentVariable;  // used by infobox
		updateMeshes(this.state.currentVariable);

		function createButton(Variable) {
			var classes = classNames({
				'btn': true,
				'btn-default': true,
				'active': Variable == self.state.currentVariable
			});

			return <a className={classes} key={Variable} href={'#/var/' + Variable}>{Variable}</a>;
		}

		return <div id="current-Variable" className="btn-group" role="group">{self.props.variables.map(createButton)}</div>;
	}
});

loadData(dataSources, function(results) {
	variables = extractvariables(results.display_data);
	var max_variable_value = prepareCensusData(results.display_data);

	getExtrusion = d3.scale.linear().domain([0, max_variable_value]).range([0, MAX_EXTRUSION]);
	getLuminance = d3.scale.linear().domain([0, max_variable_value]);

	var us_map = results.us_map;
	RO_CENTER = d3.geo.centroid(us_map);
	var features = topojson.feature(us_map, us_map.objects['us-states-geo']).features;
	initGeometry(features);

	React.render(<VariableButtons variables={variables} />, document.getElementById('container'));
});

document.addEventListener('mousemove', onDocumentMouseMove);
window.addEventListener('resize', onWindowResize);
window.addEventListener('beforeunload', saveCameraOrientation);
