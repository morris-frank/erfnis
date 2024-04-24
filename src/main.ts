import * as TWEEN from "@tweenjs/tween.js";
import * as THREE from "three";
import ThreeGlobe from "three-globe";
import { InteractionManager } from "three.interactive";
import { GLTFLoader, OrbitControls } from "three/examples/jsm/Addons.js";
import data from "../public/data.json";
import "./style.css";

interface ObjConfig {
  path: string;
  location: number[];
  rotation: number;
  height: number; // in cm
  polycam: boolean;
}

const config = {
  mesh_scale: 5,
  ruler_height: 10, // in cm
  base_mesh_altitude: 0.01,
  zoom_mesh_altitude: 0.2,
  base_camera_altitude: 0.5,
};

const BASE_URL = import.meta.env.PROD ? "https://cdn.maurice-frank.com/morris-museum" : "/objects";

function init() {
  const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf2f2f2);

  const globe = new ThreeGlobe()
    .globeImageUrl("/textures/eo_base_2020_clean_8k.jpg")
    .showAtmosphere(false)
    .objectLat("lat")
    .objectLng("lng")
    .objectAltitude("alt")
    .objectThreeObject("mesh")
    .objectFacesSurface(true);
  scene.add(globe);

  const camera = new THREE.PerspectiveCamera(75, canvas.clientWidth / canvas.clientHeight);
  const { x, y, z } = globe.getCoords(5.5, 1, config.base_camera_altitude);
  camera.position.set(x, y, z);

  const cameraControls = new OrbitControls(camera, canvas);
  cameraControls.enablePan = false;
  cameraControls.rotateSpeed = 0.2;
  cameraControls.maxDistance = 155;
  cameraControls.minDistance = 105;
  cameraControls.update();

  window.addEventListener(
    "resize",
    () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();

      renderer.setSize(window.innerWidth, window.innerHeight);
    },
    false
  );

  const loadingManager = new THREE.LoadingManager();

  const loader = new GLTFLoader(loadingManager);

  const interactionManager = new InteractionManager(renderer, camera, renderer.domElement);

  scene.add(new THREE.AmbientLight(0xcccccc, Math.PI));
  scene.add(new THREE.DirectionalLight(0xffffff, 0.6 * Math.PI));

  return { renderer, scene, camera, cameraControls, loader, interactionManager, globe };
}

function unZoomMesh(mesh: THREE.Object3D<THREE.Object3DEventMap>) {
  const [lat, lng] = mesh.userData.location as [number, number];

  new TWEEN.Tween(mesh.position)
    .to(globe.getCoords(lat, lng, config.base_mesh_altitude), 1000)
    .easing(TWEEN.Easing.Quadratic.InOut)
    .start();

  new TWEEN.Tween(mesh.rotation)
    .to({ y: mesh.rotation.y - (mesh.rotation.y % (2 * Math.PI)) + (Math.PI / 180) * mesh.userData.rotation }, 1000)
    .easing(TWEEN.Easing.Quadratic.InOut)
    .start();
}

async function addObject(objConfig: ObjConfig, highRes = false) {
  fetch(`${BASE_URL}/${objConfig.path}/description.html`).then((response) => {
    response.text().then((text) => {
      descriptions[objConfig.path] = text;
    });
  });

  const path = `${BASE_URL}/${objConfig.path}/${objConfig.polycam ? "" : "3DModel"}${highRes ? "highRes" : "lowRes"}.glb`;

  return loader.loadAsync(path).then((gltf) => {
    const mesh = (objConfig.polycam ? gltf.scene.children[0] : gltf.scene.children[0].children[0]) as THREE.Mesh<
      THREE.BufferGeometry<THREE.NormalBufferAttributes>,
      THREE.MeshStandardMaterial,
      THREE.Object3DEventMap
    >;

    scene.add(mesh);
    mesh.userData = objConfig;
    mesh.userData.highRes = highRes;

    mesh.material = mesh.material.clone();
    mesh.material.emissiveIntensity = 0.5;
    mesh.userData.materialEmissiveHex = mesh.material.emissive.getHex();

    const bbox = new THREE.Box3().setFromObject(mesh);

    const size = new THREE.Vector3();
    bbox.getSize(size);
    const factor = config.mesh_scale / Math.max(size.x, size.y, size.z);
    // const scaledSize = size.multiplyScalar(factor);
    mesh.scale.set(factor, factor, factor);

    const position = globe.getCoords(
      objConfig.location[0],
      objConfig.location[1],
      highRes ? config.zoom_mesh_altitude : config.base_mesh_altitude
    );
    mesh.position.set(position.x, position.y, position.z);

    mesh.rotation.y = (Math.PI / 180) * objConfig.rotation;

    if (import.meta.env.DEV) {
      const box = new THREE.BoxHelper(mesh, 0xffff00);
      box.update();
      scene.add(box);

      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.1), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
      mesh.add(dot);
    }

    mesh.addEventListener("mouseover", (_) => {
      if (selectedObject && selectedObject == mesh) return;
      document.body.style.cursor = "pointer";
      mesh.material.emissive.setHex(0xff0000);
      mesh.material.emissiveIntensity = 0.1;
    });

    mesh.addEventListener("mouseout", (_) => {
      document.body.style.cursor = "default";
      mesh.material.emissive.setHex(mesh.userData.materialEmissiveHex);
    });

    mesh.addEventListener("mousedown", (_) => {
      if (selectedObject && selectedObject == mesh) return;
      if (selectedObject) unZoomMesh(selectedObject);

      selectedObject = mesh;

      const isMobile = window.innerWidth < 850;
      document.body.style.cursor = "default";
      mesh.material.emissive.setHex(mesh.userData.materialEmissiveHex);
      cameraControls.enabled = false;
      overlay.style.display = "none";

      const [lat, lng] = mesh.userData.location as [number, number];

      const mesh_position = globe.getCoords(lat, lng, config.zoom_mesh_altitude);
      new TWEEN.Tween(mesh.position).to(mesh_position, 1000).easing(TWEEN.Easing.Quadratic.InOut).start();

      const camera_position = globe.getCoords(lat, lng, isMobile ? 0.27 : 0.23);
      new TWEEN.Tween(camera.position)
        .to({ x: camera_position.x, y: isMobile ? camera_position.y - 2 : camera_position.y, z: camera_position.z }, 1000)
        .easing(TWEEN.Easing.Quadratic.InOut)
        .start()
        .onComplete(() => {
          overlayLoad.style.display = highRes ? "none" : "block";
          overlay.style.display = "block";

          overlayContent.innerHTML = `
            <img src="${fetchStaticMapboxImage(lat, lng)}" />
            ${descriptions[objConfig.path]}
            `;
        });
    });

    interactionManager.add(mesh);

    return mesh;
  });
}

function fetchStaticMapboxImage(lat: number, lon: number) {
  const username = "mrtukkin";
  const style_id = "clv1a8uej00a301qu6xfn9hmz";
  const token = "pk.eyJ1IjoibXJ0dWtraW4iLCJhIjoiY2l4eXhwa3ppMDA2MDJ3bDhoN25zanFlMiJ9.tG_3O2QASQziuXyGQvuR8g";
  const width = "400";
  const height = "200";
  const zoom = "4";

  return `https://api.mapbox.com/styles/v1/${username}/${style_id}/static/${lon},${lat},${zoom}/${width}x${height}@2x/?access_token=${token}`;
}

function animate(time: number = 0) {
  requestAnimationFrame(animate);
  if (selectedObject) selectedObject.rotation.y += 0.01;

  cameraControls.update();
  interactionManager.update();
  TWEEN.update(time);
  renderer.render(scene, camera);
}

let selectedObject: THREE.Object3D | null = null;
let descriptions: { [key: string]: string } = {};
const overlay = document.querySelector<HTMLDivElement>("#overlay")!;
const overlayContent = document.querySelector<HTMLDivElement>("#overlay-content")!;
const overlayClose = document.querySelector<HTMLButtonElement>("#overlay-close")!;
const overlayLoad = document.querySelector<HTMLButtonElement>("#overlay-load")!;

const { renderer, scene, camera, cameraControls, loader, interactionManager, globe } = init();

data.map((objConfig) => addObject(objConfig, false));

overlayClose.onclick = (_) => {
  if (!selectedObject) return;

  overlay.style.display = "none";
  unZoomMesh(selectedObject);

  const [lat, lng] = selectedObject.userData.location as [number, number];
  new TWEEN.Tween(camera.position)
    .to(globe.getCoords(lat, lng, config.base_camera_altitude), 1000)
    .easing(TWEEN.Easing.Quadratic.InOut)
    .start()
    .onComplete(() => {
      cameraControls.enabled = true;
      selectedObject = null;
    });
};

overlayLoad.onclick = (_) => {
  if (!selectedObject) return;

  addObject(selectedObject.userData as ObjConfig, true).then((mesh) => {
    if (!selectedObject) return;
    mesh.rotation.y = selectedObject.rotation.y;
    scene.remove(selectedObject);
    selectedObject = mesh;
    overlayLoad.style.display = "none";
  });
};

animate();
