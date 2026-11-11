import * as THREE from 'three';

/**
 * Visible flashlight beam: a soft additive cone of light in the dusty air
 * ("volumetric" look), brightest at the lamp and fading with distance.
 * Walls cut it naturally thanks to the depth test.
 */
export class FlashlightBeam {
  public mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private static tmp = new THREE.Vector3();

  constructor(length = 9, angle = Math.PI / 6.2, color = 0xfff1dc) {
    const radius = Math.tan(angle * 0.85) * length;
    // Cone along +Z (Object3D.lookAt aims +Z), apex at the origin
    const geo = new THREE.ConeGeometry(radius, length, 40, 12, true);
    geo.translate(0, -length / 2, 0);
    geo.rotateX(-Math.PI / 2);
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(color) },
        strength: { value: 0 },
        len: { value: length },
      },
      vertexShader: /* glsl */ `
        varying float vDist;
        varying vec3 vNormalV;
        varying vec3 vViewPos;
        void main() {
          vDist = position.z;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vViewPos = mv.xyz;
          vNormalV = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 color;
        uniform float strength;
        uniform float len;
        varying float vDist;
        varying vec3 vNormalV;
        varying vec3 vViewPos;
        void main() {
          float t = clamp(vDist / len, 0.0, 1.0);
          // Bright near the lamp, gone at the end of the beam
          float fall = pow(1.0 - t, 2.2) * smoothstep(0.0, 0.06, t);
          // Thicker-looking in the middle of the cone, soft on the silhouette
          float facing = abs(dot(normalize(vNormalV), normalize(-vViewPos)));
          float a = fall * mix(0.25, 1.0, facing) * strength;
          gl_FragColor = vec4(color * a, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
  }

  /** Follow a spotlight: from its position towards its target, brightness from its intensity. */
  public follow(light: THREE.SpotLight, target: THREE.Object3D, maxIntensity = 60, haze = 0.075) {
    const k = THREE.MathUtils.clamp(light.intensity / maxIntensity, 0, 1.4);
    this.mesh.visible = k > 0.02 && light.visible;
    if (!this.mesh.visible) return;
    this.mesh.position.copy(light.position);
    target.getWorldPosition(FlashlightBeam.tmp);
    this.mesh.lookAt(FlashlightBeam.tmp);
    this.mat.uniforms.strength.value = k * haze;
  }

  public dispose() {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

/**
 * Light "cookie" for the flashlight: a hot centre, the reflector ring and a
 * dim, slightly dirty spill, like a real torch on a wall.
 */
export const makeFlashlightCookie = () => {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, S, S);
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgb(255,255,255)');
  grad.addColorStop(0.16, 'rgb(250,248,240)');
  grad.addColorStop(0.24, 'rgb(170,168,160)');
  grad.addColorStop(0.3, 'rgb(205,200,190)'); // reflector ring
  grad.addColorStop(0.36, 'rgb(165,162,155)');
  grad.addColorStop(0.7, 'rgb(105,102,98)');
  grad.addColorStop(0.95, 'rgb(30,30,30)');
  grad.addColorStop(1, 'rgb(0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  // Smudges on the lens
  for (let i = 0; i < 40; i++) {
    const r = 6 + Math.random() * 26;
    const x = S / 2 + (Math.random() - 0.5) * S * 0.7;
    const y = S / 2 + (Math.random() - 0.5) * S * 0.7;
    const sg = g.createRadialGradient(x, y, 0, x, y, r);
    sg.addColorStop(0, `rgba(0,0,0,${0.05 + Math.random() * 0.08})`);
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sg;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};
