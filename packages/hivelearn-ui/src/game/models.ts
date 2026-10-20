/**
 * Modelos «héroe» generados con Blender (`scripts/assets/build-models.py`) y servidos desde `public/models`. Si un
 * archivo no carga, el juego sigue con las piezas procedurales: el modelo es una mejora, no un requisito.
 */
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'

export type ModelName = 'drone' | 'portal' | 'core'

export async function loadModel(name: ModelName): Promise<GLTF | null> {
  try {
    return await new GLTFLoader().loadAsync(`/models/${name}.glb`)
  } catch {
    return null
  }
}
