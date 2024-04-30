import * as TWEEN from "@tweenjs/tween.js";
import * as THREE from "three";
import ThreeGlobe from "three-globe";
import { InteractionManager } from "three.interactive";
import { GLTFLoader, OrbitControls } from "three/examples/jsm/Addons.js";
import data from "../public/data.json";
import "./style.css";

interface ObjConfig {
  id: string;
  location: number[];
}

const config = {
  mesh_scale: 5,
  ruler_height: 10, // in cm
  base_mesh_altitude: 0.01,
  zoom_mesh_altitude: 0.18,
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
  scene.background = new THREE.Color(0xf3efea);

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
  cameraControls.target.set(0, 0, 0);
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

function fetchStaticMapboxImage(lat: number, lon: number) {
  const username = "mrtukkin";
  const style_id = "clv1a8uej00a301qu6xfn9hmz";
  const token = "pk.eyJ1IjoibXJ0dWtraW4iLCJhIjoiY2l4eXhwa3ppMDA2MDJ3bDhoN25zanFlMiJ9.tG_3O2QASQziuXyGQvuR8g";
  const width = "400";
  const height = "200";
  const zoom = "4";

  return `https://api.mapbox.com/styles/v1/${username}/${style_id}/static/${lon},${lat},${zoom}/${width}x${height}@2x/?access_token=${token}`;
}

let selectedObject: THREE.Mesh<
  THREE.BufferGeometry<THREE.NormalBufferAttributes>,
  THREE.MeshStandardMaterial,
  THREE.Object3DEventMap
> | null = null;
const overlay = document.querySelector<HTMLDivElement>("#overlay")!;
const overlayContent = document.querySelector<HTMLDivElement>("#overlay-content")!;
const overlayImages = document.querySelector<HTMLDivElement>("#overlay-images")!;
const overlayClose = document.querySelector<HTMLButtonElement>("#overlay-close")!;
const overlayLoad = document.querySelector<HTMLButtonElement>("#overlay-load")!;
const start = document.querySelector<HTMLButtonElement>("#start")!;
const entrance = document.querySelector<HTMLDivElement>("#entrance")!;

start.onclick = (_) => {
  const { renderer, scene, camera, cameraControls, loader, interactionManager, globe } = init();
  data.map((objConfig) => addObject(objConfig));
  animate();
  entrance.style.display = "none";

  function unZoomMesh(mesh: THREE.Object3D<THREE.Object3DEventMap>) {
    const [lat, lng] = mesh.userData.location as [number, number];

    new TWEEN.Tween(mesh.position)
      .to(globe.getCoords(lat, lng, config.base_mesh_altitude), 1000)
      .easing(TWEEN.Easing.Quadratic.InOut)
      .start();

    new TWEEN.Tween(mesh.rotation)
      .to({ y: mesh.rotation.y - (mesh.rotation.y % (2 * Math.PI)) + (Math.PI / 180) * -45 }, 1000)
      .easing(TWEEN.Easing.Quadratic.InOut)
      .start();
  }

  async function upgradeMesh(
    mesh: THREE.Mesh<THREE.BufferGeometry<THREE.NormalBufferAttributes>, THREE.MeshStandardMaterial, THREE.Object3DEventMap>
  ) {
    if (mesh.userData.highRes) return;

    loader.loadAsync(`${mesh.userData.path}/highRes.glb`).then((gltf) => {
      const highResMesh = gltf.scene.children[0] as THREE.Mesh<
        THREE.BufferGeometry<THREE.NormalBufferAttributes>,
        THREE.MeshStandardMaterial,
        THREE.Object3DEventMap
      >;

      mesh.material = highResMesh.material;
      mesh.geometry = highResMesh.geometry;
      mesh.userData.highRes = true;
      overlayLoad.style.display = "none";
    });
  }

  async function addObject(objConfig: ObjConfig, zoomed: boolean = false) {
    return loader.loadAsync(`${BASE_URL}/${objConfig.id}/lowRes.glb`).then((gltf) => {
      const mesh = gltf.scene.children[0] as THREE.Mesh<
        THREE.BufferGeometry<THREE.NormalBufferAttributes>,
        THREE.MeshStandardMaterial,
        THREE.Object3DEventMap
      >;

      scene.add(mesh);
      mesh.userData = objConfig;
      mesh.userData.highRes = false;
      mesh.userData.path = `${BASE_URL}/${objConfig.id}`;

      mesh.material = mesh.material.clone();
      mesh.material.emissiveIntensity = 0.5;
      mesh.userData.materialEmissiveHex = mesh.material.emissive.getHex();

      const bbox = new THREE.Box3().setFromObject(mesh);
      const size = new THREE.Vector3();
      bbox.getSize(size);
      mesh.scale.setScalar((config.mesh_scale * mesh.scale.y) / size.y);

      const position = globe.getCoords(
        objConfig.location[0],
        objConfig.location[1],
        zoomed ? config.zoom_mesh_altitude : config.base_mesh_altitude
      );
      mesh.position.set(position.x, position.y, position.z);

      mesh.rotation.y = (Math.PI / 180) * -45;

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

        fetch(`${BASE_URL}/${objConfig.id}/description.html`).then((response) => {
          if (response.ok) {
            response.text().then((text) => {
              overlayContent.innerHTML += text;
            });
          }
        }, (_) => { });

        fetch(`${BASE_URL}/${objConfig.id}/images.json`).then((response) => {
          response.json().then((images) => {
            overlayImages.innerHTML = images.map((image: string) => `<img src="${BASE_URL}/${objConfig.id}/${image}" />`).join("");
          });
        });

        const isMobile = window.innerWidth < 850;
        document.body.style.cursor = "default";
        mesh.material.emissive.setHex(mesh.userData.materialEmissiveHex);
        overlay.style.display = "none";

        const [lat, lng] = mesh.userData.location as [number, number];
        overlayContent.innerHTML = `<img src="${fetchStaticMapboxImage(lat, lng)}" />`;

        const mesh_position = globe.getCoords(lat, lng, config.zoom_mesh_altitude);
        new TWEEN.Tween(mesh.position).to(mesh_position, 1000).easing(TWEEN.Easing.Quadratic.InOut).start();

        cameraControls.target.set(mesh_position.x, mesh_position.y, mesh_position.z);
        cameraControls.minDistance = 1;
        const camera_position = globe.getCoords(lat, lng, isMobile ? 0.24 : 0.237);
        new TWEEN.Tween(camera.position)
          .to({ x: camera_position.x, y: isMobile ? camera_position.y - 2 : camera_position.y, z: camera_position.z }, 1000)
          .easing(TWEEN.Easing.Quadratic.InOut)
          .start()
          .onComplete(() => {
            overlayLoad.style.display = mesh.userData.highRes ? "none" : "block";
            overlay.style.display = "flex";
          });
      });

      interactionManager.add(mesh);

      return mesh;
    });
  }

  function animate(time: number = 0) {
    requestAnimationFrame(animate);
    if (selectedObject) selectedObject.rotation.y += 0.01;

    cameraControls.update();
    interactionManager.update();
    TWEEN.update(time);
    renderer.render(scene, camera);
  }

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
        cameraControls.target.set(0, 0, 0);
        cameraControls.minDistance = 105;
        selectedObject = null;
      });
  };

  overlayLoad.onclick = (_) => {
    if (!selectedObject) return;
    upgradeMesh(selectedObject);
  };
};
