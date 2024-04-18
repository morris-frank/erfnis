// import { setupCounter } from './counter.ts'
import * as TWEEN from "@tweenjs/tween.js";
import * as THREE from "three";
import "./style.css";
import { InteractionManager } from "three.interactive";
import { GLTFLoader, OrbitControls, RGBELoader } from "three/examples/jsm/Addons.js";
import data from "../public/data.json";
import "@fontsource-variable/eb-garamond";

interface ObjConfig {
  id: string;
  name: string;
  location: number[];
  description: string; // in HTML
}

function init() {
  const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  const camera = new THREE.PerspectiveCamera(75, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
  camera.position.set(0, 0, 2);

  const cameraControls = new OrbitControls(camera, canvas);
  cameraControls.enableDamping = true;
  cameraControls.autoRotate = false;
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

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf2f2f2);

  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();

  const rgbeLoader = new RGBELoader(loadingManager);
  rgbeLoader.load("/textures/skybox_512px.hdr", (texture) => {
    let envMap = pmremGenerator.fromEquirectangular(texture).texture;
    scene.environment = envMap;
    texture.dispose();
  });

  const loader = new GLTFLoader(loadingManager);

  const interactionManager = new InteractionManager(renderer, camera, renderer.domElement);

  return { renderer, scene, camera, cameraControls, loader, interactionManager };
}

function spiralLocations(n: number) {
  let v = [0, 0];
  let r = 1;
  let axis = 0;
  let delta = 1;

  let V = [];
  for (let i = 0; i < n; i++) {
    V.push([v[0], v[1]]);

    v[axis] += delta;
    if (Math.abs(v[axis]) == r) {
      axis = axis ? 0 : 1;
      if (axis) delta = delta < 0 ? 1 : -1;
      else if (0 < delta) r++;
    }
  }

  return V;
}

function addObjects(data: ObjConfig[]) {
  const V = spiralLocations(data.length);
  data.forEach((object, index) => addObject(object, V[index]));
}

async function addObject(objConfig: ObjConfig, position: number[], highRes = false) {
  return loader
    .loadAsync(highRes ? `https://cdn.maurice-frank.com/morris-museum/objects/${objConfig.id}/3DModel.glb` : `https://cdn.maurice-frank.com/morris-museum/objects/${objConfig.id}/3DModel_LowPoly.glb`)
    .then((gltf) => {
      const mesh = gltf.scene.children[0].children[0] as THREE.Mesh<
        THREE.BufferGeometry<THREE.NormalBufferAttributes>,
        THREE.MeshStandardMaterial,
        THREE.Object3DEventMap
      >;

      scene.add(mesh);
      mesh.userData = objConfig;
      mesh.userData.position = position;
      mesh.userData.highRes = highRes;

      mesh.position.set(position[0], position[1], 0);
      mesh.rotation.set(0, 0, 0);
      const bbox = new THREE.Box3().setFromObject(mesh);
      const size = new THREE.Vector3();
      bbox.getSize(size);
      const max = Math.max(size.x, size.y, size.z);
      mesh.scale.set((1 / max) * 0.9, (1 / max) * 0.9, (1 / max) * 0.9);

      mesh.material = mesh.material.clone();
      mesh.userData.initialEmissive = mesh.material.emissive.clone();
      mesh.material.emissiveIntensity = 0.5;

      mesh.addEventListener("mouseover", (_) => {
        if (!cameraControls.enabled) return;
        if (selectedObject && selectedObject == mesh) return;
        document.body.style.cursor = "pointer";

        mesh.userData.materialEmissiveHex = mesh.material.emissive.getHex();
        mesh.material.emissive.setHex(0xff0000);
        mesh.material.emissiveIntensity = 0.1;
      });

      mesh.addEventListener("mouseout", (_) => {
        if (!cameraControls.enabled) return;
        document.body.style.cursor = "default";
        mesh.material.emissive.setHex(mesh.userData.materialEmissiveHex);
      });
      
      mesh.addEventListener("mousedown", (_) => {
        if (selectedObject && selectedObject == mesh) return;
        selectedObject = mesh;
        
        document.body.style.cursor = "default";
        mesh.material.emissive.setHex(mesh.userData.materialEmissiveHex);
        cameraControls.enabled = false;

        let posZ = 1;
        let rotX = 0;
        let rotZ = 0;

        if (camera.position.z < 0) {
          posZ = -1;

          if (camera.rotation.x < 0) {
            rotX = -Math.PI;
          } else {
            rotX = Math.PI;
          }

          if (camera.rotation.z < 0) {
            rotZ = -Math.PI;
          } else {
            rotZ = Math.PI;
          }
        }

        const rotation = { x: camera.rotation.x, y: camera.rotation.y, z: camera.rotation.z };
        new TWEEN.Tween(rotation)
          .to({ x: rotX, y: 0, z: rotZ }, 1000)
          .easing(TWEEN.Easing.Quadratic.InOut) // | TWEEN.Easing.Linear.None
          .onUpdate(() => camera.rotation.set(rotation.x, rotation.y, rotation.z))
          .start();

        const coords = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
        new TWEEN.Tween(coords)
          .to({ x: position[0], y: position[1], z: posZ }, 1000)
          .easing(TWEEN.Easing.Quadratic.InOut) // | TWEEN.Easing.Linear.None
          .onUpdate(() => camera.position.set(coords.x, coords.y, coords.z))
          .start()
          .onComplete(() => {
            cameraControls.target.set(position[0], position[1], 0);
            cameraControls.enabled = true;

            overlay.style.display = "block";
            overlay.innerHTML = `
          <img src="${fetchStaticMapboxImage(objConfig.location[0], objConfig.location[1])}" />
            <h1>${objConfig.name}</h1>
            ${objConfig.description}
          `;

            if (!mesh.userData.highRes) {
              addObject(objConfig, position, true).then((highResMesh) => {
                highResMesh.rotation.set(mesh.rotation.x, mesh.rotation.y, mesh.rotation.z);
                scene.remove(mesh);
                selectedObject = highResMesh;
              });
            }
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

  cameraControls.update();

  // rotate selected object
  if (selectedObject) {
    selectedObject.rotation.y += 0.01;
  }

  interactionManager.update();
  TWEEN.update(time);
  renderer.render(scene, camera);
}

let selectedObject: THREE.Object3D | null = null;
const overlay = document.querySelector<HTMLDivElement>("#overlay")!;
const { renderer, scene, camera, cameraControls, loader, interactionManager } = init();
addObjects(data);
animate();
